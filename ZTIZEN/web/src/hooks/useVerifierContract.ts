/**
 * useVerifierContract Hook
 *
 * Provides two verification modes:
 * 1. Direct HonkVerifier - Direct ZK proof verification (for testing/research)
 * 2. ZTIZEN Contract - Full business logic with nonce management (for production)
 *
 * Requires:
 * - VITE_VERIFIER_CONTRACT_ADDRESS or VITE_ZTIZEN_CONTRACT_ADDRESS in .env
 * - VITE_SEPOLIA_RPC_URL in .env
 * - Proof generated with keccak: true option
 */

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type Hash,
} from 'viem';
import { sepolia, localhost } from 'viem/chains';
import {
  honkVerifierABI,
  ztizenABI,
  getHonkVerifierAddress,
  getZTIZENAddress,
} from '../lib/abis/zkBiownVerifier';

/**
 * Get chain config based on chain ID
 */
function getChain(chainId: number) {
  switch (chainId) {
    case 11155111:
      return sepolia;
    case 31337:
    case 1337:
      return localhost;
    default:
      return sepolia;
  }
}

export interface ZTIZENVerifyParams {
  credentialId: string;
  serviceId: string;
  currentNonce: bigint;
  productTxId: string;
  proof: Uint8Array;
  publicInputs: string[];
}

export interface VerificationResult {
  hash: Hash;
  verified: boolean;
  newNonce?: bigint;
  blockNumber?: bigint;
  gasUsed?: bigint;
}

export function useVerifierContract() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get viem clients from Privy wallet
   */
  const getClients = async (chainId: number = 11155111) => {
    const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;

    if (!rpcUrl || rpcUrl.includes('YOUR_API_KEY')) {
      throw new Error('Sepolia RPC URL not configured. Please update .env with Alchemy API key');
    }

    if (!user || !wallets || wallets.length === 0) {
      throw new Error('Wallet not connected. Please connect your wallet first.');
    }

    const wallet = wallets[0];
    const provider = await wallet.getEthereumProvider();

    if (!provider) {
      throw new Error('No Ethereum provider found. Please connect your wallet.');
    }

    const chain = getChain(chainId);

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      chain,
      transport: custom(provider),
    });

    const [account] = await walletClient.getAddresses();

    if (!account) {
      throw new Error('No account found in wallet');
    }

    return { publicClient, walletClient, account };
  };

  /**
   * Convert proof bytes and public inputs to contract format
   */
  const formatProofForContract = (proof: Uint8Array, publicInputs: string[]) => {
    // Convert proof to hex bytes
    const proofBytes = `0x${Array.from(proof)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}` as Hex;

    // Convert public inputs to bytes32[]
    // NOTE: Public inputs from Noir are already hex strings, pad to 32 bytes
    const publicInputsBytes32 = publicInputs.map((input) => {
      const hexInput = input.startsWith('0x') ? input : `0x${input}`;
      // Pad to 32 bytes (64 hex chars + 0x prefix)
      const cleanHex = hexInput.slice(2).padStart(64, '0');
      return `0x${cleanHex}` as Hex;
    });

    return { proofBytes, publicInputsBytes32 };
  };

  /**
   * Convert string to bytes32 (for credentialId, serviceId, etc.)
   */
  const stringToBytes32 = (str: string): Hex => {
    if (str.startsWith('0x') && str.length === 66) {
      return str as Hex;
    }
    return keccak256(toHex(str));
  };

  // ========================================
  // MODE 1: Direct HonkVerifier (for testing)
  // ========================================

  /**
   * Submit ZK proof directly to HonkVerifier contract (view function)
   * This is a read-only call that doesn't require gas
   */
  const verifyProofDirect = async (
    proof: Uint8Array,
    publicInputs: string[],
    chainId: number = 11155111
  ): Promise<boolean> => {
    try {
      const contractAddress = getHonkVerifierAddress(chainId);

      if (contractAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(`HonkVerifier contract not deployed on chain ${chainId}`);
      }

      const { publicClient } = await getClients(chainId);
      const { proofBytes, publicInputsBytes32 } = formatProofForContract(proof, publicInputs);

      console.log('🔍 Verifying proof directly with HonkVerifier...');
      console.log('  Contract:', contractAddress);
      console.log('  Proof size:', proof.length, 'bytes');
      console.log('  Public inputs:', publicInputsBytes32.length);

      const isValid = await publicClient.readContract({
        address: contractAddress,
        abi: honkVerifierABI,
        functionName: 'verify',
        args: [proofBytes, publicInputsBytes32],
      });

      console.log('✅ Direct verification result:', isValid);
      return isValid;
    } catch (err) {
      console.error('❌ Direct verification failed:', err);
      throw err;
    }
  };

  // ========================================
  // MODE 2: ZTIZEN Contract (production)
  // ========================================

  /**
   * Submit ZK proof through ZTIZEN contract with full business logic
   * - Validates nonce
   * - Calls HonkVerifier
   * - Rolls nonce
   * - Emits ProofVerified event
   */
  const verifyProofZTIZEN = async (
    params: ZTIZENVerifyParams,
    chainId: number = 11155111
  ): Promise<VerificationResult> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const contractAddress = getZTIZENAddress(chainId);

      if (contractAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(`ZTIZEN contract not deployed on chain ${chainId}`);
      }

      const { publicClient, walletClient, account } = await getClients(chainId);
      const { proofBytes, publicInputsBytes32 } = formatProofForContract(
        params.proof,
        params.publicInputs
      );

      const credentialIdBytes32 = stringToBytes32(params.credentialId);
      const serviceIdBytes32 = stringToBytes32(params.serviceId);
      const productTxIdBytes32 = stringToBytes32(params.productTxId);

      console.log('📝 Submitting proof to ZTIZEN contract...');
      console.log('  Contract:', contractAddress);
      console.log('  Credential ID:', credentialIdBytes32);
      console.log('  Service ID:', serviceIdBytes32);
      console.log('  Current Nonce:', params.currentNonce.toString());
      console.log('  Proof size:', params.proof.length, 'bytes');
      console.log('  Public inputs:', publicInputsBytes32.length);

      // Call verifyProof on ZTIZEN contract
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: ztizenABI,
        functionName: 'verifyProof',
        args: [
          credentialIdBytes32,
          serviceIdBytes32,
          params.currentNonce,
          productTxIdBytes32,
          proofBytes,
          publicInputsBytes32,
        ],
        account,
      });

      console.log('⏳ Waiting for transaction confirmation...');
      console.log('  Transaction hash:', hash);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      console.log('✅ Transaction confirmed!');
      console.log('  Block number:', receipt.blockNumber.toString());
      console.log('  Gas used:', receipt.gasUsed.toString());
      console.log('  Status:', receipt.status);

      // Check for ProofVerified event to get new nonce
      let newNonce: bigint | undefined;

      // Parse logs for ProofVerified event
      const proofVerifiedTopic = keccak256(
        toHex('ProofVerified(bytes32,bytes32,bytes32,address,uint256,uint256,uint256)')
      );

      for (const log of receipt.logs) {
        if (log.topics[0] === proofVerifiedTopic) {
          // Decode event data (oldNonce, newNonce, timestamp are in data)
          // Each is 32 bytes = 64 hex chars
          const data = log.data.slice(2); // Remove 0x prefix
          const oldNonceHex = '0x' + data.slice(64, 128); // Skip verifier address (first 32 bytes)
          const newNonceHex = '0x' + data.slice(128, 192);

          newNonce = BigInt(newNonceHex);
          console.log('  Old nonce:', BigInt(oldNonceHex).toString());
          console.log('  New nonce:', newNonce.toString());
          break;
        }
      }

      return {
        hash,
        verified: receipt.status === 'success',
        newNonce,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ ZTIZEN verification failed:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Get current nonce for a credential+service pair
   */
  const getNonce = async (
    credentialId: string,
    serviceId: string,
    chainId: number = 11155111
  ): Promise<bigint> => {
    try {
      const contractAddress = getZTIZENAddress(chainId);

      if (contractAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(`ZTIZEN contract not deployed on chain ${chainId}`);
      }

      const { publicClient } = await getClients(chainId);

      const credentialIdBytes32 = stringToBytes32(credentialId);
      const serviceIdBytes32 = stringToBytes32(serviceId);

      const nonce = await publicClient.readContract({
        address: contractAddress,
        abi: ztizenABI,
        functionName: 'getNonce',
        args: [credentialIdBytes32, serviceIdBytes32],
      });

      return nonce;
    } catch (err) {
      console.error('Failed to get nonce:', err);
      throw err;
    }
  };

  /**
   * Check if ZK verification is enabled on the contract
   */
  const isZKVerificationEnabled = async (chainId: number = 11155111): Promise<boolean> => {
    try {
      const contractAddress = getZTIZENAddress(chainId);

      if (contractAddress === '0x0000000000000000000000000000000000000000') {
        return false;
      }

      const { publicClient } = await getClients(chainId);

      const enabled = await publicClient.readContract({
        address: contractAddress,
        abi: ztizenABI,
        functionName: 'zkVerificationEnabled',
      });

      return enabled;
    } catch (err) {
      console.error('Failed to check ZK verification status:', err);
      return false;
    }
  };

  /**
   * Get contract stats (total credentials, zkEnabled, verifier address)
   */
  const getStats = async (
    chainId: number = 11155111
  ): Promise<{
    totalCredentials: bigint;
    zkEnabled: boolean;
    verifierAddress: Address;
  }> => {
    try {
      const contractAddress = getZTIZENAddress(chainId);

      if (contractAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(`ZTIZEN contract not deployed on chain ${chainId}`);
      }

      const { publicClient } = await getClients(chainId);

      const [totalCredentials, zkEnabled, verifierAddress] = await publicClient.readContract({
        address: contractAddress,
        abi: ztizenABI,
        functionName: 'getStats',
      });

      return { totalCredentials, zkEnabled, verifierAddress };
    } catch (err) {
      console.error('Failed to get stats:', err);
      throw err;
    }
  };

  // Legacy function for backward compatibility
  const submitProof = async (proof: Uint8Array, publicInputs: string[]): Promise<Hash> => {
    // Try direct verification first (simpler, no nonce management)
    const isValid = await verifyProofDirect(proof, publicInputs);

    if (!isValid) {
      throw new Error('Proof verification failed');
    }

    // For legacy compatibility, return a fake hash
    // In production, use verifyProofZTIZEN instead
    return '0x0000000000000000000000000000000000000000000000000000000000000000' as Hash;
  };

  // Legacy function for backward compatibility
  const verifyProofReadOnly = async (proof: Uint8Array, publicInputs: string[]): Promise<boolean> => {
    return verifyProofDirect(proof, publicInputs);
  };

  return {
    // New API
    verifyProofDirect, // Direct HonkVerifier call (view, no gas)
    verifyProofZTIZEN, // Full ZTIZEN flow (write, gas required)
    getNonce,
    isZKVerificationEnabled,
    getStats,

    // Legacy API (backward compatibility)
    submitProof,
    verifyProofReadOnly,

    // State
    isSubmitting,
    error,
  };
}
