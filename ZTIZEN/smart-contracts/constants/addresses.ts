/**
 * Configuration addresses for ZTIZEN deployment
 * Update these values before deploying to mainnet
 */

export const AUTHORITY_ADDRESSES = {
  // Sepolia Testnet
  SEPOLIA: {
    ORACLE: process.env.ORACLE_ADDRESS || "0x0000000000000000000000000000000000000000",
    ADMIN: process.env.ADMIN_ADDRESS || "0x0000000000000000000000000000000000000000",
    ZK_VERIFIER: process.env.ZK_VERIFIER_ADDRESS || "0x0000000000000000000000000000000000000000",
  },

  // Local/Hardhat
  LOCAL: {
    ORACLE: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Hardhat account 0
    ADMIN: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    ZK_VERIFIER: "0x0000000000000000000000000000000000000000", // Will be set to null address initially
  },
}

/**
 * Get addresses for the current network
 */
export function getNetworkAddresses(networkName: string) {
  switch (networkName) {
    case "sepolia":
    case "11155111":
      return AUTHORITY_ADDRESSES.SEPOLIA
    case "hardhat":
    case "hardhatMainnet":
    case "localhost":
      return AUTHORITY_ADDRESSES.LOCAL
    default:
      return AUTHORITY_ADDRESSES.LOCAL
  }
}
