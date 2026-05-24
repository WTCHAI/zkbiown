/**
 * Gas Benchmark — ZTIZENNoir interaction pipeline on Sepolia
 *
 * Loads already-deployed contract addresses from a deployment JSON (produced by
 * deploy-noir.ts), then runs the registration + verification steps and records
 * gas used + gwei cost per tx.
 *
 * Usage:
 *   # 1. Deploy first (once):
 *   npx hardhat run scripts/deploy-noir.ts --network sepolia
 *
 *   # 2. Benchmark interactions (rerun freely):
 *   DEPLOYMENT=./deployments/noir-<chainId>-<ts>.json \
 *     npx hardhat run scripts/gas-benchmark-noir.ts --network sepolia
 *     npx hardhat run scripts/gas-benchmark-noir.ts --network arbitrumSepolia
 *
 *   # Skip verifyProof (needs real bb.js proof — placeholder will revert):
 *   SKIP_PROOF=true DEPLOYMENT=... npx hardhat run ...
 *
 * Proof inputs:
 *   Replace PLACEHOLDER_PROOF and PLACEHOLDER_PUBLIC_INPUTS below with real
 *   bb.js output from the /proof-demo page (Noir backend) for production-accurate
 *   verifyProof gas numbers.
 *
 *   proof        — raw UltraHonk bytes as 0x-prefixed hex string
 *   publicInputs — bytes32[265]: [0]=match_count, [1..128]=computed_commit, [129..264]=padding
 */

import { network, artifacts } from "hardhat"
import { formatEther, formatGwei, getContract, type Hex } from "viem"
import * as fs from "fs"

// ─── Demo proof values (replace with real bb.js output) ───────────────────────
// proof: raw UltraHonk bytes — must be 0x-prefixed hex from bb.js generateProof()
const PLACEHOLDER_PROOF = '0x' + '00'.repeat(128) as Hex

// publicInputs: bytes32[265] — [0]=match_count, [1..128]=computed_commit, [129..264]=padding zeros
const PLACEHOLDER_PUBLIC_INPUTS: Hex[] = [
  `0x${(102n).toString(16).padStart(64, '0')}` as Hex,   // match_count = 102 (meets threshold)
  ...Array(264).fill(null).map((_, i) =>
    `0x${BigInt(i + 1).toString(16).padStart(64, '0')}` as Hex
  ),
]

// ─── Demo IDs (must be bytes32) ────────────────────────────────────────────────
const CREDENTIAL_ID = '0x63726564656e7469616c00000000000000000000000000000000000000000000' as Hex
const SERVICE_ID    = '0x7365727669636500000000000000000000000000000000000000000000000000' as Hex
const PRODUCT_TX_ID = '0x70726f6475637454780000000000000000000000000000000000000000000000' as Hex
const INITIAL_NONCE = 1n

// ─── Gas row tracking ──────────────────────────────────────────────────────────

interface GasRow {
  step:         string
  gasUsed:      bigint
  gasPriceGwei: bigint
  costEth:      bigint   // in wei
  txHash:       Hex
}

const rows: GasRow[] = []

async function recordTx(
  step: string,
  txHash: Hex,
  publicClient: Awaited<ReturnType<typeof import("viem").createPublicClient>>
): Promise<bigint> {
  const receipt  = await publicClient.waitForTransactionReceipt({ hash: txHash })
  const gasUsed  = receipt.gasUsed
  const gasPrice = (receipt as any).effectiveGasPrice ?? 0n
  const costWei  = gasUsed * gasPrice

  rows.push({
    step,
    gasUsed,
    gasPriceGwei: gasPrice / 1_000_000_000n,
    costEth:      costWei,
    txHash,
  })

  console.log(`  ✓ ${step}`)
  console.log(`    gas: ${gasUsed.toLocaleString()}  price: ${formatGwei(gasPrice)} gwei  cost: ${formatEther(costWei)} ETH`)
  return gasUsed
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const skipProof      = process.env.SKIP_PROOF === 'true'
  const deploymentPath = process.env.DEPLOYMENT

  if (!deploymentPath) {
    console.error('❌ DEPLOYMENT env var required.')
    console.error('   Run deploy-noir.ts first, then:')
    console.error('   DEPLOYMENT=./deployments/noir-<chainId>-<ts>.json npx hardhat run ...')
    process.exit(1)
  }

  if (!fs.existsSync(deploymentPath)) {
    console.error(`❌ Deployment file not found: ${deploymentPath}`)
    process.exit(1)
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
  const { HonkVerifier: verifierAddress, ZTIZENNoir: mainAddress } = deployment.contracts

  console.log('═══════════════════════════════════════════════════════════')
  console.log(' ZTIZENNoir Gas Benchmark  (interaction steps only)')
  console.log('═══════════════════════════════════════════════════════════\n')
  console.log(`HonkVerifier : ${verifierAddress}`)
  console.log(`ZTIZENNoir   : ${mainAddress}\n`)

  const conn = await network.connect()
  const { viem } = conn
  const [deployer] = await viem.getWalletClients()
  const publicClient = await viem.getPublicClient()

  const chainId = await publicClient.getChainId()
  const balance = await publicClient.getBalance({ address: deployer.account.address })
  console.log(`Network chain ID : ${chainId}`)
  console.log(`Deployer         : ${deployer.account.address}`)
  console.log(`Balance          : ${formatEther(balance)} ETH\n`)

  const ztizenNoirArtifact = await artifacts.readArtifact('ZTIZENNoir')

  const ztizen = getContract({
    address: mainAddress as Hex,
    abi:     ztizenNoirArtifact.abi,
    client:  { public: publicClient, wallet: deployer },
  })

  // ── Step 1: addWhitelistedUser ──────────────────────────────────────────────
  console.log('Step 1 — addWhitelistedUser')
  const whitelistHash = await ztizen.write.addWhitelistedUser([deployer.account.address])
  await recordTx('addWhitelistedUser', whitelistHash, publicClient as any)
  console.log()

  // ── Step 2: registerCredential ──────────────────────────────────────────────
  console.log('Step 2 — registerCredential')
  const registerHash = await ztizen.write.registerCredential([
    CREDENTIAL_ID,
    deployer.account.address,
    1n,  // version
  ])
  await recordTx('registerCredential', registerHash, publicClient as any)
  console.log()

  // ── Step 3: initializeCredentialForService ──────────────────────────────────
  console.log('Step 3 — initializeCredentialForService')
  const initHash = await ztizen.write.initializeCredentialForService([
    CREDENTIAL_ID,
    SERVICE_ID,
    INITIAL_NONCE,
  ])
  await recordTx('initializeCredentialForService', initHash, publicClient as any)
  console.log()

  // ── Step 4: setZKVerificationEnabled ────────────────────────────────────────
  console.log('Step 4 — setZKVerificationEnabled')
  const enableHash = await ztizen.write.setZKVerificationEnabled([true])
  await recordTx('setZKVerificationEnabled', enableHash, publicClient as any)
  console.log()

  // ── Step 5: verifyProof ──────────────────────────────────────────────────────
  if (skipProof) {
    console.log('Step 5 — verifyProof  (SKIPPED — set SKIP_PROOF=false to include)\n')
  } else {
    console.log('Step 5 — verifyProof')
    console.log('  ⚠  Using placeholder proof — replace PLACEHOLDER_PROOF/PUBLIC_INPUTS with real bb.js output')

    try {
      const verifyHash = await ztizen.write.verifyProof([
        CREDENTIAL_ID,
        SERVICE_ID,
        INITIAL_NONCE,
        PRODUCT_TX_ID,
        PLACEHOLDER_PROOF,
        PLACEHOLDER_PUBLIC_INPUTS,
      ])
      await recordTx('verifyProof', verifyHash, publicClient as any)
    } catch (e: any) {
      console.log(`  ✗ verifyProof reverted (expected with placeholder proof): ${e.shortMessage ?? e.message}`)
      console.log('  → Paste real proof hex + publicInputs from /proof-demo (Noir tab) to get accurate gas\n')
    }
    console.log()
  }

  // ── Summary table ────────────────────────────────────────────────────────────
  printSummary(rows)

  // Save results
  const out = {
    network:      chainId,
    deployer:     deployer.account.address,
    deployment:   deploymentPath,
    contracts:    { HonkVerifier: verifierAddress, ZTIZENNoir: mainAddress },
    timestamp:    new Date().toISOString(),
    rows: rows.map(r => ({
      step:         r.step,
      gasUsed:      r.gasUsed.toString(),
      gasPriceGwei: r.gasPriceGwei.toString(),
      costEth:      formatEther(r.costEth),
      txHash:       r.txHash,
    })),
    totalGas:     rows.reduce((s, r) => s + r.gasUsed, 0n).toString(),
    totalCostEth: formatEther(rows.reduce((s, r) => s + r.costEth, 0n)),
  }

  const outPath = `./deployments/gas-benchmark-noir-${Date.now()}.json`
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`💾 Results saved to ${outPath}`)
}

function printSummary(rows: GasRow[]) {
  const col1 = Math.max(34, ...rows.map(r => r.step.length)) + 2
  const line  = '─'.repeat(col1 + 16 + 14 + 20)

  console.log('\n' + '═'.repeat(line.length))
  console.log(' Gas Cost Summary — ZTIZENNoir interaction steps')
  console.log('═'.repeat(line.length))
  console.log(
    'Step'.padEnd(col1) +
    'Gas Used'.padStart(14) +
    'Gas Price'.padStart(12) +
    'Cost (ETH)'.padStart(18)
  )
  console.log(line)

  for (const r of rows) {
    console.log(
      r.step.padEnd(col1) +
      r.gasUsed.toLocaleString().padStart(14) +
      `${r.gasPriceGwei} gwei`.padStart(12) +
      formatEther(r.costEth).padStart(18)
    )
  }

  console.log(line)
  const totalGas  = rows.reduce((s, r) => s + r.gasUsed, 0n)
  const totalCost = rows.reduce((s, r) => s + r.costEth, 0n)
  console.log(
    'TOTAL'.padEnd(col1) +
    totalGas.toLocaleString().padStart(14) +
    ''.padStart(12) +
    formatEther(totalCost).padStart(18)
  )
  console.log('═'.repeat(line.length) + '\n')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Benchmark failed:', err)
    process.exit(1)
  })
