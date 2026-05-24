/**
 * Deploy ZTIZENNoir to Ethereum Sepolia (chainId 11155111).
 * Aborts with a clear error if --network flag is wrong.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-noir-sepolia.ts --network sepolia
 *   FORCE=true npx hardhat run scripts/deploy-noir-sepolia.ts --network sepolia
 *
 * Note: HonkVerifier is a very large contract (~800 KB bytecode).
 * Deployment may take several minutes and consume significant gas.
 */

import { deployNoir } from "./deploy-noir-core.js"

deployNoir({ expectedChainId: 11155111 })
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Deployment failed:', err)
    process.exit(1)
  })
