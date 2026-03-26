import { expect } from "chai";
import { ethers } from "hardhat";
import { ZTIZEN } from "../typechain-types.js";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ZTIZEN", function () {
  let ztizen: ZTIZEN;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let verifier: HardhatEthersSigner;

  // Test credential IDs
  const credId1 = ethers.id("credential-1");
  const credId2 = ethers.id("credential-2");
  const credId3 = ethers.id("credential-3");
  const version = 1n;

  beforeEach(async function () {
    [owner, user1, user2, verifier] = await ethers.getSigners();

    const ZTIZENFactory = await ethers.getContractFactory("ZTIZEN");
    ztizen = await ZTIZENFactory.deploy();
    await ztizen.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await ztizen.owner()).to.equal(owner.address);
    });

    it("Should initialize with ZK verification disabled", async function () {
      const [, zkEnabled] = await ztizen.getStats();
      expect(zkEnabled).to.be.false;
    });

    it("Should initialize with zero total credentials", async function () {
      const [total] = await ztizen.getStats();
      expect(total).to.equal(0n);
    });
  });

  describe("Credential Registration", function () {
    describe("Single Registration", function () {
      it("Should register a new credential", async function () {
        await expect(ztizen.connect(user1).registerCredential(credId1, version))
          .to.emit(ztizen, "CredentialRegistered")
          .withArgs(credId1, user1.address, version, await time.latest());

        const cred = await ztizen.getCredential(credId1);
        expect(cred.credentialId).to.equal(credId1);
        expect(cred.owner).to.equal(user1.address);
        expect(cred.version).to.equal(version);
        expect(cred.nonce).to.equal(0n);
        expect(cred.isActive).to.be.true;
      });

      it("Should increment total credentials", async function () {
        await ztizen.connect(user1).registerCredential(credId1, version);
        const [total] = await ztizen.getStats();
        expect(total).to.equal(1n);
      });

      it("Should add credential to owner's list", async function () {
        await ztizen.connect(user1).registerCredential(credId1, version);
        const creds = await ztizen.getOwnerCredentials(user1.address);
        expect(creds.length).to.equal(1);
        expect(creds[0]).to.equal(credId1);
      });

      it("Should reject duplicate credential ID", async function () {
        await ztizen.connect(user1).registerCredential(credId1, version);
        await expect(
          ztizen.connect(user2).registerCredential(credId1, version)
        ).to.be.revertedWith("ZTIZEN: Credential already exists");
      });

      it("Should reject invalid version", async function () {
        await expect(
          ztizen.connect(user1).registerCredential(credId1, 0n)
        ).to.be.revertedWith("ZTIZEN: Invalid version");
      });
    });

    describe("Batch Registration", function () {
      it("Should register multiple credentials in batch", async function () {
        const credIds = [credId1, credId2, credId3];

        await expect(
          ztizen.connect(user1).registerCredentialBatch(credIds, version)
        )
          .to.emit(ztizen, "CredentialRegistered")
          .withArgs(credId1, user1.address, version, await time.latest())
          .and.to.emit(ztizen, "CredentialRegistered")
          .withArgs(credId2, user1.address, version, await time.latest())
          .and.to.emit(ztizen, "CredentialRegistered")
          .withArgs(credId3, user1.address, version, await time.latest());

        const [total] = await ztizen.getStats();
        expect(total).to.equal(3n);
      });

      it("Should reject empty batch", async function () {
        await expect(
          ztizen.connect(user1).registerCredentialBatch([], version)
        ).to.be.revertedWith("ZTIZEN: Empty batch");
      });

      it("Should reject batch too large", async function () {
        const largeBatch = Array(11).fill(credId1);
        await expect(
          ztizen.connect(user1).registerCredentialBatch(largeBatch, version)
        ).to.be.revertedWith("ZTIZEN: Batch too large");
      });

      it("Should reject if any credential already exists", async function () {
        await ztizen.connect(user1).registerCredential(credId1, version);

        await expect(
          ztizen.connect(user1).registerCredentialBatch([credId1, credId2], version)
        ).to.be.revertedWith("ZTIZEN: Credential already exists");
      });
    });
  });

  describe("Credential Verification", function () {
    beforeEach(async function () {
      await ztizen.connect(user1).registerCredential(credId1, version);
    });

    describe("Simple Verification (Phase 3)", function () {
      it("Should verify with correct nonce", async function () {
        await expect(ztizen.connect(verifier).verifyCredential(credId1, 0n))
          .to.emit(ztizen, "CredentialVerified")
          .withArgs(credId1, verifier.address, 0n, true, await time.latest());
      });

      it("Should reject wrong nonce", async function () {
        await expect(
          ztizen.connect(verifier).verifyCredential(credId1, 1n)
        ).to.be.revertedWith("ZTIZEN: Invalid nonce");
      });

      it("Should reject reused nonce", async function () {
        await ztizen.connect(verifier).verifyCredential(credId1, 0n);

        await expect(
          ztizen.connect(verifier).verifyCredential(credId1, 0n)
        ).to.be.revertedWith("ZTIZEN: Nonce already used");
      });

      it("Should reject if credential not active", async function () {
        await ztizen.connect(user1).deactivateCredential(credId1);

        await expect(
          ztizen.connect(verifier).verifyCredential(credId1, 0n)
        ).to.be.revertedWith("ZTIZEN: Credential is not active");
      });

      it("Should update lastVerifiedAt timestamp", async function () {
        const timestamp = await time.latest();
        await ztizen.connect(verifier).verifyCredential(credId1, 0n);

        const cred = await ztizen.getCredential(credId1);
        expect(cred.lastVerifiedAt).to.be.closeTo(BigInt(timestamp), 2n);
      });
    });

    describe("ZK Proof Verification (Phase 5)", function () {
      it("Should reject when ZK verification not enabled", async function () {
        const mockProof = ethers.hexlify(ethers.randomBytes(128));

        await expect(
          ztizen.connect(verifier).verifyWithProof(credId1, 0n, mockProof)
        ).to.be.revertedWith("ZTIZEN: ZK verification not enabled");
      });

      it("Should verify with proof when enabled", async function () {
        await ztizen.connect(owner).setZKVerificationEnabled(true);
        const mockProof = ethers.hexlify(ethers.randomBytes(128));

        await expect(
          ztizen.connect(verifier).verifyWithProof(credId1, 0n, mockProof)
        )
          .to.emit(ztizen, "CredentialVerified")
          .withArgs(credId1, verifier.address, 0n, true, await time.latest());
      });

      it("Should reject empty proof", async function () {
        await ztizen.connect(owner).setZKVerificationEnabled(true);

        await expect(
          ztizen.connect(verifier).verifyWithProof(credId1, 0n, "0x")
        ).to.be.revertedWith("ZTIZEN: Invalid proof");
      });
    });
  });

  describe("Nonce Management", function () {
    beforeEach(async function () {
      await ztizen.connect(user1).registerCredential(credId1, version);
    });

    it("Should get current nonce", async function () {
      const nonce = await ztizen.getNonce(credId1);
      expect(nonce).to.equal(0n);
    });

    it("Should increment nonce", async function () {
      await expect(ztizen.connect(user1).incrementNonce(credId1))
        .to.emit(ztizen, "CredentialRevoked")
        .withArgs(credId1, user1.address, 1n, await time.latest());

      const newNonce = await ztizen.getNonce(credId1);
      expect(newNonce).to.equal(1n);
    });

    it("Should only allow owner to increment nonce", async function () {
      await expect(
        ztizen.connect(user2).incrementNonce(credId1)
      ).to.be.revertedWith("ZTIZEN: Not credential owner");
    });

    it("Should check if nonce is used", async function () {
      expect(await ztizen.isNonceUsed(credId1, 0n)).to.be.false;

      await ztizen.connect(verifier).verifyCredential(credId1, 0n);

      expect(await ztizen.isNonceUsed(credId1, 0n)).to.be.true;
    });

    it("Should invalidate old nonce after increment", async function () {
      await ztizen.connect(user1).incrementNonce(credId1);

      // Old nonce (0) should not work
      await expect(
        ztizen.connect(verifier).verifyCredential(credId1, 0n)
      ).to.be.revertedWith("ZTIZEN: Invalid nonce");

      // New nonce (1) should work
      await expect(ztizen.connect(verifier).verifyCredential(credId1, 1n))
        .to.emit(ztizen, "CredentialVerified");
    });
  });

  describe("Credential Management", function () {
    beforeEach(async function () {
      await ztizen.connect(user1).registerCredential(credId1, version);
    });

    describe("Deactivation", function () {
      it("Should deactivate credential", async function () {
        await expect(ztizen.connect(user1).deactivateCredential(credId1))
          .to.emit(ztizen, "CredentialDeactivated")
          .withArgs(credId1, user1.address, await time.latest());

        const cred = await ztizen.getCredential(credId1);
        expect(cred.isActive).to.be.false;
      });

      it("Should only allow owner to deactivate", async function () {
        await expect(
          ztizen.connect(user2).deactivateCredential(credId1)
        ).to.be.revertedWith("ZTIZEN: Not credential owner");
      });
    });

    describe("Reactivation", function () {
      beforeEach(async function () {
        await ztizen.connect(user1).deactivateCredential(credId1);
      });

      it("Should reactivate credential", async function () {
        await expect(ztizen.connect(user1).reactivateCredential(credId1))
          .to.emit(ztizen, "CredentialReactivated")
          .withArgs(credId1, user1.address, await time.latest());

        const cred = await ztizen.getCredential(credId1);
        expect(cred.isActive).to.be.true;
      });

      it("Should only allow owner to reactivate", async function () {
        await expect(
          ztizen.connect(user2).reactivateCredential(credId1)
        ).to.be.revertedWith("ZTIZEN: Not credential owner");
      });
    });

    describe("Query Functions", function () {
      it("Should get credential details", async function () {
        const cred = await ztizen.getCredential(credId1);

        expect(cred.credentialId).to.equal(credId1);
        expect(cred.owner).to.equal(user1.address);
        expect(cred.version).to.equal(version);
        expect(cred.nonce).to.equal(0n);
        expect(cred.isActive).to.be.true;
      });

      it("Should get owner credentials", async function () {
        await ztizen.connect(user1).registerCredential(credId2, version);

        const creds = await ztizen.getOwnerCredentials(user1.address);
        expect(creds.length).to.equal(2);
        expect(creds[0]).to.equal(credId1);
        expect(creds[1]).to.equal(credId2);
      });

      it("Should reject query for non-existent credential", async function () {
        await expect(
          ztizen.getCredential(credId2)
        ).to.be.revertedWith("ZTIZEN: Credential does not exist");
      });
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to enable ZK verification", async function () {
      await ztizen.connect(owner).setZKVerificationEnabled(true);
      const [, zkEnabled] = await ztizen.getStats();
      expect(zkEnabled).to.be.true;
    });

    it("Should reject non-owner from enabling ZK verification", async function () {
      await expect(
        ztizen.connect(user1).setZKVerificationEnabled(true)
      ).to.be.revertedWithCustomError(ztizen, "OwnableUnauthorizedAccount");
    });

    it("Should return correct stats", async function () {
      await ztizen.connect(user1).registerCredential(credId1, version);
      await ztizen.connect(user2).registerCredential(credId2, version);

      const [total, zkEnabled] = await ztizen.getStats();
      expect(total).to.equal(2n);
      expect(zkEnabled).to.be.false;
    });
  });

  describe("Multi-User Scenarios", function () {
    it("Should handle multiple users with multiple credentials", async function () {
      // User1 registers 2 credentials
      await ztizen.connect(user1).registerCredential(credId1, version);
      await ztizen.connect(user1).registerCredential(credId2, version);

      // User2 registers 1 credential
      await ztizen.connect(user2).registerCredential(credId3, version);

      const user1Creds = await ztizen.getOwnerCredentials(user1.address);
      const user2Creds = await ztizen.getOwnerCredentials(user2.address);

      expect(user1Creds.length).to.equal(2);
      expect(user2Creds.length).to.equal(1);

      const [total] = await ztizen.getStats();
      expect(total).to.equal(3n);
    });

    it("Should maintain independent nonces per credential", async function () {
      await ztizen.connect(user1).registerCredential(credId1, version);
      await ztizen.connect(user1).registerCredential(credId2, version);

      // Verify credId1
      await ztizen.connect(verifier).verifyCredential(credId1, 0n);
      expect(await ztizen.isNonceUsed(credId1, 0n)).to.be.true;

      // credId2 nonce should still be unused
      expect(await ztizen.isNonceUsed(credId2, 0n)).to.be.false;

      // Should be able to verify credId2
      await expect(ztizen.connect(verifier).verifyCredential(credId2, 0n))
        .to.emit(ztizen, "CredentialVerified");
    });
  });
});
