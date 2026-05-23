/**
 * Deploy ZTIZENNoir to Arbitrum Sepolia (chainId 421614).
 * Aborts with a clear error if --network flag is wrong.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-noir-arbSep.ts --network arbitrumSepolia
 *   FORCE=true npx hardhat run scripts/deploy-noir-arbSep.ts --network arbitrumSepolia
 *
 * Note: HonkVerifier is a very large contract (~800 KB bytecode).
 * Deployment may take several minutes and consume significant gas.
 */

import { deployNoir } from "./deploy-noir-core.js"

deployNoir({ expectedChainId: 421614 })
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Deployment failed:', err)
    process.exit(1)
  })
