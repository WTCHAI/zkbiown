/**
 * GROUP B: Circom/Groth16 Proof Generation + Verification Benchmark
 *
 * Tests same-person (Scenario A) and different-person (Scenario B) pairs
 * sampled from precomputed templates using the binary 0/1 circuit.
 *
 * Circuit: ZTIZEN/circuit/circom/ztizen.circom (binary BioHash, Groth16)
 * Template encoding: binary 0/1 per Gaussian projection
 *
 * Outputs: results/circuit-timing/circom_{lib}_benchmark.json
 *
 * Usage:
 *   npx tsx pipeline/02-circom-benchmark.ts --lib=facenet
 *   npx tsx pipeline/02-circom-benchmark.ts   (all libraries)
 */

import * as snarkjs from 'snarkjs'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CRYPTO_KEYS, SZQ_CONFIGS, type LibraryName } from '../utils/config.js'
import { stringToFieldElement } from '../utils/poseidon.js'
import { samplePairs } from '../utils/sample-pairs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPERIMENTAL_DIR = join(__dirname, '..')
const CIRCUIT_DIR = join(EXPERIMENTAL_DIR, '../circuit/circom/artifacts')
const RESULTS_DIR = join(EXPERIMENTAL_DIR, 'results/circuit-timing')

const WASM_PATH = join(CIRCUIT_DIR, 'ztizen_js/ztizen.wasm')
const ZKEY_PATH = join(CIRCUIT_DIR, 'ztizen.zkey')
const VKEY_PATH = join(CIRCUIT_DIR, 'verification_key.json')

const N_SAME_PAIRS = 50
const N_DIFF_PAIRS = 50
// Proof runs per same-person pair. Kept low since 50 pairs × 3 runs = 150 proofs (~7.5 min/lib)
const N_PROOF_RUNS = 3

// ─── Types ────────────────────────────────────────────────────────────────────

interface PairResult {
  scenario: 'A' | 'B'
  personId?: string
  enrollPersonId?: string
  verifyPersonId?: string
  proof_generation_ms: number[]
  proof_verification_ms: number[]
  match_count?: number
  proof_valid?: boolean
  expected_failure?: boolean
  error?: string
}

interface Stats {
  mean: number
  std: number
  min: number
  max: number
}

interface BenchmarkResult {
  library: string
  circuit: 'circom_groth16'
  template_encoding: 'binary_0_1'
  output_dim: 128
  n_same_pairs: number
  n_diff_pairs: number
  n_proof_runs_per_pair: number
  constraint_count: number
  wasm_path: string
  zkey_path: string

  scenario_a: {
    pairs_tested: number
    pairs_passed: number
    proof_generation_ms: Stats
    proof_verification_ms: Stats
    avg_match_count: number
    proof_size_bytes: number
    public_signals_count: number
  }
  scenario_b: {
    pairs_tested: number
    pairs_expected_failure: number
    pairs_unexpected_pass: number
    failure_at_witness_ms: { mean: number; std: number }
  }

  pair_results: PairResult[]
  timestamp: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stats(arr: number[]): Stats {
  if (arr.length === 0) return { mean: 0, std: 0, min: 0, max: 0 }
  const m = arr.reduce((a, b) => a + b, 0) / arr.length
  const s = Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length)
  return {
    mean: Number(m.toFixed(2)),
    std: Number(s.toFixed(2)),
    min: Number(Math.min(...arr).toFixed(2)),
    max: Number(Math.max(...arr).toFixed(2)),
  }
}

function buildWitnessInput(
  biohash: number[],
  poseidon_commitment: string[]
): Record<string, string | string[]> {
  return {
    bio_template: biohash.map(b => b.toString()),
    product_key: stringToFieldElement(CRYPTO_KEYS.PRODUCT_KEY).toString(),
    ztizen_key: stringToFieldElement(CRYPTO_KEYS.ZTIZEN_KEY).toString(),
    user_key: stringToFieldElement(CRYPTO_KEYS.USER_KEYS[0]).toString(),
    version: '1',
    nonce: '0',
    product_usage_hash: '0',
    auth_commit_stored: poseidon_commitment,
  }
}

// ─── Main benchmark ───────────────────────────────────────────────────────────

async function benchmarkLibrary(lib: LibraryName): Promise<BenchmarkResult> {
  const config = SZQ_CONFIGS[lib]
  const libField = lib === 'faceapi' ? 'faceapijs' : lib
  console.log(`\n━━━ Circom/Groth16 Benchmark: ${config.name} ━━━`)

  if (!existsSync(WASM_PATH)) throw new Error(`WASM not found: ${WASM_PATH}`)
  if (!existsSync(ZKEY_PATH)) throw new Error(`zkey not found: ${ZKEY_PATH}`)
  if (!existsSync(VKEY_PATH)) throw new Error(`vkey not found: ${VKEY_PATH}`)

  const vKey = JSON.parse(readFileSync(VKEY_PATH, 'utf-8'))

  console.log(`  Sampling ${N_SAME_PAIRS} same-person + ${N_DIFF_PAIRS} diff-person pairs...`)
  const { samePairs, diffPairs } = samplePairs(libField, N_SAME_PAIRS, N_DIFF_PAIRS)
  console.log(`  Got ${samePairs.length} same-person pairs, ${diffPairs.length} diff-person pairs.`)

  const pairResults: PairResult[] = []

  // ── Scenario A: same-person pairs ──
  console.log(`\n  ── Scenario A: same-person (expect pass ≥102/128) ──`)
  const allGenTimes: number[] = []
  const allVerifyTimes: number[] = []
  const allMatchCounts: number[] = []
  let proofSizeBytes = 0
  let publicSignalsCount = 0
  let passCount = 0

  for (let pi = 0; pi < samePairs.length; pi++) {
    const pair = samePairs[pi]
    // Verify capture biohash against enrollment Poseidon commitment
    const input = buildWitnessInput(pair.verifyBiohash, pair.enrollPoseidon)

    const genTimes: number[] = []
    const verifyTimes: number[] = []
    let matchCount: number | undefined
    let proofValid: boolean | undefined
    let errorMsg: string | undefined

    try {
      for (let r = 0; r < N_PROOF_RUNS; r++) {
        const t0 = performance.now()
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH)
        const t1 = performance.now()
        genTimes.push(t1 - t0)

        if (r === 0) {
          matchCount = Number(publicSignals[0])
          proofSizeBytes = JSON.stringify(proof).length
          publicSignalsCount = publicSignals.length
        }

        const t2 = performance.now()
        const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof)
        const t3 = performance.now()
        verifyTimes.push(t3 - t2)
        if (r === 0) proofValid = valid
      }
      passCount++
      allGenTimes.push(...genTimes)
      allVerifyTimes.push(...verifyTimes)
      if (matchCount !== undefined) allMatchCounts.push(matchCount)
    } catch (err: any) {
      proofValid = false
      errorMsg = String(err?.message ?? err).substring(0, 200)
    }

    pairResults.push({
      scenario: 'A',
      personId: pair.personId,
      proof_generation_ms: genTimes,
      proof_verification_ms: verifyTimes,
      match_count: matchCount,
      proof_valid: proofValid,
      error: errorMsg,
    })

    if ((pi + 1) % 10 === 0 || pi === samePairs.length - 1) {
      const genMs = genTimes[0] !== undefined ? genTimes[0].toFixed(0) : '?'
      console.log(`  A: ${pi + 1}/${samePairs.length} — match=${matchCount ?? 'err'}, gen=${genMs}ms, passed=${passCount}`)
    }
  }

  // ── Scenario B: different-person pairs ──
  console.log(`\n  ── Scenario B: different-person (expect circuit assert) ──`)
  const failTimes: number[] = []
  let expectedFailures = 0
  let unexpectedPasses = 0

  for (let pi = 0; pi < diffPairs.length; pi++) {
    const pair = diffPairs[pi]
    // Verify capture from PERSON B against enrollment Poseidon from PERSON A
    const input = buildWitnessInput(pair.verifyBiohash, pair.enrollPoseidon)

    let wasExpectedFailure = false
    const t0 = performance.now()
    try {
      await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH)
      // If we reach here: different-person pair unexpectedly passed threshold
      unexpectedPasses++
      failTimes.push(performance.now() - t0)
    } catch {
      // Expected: circuit assert fires (match_count < 102) or witness gen fails
      failTimes.push(performance.now() - t0)
      wasExpectedFailure = true
      expectedFailures++
    }

    pairResults.push({
      scenario: 'B',
      enrollPersonId: pair.enrollPersonId,
      verifyPersonId: pair.verifyPersonId,
      proof_generation_ms: [failTimes[failTimes.length - 1]],
      proof_verification_ms: [],
      expected_failure: wasExpectedFailure,
    })

    if ((pi + 1) % 10 === 0 || pi === diffPairs.length - 1) {
      console.log(`  B: ${pi + 1}/${diffPairs.length} — failures=${expectedFailures}, unexpected_pass=${unexpectedPasses}, last=${failTimes[failTimes.length - 1]?.toFixed(0)}ms`)
    }
  }

  const result: BenchmarkResult = {
    library: config.name,
    circuit: 'circom_groth16',
    template_encoding: 'binary_0_1',
    output_dim: 128,
    n_same_pairs: samePairs.length,
    n_diff_pairs: diffPairs.length,
    n_proof_runs_per_pair: N_PROOF_RUNS,
    constraint_count: 150413,
    wasm_path: WASM_PATH,
    zkey_path: ZKEY_PATH,

    scenario_a: {
      pairs_tested: samePairs.length,
      pairs_passed: passCount,
      proof_generation_ms: stats(allGenTimes),
      proof_verification_ms: stats(allVerifyTimes),
      avg_match_count: allMatchCounts.length > 0
        ? Number((allMatchCounts.reduce((a, b) => a + b, 0) / allMatchCounts.length).toFixed(1))
        : 0,
      proof_size_bytes: proofSizeBytes,
      public_signals_count: publicSignalsCount,
    },
    scenario_b: {
      pairs_tested: diffPairs.length,
      pairs_expected_failure: expectedFailures,
      pairs_unexpected_pass: unexpectedPasses,
      failure_at_witness_ms: {
        mean: Number((failTimes.reduce((a, b) => a + b, 0) / (failTimes.length || 1)).toFixed(2)),
        std: failTimes.length > 1
          ? Number(stats(failTimes).std)
          : 0,
      },
    },

    pair_results: pairResults,
    timestamp: new Date().toISOString(),
  }

  mkdirSync(RESULTS_DIR, { recursive: true })
  const outPath = join(RESULTS_DIR, `circom_${libField}_benchmark.json`)
  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`\n  ✓ Results saved: ${outPath}`)
  console.log(`  Scenario A: ${passCount}/${samePairs.length} passed`)
  console.log(`    Proof gen:    ${result.scenario_a.proof_generation_ms.mean}ms ± ${result.scenario_a.proof_generation_ms.std}ms`)
  console.log(`    Proof verify: ${result.scenario_a.proof_verification_ms.mean}ms ± ${result.scenario_a.proof_verification_ms.std}ms`)
  console.log(`    Avg match:    ${result.scenario_a.avg_match_count}/128`)
  console.log(`  Scenario B: ${expectedFailures}/${diffPairs.length} correct rejections (${unexpectedPasses} unexpected passes)`)

  return result
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const libArg = args.find(a => a.startsWith('--lib='))?.split('=')[1] as LibraryName | undefined
const LIBS: LibraryName[] = ['facenet', 'facenet512', 'arcface', 'faceapi']

async function main() {
  const targets = libArg ? [libArg] : LIBS
  const summary: { lib: string; passA: number; totalA: number; rejB: number; totalB: number }[] = []

  for (const lib of targets) {
    const r = await benchmarkLibrary(lib)
    summary.push({
      lib: r.library,
      passA: r.scenario_a.pairs_passed,
      totalA: r.scenario_a.pairs_tested,
      rejB: r.scenario_b.pairs_expected_failure,
      totalB: r.scenario_b.pairs_tested,
    })
  }

  if (summary.length > 1) {
    console.log('\n━━━ Summary ━━━')
    for (const s of summary) {
      console.log(`${s.lib}: A=${s.passA}/${s.totalA} passed, B=${s.rejB}/${s.totalB} rejected`)
    }
  }

  console.log('\nCircom benchmark complete.')
  process.exit(0)
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
