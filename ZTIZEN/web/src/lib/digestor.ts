/**
 * ZITZEN Digestor
 *
 * Converts raw biometric (Float32Array[128]) to binary template (number[128])
 * using per-element PRF based on Poseidon hash
 *
 * digestor(i, biometric[i], seed_user) → 0 or 1
 */

/**
 * Simple hash function for demonstration
 * In production, replace with actual Poseidon hash from circomlibjs
 */
function simpleHash(seed: Uint8Array, index: number, value: number): number {
  let hash = 0;

  // Mix seed bytes
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed[i];
    hash = hash & hash; // Convert to 32bit integer
  }

  // Mix index
  hash = ((hash << 5) - hash) + index;
  hash = hash & hash;

  // Mix biometric value (scaled to integer)
  const scaledValue = Math.floor(value * 1000);
  hash = ((hash << 5) - hash) + scaledValue;
  hash = hash & hash;

  return Math.abs(hash);
}

/**
 * Digest a single biometric dimension
 *
 * @param index - Dimension index (0-127)
 * @param biometric_value - Raw biometric value (float, typically -1 to 1)
 * @param seed_user - User's private seed (32 bytes)
 * @returns Binary value (0 or 1)
 */
export function digestElement(
  index: number,
  biometric_value: number,
  seed_user: Uint8Array
): number {
  // Combine seed with index
  const seed_with_index = simpleHash(seed_user, index, 0);

  // Use biometric value to determine threshold
  const threshold = simpleHash(seed_user, seed_with_index, biometric_value);

  // Convert to binary
  return threshold % 2;
}

/**
 * Digest entire biometric vector
 *
 * @param raw_biometric - Raw biometric from face-api.js (Float32Array[128])
 * @param seed_user - User's private seed (32 bytes)
 * @returns Binary template (number[128] of 0s and 1s)
 */
export function digestBiometric(
  raw_biometric: Float32Array,
  seed_user: Uint8Array
): number[] {
  if (raw_biometric.length !== 128) {
    throw new Error(`Expected 128 dimensions, got ${raw_biometric.length}`);
  }

  if (seed_user.length !== 32) {
    throw new Error(`Expected 32-byte seed, got ${seed_user.length}`);
  }

  const digested_biometric: number[] = [];

  for (let i = 0; i < 128; i++) {
    const binary = digestElement(i, raw_biometric[i], seed_user);
    digested_biometric[i] = binary;
  }

  console.log('Digested biometric:', {
    input_length: raw_biometric.length,
    output_length: digested_biometric.length,
    ones_count: digested_biometric.filter(b => b === 1).length,
    zeros_count: digested_biometric.filter(b => b === 0).length,
  });

  return digested_biometric;
}

/**
 * Calculate Hamming distance between two binary templates
 *
 * @param template1 - First binary template
 * @param template2 - Second binary template
 * @returns Number of differing bits (0-128)
 */
export function hammingDistance(template1: number[], template2: number[]): number {
  if (template1.length !== template2.length) {
    throw new Error('Templates must be same length');
  }

  let distance = 0;
  for (let i = 0; i < template1.length; i++) {
    if (template1[i] !== template2[i]) {
      distance++;
    }
  }

  return distance;
}

/**
 * Calculate match percentage between two binary templates
 *
 * @param enrolled - Enrolled binary template
 * @param verify - Verification binary template
 * @returns Match percentage (0-100)
 */
export function calculateMatchPercentage(enrolled: number[], verify: number[]): number {
  const distance = hammingDistance(enrolled, verify);
  const matches = enrolled.length - distance;
  return Math.round((matches / enrolled.length) * 100);
}

/**
 * Check if match meets threshold
 *
 * @param enrolled - Enrolled binary template
 * @param verify - Verification binary template
 * @param threshold - Minimum match percentage (default: 80)
 * @returns true if match >= threshold
 */
export function isMatchValid(
  enrolled: number[],
  verify: number[],
  threshold: number = 80
): boolean {
  const matchPercentage = calculateMatchPercentage(enrolled, verify);
  return matchPercentage >= threshold;
}

// Export for advanced usage
export { simpleHash };
