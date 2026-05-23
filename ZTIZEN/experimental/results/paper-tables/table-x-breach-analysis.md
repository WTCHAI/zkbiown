# Table X: Full Database Breach Security Analysis

**Why This Table Matters:**
Directly addresses reviewer Comment #3 (3-party resilience) and Comment #10 (active attacks).
Proves that a complete breach of all server-side databases — including every field in both ZTIZEN
and Product DBs, plus all nonces and salts — still cannot enable an attacker to forge authentication.
This is the **worst-case adversarial scenario** and the system survives it by construction.

**What It Shows:**
A systematic mapping of every value stored in each database, what an attacker learns from it,
and whether the combination of leaked values is sufficient to pass authentication. Covers three
escalating breach scenarios: (1) Product DB only, (2) ZTIZEN DB only, (3) both DBs simultaneously.

**How to Interpret:**
- Each row is one breach scenario, with the exact fields exposed
- "Keys held" maps to the Group C compromise matrix (1/3, 2/3, 3/3)
- "Auth possible?" is the direct answer — always NO unless all 3 keys are held
- The user key (Ku) is the structural reason: it never leaves the user's device

---

## What Is Stored — Complete Field Inventory

### ZTIZEN Service Database (`credentials` table)

| Field | Value Stored | Sensitivity | Notes |
|---|---|---|---|
| `ztizen_partial_key` | Kz in plaintext hex (64 chars) | HIGH — is one of 3 keys | Exposed in breach |
| `auth_commit` | 128 Poseidon hashes as JSONB | LOW — keyed, no biometric info | Useless without Kp + Ku |
| `nonce` | Rolling nonce (text) | MEDIUM — enables replay attempt | Invalidated on each auth |
| `pin_hash` | PBKDF2(PIN, salt) — `salt:hash` format | MEDIUM — PIN brute-forceable | PIN alone ≠ Ku |
| `version` | Integer | LOW | Public info |
| `template_type` | Algorithm name | LOW | Public info |
| `product_id`, `service_name` | Identifiers | LOW | Public info |
| Raw face embedding | **NOT STORED** | — | Never sent to server |
| BioHash template | **NOT STORED** | — | Intermediate only, discarded |
| User key (Ku) | **NOT STORED** | — | Never leaves browser |

### Product Service Database (`user_credentials` table)

| Field | Value Stored | Sensitivity | Notes |
|---|---|---|---|
| `product_partial_key` | Kp in plaintext hex (64 chars) | HIGH — is one of 3 keys | Exposed in breach |
| `credential_id` | UUID reference to ZTIZEN | LOW | Linkage identifier |
| `user_id` | Privy ID / wallet address | MEDIUM | Identity linkage |
| `status` | active / revoked | LOW | Public info |
| Raw face embedding | **NOT STORED** | — | Never sent to server |
| ZTIZEN key (Kz) | **NOT STORED** | — | Only in ZTIZEN DB |
| User key (Ku) | **NOT STORED** | — | Never leaves browser |

### User Device (browser memory only — never persisted server-side)

| Data | Where It Lives | Notes |
|---|---|---|
| Wallet private key | User's wallet (Privy / MetaMask) | Never exposed to any server |
| Wallet signature | Ephemeral in browser during auth | Discarded after Ku derivation |
| PIN (plaintext) | Browser input field only | Never sent to server |
| User key Ku | `SHA-256(walletSignature ∥ PIN)` | Derived each session, never stored |
| Raw face embedding | Browser camera → MediaPipe | Discarded after BioHash |
| BioHash template | Browser memory during auth | Discarded after Poseidon |

---

## Breach Scenario Analysis

### Scenario 1: Product Service DB Breached Only

**What attacker gets:** Kp for each user

| Property | Value |
|---|---|
| Keys held | Kp (1/3) |
| Keys missing | Kz, Ku |
| `auth_commit` accessible | No (stored in ZTIZEN DB) |
| Can recompute commitment | No — needs Kz + Ku |
| Can generate ZK proof | No — circuit requires all 3 keys as private inputs |
| Can replay old proof | No — nonce is in ZTIZEN DB (not breached) |
| **Auth possible?** | **NO** |

**Group C experimental confirmation:** 1of3-only-Kp across 4 libraries × 800 attempts → **0/800 passed, max match = 0.00%**

---

### Scenario 2: ZTIZEN Service DB Breached Only

**What attacker gets:** Kz + auth_commit + nonce + pin_hash (for all users)

| Property | Value |
|---|---|
| Keys held | Kz (1/3) |
| Keys missing | Kp, Ku |
| `auth_commit` accessible | **Yes** — 128 Poseidon hashes per user |
| Can replay `auth_commit` | No — nonce has already rolled (on-chain state) |
| Can recompute fresh commitment | No — needs Kp + Ku to recompute Poseidon hashes |
| Can brute-force Ku from pin_hash | Partially — recovers PIN only, not Ku |
| PIN → Ku? | No — Ku = `SHA-256(walletSignature ∥ PIN)`; walletSignature requires wallet private key |
| **Auth possible?** | **NO** |

**Note on pin_hash:** Even if attacker cracks the PBKDF2 hash and recovers the PIN (feasible for short PINs), they still need the wallet signature. The wallet signature is secp256k1 over a structured message — without the wallet private key, it cannot be forged. Ku therefore remains inaccessible.

**Group C experimental confirmation:** 1of3-only-Kz across 4 libraries × 800 attempts → **0/800 passed, max match = 0.00%**

---

### Scenario 3: Both DBs Breached Simultaneously (Worst Case)

**What attacker gets:** Kp + Kz + auth_commit + nonce + pin_hash (for all users)

| Property | Value |
|---|---|
| Keys held | Kp + Kz (2/3) |
| Keys missing | Ku |
| `auth_commit` accessible | **Yes** |
| Can replay stored `auth_commit` | No — nonce rolling; on-chain state rejects old nonce |
| Can recompute fresh commitment | No — Poseidon requires Ku; without it, all 128 outputs are wrong |
| Can brute-force Ku | No — Ku = `SHA-256(walletSignature ∥ PIN)`; wallet signature space = 2^520 |
| Can generate valid ZK proof | No — circuit takes Ku as private witness; cannot satisfy constraints without it |
| **Auth possible?** | **NO** |

**Group C experimental confirmation:** 2of3-missing-Ku across 4 libraries × 800 attempts → **0/800 passed, max match = 0.00%**

---

### Scenario 4: Both DBs + Malicious ZTIZEN (Service-as-Attacker)

This models the case where ZTIZEN itself is the attacker — they control their own DB, see all
traffic, and additionally steal Kp from the Product DB.

| Property | Value |
|---|---|
| Keys held | Kp + Kz (2/3) — full server-side knowledge |
| Keys missing | Ku — never sent to server |
| Nonce control | Yes — ZTIZEN controls nonce update |
| Can forge enrollment commitment | No — enrollment requires user to submit fresh Poseidon array computed with Ku |
| Can substitute their own auth_commit | No — enrollment commitment is verified on-chain; they cannot substitute without Ku |
| Can intercept Ku during auth | No — Ku is derived in-browser and used to compute proofs locally; it is a ZK circuit *private* input; it never leaves the user's browser |
| **Auth possible?** | **NO** |

**Why on-chain verification matters here:** The stored commitment on the blockchain was set during
enrollment by the user (computed with all 3 keys including Ku). Even if ZTIZEN serves a modified
nonce, the user's browser generates a ZK proof against their locally-derived Ku. The on-chain
verifier checks the proof against the stored on-chain commitment — ZTIZEN cannot alter either
the proof or the stored commitment without Ku.

---

### Scenario 5: All Three Parties Collude (ZTIZEN + Product + User Device Compromised)

| Property | Value |
|---|---|
| Keys held | Kp + Kz + Ku (3/3) |
| **Auth possible?** | **YES — by design** |

This is the intended break condition: authentication is possible only when all 3 parties
simultaneously yield their keys. This requires compromising the user's wallet private key
(or ECDSA forgery — computationally infeasible) in addition to both service databases.

**Group C experimental confirmation:** 3of3-full-knowledge across 4 libraries → **200/200 passed, 100% match** (sanity check)

---

## Consolidated Breach Matrix

| Breach scope | Keys held | Biometric data exposed | Auth possible? | Replay possible? |
|---|---|---|---|---|
| Product DB only | Kp (1/3) | No raw data | **NO** | No |
| ZTIZEN DB only | Kz (1/3) | No raw data | **NO** | No (nonce rolled) |
| Both DBs | Kp + Kz (2/3) | No raw data | **NO** | No (nonce + no Ku) |
| ZTIZEN acts as attacker | Kp + Kz (2/3) | No raw data | **NO** | No |
| Both DBs + wallet compromise | Kp + Kz + Ku (3/3) | No raw data | **YES** | N/A |

---

## Why the `auth_commit` (128 Poseidon hashes) Reveals Nothing

The 128 values stored in `auth_commit` are field elements in BN254 (~2^254 possible values each).

**Biometric privacy:** They carry zero recoverable biometric information. The computation chain is:
```
face image
  → MediaPipe embedding (128D or 512D float vector)    [browser only, discarded]
  → BioHash binary template (128 bits, keyed)          [browser only, discarded]
  → Poseidon hash per bit (128 field elements)         [stored in DB]
```
Only the last layer is stored. Inverting Poseidon to recover the BioHash template requires
solving a system of equations over BN254 — computationally equivalent to breaking the
hash function. Inverting BioHash to recover the embedding requires knowledge of the projection
matrix (which is seeded by Kp + Kz + Ku — all three keys).

**Unlinkability across services:** Two enrollments of the same person under different keys
produce completely uncorrelated `auth_commit` arrays — experimentally confirmed by Scenario C
(0.00% match across 5,436 × 4 library tests). An attacker with both DBs cannot link a user's
enrollment at Service A to their enrollment at Service B.

**No replay value:** Each `auth_commit` is bound to a specific nonce. On-chain state tracks the
current valid nonce per credential. A stolen old `auth_commit` with a consumed nonce is rejected
by the smart contract before verification even begins.

---

## Argument for Paper (Comment #3 and #10)

> "We consider the strongest realistic adversarial scenario: simultaneous breach of both service
> databases, exposing Kp, Kz, all 128-element Poseidon commitment arrays, all rolling nonces,
> and all PIN hashes. Even with this complete server-side knowledge, authentication remains
> impossible. The user key Ku = SHA-256(walletSignature ∥ PIN) is never transmitted to any
> server; the wallet signature requires the user's secp256k1 private key (2^256 security), and
> without Ku the attacker cannot recompute valid Poseidon commitments or satisfy the ZK circuit
> constraints. Empirical confirmation is provided by Group C simulations: across 19,200
> partial-key attack attempts (4 embedding libraries × 6 compromise scenarios × 800 guesses
> each strategy), zero attempts passed the 79.7% authentication threshold (max observed match
> rate: 0.00%). Replay attacks are additionally defeated by rolling nonces enforced on-chain:
> a stolen `auth_commit` paired with a consumed nonce is rejected by the smart contract
> before proof verification begins."

---

## Argument for Paper (Comment #10 — Active Attacks / Replay)

> "To demonstrate replay resistance, we note that each authentication session rolls the nonce
> stored on-chain. A proof generated with nonce N is valid exactly once: after successful
> verification, the contract advances the nonce to N' = H(N), and any subsequent submission
> of the original proof (with nonce N) is rejected. An attacker who intercepts a valid proof
> in transit cannot reuse it — the network has already advanced past that nonce by the time
> a replay could be attempted. Combined with the 3-party key split, this eliminates both
> credential-theft attacks (require Ku) and proof-replay attacks (require current nonce)."

---

## Data Sources

| Claim | Source |
|---|---|
| Group C breach simulation results | `results/key-compromise/FINDINGS.md` |
| Scenario C/D unlinkability (0.00%) | `results/four-scenario-validation/*_results.json` |
| DB schema — what is/isn't stored | `service-ztizen/sql/schema.sql`, `service-product/sql/schema_v2.sql` |
| User key derivation (HKDF-like) | `web/src/hooks/useWalletSignature.ts` |
| Poseidon commitment structure | `web/src/lib/poseidon.ts`, `experimental/utils/poseidon.ts` |
| 19,200 attack attempts, 0 passed | `results/key-compromise/1of3-attempts.json`, `2of3-attempts.json` |

---

**Generated:** 2026-05-02  
**Status:** Ready for paper integration (Sections: System Design § Key Distribution, Results § Breach Analysis, Discussion § Active Attacks)
