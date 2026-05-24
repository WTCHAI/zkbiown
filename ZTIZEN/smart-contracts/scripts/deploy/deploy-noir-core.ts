/**
 * Core deploy logic for ZTIZENNoir — imported by network-specific wrappers.
 * Not runnable directly; use deploy-noir.ts (any network) or
 * deploy-noir-sepolia.ts / deploy-noir-arbSep.ts for specific networks.
 *
 * Note: HonkVerifier is a very large contract (~800 KB bytecode).
 * Deployment may take several minutes and consume significant gas.
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
    .filter(f => f.startsWith(`noir-${chainId}-`) && f.endsWith('.json'))
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

export async function deployNoir(opts: { expectedChainId?: number } = {}) {
  const force = process.env.FORCE === 'true'

  console.log('===========================================================')
  console.log(' ZTIZENNoir Deployment')
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
    console.log(`  File         : ${existing}`)
    console.log(`  HonkVerifier : ${data.contracts.HonkVerifier}`)
    console.log(`  ZTIZENNoir   : ${data.contracts.ZTIZENNoir}`)
    console.log(`  Deployed at  : ${data.timestamp}`)
    console.log('\nSkipping deployment. Use FORCE=true to redeploy.')
    console.log('\nRun benchmark with:')
    console.log(`  DEPLOYMENT=${existing} npx hardhat run scripts/gas-benchmark-noir.ts --network <net>`)
    return
  }

  if (force && existing) {
    console.log(`FORCE=true — overriding existing deployment at ${existing}\n`)
  }

  const honkVerifierArtifact = await artifacts.readArtifact('HonkVerifier')
  const ztizenNoirArtifact   = await artifacts.readArtifact('ZTIZENNoir')

  // -- Step 1: Deploy HonkVerifier --------------------------------------------
  console.log('Step 1 -- Deploying HonkVerifier (NoirVerifier).sol...')
  console.log('  ! Large contract -- this may take a few minutes')
  const verifierHash = await deployer.deployContract({
    abi:      honkVerifierArtifact.abi,
    bytecode: honkVerifierArtifact.bytecode as Hex,
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

  // -- Step 2: Deploy ZTIZENNoir ----------------------------------------------
  console.log('Step 2 -- Deploying ZTIZENNoir.sol...')
  const mainHash = await deployer.deployContract({
    abi:      ztizenNoirArtifact.abi,
    bytecode: ztizenNoirArtifact.bytecode as Hex,
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
      HonkVerifier: verifierAddress,
      ZTIZENNoir:   mainAddress,
    },
    deployTxs: {
      HonkVerifier: verifierHash,
      ZTIZENNoir:   mainHash,
    },
    deployGas: {
      HonkVerifier: verifierReceipt.gasUsed.toString(),
      ZTIZENNoir:   mainReceipt.gasUsed.toString(),
    },
  }

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true })
  const outPath = `${DEPLOYMENTS_DIR}/noir-${chainId}-${Date.now()}.json`
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2))

  console.log('===========================================================')
  console.log(' Deployment complete')
  console.log('===========================================================')
  console.log(`HonkVerifier : ${verifierAddress}`)
  console.log(`ZTIZENNoir   : ${mainAddress}`)
  console.log(`\nSaved to ${outPath}`)
  console.log('\nNext step:')
  console.log(`  DEPLOYMENT=${outPath} npx hardhat run scripts/gas-benchmark-noir.ts --network <net>`)
}
