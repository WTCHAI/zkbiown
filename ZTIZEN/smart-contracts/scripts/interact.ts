import { ethers } from "hardhat";

/**
 * Interaction script for ZTIZEN contract
 * Used to test contract functions after deployment
 */

async function main() {
  // Contract address (update after deployment)
  const CONTRACT_ADDRESS = process.env.ZTIZEN_CONTRACT_ADDRESS || "";

  if (!CONTRACT_ADDRESS) {
    console.error("❌ Please set ZTIZEN_CONTRACT_ADDRESS in .env");
    process.exit(1);
  }

  console.log("\n=".repeat(60));
  console.log("🔗 Interacting with ZTIZEN Contract");
  console.log("=".repeat(60));
  console.log(`\nContract Address: ${CONTRACT_ADDRESS}`);

  const [signer] = await ethers.getSigners();
  console.log(`Signer Address: ${signer.address}`);

  // Connect to deployed contract
  const ztizen = await ethers.getContractAt("ZTIZEN", CONTRACT_ADDRESS);

  // Get contract stats
  const [totalCreds, zkEnabled] = await ztizen.getStats();
  console.log("\n📊 Current Stats:");
  console.log(`   Total Credentials: ${totalCreds}`);
  console.log(`   ZK Verification: ${zkEnabled ? "Enabled" : "Disabled"}`);

  // Example: Register a test credential
  console.log("\n📝 Registering test credential...");
  const testCredId = ethers.id("test-credential-" + Date.now());
  const version = 1n;

  try {
    const tx = await ztizen.registerCredential(testCredId, version);
    console.log(`Transaction hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`✅ Credential registered in block ${receipt?.blockNumber}`);

    // Get credential details
    const cred = await ztizen.getCredential(testCredId);
    console.log("\n📋 Credential Details:");
    console.log(`   ID: ${cred.credentialId}`);
    console.log(`   Owner: ${cred.owner}`);
    console.log(`   Version: ${cred.version}`);
    console.log(`   Nonce: ${cred.nonce}`);
    console.log(`   Active: ${cred.isActive}`);
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
  }

  // Get owner credentials
  const ownerCreds = await ztizen.getOwnerCredentials(signer.address);
  console.log(`\n👤 Your Credentials: ${ownerCreds.length}`);

  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
