/**
 * ZTIZEN Smart Contract ABI
 *
 * This ABI interfaces with the ZTIZEN.sol contract which wraps the Noir-generated
 * HonkVerifier for ZK proof verification with business logic including:
 * - Credential management
 * - Nonce-based replay protection
 * - Event emission for verification tracking
 */

// HonkVerifier ABI (Noir-generated) - Direct ZK proof verification
export const honkVerifierABI = [
  {
    inputs: [
      { internalType: 'bytes', name: '_proof', type: 'bytes' },
      { internalType: 'bytes32[]', name: '_publicInputs', type: 'bytes32[]' },
    ],
    name: 'verify',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ZTIZEN ABI - Full business logic wrapper
export const ztizenABI = [
  // ============ Credential Registration (Oracle-only) ============
  {
    type: 'function',
    name: 'registerCredential',
    inputs: [
      { name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'userAddress', type: 'address', internalType: 'address' },
      { name: 'version', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'initializeCredentialForService',
    inputs: [
      { name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'serviceId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'initialNonce', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },

  // ============ Credential Management ============
  {
    type: 'function',
    name: 'deactivateCredential',
    inputs: [{ name: 'credentialId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: 'success', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'reactivateCredential',
    inputs: [{ name: 'credentialId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: 'success', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },

  // ============ ZK Proof Verification (Permissionless) ============
  {
    type: 'function',
    name: 'verifyProof',
    inputs: [
      { name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'serviceId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'currentNonce', type: 'uint256', internalType: 'uint256' },
      { name: 'productTxId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'proof', type: 'bytes', internalType: 'bytes' },
      { name: 'publicInputs', type: 'bytes32[]', internalType: 'bytes32[]' },
    ],
    outputs: [
      { name: 'success', type: 'bool', internalType: 'bool' },
      { name: 'newNonce', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },

  // ============ Nonce Management ============
  {
    type: 'function',
    name: 'getNonce',
    inputs: [
      { name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'serviceId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'nonce', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'revokeNonce',
    inputs: [
      { name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'serviceId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'newNonce', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'credentialServiceNonces',
    inputs: [
      { name: '', type: 'bytes32', internalType: 'bytes32' },
      { name: '', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },

  // ============ Credential Queries ============
  {
    type: 'function',
    name: 'credentialExists',
    inputs: [{ name: 'credentialId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: 'exists', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isCredentialActive',
    inputs: [{ name: 'credentialId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: 'active', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCredentialOwner',
    inputs: [{ name: 'credentialId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: 'owner', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCredential',
    inputs: [{ name: 'credentialId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      {
        name: 'metadata',
        type: 'tuple',
        internalType: 'struct IZTIZENCore.CredentialMeta',
        components: [
          { name: 'owner', type: 'address', internalType: 'address' },
          { name: 'version', type: 'uint256', internalType: 'uint256' },
          { name: 'isActive', type: 'bool', internalType: 'bool' },
          { name: 'registeredAt', type: 'uint256', internalType: 'uint256' },
          { name: 'lastVerifiedAt', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isCredentialInitializedForService',
    inputs: [
      { name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'serviceId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'initialized', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },

  // ============ Whitelist Management ============
  {
    type: 'function',
    name: 'addWhitelistedUser',
    inputs: [{ name: 'userAddress', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeWhitelistedUser',
    inputs: [{ name: 'userAddress', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isUserWhitelisted',
    inputs: [{ name: 'userAddress', type: 'address', internalType: 'address' }],
    outputs: [{ name: 'whitelisted', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'whitelistedUsers',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },

  // ============ Admin Functions ============
  {
    type: 'function',
    name: 'setZKVerifier',
    inputs: [{ name: 'verifierAddress', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setZKVerificationEnabled',
    inputs: [{ name: 'enabled', type: 'bool', internalType: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getStats',
    inputs: [],
    outputs: [
      { name: 'totalCredentials_', type: 'uint256', internalType: 'uint256' },
      { name: 'zkEnabled', type: 'bool', internalType: 'bool' },
      { name: 'verifierAddress', type: 'address', internalType: 'address' },
    ],
    stateMutability: 'view',
  },

  // ============ State Variables ============
  {
    type: 'function',
    name: 'totalCredentials',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'zkVerificationEnabled',
    inputs: [],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'zkVerifier',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },

  // ============ Events ============
  {
    type: 'event',
    name: 'CredentialRegistered',
    inputs: [
      { indexed: true, name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: true, name: 'owner', type: 'address', internalType: 'address' },
      { indexed: false, name: 'version', type: 'uint256', internalType: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'CredentialActivatedForService',
    inputs: [
      { indexed: true, name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: true, name: 'serviceId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: false, name: 'initialNonce', type: 'uint256', internalType: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'CredentialDeactivated',
    inputs: [
      { indexed: true, name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: true, name: 'owner', type: 'address', internalType: 'address' },
      { indexed: false, name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'CredentialReactivated',
    inputs: [
      { indexed: true, name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: true, name: 'owner', type: 'address', internalType: 'address' },
      { indexed: false, name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ProofVerified',
    inputs: [
      { indexed: true, name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: true, name: 'serviceId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: true, name: 'productTxId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: false, name: 'verifier', type: 'address', internalType: 'address' },
      { indexed: false, name: 'oldNonce', type: 'uint256', internalType: 'uint256' },
      { indexed: false, name: 'newNonce', type: 'uint256', internalType: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'NonceRevoked',
    inputs: [
      { indexed: true, name: 'credentialId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: true, name: 'serviceId', type: 'bytes32', internalType: 'bytes32' },
      { indexed: false, name: 'oldNonce', type: 'uint256', internalType: 'uint256' },
      { indexed: false, name: 'newNonce', type: 'uint256', internalType: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ZKVerificationEnabledChanged',
    inputs: [{ indexed: false, name: 'enabled', type: 'bool', internalType: 'bool' }],
  },
  {
    type: 'event',
    name: 'VerifierAddressChanged',
    inputs: [{ indexed: false, name: 'newVerifier', type: 'address', internalType: 'address' }],
  },
] as const;

// Legacy ABI for backward compatibility with zkbiown-contract.ts
export const zkBiownVerifierABI = ztizenABI;

/**
 * Contract Deployment Addresses
 * Update these after deploying the contract
 */
export const CONTRACT_ADDRESSES = {
  // Ethereum Sepolia testnet
  sepolia: {
    honkVerifier: '0xcB80852fDF30F4ae407814B4c98f57a4A6c45121', // Deployed Noir verifier
    ztizen: '0x0000000000000000000000000000000000000000', // TODO: Update after deployment
  },

  // Ethereum Mainnet
  mainnet: {
    honkVerifier: '0x0000000000000000000000000000000000000000',
    ztizen: '0x0000000000000000000000000000000000000000',
  },

  // Local development
  localhost: {
    honkVerifier: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    ztizen: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  },
} as const;

// Legacy exports for backward compatibility
export const ZKBIOWN_VERIFIER_ADDRESSES = {
  sepolia: CONTRACT_ADDRESSES.sepolia.ztizen,
  mainnet: CONTRACT_ADDRESSES.mainnet.ztizen,
  localhost: CONTRACT_ADDRESSES.localhost.ztizen,
};

export type SupportedChainId = keyof typeof CONTRACT_ADDRESSES;

/**
 * Get ZTIZEN contract address for current chain
 */
export function getZTIZENAddress(chainId: number): `0x${string}` {
  const chainMap: Record<number, SupportedChainId> = {
    1: 'mainnet',
    11155111: 'sepolia',
    31337: 'localhost',
    1337: 'localhost',
  };

  const network = chainMap[chainId] || 'localhost';
  const address = CONTRACT_ADDRESSES[network].ztizen;

  if (address === '0x0000000000000000000000000000000000000000') {
    console.warn(`⚠️ ZTIZEN contract not deployed on ${network} (chainId: ${chainId})`);
  }

  return address as `0x${string}`;
}

/**
 * Get HonkVerifier contract address for current chain (for direct verification)
 */
export function getHonkVerifierAddress(chainId: number): `0x${string}` {
  const chainMap: Record<number, SupportedChainId> = {
    1: 'mainnet',
    11155111: 'sepolia',
    31337: 'localhost',
    1337: 'localhost',
  };

  const network = chainMap[chainId] || 'localhost';
  const address = CONTRACT_ADDRESSES[network].honkVerifier;

  if (address === '0x0000000000000000000000000000000000000000') {
    console.warn(`⚠️ HonkVerifier contract not deployed on ${network} (chainId: ${chainId})`);
  }

  return address as `0x${string}`;
}

// Legacy function for backward compatibility
export function getVerifierAddress(chainId: number): `0x${string}` {
  return getZTIZENAddress(chainId);
}
