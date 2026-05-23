/**
 * Circom/Groth16 Browser-Side Proof Generation
 *
 * Mirrors the zadelend pattern: fetch .wasm + .zkey from /public/circom/,
 * run groth16.fullProve() entirely in the browser via snarkjs.
 *
 * Files served from /public/circom/:
 *   ztizen.wasm          (3.1 MB)
 *   ztizen.zkey          (66 MB — downloaded once, cached by browser)
 *   verification_key.json (26 KB)
 *
 * Circuit inputs (must match ztizen.circom):
 *   bio_template[128]        — binary 0/1 biohash (verify capture)
 *   product_key              — field element
 *   ztizen_key               — field element
 *   user_key                 — field element
 *   version                  — "1"
 *   nonce                    — "0"
 *   product_usage_hash       — "0"
 *   auth_commit_stored[128]  — enrollment Poseidon hashes (public input)
 *
 * Public outputs:
 *   publicSignals[0]         — match_count (number of matching positions, expect ≥102)
 *   publicSignals[1..128]    — auth_commit_stored (echoed back as public inputs)
 */

import { groth16, type Groth16Proof, type PublicSignals } from 'snarkjs'

const CIRCOM_BASE = '/circom'

export interface CircomInput {
  bio_template: string[]           // 128 binary values as strings ("0" or "1")
  product_key: string
  ztizen_key: string
  user_key: string
  version: string
  nonce: string
  product_usage_hash: string
  auth_commit_stored: string[]     // 128 Poseidon hashes as decimal strings
}

export interface CircomProofOutput {
  proof: Groth16Proof
  publicSignals: PublicSignals
  matchCount: number
  proofValid?: boolean
  timings: {
    fetchMs: number
    proofGenMs: number
    verifyMs?: number
    totalMs: number
  }
}

export interface CircomSolidityCallData {
  pA: string[]
  pB: string[][]
  pC: string[]
  pubSignals: string[]
}

/**
 * Generate a Groth16 proof in the browser.
 * Fetches wasm + zkey from /public/circom/ — zkey is 66MB, cached after first load.
 */
export async function generateCircomProof(input: CircomInput): Promise<CircomProofOutput> {
  const t0 = performance.now()

  // Fetch wasm + zkey in parallel
  const [wasmBuffer, zkeyBuffer] = await Promise.all([
    fetch(`${CIRCOM_BASE}/ztizen.wasm`).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch ztizen.wasm: ${r.statusText}`)
      return r.arrayBuffer()
    }),
    fetch(`${CIRCOM_BASE}/ztizen.zkey`).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch ztizen.zkey: ${r.statusText}`)
      return r.arrayBuffer()
    }),
  ])

  const fetchMs = performance.now() - t0

  // Generate proof
  const t1 = performance.now()
  const { proof, publicSignals } = await groth16.fullProve(
    input,
    new Uint8Array(wasmBuffer),
    new Uint8Array(zkeyBuffer)
  )
  const proofGenMs = performance.now() - t1

  // match_count is publicSignals[0]
  const matchCount = Number(publicSignals[0])

  return {
    proof,
    publicSignals,
    matchCount,
    timings: {
      fetchMs,
      proofGenMs,
      totalMs: performance.now() - t0,
    },
  }
}

/**
 * Verify a Groth16 proof in the browser using the verification key.
 */
export async function verifyCircomProof(
  proof: Groth16Proof,
  publicSignals: PublicSignals
): Promise<{ valid: boolean; verifyMs: number }> {
  const vkRes = await fetch(`${CIRCOM_BASE}/verification_key.json`)
  if (!vkRes.ok) throw new Error(`Failed to fetch verification_key.json: ${vkRes.statusText}`)
  const vKey = await vkRes.json()

  const t0 = performance.now()
  const valid = await groth16.verify(vKey, publicSignals, proof)
  const verifyMs = performance.now() - t0

  return { valid, verifyMs }
}

/**
 * Export proof as Solidity calldata for on-chain submission.
 * Returns [pA, pB, pC, pubSignals] ready for ZtizenVerifier.sol.
 */
export async function exportSolidityCallData(
  proof: Groth16Proof,
  publicSignals: PublicSignals
): Promise<CircomSolidityCallData> {
  const calldata = await groth16.exportSolidityCallData(proof, publicSignals)
  const parsed = JSON.parse(`[${calldata}]`) as [string[], string[][], string[], string[]]
  return {
    pA: parsed[0],
    pB: parsed[1],
    pC: parsed[2],
    pubSignals: parsed[3],
  }
}
