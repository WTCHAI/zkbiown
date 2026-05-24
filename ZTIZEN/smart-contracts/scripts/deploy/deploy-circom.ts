/**
 * Deploy CircomVerifier + ZTIZENCircom to any network.
 * Saves addresses to deployments/circom-<chainId>-<timestamp>.json
 * so gas-benchmark-circom.ts can load them without redeploying.
 *
 * If a deployment for this chainId already exists, prints the existing
 * addresses and exits — use FORCE=true to redeploy anyway.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-circom.ts --network sepolia
 *   npx hardhat run scripts/deploy-circom.ts --network arbitrumSepolia
 *   FORCE=true npx hardhat run scripts/deploy-circom.ts --network sepolia
 *
 * Prefer network-specific scripts to avoid --network mistakes:
 *   scripts/deploy-circom-sepolia.ts   (enforces chainId 11155111)
 *   scripts/deploy-circom-arbSep.ts    (enforces chainId 421614)
 *
 * Requires .env:
 *   DEPLOYER_PRIVATE_KEY=...
 */

import { deployCircom } from "./deploy-circom-core.js"

deployCircom()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Deployment failed:', err)
    process.exit(1)
  })
