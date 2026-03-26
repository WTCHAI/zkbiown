/**
 * Zero-Knowledge Proof Generation Utility
 * Uses signmag128 circuit (Sign-Magnitude with 128 values)
 */

import type { CompiledCircuit } from '@noir-lang/types';
import type { Noir } from '@noir-lang/noir_js';
import type { UltraHonkBackend } from '@aztec/bb.js';
import { CIRCUIT_CONFIG } from '@/stores/useCircuitStore';
import { useMetricsStore, METRIC_OPERATIONS } from '@/stores/useMetricsStore';

export interface CircuitInputs {
  template: string[];              // [Field; 128] - 128-element template (sign-magnitude values 0-8)
  product_key: string;             // Field
  ztizen_key: string;              // Field
  user_key: string;                // Field
  version: string;                 // Field
  nonce: string;                   // Field
  product_usage_hash: string;      // Field
  auth_commit_stored: string[];    // [Field; 128] - 128 stored commits
}

/**
 * Circuit configuration
 * Uses signmag128 (Sign-Magnitude with 128 values, 0-8 encoding)
 */
export const EXPECTED_TEMPLATE_SIZE = CIRCUIT_CONFIG.templateSize; // 128
export const CIRCUIT_PATH = CIRCUIT_CONFIG.path;

/**
 * Validate template size matches expected circuit input
 */
export function validateTemplateSize(templateSize: number): void {
  if (templateSize !== EXPECTED_TEMPLATE_SIZE) {
    throw new Error(
      `Invalid template size: ${templateSize}. Expected ${EXPECTED_TEMPLATE_SIZE} for signmag128 circuit.`
    );
  }
}

export interface ProofOutput {
  proof: Uint8Array;
  publicInputs: string[];
  matchCount?: number;
  computedCommit?: string[];
  keccakFormat?: boolean;          // Whether proof uses Keccak hashing (for on-chain)
}

export interface ProofOptions {
  keccak?: boolean;                // true = on-chain (Solidity), false = off-chain (faster)
}

/**
 * Generate ZK proof using pre-initialized circuit (FAST PATH)
 * Uses circuit already loaded by ProofProvider
 *
 * @param params - Circuit inputs (128-element templates for signmag128)
 * @param noir - Pre-initialized Noir instance
 * @param backend - Pre-initialized UltraHonkBackend instance
 * @param options - Proof generation options (keccak format)
 */
export async function GenerateProofWithProvider(
  params: CircuitInputs,
  noir: Noir,
  backend: UltraHonkBackend,
  _circuit?: CompiledCircuit, // Kept for backward compatibility
  options: ProofOptions = {}
): Promise<ProofOutput> {
  const useKeccak = options.keccak ?? false; // Default: off-chain (faster)

  try {
    console.log('⚡ Using pre-initialized circuit (fast path)');
    console.log(`🔐 Keccak format: ${useKeccak ? 'ON (on-chain)' : 'OFF (off-chain)'}`);

    // Validate template size
    if (params.template.length !== EXPECTED_TEMPLATE_SIZE) {
      throw new Error(
        `Template size mismatch: got ${params.template.length}, expected ${EXPECTED_TEMPLATE_SIZE}`
      );
    }

    // Prepare circuit inputs
    const inputs: Record<string, any> = {
      template: params.template,
      product_key: params.product_key,
      ztizen_key: params.ztizen_key,
      user_key: params.user_key,
      version: params.version,
      nonce: params.nonce,
      product_usage_hash: params.product_usage_hash,
      auth_commit_stored: params.auth_commit_stored,
    };

    console.log('🔄 Generating witness...');
    const witnessStartTime = performance.now();
    const { witness } = await noir.execute(inputs);
    const witnessDuration = performance.now() - witnessStartTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.WITNESS_PREPARATION, witnessDuration);

    console.log(`🔄 Generating proof with ${useKeccak ? 'Keccak' : 'standard'} hashing...`);
    const proofStartTime = performance.now();
    const { proof, publicInputs } = await backend.generateProof(witness, {
      keccak: useKeccak,
    });
    const proofDuration = performance.now() - proofStartTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.ZK_PROOF_GENERATION, proofDuration);

    // Record proof size
    useMetricsStore.getState().recordProofSize(proof.length);

    // Extract match count from public inputs
    // Public outputs: (matchCount: Field, computedCommit: [Field; 128])
    const matchCount = publicInputs && publicInputs.length > 0
      ? Number(BigInt(publicInputs[0]))
      : undefined;

    console.log('✅ Proof generation complete:', {
      proofSize: proof.length,
      publicInputsCount: publicInputs.length,
      matchCount,
      keccakFormat: useKeccak,
      witnessTime: `${witnessDuration.toFixed(2)}ms`,
      proofTime: `${proofDuration.toFixed(2)}ms`,
    });

    return {
      proof,
      publicInputs,
      matchCount,
      keccakFormat: useKeccak,
    };
  } catch (error) {
    console.error('❌ Proof generation failed:', error);
    throw error;
  }
}

/**
 * Generate ZK proof for biometric verification (SLOW PATH)
 * Loads circuit fresh from /public/circuits/ directory
 *
 * @param params - Circuit inputs (128-element templates for signmag128)
 * @param options - Proof generation options (keccak format)
 */
export async function GenerateProof(
  params: CircuitInputs,
  options: ProofOptions = {}
): Promise<ProofOutput> {
  const useKeccak = options.keccak ?? false; // Default: off-chain (faster)

  try {
    // Validate template size
    validateTemplateSize(params.template.length);

    console.log('⏳ Circuit not initialized, loading fresh (slow path)');
    console.log(`📊 Template size: ${params.template.length} (signmag128)`);
    console.log(`🔐 Keccak format: ${useKeccak ? 'ON (on-chain)' : 'OFF (off-chain)'}`);

    // Dynamic imports
    const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
      import('@noir-lang/noir_js'),
      import('@aztec/bb.js'),
    ]);

    // Fetch circuit from public folder
    console.log(`📦 Fetching circuit from ${CIRCUIT_PATH}...`);
    const circuitResponse = await fetch(CIRCUIT_PATH);

    if (!circuitResponse.ok) {
      throw new Error(`Failed to fetch circuit: ${circuitResponse.statusText}`);
    }

    const circuit = (await circuitResponse.json()) as CompiledCircuit;

    console.log('📦 Circuit loaded:', {
      bytecodeLength: circuit.bytecode?.length || 0,
    });

    // Initialize Noir and backend
    const noir = new Noir(circuit as any);
    const backend = new UltraHonkBackend(circuit.bytecode);

    // Initialize Noir
    console.log('⚙️ Initializing Noir...');
    await noir.init();

    // Prepare circuit inputs
    const inputs: Record<string, any> = {
      template: params.template,
      product_key: params.product_key,
      ztizen_key: params.ztizen_key,
      user_key: params.user_key,
      version: params.version,
      nonce: params.nonce,
      product_usage_hash: params.product_usage_hash,
      auth_commit_stored: params.auth_commit_stored,
    };

    console.log('🔄 Generating witness...');
    const witnessStartTime = performance.now();
    const { witness } = await noir.execute(inputs);
    const witnessDuration = performance.now() - witnessStartTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.WITNESS_PREPARATION, witnessDuration);

    console.log(`🔄 Generating proof with ${useKeccak ? 'Keccak' : 'standard'} hashing...`);
    const proofStartTime = performance.now();
    const { proof, publicInputs } = await backend.generateProof(witness, {
      keccak: useKeccak,
    });
    const proofDuration = performance.now() - proofStartTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.ZK_PROOF_GENERATION, proofDuration);

    // Record proof size
    useMetricsStore.getState().recordProofSize(proof.length);

    // Public outputs: (matchCount: Field, computedCommit: [Field; 128])
    const matchCount = publicInputs && publicInputs.length > 0
      ? Number(BigInt(publicInputs[0]))
      : undefined;

    // Extract computed commit from remaining public inputs (next 128)
    const computedCommit = publicInputs && publicInputs.length > 1
      ? publicInputs.slice(1, 129)
      : undefined;

    console.log('✅ Proof generation complete:', {
      proofSize: proof.length,
      publicInputsCount: publicInputs.length,
      matchCount,
      keccakFormat: useKeccak,
      witnessTime: `${witnessDuration.toFixed(2)}ms`,
      proofTime: `${proofDuration.toFixed(2)}ms`,
    });

    return {
      proof,
      publicInputs,
      matchCount,
      computedCommit,
      keccakFormat: useKeccak,
    };
  } catch (error) {
    console.error('❌ Proof generation failed:', error);
    throw error;
  }
}
