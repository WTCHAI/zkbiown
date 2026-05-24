/**
 * Deploy ZTIZENCircom to Arbitrum Sepolia (chainId 421614).
 * Aborts with a clear error if --network flag is wrong.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-circom-arbSep.ts --network arbitrumSepolia
 *   FORCE=true npx hardhat run scripts/deploy-circom-arbSep.ts --network arbitrumSepolia
 */

import { deployCircom } from "./deploy-circom-core.js"

deployCircom({ expectedChainId: 421614 })
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Deployment failed:', err)
    process.exit(1)
  })
