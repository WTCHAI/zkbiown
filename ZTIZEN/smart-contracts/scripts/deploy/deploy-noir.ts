/**
 * Deploy HonkVerifier (NoirVerifier) + ZTIZENNoir to any network.
 * Saves addresses to deployments/noir-<chainId>-<timestamp>.json
 * so gas-benchmark-noir.ts can load them without redeploying.
 *
 * If a deployment for this chainId already exists, prints the existing
 * addresses and exits — use FORCE=true to redeploy anyway.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-noir.ts --network sepolia
 *   npx hardhat run scripts/deploy-noir.ts --network arbitrumSepolia
 *   FORCE=true npx hardhat run scripts/deploy-noir.ts --network sepolia
 *
 * Prefer network-specific scripts to avoid --network mistakes:
 *   scripts/deploy-noir-sepolia.ts   (enforces chainId 11155111)
 *   scripts/deploy-noir-arbSep.ts    (enforces chainId 421614)
 *
 * Requires .env:
 *   DEPLOYER_PRIVATE_KEY=...
 *
 * Note: HonkVerifier is a very large contract (~800 KB bytecode).
 * Deployment may take several minutes and consume significant gas.
 */

import { deployNoir } from "./deploy-noir-core.js"

deployNoir()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Deployment failed:', err)
    process.exit(1)
  })
