/**
 * Manual Circom Groth16 Proof Generation + Verification Test (Node.js)
 *
 * Runs a single proof end-to-end and prints all data:
 * - Input witness values
 * - Proof JSON
 * - Public signals
 * - Match count
 * - Verification result
 * - Solidity calldata
 * - Timing for each stage
 *
 * Usage:
 *   npx tsx scripts/manual-proof-test.ts --lib=facenet
 *   npx tsx scripts/manual-proof-test.ts --lib=arcface --scenario=B
 */

import * as snarkjs from 'snarkjs'
import { writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CRYPTO_KEYS, SZQ_CONFIGS, type LibraryName } from '../utils/config.js'
import { stringToFieldElement } from '../utils/poseidon.js'
import { samplePairs } from '../utils/sample-pairs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ARTIFACTS_DIR = join(__dirname, '../../circuit/circom/artifacts')
const WASM_PATH = join(ARTIFACTS_DIR, 'ztizen_js/ztizen.wasm')
const ZKEY_PATH = join(ARTIFACTS_DIR, 'ztizen.zkey')
const VKEY_PATH = join(ARTIFACTS_DIR, 'verification_key.json')
const OUT_DIR = '/tmp/ztizen-proof'

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const libArg = (args.find(a => a.startsWith('--lib='))?.split('=')[1] ?? 'facenet') as LibraryName
const scenario = args.find(a => a.startsWith('--scenario='))?.split('=')[1] ?? 'A'
const libField = libArg === 'faceapi' ? 'faceapijs' : libArg

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInput(biohash: number[], poseidon: string[]): Record<string, string | string[]> {
  return {
    bio_template: biohash.map(b => b.toString()),
    product_key: stringToFieldElement(CRYPTO_KEYS.PRODUCT_KEY).toString(),
    ztizen_key: stringToFieldElement(CRYPTO_KEYS.ZTIZEN_KEY).toString(),
    user_key: stringToFieldElement(CRYPTO_KEYS.USER_KEYS[0]).toString(),
    version: '1',
    nonce: '0',
    product_usage_hash: '0',
    auth_commit_stored: poseidon,
  }
}

function hr() { console.log('─'.repeat(70)) }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'━'.repeat(70)}`)
  console.log(`  Circom Groth16 Manual Proof Test`)
  console.log(`  Library: ${SZQ_CONFIGS[libArg].name}   Scenario: ${scenario}`)
  console.log(`${'━'.repeat(70)}\n`)

  // Verify artifacts exist
  for (const [label, path] of [['WASM', WASM_PATH], ['zkey', ZKEY_PATH], ['vkey', VKEY_PATH]] as const) {
    if (!existsSync(path)) throw new Error(`${label} not found: ${path}`)
    console.log(`✓ ${label}: ${path}`)
  }

  // Sample pairs
  const { samePairs, diffPairs } = samplePairs(libField, 1, 1)

  let biohash: number[]
  let poseidon: string[]
  let label: string

  if (scenario === 'B') {
    // Different-person: verify person B against enroll person A
    const pair = diffPairs[0]
    biohash = pair.verifyBiohash
    poseidon = pair.enrollPoseidon
    label = `Enroll: ${pair.enrollPersonId} / Verify: ${pair.verifyPersonId}`
    console.log(`\nScenario B (different-person — expect REJECTION)`)
  } else {
    // Same-person: verify capture 1 against enroll capture 0
    const pair = samePairs[0]
    biohash = pair.verifyBiohash
    poseidon = pair.enrollPoseidon
    label = `Person: ${pair.personId}  enroll_cap=${pair.enrollCaptureIdx}  verify_cap=${pair.verifyCaptureIdx}`
    console.log(`\nScenario A (same-person — expect PASS ≥102/128)`)
  }

  console.log(`Pair: ${label}`)

  const input = buildInput(biohash, poseidon)

  // ── Print input ──────────────────────────────────────────────────────────
  hr()
  console.log('INPUT:')
  console.log(`  bio_template (first 16):  [${input.bio_template.slice(0, 16).join(', ')}]`)
  console.log(`  bio_template (all 128):   ${biohash.join('')}  (${biohash.filter(b=>b===1).length} ones)`)
  console.log(`  product_key:              ${input.product_key}`)
  console.log(`  ztizen_key:               ${input.ztizen_key}`)
  console.log(`  user_key:                 ${input.user_key}`)
  console.log(`  auth_commit_stored[0]:    ${poseidon[0]}`)
  console.log(`  auth_commit_stored[127]:  ${poseidon[127]}`)

  // ── Generate proof ───────────────────────────────────────────────────────
  hr()
  console.log('PROOF GENERATION:')
  const t0 = performance.now()
  let proof: any
  let publicSignals: any
  let proofGenMs: number

  try {
    const result = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH)
    proof = result.proof
    publicSignals = result.publicSignals
    proofGenMs = performance.now() - t0
    console.log(`  ✓ Proof generated in ${proofGenMs.toFixed(0)}ms`)
  } catch (err: any) {
    proofGenMs = performance.now() - t0
    console.log(`  ✗ Proof generation FAILED in ${proofGenMs.toFixed(0)}ms`)
    console.log(`  Error: ${err.message}`)
    console.log(`  (Expected for Scenario B — circuit assert fires when match_count < 102)`)
    process.exit(0)
  }

  // ── Print proof ──────────────────────────────────────────────────────────
  hr()
  console.log('PROOF:')
  console.log(JSON.stringify(proof, null, 2))

  // ── Print public signals ─────────────────────────────────────────────────
  hr()
  console.log('PUBLIC SIGNALS:')
  const matchCount = Number(publicSignals[0])
  console.log(`  publicSignals[0] = match_count: ${matchCount}/128  (threshold: 102)`)
  console.log(`  publicSignals[1..128] = auth_commit_stored (echoed):`)
  console.log(`    [0]: ${publicSignals[1]}`)
  console.log(`    [1]: ${publicSignals[2]}`)
  console.log(`    ... (${publicSignals.length - 1} total commitment values)`)

  // ── Verify proof ─────────────────────────────────────────────────────────
  hr()
  console.log('VERIFICATION:')
  const { default: vKey } = await import(VKEY_PATH, { assert: { type: 'json' } }).catch(
    async () => ({ default: JSON.parse(await (await import('fs')).readFileSync(VKEY_PATH, 'utf-8')) })
  )
  const { readFileSync } = await import('fs')
  const vk = JSON.parse(readFileSync(VKEY_PATH, 'utf-8'))

  const t1 = performance.now()
  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof)
  const verifyMs = performance.now() - t1
  console.log(`  Valid: ${valid ? '✓ TRUE' : '✗ FALSE'}  (${verifyMs.toFixed(1)}ms)`)

  // ── Solidity calldata ────────────────────────────────────────────────────
  hr()
  console.log('SOLIDITY CALLDATA (for ZtizenVerifier.sol):')
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)
  const parsed = JSON.parse(`[${calldata}]`)
  console.log(`  pA:         ${JSON.stringify(parsed[0])}`)
  console.log(`  pB:         ${JSON.stringify(parsed[1])}`)
  console.log(`  pC:         ${JSON.stringify(parsed[2])}`)
  console.log(`  pubSignals: [${parsed[3][0]}, ... (${parsed[3].length} values)]`)

  // ── Save to /tmp ─────────────────────────────────────────────────────────
  hr()
  await import('fs').then(({ mkdirSync }) => mkdirSync(OUT_DIR, { recursive: true }))
  writeFileSync(`${OUT_DIR}/input.json`, JSON.stringify(input, null, 2))
  writeFileSync(`${OUT_DIR}/proof.json`, JSON.stringify(proof, null, 2))
  writeFileSync(`${OUT_DIR}/public.json`, JSON.stringify(publicSignals, null, 2))
  writeFileSync(`${OUT_DIR}/calldata.json`, JSON.stringify(parsed, null, 2))
  console.log(`Files saved to ${OUT_DIR}/`)
  console.log(`  input.json    — witness input`)
  console.log(`  proof.json    — Groth16 proof`)
  console.log(`  public.json   — public signals`)
  console.log(`  calldata.json — Solidity calldata`)

  // ── Summary ──────────────────────────────────────────────────────────────
  hr()
  console.log('SUMMARY:')
  console.log(`  Library:       ${SZQ_CONFIGS[libArg].name}`)
  console.log(`  Scenario:      ${scenario}`)
  console.log(`  Match count:   ${matchCount}/128  (${(matchCount/128*100).toFixed(1)}%)`)
  console.log(`  Proof valid:   ${valid}`)
  console.log(`  Proof gen:     ${proofGenMs.toFixed(0)}ms`)
  console.log(`  Proof verify:  ${verifyMs.toFixed(1)}ms`)
  console.log(`  Proof size:    ${JSON.stringify(proof).length} bytes`)
  console.log(`${'━'.repeat(70)}\n`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
