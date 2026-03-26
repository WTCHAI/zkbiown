/**
 * zkBIOWN Smart Contract Integration
 *
 * Utilities for interacting with the zkBIOWN Verifier smart contract
 * Handles on-chain ZK proof submission and verification
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type WalletClient,
  type PublicClient,
  type Hash,
  type TransactionReceipt,
  encodePacked,
  keccak256,
  toHex,
} from 'viem';
import { sepolia, mainnet, localhost } from 'viem/chains';
import { zkBiownVerifierABI, getVerifierAddress } from './abis/zkBiownVerifier';

/**
 * Supported chains for zkBIOWN verification
 */
export const SUPPORTED_CHAINS = {
  sepolia,
  mainnet,
  localhost,
};

/**
 * Get chain object from chain ID
 */
export function getChain(chainId: number) {
  switch (chainId) {
    case 1:
      return mainnet;
    case 11155111:
      return sepolia;
    case 31337:
    case 1337:
      return localhost;
    default:
      console.warn(`Unsupported chain ID: ${chainId}, falling back to localhost`);
      return localhost;
  }
}

/**
 * Create public client for reading contract state
 */
export function createZKBiownPublicClient(chainId: number): PublicClient {
  const chain = getChain(chainId);

  return createPublicClient({
    chain,
    transport: http(),
  });
}

/**
 * Parameters for submitting ZK proof on-chain
 */
export interface SubmitZKProofParams {
  proof: Uint8Array; // ZK proof bytes
  txHash: string; // Challenge transaction hash (0x...)
  serviceId: string; // Service ID as bytes32 (0x...)
  credentialId: string; // Credential ID (will be converted to bytes32)
  publicInputs: string[]; // Public inputs as field elements
  walletClient: WalletClient; // Connected wallet client
  chainId?: number; // Optional chain ID (defaults to wallet's chain)
}

/**
 * Convert credential ID string to bytes32
 * Pads with zeros if needed
 */
export function credentialIdToBytes32(credentialId: string): `0x${string}` {
  // If already 0x-prefixed and 66 chars (0x + 64 hex), return as-is
  if (credentialId.startsWith('0x') && credentialId.length === 66) {
    return credentialId as `0x${string}`;
  }

  // Otherwise, hash it
  const hash = keccak256(toHex(credentialId));
  return hash;
}

/**
 * Convert field element strings to bytes32 array
 */
export function fieldElementsToBytes32(fieldElements: string[]): `0x${string}`[] {
  return fieldElements.map(fe => {
    // If already 0x-prefixed hex, use as-is (pad to 32 bytes)
    if (fe.startsWith('0x')) {
      const hex = fe.slice(2).padStart(64, '0');
      return `0x${hex}` as `0x${string}`;
    }

    // Convert decimal string to hex (field element)
    const num = BigInt(fe);
    const hex = num.toString(16).padStart(64, '0');
    return `0x${hex}` as `0x${string}`;
  });
}

/**
 * Submit ZK proof to smart contract
 *
 * This function:
 * 1. Validates proof and parameters
 * 2. Calls verifyZKProof() on the smart contract
 * 3. Waits for transaction confirmation
 * 4. Returns transaction hash and receipt
 *
 * The smart contract will:
 * - Verify the ZK proof using UltraVerifier
 * - Emit ZKVerificationCompleted event
 * - Store verification result on-chain
 */
export async function submitZKProof(
  params: SubmitZKProofParams
): Promise<{
  hash: Hash;
  receipt: TransactionReceipt;
  verified: boolean;
}> {
  const {
    proof,
    txHash,
    serviceId,
    credentialId,
    publicInputs,
    walletClient,
    chainId,
  } = params;

  // Validate parameters
  if (!proof || proof.length === 0) {
    throw new Error('Invalid proof: proof is empty');
  }

  if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
    throw new Error('Invalid txHash: must be 0x + 64 hex characters');
  }

  if (!serviceId || !serviceId.startsWith('0x') || serviceId.length !== 66) {
    throw new Error('Invalid serviceId: must be 0x + 64 hex characters');
  }

  if (!credentialId) {
    throw new Error('Invalid credentialId: cannot be empty');
  }

  // Get chain ID from wallet if not provided
  const activeChainId = chainId || (await walletClient.getChainId());

  // Get contract address for this chain
  const contractAddress = getVerifierAddress(activeChainId);

  if (contractAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(
      `zkBIOWN Verifier contract not deployed on chain ${activeChainId}. ` +
      `Please deploy the contract or use a supported chain (Sepolia, Mainnet, Localhost).`
    );
  }

  // Convert credential ID to bytes32
  const credentialIdBytes32 = credentialIdToBytes32(credentialId);

  // Convert public inputs to bytes32 array
  const publicInputsBytes32 = fieldElementsToBytes32(publicInputs);

  console.log('📝 Submitting ZK proof to contract...');
  console.log('   Contract Address:', contractAddress);
  console.log('   Chain ID:', activeChainId);
  console.log('   tx_hash:', txHash);
  console.log('   service_id:', serviceId);
  console.log('   credential_id:', credentialIdBytes32);
  console.log('   proof size:', proof.length, 'bytes');
  console.log('   public inputs:', publicInputsBytes32.length);

  try {
    // Call verifyZKProof on the contract
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: zkBiownVerifierABI,
      functionName: 'verifyZKProof',
      args: [
        `0x${Array.from(proof).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`,
        txHash as `0x${string}`,
        serviceId as `0x${string}`,
        credentialIdBytes32,
        publicInputsBytes32,
      ],
    });

    console.log('✅ Transaction submitted:', hash);
    console.log('   Waiting for confirmation...');

    // Create public client to wait for receipt
    const publicClient = createZKBiownPublicClient(activeChainId);

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    console.log('✅ Transaction confirmed in block:', receipt.blockNumber);
    console.log('   Status:', receipt.status === 'success' ? 'Success' : 'Failed');
    console.log('   Gas used:', receipt.gasUsed.toString());

    // Check if transaction was successful
    const verified = receipt.status === 'success';

    if (!verified) {
      throw new Error('Transaction failed - proof verification rejected by contract');
    }

    // Parse logs to find ZKVerificationCompleted event
    const zkVerificationEvent = receipt.logs.find(log =>
      log.topics[0] === keccak256(toHex('ZKVerificationCompleted(bytes32,bytes32,bytes32,bool,uint256)'))
    );

    if (zkVerificationEvent) {
      console.log('✅ ZKVerificationCompleted event emitted');
      console.log('   Event data:', zkVerificationEvent);
    } else {
      console.warn('⚠️ ZKVerificationCompleted event not found in logs');
    }

    return {
      hash,
      receipt,
      verified,
    };

  } catch (error: any) {
    console.error('❌ Error submitting ZK proof:', error);

    // Provide helpful error messages
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction rejected by user');
    }

    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds for gas');
    }

    if (error.message?.includes('nonce too low')) {
      throw new Error('Nonce too low - please try again');
    }

    // Re-throw with original error
    throw new Error(`Failed to submit ZK proof: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Query verification status from smart contract
 *
 * Checks if a tx_hash has been verified on-chain
 */
export async function getVerificationStatus(
  txHash: string,
  chainId: number = 11155111 // Default to Sepolia
): Promise<{
  exists: boolean;
  verified: boolean;
  timestamp: bigint;
}> {
  const publicClient = createZKBiownPublicClient(chainId);
  const contractAddress = getVerifierAddress(chainId);

  if (contractAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`zkBIOWN Verifier contract not deployed on chain ${chainId}`);
  }

  try {
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: zkBiownVerifierABI,
      functionName: 'getVerificationStatus',
      args: [txHash as `0x${string}`],
    });

    return {
      exists: result[0],
      verified: result[1],
      timestamp: result[2],
    };

  } catch (error: any) {
    console.error('Error querying verification status:', error);
    throw new Error(`Failed to query verification status: ${error.message}`);
  }
}

/**
 * Wait for verification event
 *
 * Listens for ZKVerificationCompleted event matching the tx_hash
 * Useful for real-time updates after submission
 */
export async function waitForVerificationEvent(
  txHash: string,
  chainId: number,
  timeoutMs: number = 60000 // 1 minute timeout
): Promise<{
  credentialId: string;
  serviceId: string;
  verified: boolean;
  timestamp: bigint;
}> {
  const publicClient = createZKBiownPublicClient(chainId);
  const contractAddress = getVerifierAddress(chainId);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for verification event'));
    }, timeoutMs);

    // Watch for ZKVerificationCompleted events
    const unwatch = publicClient.watchContractEvent({
      address: contractAddress,
      abi: zkBiownVerifierABI,
      eventName: 'ZKVerificationCompleted',
      onLogs: (logs) => {
        for (const log of logs) {
          const { args } = log as any;

          // Check if this is the event we're waiting for
          if (args.txHash === txHash) {
            clearTimeout(timeout);
            unwatch();

            resolve({
              credentialId: args.credentialId,
              serviceId: args.serviceId,
              verified: args.verified,
              timestamp: args.timestamp,
            });
            return;
          }
        }
      },
      onError: (error) => {
        clearTimeout(timeout);
        unwatch();
        reject(error);
      },
    });
  });
}
