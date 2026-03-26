/**
 * Poseidon Hash Utility for Auth Commit Creation
 * Using poseidon-lite library
 *
 * Implements: Poseidon(template(i), i, 3 seeds, version, nonce, product_usage_details)
 * Total: 8 inputs → use poseidon8
 */

import { poseidon8 } from 'poseidon-lite';
import { useMetricsStore, METRIC_OPERATIONS } from '@/stores/useMetricsStore';

/**
 * Create auth_commit using Poseidon hash
 *
 * @param template - Binary template from cancelable biometric (956 bits for MediaPipe)
 * @param templateIndex - Index of the bit in template (0-955 for MediaPipe)
 * @param productKey - Product partial key (seed 1)
 * @param ztizenKey - ZTIZEN partial key (seed 2)
 * @param userKey - User key derived from wallet signature (seed 3)
 * @param version - Version number (default 1)
 * @param nonce - Random nonce for uniqueness
 * @param productUsageDetails - Product service metadata
 * @returns Auth commit hash as BigInt
 */
export function createAuthCommitPoseidon(
  template: number[],
  templateIndex: number,
  productKey: string,
  ztizenKey: string,
  userKey: Uint8Array,
  version: number,
  nonce: bigint,
  productUsageDetails: {
    product_id: string;
    service_id: string;
    service_type: string;
  }
): bigint {
  // Validate inputs - supports multiple template sizes:
  // - 7648 bits: Hybrid algorithm (956 dims × 8-bit quantization)
  // - 956 bits: MediaPipe with 1-bit quantization (native only - browser stack overflow)
  // - 512 bits: Browser ZK circuit (512 elements) - may cause stack overflow
  // - 256 bits: Browser ZK circuit (256 elements) - recommended for browser
  // - 128 bits: Minimal browser-compatible ZK circuit
  // - 1024 bits: Future expansion (if bb.js improves)
  const VALID_TEMPLATE_LENGTHS = [7648, 1024, 956, 512, 256, 128, 32];

  if (!VALID_TEMPLATE_LENGTHS.includes(template.length)) {
    throw new Error(
      `Template must be 7648/1024/956/512/256/128/32 bits, got ${template.length}`
    );
  }

  if (templateIndex < 0 || templateIndex >= template.length) {
    throw new Error(`Template index must be 0-${template.length - 1}, got ${templateIndex}`);
  }

  // Convert inputs to BigInt for Poseidon
  const inputs: bigint[] = [];

  // 1. Template bit at index i
  inputs.push(BigInt(template[templateIndex]));

  // 2. Template index i
  inputs.push(BigInt(templateIndex));

  // 3. Seed 1: Product key (hash to field element)
  inputs.push(stringToFieldElement(productKey));

  // 4. Seed 2: ZTIZEN key (hash to field element)
  inputs.push(stringToFieldElement(ztizenKey));

  // 5. Seed 3: User key (convert bytes to field element)
  inputs.push(bytesToFieldElement(userKey));

  // 6. Version
  inputs.push(BigInt(version));

  // 7. Nonce
  inputs.push(nonce);

  // 8. Product usage details (hash to single field element)
  const usageHash = stringToFieldElement(
    `${productUsageDetails.product_id}:${productUsageDetails.service_id}:${productUsageDetails.service_type}`
  );
  inputs.push(usageHash);

  // Compute Poseidon hash (8 inputs → poseidon8)
  const hash = poseidon8(inputs);

  return hash;
}

/**
 * Create auth_commit for entire template
 * Returns array of commitments (one per bit) - 956 for MediaPipe, 128 for legacy
 */
export function createFullAuthCommit(
  template: number[],
  productKey: string,
  ztizenKey: string,
  userKey: Uint8Array,
  version: number,
  nonce: bigint,
  productUsageDetails: {
    product_id: string;
    service_id: string;
    service_type: string;
  }
): bigint[] {
  const startTime = performance.now();
  const commits: bigint[] = [];

  for (let i = 0; i < template.length; i++) {
    const commit = createAuthCommitPoseidon(
      template,
      i,
      productKey,
      ztizenKey,
      userKey,
      version,
      nonce,
      productUsageDetails
    );
    commits.push(commit);
  }

  // Record timing metric
  const durationMs = performance.now() - startTime;
  useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.POSEIDON_HASHING, durationMs, {
    hashCount: template.length,
  });

  console.log(`✅ Created ${template.length} auth commits using Poseidon (${durationMs.toFixed(2)}ms)`);

  return commits;
}

/**
 * Generate random nonce as BigInt
 * IMPORTANT: Must fit within BN254 field modulus for Noir circuits
 */
export function generateNonce(): bigint {
  // BN254 field modulus (~254 bits)
  const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  // Convert to BigInt
  let nonce = 0n;
  for (const byte of bytes) {
    nonce = (nonce << 8n) | BigInt(byte);
  }

  // Reduce modulo field modulus to ensure it fits within BN254 field
  return nonce % FIELD_MODULUS;
}

/**
 * Convert string to field element using hash
 */
export function stringToFieldElement(str: string): bigint {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return bytesToFieldElement(bytes);
}

/**
 * Convert byte array to field element
 * Takes modulo of a large prime to fit in field
 */
export function bytesToFieldElement(bytes: Uint8Array): bigint {
  let num = 0n;
  for (const byte of bytes) {
    num = (num << 8n) | BigInt(byte);
  }

  // Poseidon works with BN254 field
  // Field modulus: 21888242871839275222246405745257275088548364400416034343698204186575808495617
  const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

  return num % FIELD_MODULUS;
}
