/**
 * GROUP A: Noir/UltraHonk Proof Generation + Verification Benchmark (Node.js)
 *
 * Uses @aztec/bb.js UltraHonkBackend with the ztizen_circuit_biohash128 circuit.
 * Template input: binary 0/1 biohash values (same as circom benchmark).
 * The circuit treats template[i] as a field element — 0 or 1 are valid inputs.
 *
 * Same person-pairs as 02-circom-benchmark.ts (via samplePairs), so timing
 * results are directly comparable between Groth16 and UltraHonk.
 *
 * Outputs: results/circuit-timing/noir_{lib}_benchmark.json
 *
 * Usage:
 *   npx tsx pipeline/03-noir-benchmark.ts --lib=facenet
 *   npx tsx pipeline/03-noir-benchmark.ts   (all libraries)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CRYPTO_KEYS, SZQ_CONFIGS, type LibraryName } from '../utils/config.js'
import { stringToFieldElement } from '../utils/poseidon.js'
import { samplePairs } from '../utils/sample-pairs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPERIMENTAL_DIR = join(__dirname, '..')
const CIRCUIT_PATH = join(EXPERIMENTAL_DIR, '../web/public/circuits/ztizen_circuit_biohash128.json')
const RESULTS_DIR = join(EXPERIMENTAL_DIR, 'results/circuit-timing')

const N_SAME_PAIRS = 50
const N_DIFF_PAIRS = 50
const N_PROOF_RUNS = 3

// ─── Types ────────────────────────────────────────────────────────────────────

interface PairResult {
  scenario: 'A' | 'B'
  personId?: string
  enrollPersonId?: string
  verifyPersonId?: string
  witness_gen_ms: number[]
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
  circuit: 'noir_ultrahonk'
  template_encoding: 'binary_0_1'
  output_dim: 128
  n_same_pairs: number
  n_diff_pairs: number
  n_proof_runs_per_pair: number
  circuit_path: string

  scenario_a: {
    pairs_tested: number
    pairs_passed: number
    witness_gen_ms: Stats
    proof_generation_ms: Stats
    proof_verification_ms: Stats
    avg_match_count: number
    proof_size_bytes: number
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

function statsOf(arr: number[]): Stats {
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
    template: biohash.map(b => b.toString()),
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
  console.log(`\n━━━ Noir/UltraHonk Benchmark: ${config.name} ━━━`)

  if (!existsSync(CIRCUIT_PATH)) throw new Error(`Circuit not found: ${CIRCUIT_PATH}`)

  const { Noir } = await import('@noir-lang/noir_js' as any)
  const { UltraHonkBackend } = await import('@aztec/bb.js' as any)

  console.log('  Loading circuit...')
  const circuit = JSON.parse(readFileSync(CIRCUIT_PATH, 'utf-8'))
  const noir = new Noir(circuit)
  const backend = new UltraHonkBackend(circuit.bytecode)
  await noir.init()
  console.log('  Circuit initialized.')

  console.log(`  Sampling ${N_SAME_PAIRS} same-person + ${N_DIFF_PAIRS} diff-person pairs...`)
  const { samePairs, diffPairs } = samplePairs(libField, N_SAME_PAIRS, N_DIFF_PAIRS)
  console.log(`  Got ${samePairs.length} same-person pairs, ${diffPairs.length} diff-person pairs.`)

  const pairResults: PairResult[] = []

  // ── Scenario A: same-person pairs ──
  console.log(`\n  ── Scenario A: same-person (expect pass ≥102/128) ──`)
  const allWitnessTimes: number[] = []
  const allGenTimes: number[] = []
  const allVerifyTimes: number[] = []
  const allMatchCounts: number[] = []
  let proofSizeBytes = 0
  let passCount = 0

  for (let pi = 0; pi < samePairs.length; pi++) {
    const pair = samePairs[pi]
    const inputs = buildWitnessInput(pair.verifyBiohash, pair.enrollPoseidon)

    const witnessTimes: number[] = []
    const genTimes: number[] = []
    const verifyTimes: number[] = []
    let matchCount: number | undefined
    let proofValid: boolean | undefined
    let errorMsg: string | undefined

    try {
      for (let r = 0; r < N_PROOF_RUNS; r++) {
        const t0 = performance.now()
        const { witness } = await noir.execute(inputs)
        const t1 = performance.now()
        witnessTimes.push(t1 - t0)

        const t2 = performance.now()
        const { proof, publicInputs } = await backend.generateProof(witness, { keccak: false })
        const t3 = performance.now()
        genTimes.push(t3 - t2)

        if (r === 0) {
          // publicInputs layout: [auth_commit_stored[0..127], match_count, computed_commit[0..127]]
          matchCount = publicInputs.length > 128 ? Number(BigInt(publicInputs[128])) : undefined
          proofSizeBytes = proof.length
        }

        const t4 = performance.now()
        const valid = await backend.verifyProof({ proof, publicInputs }, { keccak: false })
        const t5 = performance.now()
        verifyTimes.push(t5 - t4)
        if (r === 0) proofValid = valid
      }
      passCount++
      allWitnessTimes.push(...witnessTimes)
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
      witness_gen_ms: witnessTimes,
      proof_generation_ms: genTimes,
      proof_verification_ms: verifyTimes,
      match_count: matchCount,
      proof_valid: proofValid,
      error: errorMsg,
    })

    if ((pi + 1) % 10 === 0 || pi === samePairs.length - 1) {
      const wMs = witnessTimes[0] !== undefined ? witnessTimes[0].toFixed(0) : '?'
      const gMs = genTimes[0] !== undefined ? genTimes[0].toFixed(0) : '?'
      console.log(`  A: ${pi + 1}/${samePairs.length} — match=${matchCount ?? 'err'}, witness=${wMs}ms, gen=${gMs}ms, passed=${passCount}`)
    }
  }

  // ── Scenario B: different-person pairs ──
  console.log(`\n  ── Scenario B: different-person (expect circuit assert) ──`)
  const failTimes: number[] = []
  let expectedFailures = 0
  let unexpectedPasses = 0

  for (let pi = 0; pi < diffPairs.length; pi++) {
    const pair = diffPairs[pi]
    const inputs = buildWitnessInput(pair.verifyBiohash, pair.enrollPoseidon)

    let wasExpectedFailure = false
    const t0 = performance.now()
    try {
      const { witness } = await noir.execute(inputs)
      await backend.generateProof(witness, { keccak: false })
      unexpectedPasses++
      failTimes.push(performance.now() - t0)
    } catch {
      failTimes.push(performance.now() - t0)
      wasExpectedFailure = true
      expectedFailures++
    }

    pairResults.push({
      scenario: 'B',
      enrollPersonId: pair.enrollPersonId,
      verifyPersonId: pair.verifyPersonId,
      witness_gen_ms: [failTimes[failTimes.length - 1]],
      proof_generation_ms: [],
      proof_verification_ms: [],
      expected_failure: wasExpectedFailure,
    })

    if ((pi + 1) % 10 === 0 || pi === diffPairs.length - 1) {
      console.log(`  B: ${pi + 1}/${diffPairs.length} — failures=${expectedFailures}, unexpected_pass=${unexpectedPasses}, last=${failTimes[failTimes.length - 1]?.toFixed(0)}ms`)
    }
  }

  const result: BenchmarkResult = {
    library: config.name,
    circuit: 'noir_ultrahonk',
    template_encoding: 'binary_0_1',
    output_dim: 128,
    n_same_pairs: samePairs.length,
    n_diff_pairs: diffPairs.length,
    n_proof_runs_per_pair: N_PROOF_RUNS,
    circuit_path: CIRCUIT_PATH,

    scenario_a: {
      pairs_tested: samePairs.length,
      pairs_passed: passCount,
      witness_gen_ms: statsOf(allWitnessTimes),
      proof_generation_ms: statsOf(allGenTimes),
      proof_verification_ms: statsOf(allVerifyTimes),
      avg_match_count: allMatchCounts.length > 0
        ? Number((allMatchCounts.reduce((a, b) => a + b, 0) / allMatchCounts.length).toFixed(1))
        : 0,
      proof_size_bytes: proofSizeBytes,
    },
    scenario_b: {
      pairs_tested: diffPairs.length,
      pairs_expected_failure: expectedFailures,
      pairs_unexpected_pass: unexpectedPasses,
      failure_at_witness_ms: {
        mean: Number((failTimes.reduce((a, b) => a + b, 0) / (failTimes.length || 1)).toFixed(2)),
        std: failTimes.length > 1 ? Number(statsOf(failTimes).std) : 0,
      },
    },

    pair_results: pairResults,
    timestamp: new Date().toISOString(),
  }

  mkdirSync(RESULTS_DIR, { recursive: true })
  const outPath = join(RESULTS_DIR, `noir_${libField}_benchmark.json`)
  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`\n  ✓ Results saved: ${outPath}`)
  console.log(`  Scenario A: ${passCount}/${samePairs.length} passed`)
  console.log(`    Witness gen:  ${result.scenario_a.witness_gen_ms.mean}ms ± ${result.scenario_a.witness_gen_ms.std}ms`)
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

  console.log('\nNoir benchmark complete.')
  process.exit(0)
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
