/**
 * Custom Quantization BioHashing Implementation
 * Based on: /research/CUSTOM_QUANTIZATION_BIOHASHING.md
 *
 * Algorithm:
 * 1. Quantize each biometric dimension to bins
 * 2. Mix quantized value with position-specific seed
 * 3. Generate bio-influenced threshold
 * 4. Compare quantized value vs threshold → binary bit
 */

import { generateSeedFromPIN } from './biohashing-mediapipe';

const BIN_WIDTH = 0.2;  // Bin width for quantization
const NUM_BINS = Math.ceil(2.0 / BIN_WIDTH);  // 10 bins for range [-1, 1]
const GOLDEN_RATIO = 0x9E3779B9;  // Golden ratio constant for mixing

/**
 * Linear Congruential Generator for deterministic randomness
 */
class LCG {
  private state: number;
  private readonly A = 1664525;
  private readonly C = 1013904223;
  private readonly M = 0x100000000;  // 2^32

  constructor(seed: number) {
    this.state = seed >>> 0;  // Ensure unsigned 32-bit
  }

  next(): number {
    this.state = (this.A * this.state + this.C) % this.M;
    return this.state / this.M;  // Return [0, 1)
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

/**
 * Generate indexed seed from user seed and position
 */
async function generateIndexedSeed(userSeed: Uint8Array, index: number): Promise<number> {
  const combined = new Uint8Array(userSeed.length + 4);
  combined.set(userSeed);

  // Add index as 4 bytes (big-endian)
  combined[userSeed.length] = (index >> 24) & 0xff;
  combined[userSeed.length + 1] = (index >> 16) & 0xff;
  combined[userSeed.length + 2] = (index >> 8) & 0xff;
  combined[userSeed.length + 3] = index & 0xff;

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = new Uint8Array(hashBuffer);

  return (
    (hashArray[0] << 24) |
    (hashArray[1] << 16) |
    (hashArray[2] << 8) |
    hashArray[3]
  ) >>> 0;
}

/**
 * Quantize a biometric value to bin index
 * Maps [-1, 1] to bins [0, 9]
 */
function quantize(value: number, binWidth: number = BIN_WIDTH): number {
  // Clamp to [-1, 1]
  const clamped = Math.max(-1.0, Math.min(1.0, value));

  // Shift to [0, 2]
  const shifted = clamped + 1.0;

  // Divide by bin width and floor
  const bin = Math.floor(shifted / binWidth);

  // Clamp to valid bin range
  return Math.max(0, Math.min(NUM_BINS - 1, bin));
}

/**
 * Custom Quantization BioHashing
 *
 * For each dimension i:
 *   1. seed_i = SHA256(user_seed || i)
 *   2. quantized_i = quantize(biometric[i], bin_width)
 *   3. mixed_seed = seed_i ⊕ (quantized_i × GOLDEN_RATIO)
 *   4. threshold_i = LCG(mixed_seed).nextInt(NUM_BINS)
 *   5. bit_i = (quantized_i > threshold_i) ? 1 : 0
 */
export async function customQuantizationBioHashing(
  biometricValues: number[],
  userSeed: Uint8Array
): Promise<{
  digest: Uint8Array;
  bits: number[];
  quantized: number[];
  thresholds: number[];
}> {
  const dimensions = biometricValues.length;
  const bits: number[] = [];
  const quantized: number[] = [];
  const thresholds: number[] = [];

  console.log('🔧 Custom Quantization BioHashing:', {
    dimensions,
    binWidth: BIN_WIDTH,
    numBins: NUM_BINS,
  });

  for (let i = 0; i < dimensions; i++) {
    // Step 1: Generate position-specific seed
    const seed_i = await generateIndexedSeed(userSeed, i);

    // Step 2: Quantize biometric value to bin
    const quantized_i = quantize(biometricValues[i], BIN_WIDTH);
    quantized.push(quantized_i);

    // Step 3: Mix seed with quantized biometric (bio-influenced randomness)
    const mixed_seed = (seed_i ^ ((quantized_i * GOLDEN_RATIO) >>> 0)) >>> 0;

    // Step 4: Generate threshold using LCG with mixed seed
    const rng = new LCG(mixed_seed);
    const threshold_i = rng.nextInt(NUM_BINS);
    thresholds.push(threshold_i);

    // Step 5: Binary comparison
    const bit_i = quantized_i > threshold_i ? 1 : 0;
    bits.push(bit_i);

    // Log first 5 for debugging
    if (i < 5) {
      console.log(`  Dim ${i}: value=${biometricValues[i].toFixed(3)}, quantized=${quantized_i}, threshold=${threshold_i}, bit=${bit_i}`);
    }
  }

  // Pack bits into bytes
  const digest = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 1) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      digest[byteIndex] |= (1 << bitIndex);
    }
  }

  const onesCount = bits.filter(b => b === 1).length;
  const balance = (onesCount / bits.length) * 100;

  console.log('✅ Custom Quantization complete:', {
    digestSize: digest.length,
    bitsCount: bits.length,
    onesCount,
    balance: balance.toFixed(1) + '%',
  });

  return {
    digest,
    bits,
    quantized,
    thresholds,
  };
}

/**
 * Enrollment with custom quantization
 */
export async function enrollCustomQuantization(
  biometricValues: number[],
  pin: string
): Promise<{
  digest: Uint8Array;
  bits: number[];
  quantized: number[];
  thresholds: number[];
}> {
  console.log('📝 Custom Quantization Enrollment...');

  // Generate seed from PIN
  const seed = await generateSeedFromPIN(pin);

  // Apply custom quantization BioHashing
  const result = await customQuantizationBioHashing(biometricValues, seed);

  console.log('✅ Enrollment complete (custom quantization)');

  return result;
}

/**
 * Verification with custom quantization
 */
export async function verifyCustomQuantization(
  biometricValues: number[],
  pin: string,
  enrolledDigest: Uint8Array,
  threshold: number = 80
): Promise<{
  isMatch: boolean;
  matchRate: number;
}> {
  console.log('🔐 Custom Quantization Verification...');

  // Generate seed from PIN
  const seed = await generateSeedFromPIN(pin);

  // Apply custom quantization BioHashing
  const result = await customQuantizationBioHashing(biometricValues, seed);

  // Calculate match rate (Hamming distance)
  const totalBits = enrolledDigest.length * 8;
  let matchingBits = 0;

  for (let byteIndex = 0; byteIndex < enrolledDigest.length; byteIndex++) {
    const byte1 = enrolledDigest[byteIndex];
    const byte2 = result.digest[byteIndex];
    const xor = byte1 ^ byte2;

    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      if ((xor & (1 << bitIndex)) === 0) {
        matchingBits++;
      }
    }
  }

  const matchRate = (matchingBits / totalBits) * 100;
  const isMatch = matchRate >= threshold;

  console.log('🔍 Verification result (custom):', {
    matchRate: matchRate.toFixed(2) + '%',
    threshold: threshold + '%',
    isMatch: isMatch ? '✅ MATCH' : '❌ NO MATCH',
  });

  return {
    isMatch,
    matchRate,
  };
}

/**
 * Calculate match rate between two custom quantization digests
 */
export function matchCustomDigests(digest1: Uint8Array, digest2: Uint8Array): number {
  if (digest1.length !== digest2.length) {
    throw new Error('Digests must be same length');
  }

  const totalBits = digest1.length * 8;
  let matchingBits = 0;

  for (let byteIndex = 0; byteIndex < digest1.length; byteIndex++) {
    const byte1 = digest1[byteIndex];
    const byte2 = digest2[byteIndex];
    const xor = byte1 ^ byte2;

    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      if ((xor & (1 << bitIndex)) === 0) {
        matchingBits++;
      }
    }
  }

  return (matchingBits / totalBits) * 100;
}
