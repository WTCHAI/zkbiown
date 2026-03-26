/**
 * useZKProof Hook
 * ZK proof generation with support for both on-chain (keccak: true) and off-chain (keccak: false)
 *
 * Usage:
 * - Off-chain (local verification, faster): generateProof(inputs, { keccak: false })
 * - On-chain (Solidity verifier): generateProof(inputs, { keccak: true })
 *
 * Uses signmag128 circuit (Sign-Magnitude with 128 values, 0-8 encoding)
 */

import { useProofStore } from '@/stores/useProofStore';
import {
  GenerateProof,
  GenerateProofWithProvider,
  EXPECTED_TEMPLATE_SIZE,
  type CircuitInputs,
  type ProofOptions,
} from '@/utils/generate-proof';
import { useProofContext } from '@/contexts/ProofProvider';
import { useMetricsStore, METRIC_OPERATIONS } from '@/stores/useMetricsStore';

export function useZKProof() {
  const {
    proof,
    publicInputs,
    matchCount,
    computedCommit,
    isGenerating,
    isVerifying,
    isVerified,
    transactionHash,
    error,
    setProof,
    clearProof,
    setGenerating,
    setVerifying,
    setVerified,
    setError,
    resetVerification,
  } = useProofStore();

  const { noir, backend, circuit, isInitialized } = useProofContext();

  /**
   * Generate ZK proof
   *
   * @param inputs - Circuit inputs (128-element templates for signmag128)
   * @param options - Proof options { keccak: boolean }
   *   - keccak: false (default) = Off-chain verification (faster, no gas)
   *   - keccak: true = On-chain verification (Solidity verifier, requires gas)
   */
  const generateProof = async (inputs: CircuitInputs, options: ProofOptions = {}) => {
    const useKeccak = options.keccak ?? false;

    try {
      setGenerating(true);
      setError(null);
      console.log('🔬 Generating proof with inputs:', {
        templateLength: inputs.template.length,
        authCommitLength: inputs.auth_commit_stored.length,
        keccak: useKeccak,
      });

      // Validate template size matches signmag128 circuit expectation
      if (inputs.template.length !== EXPECTED_TEMPLATE_SIZE) {
        throw new Error(
          `Invalid template size: ${inputs.template.length}. Expected ${EXPECTED_TEMPLATE_SIZE} for signmag128 circuit.`
        );
      }

      let result;

      // Use pre-initialized circuit if available (MUCH faster!)
      if (isInitialized && noir && backend) {
        console.log('⚡ Using pre-initialized circuit (fast path)');
        result = await GenerateProofWithProvider(inputs, noir, backend, circuit ?? undefined, options);
      } else {
        console.log('⏳ Circuit not initialized, loading fresh (slow path)');
        result = await GenerateProof(inputs, options);
      }

      setProof(
        result.proof,
        result.publicInputs,
        result.matchCount,
        result.computedCommit
      );

      console.log('✅ Proof stored in state:', {
        proofSize: result.proof.length,
        matchCount: result.matchCount,
        keccakFormat: result.keccakFormat,
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Proof generation failed';
      setError(errorMessage);
      console.error('❌ Proof generation error:', errorMessage);
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Verify ZK proof using pre-initialized Noir backend
   *
   * @param proof - Proof bytes to verify
   * @param publicInputs - Public inputs for the proof
   * @returns Whether the proof is cryptographically valid
   */
  const verifyProof = async (
    proof: Uint8Array,
    publicInputs: string[]
  ): Promise<boolean> => {
    try {
      setVerifying(true);
      setError(null);
      console.log('🔍 Verifying proof with Noir backend...', {
        proofSize: proof.length,
        publicInputsCount: publicInputs.length,
      });

      // Verify proof using pre-initialized backend
      if (backend === null) {
        throw new Error('Backend not initialized - circuit must be loaded first');
      }

      const startTime = performance.now();
      const verified = await backend.verifyProof({ proof, publicInputs });
      const durationMs = performance.now() - startTime;

      // Record verification timing metric
      useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.ZK_PROOF_VERIFICATION, durationMs, {
        proofSize: proof.length,
        publicInputsCount: publicInputs.length,
      });

      console.log(`✅ Proof verification result: ${verified} (${durationMs.toFixed(2)}ms)`);
      setVerified(verified);

      return verified;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Proof verification failed';
      setError(errorMessage);
      console.error('❌ Proof verification error:', errorMessage);
      throw err;
    } finally {
      setVerifying(false);
    }
  };

  return {
    // State
    proof,
    publicInputs,
    matchCount,
    computedCommit,
    isGenerating,
    isVerifying,
    isVerified,
    transactionHash,
    error,

    // Computed
    hasProof: !!proof && !!publicInputs,
    isReady: !isGenerating && !isVerifying,

    // Actions
    generateProof,
    verifyProof,
    clearProof,
    setVerifying,
    setVerified,
    resetVerification,
  };
}
