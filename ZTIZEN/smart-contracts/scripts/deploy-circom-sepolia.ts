/**
 * Deploy ZTIZENCircom to Ethereum Sepolia (chainId 11155111).
 * Aborts with a clear error if --network flag is wrong.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-circom-sepolia.ts --network sepolia
 *   FORCE=true npx hardhat run scripts/deploy-circom-sepolia.ts --network sepolia
 */

import { deployCircom } from "./deploy-circom-core.js"

deployCircom({ expectedChainId: 11155111 })
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Deployment failed:', err)
    process.exit(1)
  })
