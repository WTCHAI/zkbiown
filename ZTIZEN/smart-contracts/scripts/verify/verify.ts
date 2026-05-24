import { network } from "hardhat"
import * as fs from "fs"
import * as path from "path"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

/**
 * TypeScript Verification Script for ZTIZEN System
 * 
 * Verifies both HonkVerifier and ZTIZEN contracts on block explorers
 * 
 * Usage:
 *   npx hardhat run scripts/verify.ts --network sepolia
 *   DEPLOYMENT_FILE=./deployments/sepolia-123.json npx hardhat run scripts/verify.ts --network sepolia
 */

async function main() {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log("🔍 ZTIZEN System Verification")
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log("")

    const networkName = process.env.HARDHAT_NETWORK || "hardhat"
    console.log("🌐 Network:", networkName)
    console.log("")

    // Load deployment info
    let deploymentInfo: any
    const deploymentFile = process.env.DEPLOYMENT_FILE

    if (deploymentFile && fs.existsSync(deploymentFile)) {
        console.log("📂 Loading deployment from:", deploymentFile)
        deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"))
    } else {
        // Find latest deployment file for this network
        const deploymentsDir = "./deployments"
        if (!fs.existsSync(deploymentsDir)) {
            console.error("❌ No deployments directory found")
            process.exit(1)
        }

        const files = fs.readdirSync(deploymentsDir)
            .filter(f => f.startsWith(`${networkName}-`) && f.endsWith(".json"))
            .sort()
            .reverse()

        if (files.length === 0) {
            console.error(`❌ No deployment files found for network: ${networkName}`)
            console.error(`   Looking in: ${deploymentsDir}`)
            process.exit(1)
        }

        const latestFile = path.join(deploymentsDir, files[0])
        console.log("📂 Loading latest deployment:", latestFile)
        deploymentInfo = JSON.parse(fs.readFileSync(latestFile, "utf-8"))
    }

    console.log("")

    const { HonkVerifier, ZTIZEN } = deploymentInfo.contracts

    if (!HonkVerifier || !ZTIZEN) {
        console.error("❌ Missing contract addresses in deployment file")
        console.error("   HonkVerifier:", HonkVerifier)
        console.error("   ZTIZEN:", ZTIZEN)
        process.exit(1)
    }

    console.log("📋 Contract Addresses:")
    console.log("  HonkVerifier:", HonkVerifier)
    console.log("  ZTIZEN:", ZTIZEN)
    console.log("")

    // ============================================
    // STEP 1: Verify HonkVerifier
    // ============================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log("1️⃣  Verifying HonkVerifier (no constructor args)...")
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log("")

    try {
        const { stdout, stderr } = await execAsync(
            `npx hardhat verify --network ${networkName} ${HonkVerifier}`
        )
        console.log(stdout)
        if (stderr) console.error(stderr)
        console.log("✅ HonkVerifier verified successfully!")
    } catch (error: any) {
        if (error.stdout?.includes("Already Verified") || error.message?.includes("Already Verified")) {
            console.log("ℹ️  HonkVerifier already verified")
        } else {
            console.error("❌ HonkVerifier verification failed:", error.message)
            if (error.stdout) console.log(error.stdout)
            if (error.stderr) console.error(error.stderr)
            // Continue to ZTIZEN verification
        }
    }

    console.log("")

    // ============================================
    // STEP 2: Verify ZTIZEN
    // ============================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log("2️⃣  Verifying ZTIZEN...")
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log("  Constructor args: [verifier]")
    console.log("  Verifier address:", HonkVerifier)
    console.log("")

    try {
        const { stdout, stderr } = await execAsync(
            `npx hardhat verify --network ${networkName} ${ZTIZEN} ${HonkVerifier}`
        )
        console.log(stdout)
        if (stderr) console.error(stderr)
        console.log("✅ ZTIZEN verified successfully!")
    } catch (error: any) {
        if (error.stdout?.includes("Already Verified") || error.message?.includes("Already Verified")) {
            console.log("ℹ️  ZTIZEN already verified")
        } else {
            console.error("❌ ZTIZEN verification failed:", error.message)
            if (error.stdout) console.log(error.stdout)
            if (error.stderr) console.error(error.stderr)
            throw error
        }
    }

    console.log("")
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log("✅ All contracts verified successfully!")
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Verification failed:", error)
        process.exit(1)
    })
