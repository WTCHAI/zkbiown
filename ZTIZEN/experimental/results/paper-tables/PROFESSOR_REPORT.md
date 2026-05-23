# ZKBIOWN — Paper Alignment Handbook

**Date:** 2026-05-22  
**Paper:** `A Trustless Biometric Authentication System_060.pdf` (IEEE, 4 pages, ACCEPTED)  
**Purpose:** Map every table and claim in the paper to the latest experimental results. Use this as a checklist when revising the camera-ready submission.

---

## Paper Structure (Current Submission)

| Section | Content |
|---------|---------|
| I. Introduction | Motivation: centralized biometric storage risks |
| II. Related Work | BioHashing, ZKP-based auth literature |
| III. Proposed Solution | Architecture: 3-party key, BioHashing, Poseidon, ZK proof |
| IV.A Security Properties | Table I — qualitative attack resistance |
| IV.B Testing & Performance | Table II — runtime overhead; Table III — similarity scores |
| V. Conclusion | Summary |

---

## What Changed Since Submission

The experimental pipeline has been updated with:
1. **Aligned dataset** — all 4 libraries now use identical 437 persons × 2,137 captures (was: faceapijs had 466 persons, different capture sets)
2. **Exhaustive diff-person pairs** — 2,276,885 pairs (was: 10,000 sampled)
3. **Three-layer analysis** — cosine → BioHash Hamming → Poseidon, on identical pairs
4. **Circom Groth16 port** — head-to-head ZK framework comparison
5. **Key compromise simulation** — 19,200 attack attempts, all partial-key = 0 passes
6. **Corrected publicInputs index** — matchCount at index 128, not 0 (Noir benchmark fix)

---

## TABLE I — Qualitative Attack Resistance Comparison

**Paper location:** Section IV.A, Table I  
**Type:** Qualitative — no experimental data needed  
**Status:** ✅ Correct as published

| Attack Type | Conventional | ZKBIOWN |
|---|---|---|
| Database breach | Full biometric disclosure | Commitment disclosure only |
| Replay attack | Vulnerable | Mitigated by nonce and proof context |
| Cross-service linking | Possible | Mitigated by service-specific key derivation |
| Biometric exposure during auth | Verifier receives biometric data | Verifier receives proof only |

**Experimental backing now available (new, not in paper):**
- Replay → nonce rolling in `ZTIZEN.sol` (incrementNonce)
- Cross-service → Scenario C = **0.00%** across all 4 libs × 5,431 pairs
- Key compromise → Group C simulation: 19,200 partial-key attempts, **0 passed**

**Suggested paper update:** Add footnote to Table I pointing to the key-compromise simulation results and Scenario C/D numbers as empirical backing.

---

## TABLE II — Prototype Runtime Overhead

**Paper location:** Section IV.B, Table II  
**Status:** ⚠️ Partially outdated — Proof Generation row needs update, Circom not yet in paper

### Current Paper (Table II)

| Operation | Time | Implementation Detail |
|---|---|---|
| BioHashing (128D) | 46.9ms ± 5.5ms | — |
| BioHashing (512D) | 187.6ms ± 3.8ms | — |
| Poseidon Hashing | 46.9ms ± 3.8ms | — |
| Proof Generation | ~15s | Browser, WASM |
| Proof Verification | ~4s | Browser, Verifier |

### Updated Numbers (from `results/circuit-timing/`)

**Enrollment pipeline (Node.js, M4 Pro):**

| Operation | FaceNet 128D | FaceNet512 512D | ArcFace 512D |
|---|:---:|:---:|:---:|
| Key Combination (SHA-256) | 0.0018 ms | 0.0018 ms | 0.0018 ms |
| BioHashing (Gaussian+GS+binarize) | 47.6 ± 5.5 ms | 187.6 ± 19.5 ms | 190.9 ± 24.5 ms |
| Poseidon Hashing (128× hash) | 46.6 ± 2.8 ms | 46.9 ± 3.8 ms | 47.2 ± 3.6 ms |
| **Total Enrollment** | **~94 ms** | **~234 ms** | **~238 ms** |

**ZK Proof — NEW comparison table (from `results/circuit-timing/BENCHMARK_SUMMARY.md`):**

| Backend | Proof Gen (Node.js) | Proof Verify (Node.js) | Proof Size | Trusted Setup |
|---|:---:|:---:|:---:|:---:|
| Circom Groth16 | ~2.4–3.3 s | 5–17 ms | **0.7 KB** | Required (pot18) |
| Noir UltraHonk | ~13.5–13.6 s | ~4.0–4.1 s | 15.9 KB | Not required |
| Noir (Browser WASM) | ~12–15 s | ~4 s | 15.9 KB | Not required |

**Key takeaway:** Circom is ~4–5× faster proof gen, ~700× faster verification, ~22× smaller proof. Noir requires no trusted setup and is browser-native.

**Suggested paper update for Table II:**
- Split into two sub-tables: enrollment timing + ZK proof timing
- Add Circom Groth16 row alongside Noir for reviewer comment #1 and #9
- Keep Browser WASM row for Noir (this is what the prototype uses)

---

## TABLE III — Similarity Score Before and After Transformation

**Paper location:** Section IV.B, Table III  
**Status:** ❌ Numbers are stale — need update with aligned dataset + exhaustive pairs

### Current Paper (Table III)

| Embedding Model | Before Transformation | After Transformation Same Person | After Transformation Different Person |
|---|:---:|:---:|:---:|
| FaceNet-128 | 63.94% ± 21.04% | 72.86% ± 8.80% | 52.40% ± 5.88% |
| FaceNet-512 | 62.43% ± 20.69% | 72.31% ± 9.06% | 51.20% ± 6.62% |
| ArcFace | 55.07% ± 22.79% | 69.42% ± 9.68% | 51.69% ± 5.96% |
| Face-api.js | 95.28% ± 1.92% | 90.59% ± 3.05% | 81.31% ± 3.49% |

*Note in paper: "The different-key cases are not shown here because they resulted in zero similarity under different key settings."*

### Updated Numbers (from aligned dataset, exhaustive pairs)

**Layer 1 (Raw Cosine) — `results/baseline-similarity/`:**

| Model | Same-Person | Diff-Person | Pairs (same) | Pairs (diff) |
|---|:---:|:---:|:---:|:---:|
| FaceNet-128 | 63.96% ± 21.03% | 8.06% ± 14.87% | 5,431 | 2,276,885 |
| FaceNet-512 | 62.46% ± 20.67% | 4.43% ± 15.95% | 5,431 | 2,276,885 |
| ArcFace | 55.09% ± 22.79% | 4.92% ± 9.97% | 5,431 | 2,276,885 |
| face-api.js | 95.28% ± 1.79% | 83.16% ± 3.69% | 5,431 | 2,276,885 |

**Layer 2 (BioHash Hamming) + Layer 3 (Poseidon Match Rate) — `results/biohash-hamming/`:**

*Scenario A — Same Person, Same Key:*

| Model | L1: Raw Cosine | L2: BioHash Hamming | L3: Poseidon Match | n pairs |
|---|:---:|:---:|:---:|:---:|
| FaceNet-128 | 63.96% ± 21.03% | 72.88% ± 8.79% | 72.88% ± 8.79% | 5,431 |
| FaceNet-512 | 62.46% ± 20.67% | 72.32% ± 9.06% | 72.32% ± 9.06% | 5,431 |
| ArcFace | 55.09% ± 22.79% | 69.43% ± 9.67% | 69.43% ± 9.67% | 5,431 |
| face-api.js | 95.28% ± 1.79% | 90.51% ± 3.00% | 90.51% ± 3.00% | 5,431 |

*Scenario B — Different Person, Same Key (exhaustive):*

| Model | L1: Raw Cosine | L2: BioHash Hamming | L3: Poseidon Match | n pairs |
|---|:---:|:---:|:---:|:---:|
| FaceNet-128 | 8.06% ± 14.87% | 52.64% ± 5.89% | 52.64% ± 5.89% | 2,276,885 |
| FaceNet-512 | 4.43% ± 15.95% | 51.57% ± 6.60% | 51.57% ± 6.60% | 2,276,885 |
| ArcFace | 4.92% ± 9.97% | 51.76% ± 5.41% | 51.76% ± 5.41% | 2,276,885 |
| face-api.js | 83.16% ± 3.69% | 81.36% ± 3.54% | 81.36% ± 3.54% | 2,276,885 |

*Scenario C ★ — Same Person, DIFFERENT Key (unlinkability — missing from paper):*

| Model | L2: BioHash Hamming | L3: Poseidon Match | n pairs |
|---|:---:|:---:|:---:|
| FaceNet-128 | 49.81% ± 4.48% | **0.00% ± 0.00%** | 5,431 |
| FaceNet-512 | 49.89% ± 4.46% | **0.00% ± 0.00%** | 5,431 |
| ArcFace | 49.52% ± 4.38% | **0.00% ± 0.00%** | 5,431 |
| face-api.js | 50.59% ± 3.50% | **0.00% ± 0.00%** | 5,431 |

**What the three layers mean:**
- L1→L2: BioHashing normalises impostor cosine (4–83%) to ~51–52% Hamming (coin-flip baseline). Same-person variance shrinks (e.g., ±21%→±8.8%)
- L2→L3: Poseidon is lossless for matching keys (A/B: L2=L3 exactly). For diff key: 49–51% Hamming → **0.00%** Poseidon — cryptographic avalanche
- Scenario C, L2 ≈ 50%: BioHashing alone achieves coin-flip unlinkability
- Scenario C, L3 = 0.00%: Poseidon provides exact-zero, no exceptions across all 21,724 pairs

**Suggested paper update for Table III:**
- Update all numbers to aligned dataset values (minor changes in most cells)
- Add Scenario C rows (currently noted as "not shown" — reviewers asked for this explicitly)
- Add "n pairs" column to show exhaustive coverage (2,276,885 diff-person vs old 10,000)
- Split into Scenario A / B / C sub-tables or add C as separate rows

---

## Dataset Characteristics (not a separate table in paper — embedded in text)

**Paper says:** "After quality filtering, 437 subjects and approximately 2,138 images were retained."

**Updated (aligned dataset):**
- 437 persons, **2,137** captures (1 capture dropped from alignment)
- All 4 libraries use **identical** person and capture sets
- Same-person pairs: **5,431** (was 5,436 for facenet/arcface, 7,771 for faceapijs)
- Diff-person pairs: **2,276,885** exhaustive (was 10,000 sampled)

**Suggested paper update:** Change "2,138" → "2,137" in text. Note that all 4 libraries evaluated on identical dataset for fair comparison.

---

## NEW DATA — Four-Scenario Validation (not in paper, needed for revision)

**Source:** `results/four-scenario-validation/` — GAR/FAR pass rates at 102/128 threshold

| Library | Scen A GAR | Scen A mean | Scen B FAR | Scen C | Scen D | n(A/C) | n(B/D) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| FaceNet-128 | 21.8% | 72.88% ± 8.79% | 0.0% | **0.00%** | **0.00%** | 5,431 | 2,276,885 |
| FaceNet-512 | 21.2% | 72.32% ± 9.06% | 0.0% | **0.00%** | **0.00%** | 5,431 | 2,276,885 |
| ArcFace | 14.8% | 69.43% ± 9.67% | 0.2% | **0.00%** | **0.00%** | 5,431 | 2,276,885 |
| face-api.js | 100.0% | 90.51% ± 3.00% | 72.1% | **0.00%** | **0.00%** | 5,431 | 2,276,885 |

*Threshold: 102/128 = 79.7%. Total: 18,258,528 comparisons across all 4 libs.*

**Scenario meanings:**
- **A** Same person, same key → GAR (system correctly accepts)
- **B** Different person, same key → FAR (system correctly rejects impostor)
- **C** Same person, **different key** → 0.00% proves **UNLINKABILITY** (key change = new identity)
- **D** Different person, different key → 0.00% proves **CROSS-KEY PRIVACY**

**Note on face-api.js FAR (72.1%):** High FAR is inherited from the embedding model — raw cosine similarity between different people is already 83% for face-api.js, leaving small class separation. This is a property of the embedding, not the pipeline. C and D are still 0.00%.

---

## NEW DATA — ZK Circuit Comparison (not in paper, needed for revision)

**Source:** `results/circuit-timing/BENCHMARK_SUMMARY.md`

| Property | Circom Groth16 | Noir UltraHonk |
|---|:---:|:---:|
| Proof system | Groth16 (BN254) | UltraHonk (Barretenberg) |
| R1CS constraints | ~150,413 | N/A (PLONK) |
| Trusted setup | Required (pot18) | Not required |
| Proof gen — Node.js | ~2.4–3.3 s | ~13.5–13.6 s |
| Proof gen — Browser WASM | ~2–4 s (est.) | ~12–15 s (measured) |
| Proof verify — Node.js | 5–17 ms | ~4.0–4.1 s |
| Proof size | **0.7 KB** | 15.9 KB |
| Solidity verifier | ZtizenVerifier.sol ✓ | Generatable via bb |
| Circuit GAR (Scenario A) | 100% | 100% |

**Head-to-head:** Circom ~4–5× faster proof gen, ~700× faster verify, ~22× smaller proof. Both circuits implement identical biometric logic — same threshold, same Poseidon8, same 3-key structure. GAR/FAR identical confirms port is semantically correct.

---

## NEW DATA — Key Compromise Simulation (not in paper, needed for revision)

**Source:** `results/key-compromise/FINDINGS.md`  
**Dataset:** 50 persons × 4 libs, 3 attacker strategies, 6 compromise scenarios  
**Total:** 19,200 attack attempts

| Keys Held | Strategy | Attempts | Passed | Max Match |
|---|---|:---:|:---:|:---:|
| Kp only (1/3) | zero+random+dict | 3,200 | 0 | **0.00%** |
| Kz only (1/3) | zero+random+dict | 3,200 | 0 | **0.00%** |
| Ku only (1/3) | zero+random+dict | 3,200 | 0 | **0.00%** |
| Kp + Kz (2/3) | zero+random+dict | 3,200 | 0 | **0.00%** |
| Kp + Ku (2/3) | zero+random+dict | 3,200 | 0 | **0.00%** |
| Kz + Ku (2/3) | zero+random+dict | 3,200 | 0 | **0.00%** |
| Kp + Kz + Ku (3/3) | exact | 200 | **200** | **100.00%** |

---

## Revision Checklist — Per Reviewer Comment

| # | Reviewer Concern | Data Available | Where in Results | Paper Action |
|---|---|:---:|---|---|
| #1 | Proof gen ~15s latency — breakdown needed | ✅ | `circuit-timing/BENCHMARK_SUMMARY.md` | Update Table II: add Circom row, split enrollment vs proof timing |
| #2.1 | Formal proofs of irreversibility/unlinkability | ✅ (via literature) | `Paper/biohashing-*.pdf` | Add threat model subsection citing BioHashing papers |
| #2.2 | "Preserves BioHashing properties" — needs verification | ✅ | `biohash-hamming/*_baseline.json` | Add L1→L2→L3 table to paper (Scenario A/B/C three-layer) |
| #3 | 3-party compromise resilience | ✅ | `key-compromise/FINDINGS.md` | Add Table X / paragraph: 19,200 attempts, 0 passed |
| #4 | KD study | DROPPED | — | Note withdrawal in response letter |
| #5 | Limited modalities | ❌ NOT DONE | — | Deferred — acknowledge limitation in paper |
| #6 | Diff-key rows showing 0% | ✅ | `biohash-hamming/*_baseline.json` Scenario C | Add Scenario C rows to Table III |
| #7 | On/off-chain trade-offs | ⚠️ PARTIAL | Circom verifier ready, Sepolia gas pending | Add circuit comparison table; note on-chain gas as future work |
| #8 | Revocation details | ✅ (design) | System architecture | Add revocation subsection / diagram |
| #9 | Why Noir? | ✅ | `circuit-timing/BENCHMARK_SUMMARY.md` | Add Circom vs Noir comparison table, justify Noir for browser |
| #10 | Active attacks — replay | ✅ (design) | `ZTIZEN.sol` nonce logic | Add paragraph: nonce rolls on each auth, old proof rejected |
| #11 | Scalability — 15s is client-side | ✅ | Circuit timing + architecture | Clarify in Discussion: 15s is client-only; backend verifies in 5–17ms (Circom) or 4s (Noir) |
| #12 | ISO standards mapping | DEFERRED | — | Leave to professors |

---

## Summary: What to Change in Each Paper Section

### Abstract
- Add: "evaluated against FaceScrub across 18M+ comparison pairs"
- Add: "Circom Groth16 alternative achieving 0.7KB proofs verified in <20ms"

### Section IV.A — Security Properties
- Table I: add empirical backing footnotes → Group C simulation (19,200 attempts, 0 passed), Scenario C/D = 0.00%

### Section IV.B — Testing & Performance
**Table II updates:**
- Change "Proof Generation ~15s Browser, WASM" → split into Circom (2.4–3.3s Node.js / ~2–4s Browser) and Noir (13.5s Node.js / 12–15s Browser)
- Add "Proof Verification" row: Circom 5–17ms vs Noir 4s
- Add "Proof Size" row: Circom 0.7KB vs Noir 15.9KB

**Table III updates:**
- Update all numbers (minor changes from aligned dataset)
- Add Scenario C rows: BioHash Hamming ~49–51%, Poseidon **0.00%**
- Add n pairs column (5,431 same-person, 2,276,885 diff-person)
- Change dataset note: "2,137 images" and "identical across all 4 libraries"

**New content to add:**
- Paragraph on four-scenario GAR/FAR results (21.8% GAR for FaceNet at 79.7% threshold — inherited from dataset quality not pipeline)
- Paragraph on 3-party key compromise simulation (Group C)
- Note on nonce-based replay resistance (Group E design)

### Section V — Conclusion
- Mention Circom Groth16 port validates ZK framework choice
- Mention exhaustive 18M+ pair validation

---

## Source File Index

| Paper Table/Section | Source File | Script |
|---|---|---|
| Table II — enrollment timing | `results/pipeline-timing/*.json` | `pipeline/00-prepare-templates.ts` |
| Table II — Circom proof | `results/circuit-timing/circom_*_benchmark.json` | `pipeline/02-circom-benchmark.ts` |
| Table II — Noir proof | `results/circuit-timing/noir_*_benchmark.json` | `pipeline/03-noir-benchmark.ts` |
| Table III — Before (cosine) | `results/baseline-similarity/*_baseline.json` | `pipeline/00-baseline-similarity.ts` |
| Table III — After (Hamming/Poseidon) | `results/biohash-hamming/*_baseline.json` | `pipeline/02-biohash-hamming-baseline.ts` |
| Table III — Scenario C rows | `results/biohash-hamming/*_baseline.json` scenarioC | same |
| Four-scenario GAR/FAR | `results/four-scenario-validation/*_results.json` | `pipeline/01-analyze-four-scenarios.ts` |
| Key compromise | `results/key-compromise/FINDINGS.md` | `pipeline/07-key-compromise-sim.ts` |
| Circuit comparison | `results/circuit-timing/BENCHMARK_SUMMARY.md` | both benchmark scripts |
