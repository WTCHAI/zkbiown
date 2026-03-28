/**
 * Poseidon Hash Utility for Auth Commit Creation
 * Using poseidon-lite library
 *
 * Implements: Poseidon(template(i), i, 3 seeds, version, nonce, product_usage_details)
 * Total: 8 inputs → use poseidon8
 *
 * Extracted from production code: web/src/lib/poseidonHash.ts
 * Adapted for experimental validation with real FaceScrub embeddings
 */

import { poseidon8 } from 'poseidon-lite'

/**
 * BN254 field modulus used by Poseidon hash
 * This is the prime field used in the ZK circuit
 */
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

/**
 * Convert string to field element using byte conversion
 * Matches production implementation
 */
export function stringToFieldElement(str: string): bigint {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  return bytesToFieldElement(bytes)
}

/**
 * Convert byte array to field element
 * Takes modulo BN254 field modulus to fit in field
 */
export function bytesToFieldElement(bytes: Uint8Array): bigint {
  let num = 0n
  for (const byte of bytes) {
    num = (num << 8n) | BigInt(byte)
  }
  return num % FIELD_MODULUS
}

/**
 * Legacy: Generate a field element seed from a key string
 * Uses SHA-256 hash and reduces to BN254 field modulus
 * @deprecated Use stringToFieldElement instead for consistency with production
 */
export function generateKeySeed(key: string): bigint {
  return stringToFieldElement(key)
}

/**
 * Generate Poseidon hashes for each bit in a binary template
 *
 * This is the ACTUAL comparison format used in the ZK circuit.
 * Each bit is hashed with poseidon8 using:
 * 1. Template bit at index i (0 or 1)
 * 2. Template index i (0-127 for 128-bit template)
 * 3. Seed 1: Product key
 * 4. Seed 2: ZTIZEN key
 * 5. Seed 3: User key
 * 6. Version number
 * 7. Nonce
 * 8. Product usage details hash
 *
 * Matches production: web/src/lib/poseidonHash.ts::createFullAuthCommit
 *
 * @param binaryTemplate - Binary template from BioHashing (128 bits or other lengths)
 * @param productKey - Product key (Kp) as string
 * @param ztizenKey - ZTIZEN key (Kz) as string
 * @param userKey - User key (Ku) as string or Uint8Array
 * @param version - Version number (default: 1)
 * @param nonce - Nonce for uniqueness (default: 0)
 * @param productUsageDetails - Product service metadata (default: empty)
 * @returns Array of Poseidon hashes (one per bit)
 */
export function generatePoseidonBitHashes(
  binaryTemplate: number[],
  productKey: string,
  ztizenKey: string,
  userKey: string | Uint8Array,
  version: number = 1,
  nonce: bigint = 0n,
  productUsageDetails?: {
    product_id: string
    service_id: string
    service_type: string
  }
): bigint[] {
  // Convert keys to field elements
  const productKeySeed = stringToFieldElement(productKey)
  const ztizenKeySeed = stringToFieldElement(ztizenKey)
  const userKeySeed = typeof userKey === 'string'
    ? stringToFieldElement(userKey)
    : bytesToFieldElement(userKey)

  // Convert product usage details to single field element
  const usageHash = productUsageDetails
    ? stringToFieldElement(
        `${productUsageDetails.product_id}:${productUsageDetails.service_id}:${productUsageDetails.service_type}`
      )
    : 0n

  const bitHashes: bigint[] = []

  // Hash each bit with poseidon8
  for (let i = 0; i < binaryTemplate.length; i++) {
    const bit = BigInt(binaryTemplate[i])
    const index = BigInt(i)

    // poseidon8 takes 8 inputs (matches production code)
    const hash = poseidon8([
      bit,              // 1. Template bit at index i
      index,            // 2. Template index i
      productKeySeed,   // 3. Seed 1: Product key
      ztizenKeySeed,    // 4. Seed 2: ZTIZEN key
      userKeySeed,      // 5. Seed 3: User key
      BigInt(version),  // 6. Version
      nonce,            // 7. Nonce
      usageHash,        // 8. Product usage details
    ])

    bitHashes.push(hash)
  }

  return bitHashes
}

/**
 * Calculate match rate between two Poseidon hash arrays
 *
 * This is the CORRECT comparison metric for the ZK circuit.
 * Counts how many Poseidon hashes match exactly.
 *
 * @param a - First Poseidon hash array
 * @param b - Second Poseidon hash array
 * @returns Match rate between 0 and 1 (0 = completely different, 1 = identical)
 */
export function poseidonMatchRate(a: bigint[], b: bigint[]): number {
  if (a.length !== b.length) {
    throw new Error(`Array length mismatch: ${a.length} vs ${b.length}`)
  }

  let matches = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) {
      matches++
    }
  }

  return matches / a.length
}

/**
 * Generate Poseidon commitment from bit hashes
 *
 * Commitment is the XOR of all bit hashes.
 * This provides a compact representation of the template.
 *
 * @param bitHashes - Array of Poseidon hashes
 * @returns Commitment value
 */
export function generateCommitment(bitHashes: bigint[]): bigint {
  return bitHashes.reduce((acc, hash) => acc ^ hash, BigInt(0))
}

/**
 * Generate random nonce as BigInt
 * IMPORTANT: Must fit within BN254 field modulus for Noir circuits
 *
 * Matches production: web/src/lib/poseidonHash.ts::generateNonce
 */
export function generateNonce(): bigint {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  // Convert to BigInt
  let nonce = 0n
  for (const byte of bytes) {
    nonce = (nonce << 8n) | BigInt(byte)
  }

  // Reduce modulo field modulus to ensure it fits within BN254 field
  return nonce % FIELD_MODULUS
}
