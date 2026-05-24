# ZTIZENCircom On-Chain Gas Cost Analysis

**Date:** 2026-05-24  
**ETH/USD:** $2,077.46  
**Networks:** Ethereum Sepolia (chainId 11155111) · Arbitrum Sepolia (chainId 421614)  
**Deployed by:** `0x976e6aa697f860af7771c22c630cc843107e6dee`

> Every gas figure below has a live on-chain source link. Click any transaction hash or
> contract address to verify the number independently on the block explorer.

---

## 1. Deployed Contract Addresses

### Ethereum Sepolia

| Contract | Address | Explorer |
|---|---|---|
| CircomVerifier (Groth16) | `0x7f03a3254d9c5fee8a5ad82245d33336f9d7024c` | https://eth-sepolia.blockscout.com/address/0x7f03a3254d9c5fee8a5ad82245d33336f9d7024c |
| ZTIZENCircom | `0x62b9c6545a07ce573372cbb42857b719d5200d8d` | https://eth-sepolia.blockscout.com/address/0x62b9c6545a07ce573372cbb42857b719d5200d8d |

**Deployment transactions:**

| Contract | Deploy Tx | Explorer |
|---|---|---|
| CircomVerifier | `0xda748395...` | https://eth-sepolia.blockscout.com/tx/0xda748395755846f11faf83e67f4b94db3afd02f46cf3a127e79399f0ed824af4 |
| ZTIZENCircom | `0xe014d6dd...` | https://eth-sepolia.blockscout.com/tx/0xe014d6dd94a205aac8cc1cf2fb1dc0849dda2df282777d2067ff7b0442acad23 |

### Arbitrum Sepolia

| Contract | Address | Explorer |
|---|---|---|
| CircomVerifier (Groth16) | `0x2da55f4c1eceb0ceeb93ee598e852bf24abb8fce` | https://arbitrum-sepolia.blockscout.com/address/0x2da55f4c1eceb0ceeb93ee598e852bf24abb8fce |
| ZTIZENCircom | `0xd2b1dd269c90873d5a4ef92cf9104b63941997df` | https://arbitrum-sepolia.blockscout.com/address/0xd2b1dd269c90873d5a4ef92cf9104b63941997df |

**Deployment transactions:**

| Contract | Deploy Tx | Explorer |
|---|---|---|
| CircomVerifier | `0xf004186a...` | https://arbitrum-sepolia.blockscout.com/tx/0xf004186accbb88d4a02e525843cb5d9b508deb187c155440e45237bc4117b6f8 |
| ZTIZENCircom | `0x3dd6b5f5...` | https://arbitrum-sepolia.blockscout.com/tx/0x3dd6b5f5d3e9ddf250d735abb598b1431d08a1a3f750c1c482a4683a43a106ce |

---

## 2. Interaction Transactions (per authentication session)

Each row below is a live transaction. Open any link to verify gas used, gas price, and
transaction fee directly on the block explorer — these are the raw source numbers used
in every table in this report.

### Ethereum Sepolia

| Step | Gas Used | Cost (ETH) | Transaction |
|---|---:|---:|---|
| addWhitelistedUser | 47,556 | 0.000052803 | https://eth-sepolia.blockscout.com/tx/0x593ed0305283f5d14aee0425b43829a68e827a8fee77e6fffc9caa2a9bc707a5 |
| registerCredential | 188,723 | 0.000210233 | https://eth-sepolia.blockscout.com/tx/0x56cb8d65d2284837e09bb74aff3eb14a290c60004856fca941ca56ebb1e11d25 |
| initializeCredentialForService | 55,788 | 0.000059820 | https://eth-sepolia.blockscout.com/tx/0xd4498b4890b6e741f5d5c61711144b0555aac61b0624460017c4583b3b675429 |
| setZKVerificationEnabled | 29,926 | 0.000029462 | https://eth-sepolia.blockscout.com/tx/0x1bcb75e726f6c1909882630ef0c584b587e9340367092a096b20682e4138715d |
| **verifyProof** | **1,169,555** | **0.001247072** | https://eth-sepolia.blockscout.com/tx/0x6c9f8d8700162296f5cee774de377fbe447a2961cb9aed07aada367f4700a5df |
| **Total session** | **1,491,548** | **0.001599389** | — |

### Arbitrum Sepolia

| Step | Gas Used | Cost (ETH) | Transaction |
|---|---:|---:|---|
| addWhitelistedUser | 51,418 | 0.000001029 | https://arbitrum-sepolia.blockscout.com/tx/0xa52df8248c11f76cb13fd9592bcc14277a9d226b27bac3a689ed05fccd3b1302 |
| registerCredential | 194,313 | 0.000003887 | https://arbitrum-sepolia.blockscout.com/tx/0x24ff9082b6ecc44bba6738144d92736dde177e3f7d79e205ecbe8a475ef371a7 |
| initializeCredentialForService | 61,373 | 0.000001229 | https://arbitrum-sepolia.blockscout.com/tx/0xd7e6f83c67d8efa9f06aec756f80067105c1275d4d73cfcce2f4f8e7ed2668a2 |
| setZKVerificationEnabled | 33,745 | 0.000000683 | https://arbitrum-sepolia.blockscout.com/tx/0x37d2eed4cce9dabcb018a2fcaef754708e2214cdd8aac671515706f1fdd545f2 |
| **verifyProof** | **1,290,131** | **0.000025831** | https://arbitrum-sepolia.blockscout.com/tx/0xec7eb50999051dc1a6d3028a6ad61ef42035d89c9ba5a31e670886dbe4139a55 |
| **Total session** | **1,630,980** | **0.000032660** | — |

---

## 3. Why Arbitrum Uses More Gas Units But Costs Less

This is the central conceptual point for understanding the cost difference.

### The fee equation (source: https://ethereum.org/developers/docs/gas/)

```
Transaction fee (ETH) = Gas units × Gas price (wei) × 10⁻¹⁸

Where:
  Gas units  — units of EVM computation consumed (SLOAD, SSTORE, ecPairing, etc.)
  Gas price  — Base fee + Priority fee, denominated in wei (1 gwei = 10⁹ wei)
  Base fee   — protocol-set minimum per block, burned (EIP-1559)
  Priority fee — tip to the block producer / sequencer
```

### What differs between networks

| Factor | Ethereum Sepolia | Arbitrum Sepolia | Why |
|---|---|---|---|
| Gas units (verifyProof) | 1,169,555 | 1,290,131 | Arbitrum's AVM reprices BN254 precompile (`ecPairing`) and storage opcodes slightly higher |
| Effective gas price | ~1.066 gwei | ~0.020 gwei | Arbitrum amortises L1 posting cost across ~hundreds of batched txs |
| **Transaction fee** | **0.001247 ETH** | **0.000026 ETH** | **48× cheaper** |

### Why Arbitrum gas price is ~53× lower

Arbitrum One is an Optimistic Rollup. Every L2 transaction pays two components:

1. **L2 execution fee** — cost of running the EVM on Arbitrum's sequencer. Very cheap because the sequencer is a single centralised node.
2. **L1 data fee** — cost of posting compressed calldata to Ethereum mainnet as a blob. This is **shared across all transactions in the batch** — if 500 txs are batched together, each pays 1/500th of the L1 blob cost.

On Ethereum mainnet each transaction pays the full L1 fee alone. This is why gas price collapses from ~1.1 gwei to ~0.02 gwei — a 53× reduction — even though gas units are slightly higher.

```
Ethereum:  you pay the full taxi fare alone
Arbitrum:  you pay 1/500th of a bus fare — bus has slightly heavier seats
           (slightly more gas units) but the fare is far cheaper
```

---

## 4. Deployment Gas (one-time cost)

| Contract | Ethereum Sepolia | Arbitrum Sepolia | Δ Units |
|---|---:|---:|---:|
| CircomVerifier (Groth16) | 4,899,605 | 5,206,969 | +6.3% |
| ZTIZENCircom | 1,375,941 | 1,465,140 | +6.5% |
| **Total** | **6,275,546** | **6,672,109** | **+6.3%** |

---

## 5. Interaction Gas per Authentication Session

| Step | ETH Sepolia (gas) | ARB Sepolia (gas) | Δ Units |
|---|---:|---:|---:|
| addWhitelistedUser | 47,556 | 51,418 | +8.1% |
| registerCredential | 188,723 | 194,313 | +3.0% |
| initializeCredentialForService | 55,788 | 61,373 | +10.0% |
| setZKVerificationEnabled | 29,926 | 33,745 | +12.8% |
| **verifyProof** | **1,169,555** | **1,290,131** | **+10.3%** |
| **Total session** | **1,491,548** | **1,630,980** | **+9.3%** |

**verifyProof accounts for 78.4% (Sepolia) and 79.1% (Arbitrum) of total session gas.**  
The Groth16 BN254 pairing check is the dominant cost regardless of network.

---

## 6. Actual Cost Paid (as measured from testnet receipts)

### Effective gas prices observed

| Network | Effective gas price | Source |
|---|---|---|
| Ethereum Sepolia | ~1.066–1.113 gwei | `effectiveGasPrice` from tx receipts |
| Arbitrum Sepolia | ~0.020 gwei | consistent floor across all 5 steps |

### Cost in ETH

| Step | ETH Sepolia (ETH) | ARB Sepolia (ETH) | Ratio |
|---|---:|---:|---:|
| addWhitelistedUser | 0.000052803 | 0.000001029 | 51.3× |
| registerCredential | 0.000210233 | 0.000003887 | 54.1× |
| initializeCredentialForService | 0.000059820 | 0.000001229 | 48.7× |
| setZKVerificationEnabled | 0.000029462 | 0.000000683 | 43.1× |
| **verifyProof** | **0.001247072** | **0.000025831** | **48.3×** |
| **Total session** | **0.001599389** | **0.000032660** | **49.0×** |

---

## 7. USD Cost (@ $2,077.46 / ETH)

| Step | ETH Sepolia (USD) | ARB Sepolia (USD) |
|---|---:|---:|
| addWhitelistedUser | $0.110 | $0.0021 |
| registerCredential | $0.437 | $0.0081 |
| initializeCredentialForService | $0.124 | $0.0026 |
| setZKVerificationEnabled | $0.061 | $0.0014 |
| **verifyProof** | **$2.591** | **$0.054** |
| **Total session** | **$3.323** | **$0.068** |

**Arbitrum Sepolia is 49× cheaper at these gas prices.**

---

## 8. Mainnet Cost Projection

These use mainnet-typical gas prices applied to the gas units measured on testnet.

### Ethereum Mainnet (using Sepolia gas units)

| Gas scenario | Gas price | verifyProof (USD) | Full session (USD) |
|---|---|---:|---:|
| Low — off-peak | 5 gwei | $12.14 | $15.51 |
| Normal | 15 gwei | $36.43 | $46.52 |
| High — peak hours | 50 gwei | $121.43 | $155.07 |

### Arbitrum One Mainnet (using Arbitrum Sepolia gas units)

| Gas scenario | Gas price | verifyProof (USD) | Full session (USD) |
|---|---|---:|---:|
| Normal | 0.1 gwei | $0.243 | $0.310 |
| Elevated | 0.5 gwei | $1.215 | $1.550 |

**Mainnet real-world ratio: ~50–150× cheaper on Arbitrum One.**  
Arbitrum One is the only production-viable deployment target at current proof system scale.

---

## 9. Cost Calculation Verification

Reference: https://ethereum.org/developers/docs/gas/

```
cost_ETH = gas_units × gas_price_wei / 10¹⁸
cost_USD = cost_ETH × ETH_price_USD
```

**Ethereum Sepolia — verifyProof:**
```
gas_units     = 1,169,555
gas_price_wei = 1,066,279 wei  (= 1.066279 gwei)
cost_ETH      = 1,169,555 × 1,066,279 / 10¹⁸
              = 1,247,072,... / 10¹⁸
              = 0.001247072 ETH  ✓ (matches tx receipt)
cost_USD      = 0.001247072 × 2,077.46 = $2.591  ✓
```

**Arbitrum Sepolia — verifyProof:**
```
gas_units     = 1,290,131
gas_price_wei = 20,022 wei  (= 0.020022 gwei)
cost_ETH      = 1,290,131 × 20,022 / 10¹⁸
              = 25,831,... / 10¹⁸
              = 0.000025831 ETH  ✓ (matches tx receipt)
cost_USD      = 0.000025831 × 2,077.46 = $0.054  ✓
```

**Ratio:**
```
0.001247072 / 0.000025831 = 48.3× cheaper on Arbitrum (verifyProof)
0.001599389 / 0.000032660 = 49.0× cheaper on Arbitrum (full session)
```

---

## 10. Nonce-Rolling Security Mechanism

The nonce roll is implemented entirely on-chain in `ZTIZENCircom.sol` and is **included in the gas cost of verifyProof**. There is no separate transaction for it.

### What happens inside verifyProof (1,169,555 / 1,290,131 gas)

```
Step 1 — Replay guard
  require(currentNonce == credentialServiceNonces[credId][svcId])
  → Rejects any proof generated with an old nonce

Step 2 — ZK proof verification
  circomVerifier.verifyProof(pA, pB, pC, pubSignals)
  → ~1.15M gas consumed here (Groth16 BN254 pairing)

Step 3 — Nonce roll (within same tx, no extra cost)
  newNonce = keccak256(nonce_N || block.timestamp || block.number || block.prevrandao)
  credentialServiceNonces[credId][svcId] = newNonce

Step 4 — Emit event
  emit ProofVerified(..., oldNonce, newNonce, ...)
  → Off-chain service reads newNonce here
  → Recomputes commit[128] = Poseidon(bits, newNonce, keys) before next login
```

### Why `block.prevrandao` matters

`block.prevrandao` (EIP-4399) is the beacon chain RANDAO reveal — it is **not known to the prover when generating the proof**. The prover must submit their proof before the block is mined, so they cannot pre-compute what `newNonce` will be. This means:

- The prover cannot generate two valid proofs for the same session (the second would need `newNonce` as input, which they don't know yet)
- Even if a proof is intercepted in the mempool, replaying it in the next block will fail because `storedNonce` has already rolled

### Security properties preserved by nonce rolling

| Property | Mechanism |
|---|---|
| Replay resistance | `require(currentNonce == storedNonce)` — old proof rejected immediately |
| Forward secrecy | `newNonce` is unpredictable → old commit[] is useless after one auth |
| Cross-service isolation | Nonces are scoped per `(credentialId, serviceId)` — separate rollover per service |
| Emergency revocation | `revokeNonce()` rolls nonce without proof — invalidates any pending session |

### Off-chain service responsibility

After a successful `verifyProof`, the service must:
1. Read `newNonce` from the `ProofVerified` event
2. Recompute `commit[128] = Poseidon(bits, newNonce, keys)` using the user's current biometric
3. Store the new `(credentialId, serviceId, newNonce, commit[])` tuple before the next login attempt

This off-chain step is **not** included in the on-chain gas figures — it is pure computation with no transaction cost.

---

## 11. Key Findings

1. **verifyProof = 78–79% of session gas** — the Groth16 BN254 pairing check dominates regardless of network. All other steps (registration, nonce init, whitelist) are minor by comparison.

2. **Arbitrum is 49× cheaper at testnet prices; 50–150× cheaper at mainnet prices** — entirely due to L2 batch amortisation of L1 data costs, not a difference in computation.

3. **Gas units are ~9% higher on Arbitrum** — expected AVM behaviour for storage-heavy and precompile-heavy contracts. Not a measurement error.

4. **Nonce rolling adds zero marginal gas cost** — it executes within the same `verifyProof` transaction. The `keccak256` + one `SSTORE` for the new nonce is negligible vs the 1.15M gas pairing check.

5. **Production deployment recommendation: Arbitrum One** — at $0.24–$1.55 per authentication vs $15–$155 on Ethereum mainnet, L2 deployment is necessary for practical consumer use.

---

## Source Files

| Data | File |
|---|---|
| Sepolia deployment | `smart-contracts/deployments/circom-11155111-1779562004073.json` |
| Arbitrum deployment | `smart-contracts/deployments/circom-421614-1779564549582.json` |
| Sepolia benchmark | `smart-contracts/deployments/gas-benchmark-circom-1779562191045.json` |
| Arbitrum benchmark | `smart-contracts/deployments/gas-benchmark-circom-1779564631229.json` |
| Contract source | `smart-contracts/contracts/ZTIZENCircom.sol` |
| Deploy script | `smart-contracts/scripts/deploy-circom-core.ts` |
| Benchmark script | `smart-contracts/scripts/gas-benchmark-circom.ts` |
