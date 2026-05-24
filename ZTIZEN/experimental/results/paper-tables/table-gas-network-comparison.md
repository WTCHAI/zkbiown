# Table — On-Chain Gas Cost: Ethereum Sepolia vs Arbitrum Sepolia

**Source:** `results/gas-cost-analysis.md`  
**ETH/USD:** $2,077.46  
**All figures verifiable on-chain — links provided per row**

---

## Deployed Contracts (Source of Truth)

### Ethereum Sepolia
- CircomVerifier: https://eth-sepolia.blockscout.com/address/0x7f03a3254d9c5fee8a5ad82245d33336f9d7024c
- ZTIZENCircom: https://eth-sepolia.blockscout.com/address/0x62b9c6545a07ce573372cbb42857b719d5200d8d

### Arbitrum Sepolia
- CircomVerifier: https://arbitrum-sepolia.blockscout.com/address/0x2da55f4c1eceb0ceeb93ee598e852bf24abb8fce
- ZTIZENCircom: https://arbitrum-sepolia.blockscout.com/address/0xd2b1dd269c90873d5a4ef92cf9104b63941997df

---

## Table A — Deployment Gas (one-time)

| Contract | ETH Sepolia (gas) | ARB Sepolia (gas) | Deploy Tx (Sepolia) | Deploy Tx (Arbitrum) |
|---|---:|---:|---|---|
| CircomVerifier | 4,899,605 | 5,206,969 | https://eth-sepolia.blockscout.com/tx/0xda748395755846f11faf83e67f4b94db3afd02f46cf3a127e79399f0ed824af4 | https://arbitrum-sepolia.blockscout.com/tx/0xf004186accbb88d4a02e525843cb5d9b508deb187c155440e45237bc4117b6f8 |
| ZTIZENCircom | 1,375,941 | 1,465,140 | https://eth-sepolia.blockscout.com/tx/0xe014d6dd94a205aac8cc1cf2fb1dc0849dda2df282777d2067ff7b0442acad23 | https://arbitrum-sepolia.blockscout.com/tx/0x3dd6b5f5d3e9ddf250d735abb598b1431d08a1a3f750c1c482a4683a43a106ce |
| **Total** | **6,275,546** | **6,672,109** | — | — |

---

## Table B — Interaction Gas per Authentication Session

| Operation | ETH Sep (gas) | ETH Sep (USD) | ARB Sep (gas) | ARB Sep (USD) | Tx (Sepolia) | Tx (Arbitrum) |
|---|---:|---:|---:|---:|---|---|
| addWhitelistedUser | 47,556 | $0.110 | 51,418 | $0.0021 | https://eth-sepolia.blockscout.com/tx/0x593ed0305283f5d14aee0425b43829a68e827a8fee77e6fffc9caa2a9bc707a5 | https://arbitrum-sepolia.blockscout.com/tx/0xa52df8248c11f76cb13fd9592bcc14277a9d226b27bac3a689ed05fccd3b1302 |
| registerCredential | 188,723 | $0.437 | 194,313 | $0.0081 | https://eth-sepolia.blockscout.com/tx/0x56cb8d65d2284837e09bb74aff3eb14a290c60004856fca941ca56ebb1e11d25 | https://arbitrum-sepolia.blockscout.com/tx/0x24ff9082b6ecc44bba6738144d92736dde177e3f7d79e205ecbe8a475ef371a7 |
| initializeCredentialForService | 55,788 | $0.124 | 61,373 | $0.0026 | https://eth-sepolia.blockscout.com/tx/0xd4498b4890b6e741f5d5c61711144b0555aac61b0624460017c4583b3b675429 | https://arbitrum-sepolia.blockscout.com/tx/0xd7e6f83c67d8efa9f06aec756f80067105c1275d4d73cfcce2f4f8e7ed2668a2 |
| setZKVerificationEnabled | 29,926 | $0.061 | 33,745 | $0.0014 | https://eth-sepolia.blockscout.com/tx/0x1bcb75e726f6c1909882630ef0c584b587e9340367092a096b20682e4138715d | https://arbitrum-sepolia.blockscout.com/tx/0x37d2eed4cce9dabcb018a2fcaef754708e2214cdd8aac671515706f1fdd545f2 |
| **verifyProof** | **1,169,555** | **$2.591** | **1,290,131** | **$0.054** | https://eth-sepolia.blockscout.com/tx/0x6c9f8d8700162296f5cee774de377fbe447a2961cb9aed07aada367f4700a5df | https://arbitrum-sepolia.blockscout.com/tx/0xec7eb50999051dc1a6d3028a6ad61ef42035d89c9ba5a31e670886dbe4139a55 |
| **Total session** | **1,491,548** | **$3.323** | **1,630,980** | **$0.068** | — | — |

_Gas price: Sepolia ~1.07 gwei · Arbitrum Sepolia ~0.020 gwei (from tx receipts)_  
_Cost = gas × price × 10⁻⁹ × $2,077.46 (ref: https://ethereum.org/developers/docs/gas/)_  
_Arbitrum 49× cheaper despite 9% more gas units — L2 batch amortisation of L1 data cost_

---

## Table C — Mainnet Cost Projection

| Network | Gas price | verifyProof (USD) | Full session (USD) |
|---|---|---:|---:|
| Ethereum — Low (5 gwei) | 5 gwei | $12.14 | $15.51 |
| Ethereum — Normal (15 gwei) | 15 gwei | $36.43 | $46.52 |
| Ethereum — Peak (50 gwei) | 50 gwei | $121.43 | $155.07 |
| Arbitrum One — Normal (0.1 gwei) | 0.1 gwei | $0.243 | $0.310 |
| Arbitrum One — Elevated (0.5 gwei) | 0.5 gwei | $1.215 | $1.550 |

---

## Table D — Nonce Roll: Security Properties (no extra gas cost)

The nonce roll executes **within** the `verifyProof` transaction — zero additional gas.

| Property | Implementation | Gas impact |
|---|---|---|
| Replay resistance | `require(currentNonce == storedNonce)` | ~200 gas (SLOAD) |
| Nonce derivation | `keccak256(nonce_N \|\| timestamp \|\| blockNum \|\| prevrandao)` | ~30 gas |
| Nonce storage | `credentialServiceNonces[credId][svcId] = newNonce` | ~5,000 gas (SSTORE) |
| Event emission | `emit ProofVerified(..., oldNonce, newNonce)` | ~1,500 gas |
| **Total nonce overhead** | **~6,730 gas** | **0.6% of verifyProof** |

The Groth16 pairing check (~1.16M gas) dwarfs the nonce mechanism. Rolling nonces is essentially free relative to the ZK verification cost.
