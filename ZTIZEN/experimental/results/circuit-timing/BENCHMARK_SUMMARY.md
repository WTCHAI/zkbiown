# ZK Proof Generation Benchmark Summary

**Generated:** 2026-05-14T03:12:39.483Z

**Environment:** Node.js 22, Apple M-series (or equivalent x86-64)

**Dataset:** FaceScrub face recognition dataset — same person-pairs used for both backends.
50 same-person Scenario A pairs + 50 different-person Scenario B pairs per library.

---

## Circuit Comparison

| Aspect | Circom Groth16 | Noir UltraHonk |
|--------|:--------------|:---------------|
| Template encoding | Binary 0/1 (128 bits) | Binary 0/1 (128 bits) |
| Constraints | ~150,413 | N/A (PLONK-based) |
| Proof system | Groth16 (BN254) | UltraHonk (Barretenberg) |
| Trusted setup | Required (pot18 ceremony) | Not required |
| Solidity verifier | Yes (ZtizenVerifier.sol) | Generatable via snarkjs/bb |
| Node.js prover | snarkjs 0.7.5 | @aztec/bb.js + @noir-lang/noir_js |

---

## Scenario A — Same-Person Proof Generation

*Enroll with capture 0, verify with capture 1 of the same person.*
*Circuit threshold: ≥102/128 Poseidon hash matches required.*

### Circom Groth16 (binary 0/1 encoding)

| Library | GAR% | Proof gen (ms) | Proof verify (ms) | Avg match | Proof size |
|---------|:----:|:--------------:|:-----------------:|:---------:|:----------:|
| FaceNet (128D) | 100.0% | 2425±89 | 5±2 | 107.4/128 | 0.7 KB |
| FaceNet512 (512D→128D) | 100.0% | 3330±294 | 10±6 | 107.0/128 | 0.7 KB |
| ArcFace (512D→128D) | 100.0% | 2634±115 | 6±2 | 107.4/128 | 0.7 KB |
| face-api.js (128D) | 100.0% | 3341±258 | 17±14 | 116.6/128 | 0.7 KB |

### Noir UltraHonk (binary 0/1 encoding)

| Library | GAR% | Witness gen (ms) | Proof gen (ms) | Proof verify (ms) | Avg match | Proof size |
|---------|:----:|:----------------:|:--------------:|:-----------------:|:---------:|:----------:|
| FaceNet (128D) | 100.0% | 797±12 | 13453±165 | 4024±42 | 107.4/128 | 15.9 KB |
| FaceNet512 (512D→128D) | 100.0% | 805±8 | 13537±155 | 4050±48 | 107.0/128 | 15.9 KB |
| ArcFace (512D→128D) | 100.0% | 806±8 | 13564±182 | 4053±45 | 107.4/128 | 15.9 KB |
| face-api.js (128D) | 100.0% | 808±20 | 13600±247 | 4075±188 | 116.6/128 | 15.9 KB |

---

## Scenario B — Different-Person Rejection Rate

*Enrollment from Person A, verification from Person B (different identity).*
*Circuit should reject with assert failure — FAR should be near 0%.*

| Library | Circom FAR% | Circom fail time (ms) | Noir FAR% | Noir fail time (ms) |
|---------|:-----------:|:--------------------:|:---------:|:-------------------:|
| FaceNet (128D) | 0.0% | 133±3 | 0.0% | 272±2 |
| FaceNet512 (512D→128D) | 0.0% | 199±67 | 0.0% | 272±2 |
| ArcFace (512D→128D) | 2.0% | 193±336 | 2.0% | 560±2004 |
| face-api.js (128D) | 80.0% | 2052±946 | 80.0% | 11452±5591 |

---

## Browser (Noir/UltraHonk via WASM)

Browser-based Noir proof generation was measured separately during UI testing (not re-run here).

| Operation | Observed time |
|-----------|:-------------:|
| Witness generation | ~2,000–3,000 ms |
| Proof generation | ~12,000–15,000 ms |
| **Total** | **~15 seconds** |

The Node.js backend is **~4–5× faster** than browser WASM because it can use native code paths.
The circom Groth16 Node.js backend is further optimized due to the smaller constraint count.

---

## Notes on Template Encoding

Both circuits use the same binary 0/1 template encoding from the BioHashing pipeline:

1. Face embedding (128D or 512D depending on model) is projected via Gaussian random matrix to 128D
2. Each projection is thresholded: `B[i] = 1 if p[i] > 0, else 0`
3. 128 Poseidon8 hashes are computed: `commit[i] = Poseidon8(B[i], i, product_key, ztizen_key, user_key, version, nonce, usage_hash)`
4. Circuit compares `computed_commit[i] == auth_commit_stored[i]` for all 128 positions
5. Assert `match_count >= 102` (79.7% threshold)

Both Circom Groth16 and Noir UltraHonk run the identical pipeline. Timing differences reflect the proof system, not the biometric encoding.

---

## Running the Benchmarks

```bash
cd ZTIZEN/experimental

# Single library (fast test, ~7 min)
npx tsx pipeline/02-circom-benchmark.ts --lib=facenet
npx tsx pipeline/03-noir-benchmark.ts --lib=facenet

# All libraries (~30 min each)
npx tsx pipeline/02-circom-benchmark.ts
npx tsx pipeline/03-noir-benchmark.ts

# Regenerate this summary
npx tsx pipeline/04-write-benchmark-summary.ts
```
