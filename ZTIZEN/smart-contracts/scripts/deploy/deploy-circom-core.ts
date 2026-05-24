/**
 * Core deploy logic for ZTIZENCircom — imported by network-specific wrappers.
 * Not runnable directly; use deploy-circom.ts (any network) or
 * deploy-circom-sepolia.ts / deploy-circom-arbSep.ts for specific networks.
 */

import hre, { network, artifacts } from "hardhat"
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify"
import { formatEther, type Hex } from "viem"
import * as fs from "fs"
import * as path from "path"

const VERIFY_BLOCK_CONFIRMATIONS = 5
export const DEPLOYMENTS_DIR = './deployments'

export function findExistingDeployment(chainId: bigint | number): string | null {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) return null
  const files = fs.readdirSync(DEPLOYMENTS_DIR)
  const matches = files
    .filter(f => f.startsWith(`circom-${chainId}-`) && f.endsWith('.json'))
    .sort()
    .reverse()
  return matches.length > 0 ? path.join(DEPLOYMENTS_DIR, matches[0]) : null
}

export async function waitBlocks(
  publicClient: Awaited<ReturnType<typeof import("viem").createPublicClient>>,
  count: number
) {
  const start = await publicClient.getBlockNumber()
  console.log(`  -> Waiting ${count} blocks for explorer indexing...`)
  while (true) {
    await new Promise(r => setTimeout(r, 3000))
    const current = await publicClient.getBlockNumber()
    if (current >= start + BigInt(count)) break
  }
}

export async function verify(address: string, constructorArgs: unknown[]) {
  try {
    await verifyContract({ address, constructorArgs, provider: 'blockscout' }, hre)
    console.log('  + Verified on Blockscout\n')
  } catch (e: any) {
    if (e.message?.includes('Already Verified') || e.message?.includes('already verified')) {
      console.log('  + Already verified\n')
    } else {
      console.log(`  ! Verification skipped: ${e.message}\n`)
    }
  }
}

export async function deployCircom(opts: { expectedChainId?: number } = {}) {
  const force = process.env.FORCE === 'true'

  console.log('===========================================================')
  console.log(' ZTIZENCircom Deployment')
  console.log('===========================================================\n')

  const conn = await network.connect()
  const { viem } = conn
  const [deployer] = await viem.getWalletClients()
  const publicClient = await viem.getPublicClient()

  const chainId = await publicClient.getChainId()
  const balance = await publicClient.getBalance({ address: deployer.account.address })
  console.log(`Network chain ID : ${chainId}`)
  console.log(`Deployer         : ${deployer.account.address}`)
  console.log(`Balance          : ${formatEther(balance)} ETH\n`)

  // -- Network guard ----------------------------------------------------------
  if (opts.expectedChainId !== undefined && chainId !== opts.expectedChainId) {
    console.error(`❌ Wrong network!`)
    console.error(`   Expected chainId ${opts.expectedChainId}, got ${chainId}.`)
    console.error(`   Pass the correct --network flag to hardhat.`)
    process.exit(1)
  }

  // -- Check for existing deployment ------------------------------------------
  const existing = findExistingDeployment(chainId)
  if (existing && !force) {
    const data = JSON.parse(fs.readFileSync(existing, 'utf8'))
    console.log(`Found existing deployment for chainId ${chainId}:`)
    console.log(`  File           : ${existing}`)
    console.log(`  CircomVerifier : ${data.contracts.CircomVerifier}`)
    console.log(`  ZTIZENCircom   : ${data.contracts.ZTIZENCircom}`)
    console.log(`  Deployed at    : ${data.timestamp}`)
    console.log('\nSkipping deployment. Use FORCE=true to redeploy.')
    console.log('\nRun benchmark with:')
    console.log(`  DEPLOYMENT=${existing} npx hardhat run scripts/gas-benchmark-circom.ts --network <net>`)
    return
  }

  if (force && existing) {
    console.log(`FORCE=true — overriding existing deployment at ${existing}\n`)
  }

  const circomVerifierArtifact = await artifacts.readArtifact('Groth16Verifier')
  const ztizenCircomArtifact   = await artifacts.readArtifact('ZTIZENCircom')

  // -- Step 1: Deploy CircomVerifier ------------------------------------------
  console.log('Step 1 -- Deploying CircomVerifier.sol (Groth16Verifier)...')
  const verifierHash = await deployer.deployContract({
    abi:      circomVerifierArtifact.abi,
    bytecode: circomVerifierArtifact.bytecode as Hex,
    args:     [],
  })
  const verifierReceipt = await publicClient.waitForTransactionReceipt({ hash: verifierHash })
  const verifierAddress = verifierReceipt.contractAddress!
  console.log(`  -> deployed at ${verifierAddress}`)
  console.log(`  -> tx ${verifierHash}`)
  console.log(`  -> gas used: ${verifierReceipt.gasUsed.toLocaleString()}`)

  await waitBlocks(publicClient as any, VERIFY_BLOCK_CONFIRMATIONS)
  console.log('  -> Verifying on Blockscout...')
  await verify(verifierAddress, [])

  // -- Step 2: Deploy ZTIZENCircom --------------------------------------------
  console.log('Step 2 -- Deploying ZTIZENCircom.sol...')
  const mainHash = await deployer.deployContract({
    abi:      ztizenCircomArtifact.abi,
    bytecode: ztizenCircomArtifact.bytecode as Hex,
    args:     [verifierAddress],
  })
  const mainReceipt = await publicClient.waitForTransactionReceipt({ hash: mainHash })
  const mainAddress = mainReceipt.contractAddress!
  console.log(`  -> deployed at ${mainAddress}`)
  console.log(`  -> tx ${mainHash}`)
  console.log(`  -> gas used: ${mainReceipt.gasUsed.toLocaleString()}`)

  await waitBlocks(publicClient as any, VERIFY_BLOCK_CONFIRMATIONS)
  console.log('  -> Verifying on Blockscout...')
  await verify(mainAddress, [verifierAddress])

  // -- Save deployment file ---------------------------------------------------
  const deploymentInfo = {
    network:   chainId.toString(),
    deployer:  deployer.account.address,
    timestamp: new Date().toISOString(),
    contracts: {
      CircomVerifier: verifierAddress,
      ZTIZENCircom:   mainAddress,
    },
    deployTxs: {
      CircomVerifier: verifierHash,
      ZTIZENCircom:   mainHash,
    },
    deployGas: {
      CircomVerifier: verifierReceipt.gasUsed.toString(),
      ZTIZENCircom:   mainReceipt.gasUsed.toString(),
    },
  }

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true })
  const outPath = `${DEPLOYMENTS_DIR}/circom-${chainId}-${Date.now()}.json`
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2))

  console.log('===========================================================')
  console.log(' Deployment complete')
  console.log('===========================================================')
  console.log(`CircomVerifier : ${verifierAddress}`)
  console.log(`ZTIZENCircom   : ${mainAddress}`)
  console.log(`\nSaved to ${outPath}`)
  console.log('\nNext step:')
  console.log(`  DEPLOYMENT=${outPath} npx hardhat run scripts/gas-benchmark-circom.ts --network <net>`)
}
