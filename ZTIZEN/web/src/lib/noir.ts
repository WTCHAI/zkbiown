/**
 * ZITZEN Noir Proof Generation (MOCKED)
 *
 * Mock implementation for biometric authentication proof generation
 *
 * NOTE: This is a temporary mock until the Noir circuit is compiled.
 * Replace with actual Noir integration when circuit is ready.
 */

import { calculateMatchPercentage } from './digestor';

// Legacy type for old demo components
interface ProofData {
  proof: any;
  publicInputs: any;
  matchPercentage?: number;  // Optional match percentage
  generatedAt?: Date;  // Optional timestamp
  [key: string]: any;  // Allow any other properties
}

/**
 * Generate MOCK ZK proof for biometric authentication
 *
 * @param enrolledBiometric - Binary template from enrollment (128 bits)
 * @param verifyBiometric - Binary template from current scan (128 bits)
 * @param seed_user - User's private seed (32 bytes)
 * @returns Mock proof data including proof, public inputs, and match percentage
 */
export async function generateProof(
  enrolledBiometric: number[],
  verifyBiometric: number[],
  seed_user: Uint8Array
): Promise<ProofData> {
  try {
    console.log('⚠️  Starting MOCK proof generation (circuit not compiled)...');
    console.log('Enrolled biometric length:', enrolledBiometric.length);
    console.log('Verify biometric length:', verifyBiometric.length);

    // Validate inputs
    if (enrolledBiometric.length !== 128) {
      throw new Error(`Enrolled biometric must be 128 dimensions, got ${enrolledBiometric.length}`);
    }

    if (verifyBiometric.length !== 128) {
      throw new Error(`Verify biometric must be 128 dimensions, got ${verifyBiometric.length}`);
    }

    if (seed_user.length !== 32) {
      throw new Error(`Seed must be 32 bytes, got ${seed_user.length}`);
    }

    // Calculate match percentage
    const matchPercentage = calculateMatchPercentage(enrolledBiometric, verifyBiometric);
    console.log('Match percentage:', matchPercentage);

    if (matchPercentage < 80) {
      throw new Error(`Match below threshold: ${matchPercentage}% (need ≥80%)`);
    }

    // Simulate proof generation delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock b_partial_key and version for demo
    const b_partial_key = new Uint8Array(32);
    crypto.getRandomValues(b_partial_key);
    const version = 1;
    const currentNonce = 0;

    // Compute mock commitment
    const storedAuthCommit = computeMockCommitment(
      enrolledBiometric,
      seed_user,
      b_partial_key,
      currentNonce,
      version
    );

    // Generate mock proof (32 random bytes)
    const mockProof = new Uint8Array(32);
    crypto.getRandomValues(mockProof);

    // Generate mock public inputs
    const mockPublicInputs = [
      storedAuthCommit,
      String(currentNonce + 1), // new_nonce
      String(matchPercentage),  // match_percentage
    ];

    console.log('✅ MOCK proof generated successfully');
    console.log('⚠️  NOTE: This is NOT a real ZK proof! Compile circuit for production.');
    console.log('Mock proof size:', mockProof.length, 'bytes');

    return {
      proof: mockProof,
      publicInputs: mockPublicInputs,
      matchPercentage,
      generatedAt: new Date(),
    };

  } catch (error) {
    console.error('Mock proof generation error:', error);
    throw new Error(`Mock proof generation failed: ${(error as Error).message}`);
  }
}

/**
 * Verify MOCK ZK proof
 *
 * @param proof - Proof bytes
 * @param publicInputs - Public inputs as strings
 * @returns Always true (mock verification)
 */
export async function verifyProof(
  proof: Uint8Array,
  publicInputs: string[]
): Promise<boolean> {
  try {
    console.log('⚠️  MOCK proof verification (always returns true)...');
    console.log('Proof size:', proof.length, 'bytes');
    console.log('Public inputs:', publicInputs);

    // Simulate verification delay
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('✅ MOCK proof verified');
    console.log('⚠️  NOTE: This is NOT real verification! Compile circuit for production.');

    return true; // Mock always returns true

  } catch (error) {
    console.error('Mock proof verification error:', error);
    return false;
  }
}

/**
 * Compute mock commitment for demo
 * In production, use actual Poseidon hash
 */
function computeMockCommitment(
  biometric: number[],
  seed: Uint8Array,
  key: Uint8Array,
  nonce: number,
  version: number
): string {
  // Simple hash for demo (NOT cryptographically secure!)
  let hash = version + nonce;

  for (const bit of biometric) {
    hash = ((hash << 5) - hash) + bit;
  }

  for (const byte of seed) {
    hash = ((hash << 5) - hash) + byte;
  }

  for (const byte of key) {
    hash = ((hash << 5) - hash) + byte;
  }

  // Return as field element string
  return String(Math.abs(hash));
}

/**
 * Get MOCK circuit info
 */
export function getCircuitInfo() {
  console.log('⚠️  Returning mock circuit info (circuit not compiled)');
  return {
    name: 'zitzen_auth_mock',
    abi: { parameters: [], return_type: null },
    bytecode: new Uint8Array(0),
    isMock: true,
  };
}
