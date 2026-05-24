import { network, artifacts } from "hardhat"
import { formatEther, getContract, type Hex } from "viem"
import { getNetworkAddresses } from "../constants/addresses.js"

/**
 * Main deployment script for ZTIZEN system (Hardhat v3 + Viem)
 *
 * Deployment order:
 * 1. Deploy ZTIZEN
 * 2. Whitelist oracle address
 * 3. Configure ZK verification
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *   npx hardhat run scripts/deploy.ts --network localhost
 */

async function main() {
	console.log("🚀 Starting ZTIZEN System Deployment...\n")

	// Load artifacts
	const ztizenArtifact = await artifacts.readArtifact("ZTIZEN")
	const verifierArtifact = await artifacts.readArtifact("HonkVerifier")

	// Connect to network and get clients (Hardhat v3 + Viem)
	const { viem } = await network.connect({
		network: "sepolia"
	})
	const [deployer] = await viem.getWalletClients()
	const publicClient = await viem.getPublicClient()

	// Get network info from process.env or hardhat network config
	const networkName = process.env.HARDHAT_NETWORK || "hardhat"
	const chainId = await publicClient.getChainId()
	console.log("🌐 Network:", networkName)
	console.log("🔗 Chain ID:", chainId)
	console.log("")

	console.log("Deploying contracts with account:", deployer.account.address)
	const balance = await publicClient.getBalance({ address: deployer.account.address })
	console.log("Account balance:", formatEther(balance), "ETH\n")

	// ============================================
	// CONFIGURATION - EDIT THESE VALUES
	// ============================================
	const networkAddresses = getNetworkAddresses(networkName)

	// Set to an existing verifier address to skip deployment, or null to deploy new
	const EXISTING_VERIFIER_ADDRESS = process.env.HONK_VERIFIER_ADDRESS || "0xcB80852fDF30F4ae407814B4c98f57a4A6c45121"

	// ============================================
	// STEP 1: Deploy or Use Existing ZK Verifier
	// ============================================

	let verifierAddress: `0x${string}`

	if (EXISTING_VERIFIER_ADDRESS && EXISTING_VERIFIER_ADDRESS !== "0x0000000000000000000000000000000000000000") {
		console.log("1️⃣  Using existing HonkVerifier...")
		verifierAddress = EXISTING_VERIFIER_ADDRESS as `0x${string}`
		console.log("✅ HonkVerifier at:", verifierAddress)
		console.log("")
	} else {
		console.log("1️⃣  Deploying HonkVerifier (Noir ZK Verifier)...")
		console.log("⚠️  Warning: This is a LARGE contract (~800KB bytecode)")
		console.log("   Deployment may take 2-5 minutes and cost significant gas")
		console.log("")

		const verifierHash = await deployer.deployContract({
			abi: verifierArtifact.abi,
			bytecode: verifierArtifact.bytecode as Hex,
			args: [],
		})

		console.log("📝 Verifier deployment tx:", verifierHash)
		console.log("⏳ Waiting for confirmation...")

		const verifierReceipt = await publicClient.waitForTransactionReceipt({ hash: verifierHash })
		verifierAddress = verifierReceipt.contractAddress!

		console.log("✅ HonkVerifier deployed to:", verifierAddress)
		console.log("📦 Block number:", verifierReceipt.blockNumber)
		console.log("")
	}

	// ============================================
	// STEP 2: Deploy ZTIZEN with Verifier
	// ============================================

	console.log("2️⃣  Deploying ZTIZEN...")
	console.log("  ZK Verifier:", verifierAddress)

	const ztizenHash = await deployer.deployContract({
		abi: ztizenArtifact.abi,
		bytecode: ztizenArtifact.bytecode as Hex,
		args: [verifierAddress],
	})

	console.log("\n📝 ZTIZEN deployment tx:", ztizenHash)
	console.log("⏳ Waiting for confirmation...")

	const ztizenReceipt = await publicClient.waitForTransactionReceipt({ hash: ztizenHash })
	const ztizenAddress = ztizenReceipt.contractAddress!
	console.log("✅ ZTIZEN deployed to:", ztizenAddress)
	console.log("📦 Block number:", ztizenReceipt.blockNumber)
	console.log("")

	// Get contract instance
	const ztizen = getContract({
		address: ztizenAddress,
		abi: ztizenArtifact.abi,
		client: { public: publicClient, wallet: deployer },
	})

	// ============================================
	// STEP 3: Whitelist Oracle Address
	// ============================================
	console.log("3️⃣  Whitelisting Oracle Address...")
	const whitelistHash = await ztizen.write.addWhitelistedUser([deployer.account.address as Hex])
	await publicClient.waitForTransactionReceipt({ hash: whitelistHash })
	console.log("✅ Oracle whitelisted:", deployer.account.address)
	console.log("")

	// ============================================
	// DEPLOYMENT SUMMARY
	// ============================================
	console.log("═══════════════════════════════════════════════════════")
	console.log("🎉 DEPLOYMENT COMPLETE!")
	console.log("═══════════════════════════════════════════════════════")
	console.log("")
	console.log("📝 Contract Addresses:")
	console.log("──────────────────────────────────────────────────────")
	console.log("HonkVerifier:", verifierAddress)
	console.log("ZTIZEN:", ztizenAddress)
	console.log("")
	console.log("🔑 Access Control:")
	console.log("──────────────────────────────────────────────────────")
	console.log("Oracle:", deployer.account.address)
	console.log("Admin:", deployer.account.address)
	console.log("")
	console.log("📋 Next Steps:")
	console.log("──────────────────────────────────────────────────────")
	console.log("1. Verify contracts on block explorer")
	console.log("2. Enable ZK verification when ready")
	console.log("3. Register first credential for oracle")
	console.log("4. Initialize service credentials")
	console.log("")
	console.log("💾 Save these addresses to your .env file:")
	console.log("──────────────────────────────────────────────────────")
	console.log(`HONK_VERIFIER_ADDRESS=${verifierAddress}`)
	console.log(`ZTIZEN_ADDRESS=${ztizenAddress}`)
	console.log(`ZTIZEN_ORACLE_ADDRESS=${deployer.account.address}`)
	console.log(`ZTIZEN_ADMIN_ADDRESS=${deployer.account.address}`)
	console.log("")

	// Save deployment info to file
	const deploymentInfo = {
		network: networkName,
		chainId: Number(chainId),
		deployer: deployer.account.address,
		timestamp: new Date().toISOString(),
		contracts: {
			HonkVerifier: verifierAddress,
			ZTIZEN: ztizenAddress,
		},
		config: deployer.account.address,
	}

	const fs = await import("fs")
	const deploymentPath = `./deployments/${networkName}-${Date.now()}.json`
	fs.mkdirSync("./deployments", { recursive: true })
	fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2))
	console.log("💾 Deployment info saved to:", deploymentPath)
	console.log("")
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("❌ Deployment failed:", error)
		process.exit(1)
	})
