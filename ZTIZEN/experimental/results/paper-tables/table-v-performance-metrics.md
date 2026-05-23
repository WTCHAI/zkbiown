### Table V: Performance Metrics (Apple M4 Pro)

**Why This Table Matters:**
Demonstrates practical real-time performance suitable for production deployment, with enrollment time under 250ms and verification under 50ms (excluding ZK proof).

**What It Shows:**
Computational cost breakdown for each pipeline stage: key derivation → BioHashing → Poseidon hashing → ZK proof generation/verification.

**How to Interpret:**
- **Key Combination**: SHA256-based key derivation (negligible ~1.8μs)
- **BioHashing**: Matrix generation + projection + binarization (scales with input dimension)
- **Poseidon**: Field conversion + hash computation (constant ~47ms regardless of dimension)
- **Total Enrollment**: One-time cost per user registration (BioHashing + Poseidon)
- **ZK Proof (Circom)**: Groth16 proof generation/verification — Node.js native AND Browser WASM via snarkjs 0.7.5
- **ZK Proof (Noir)**: UltraHonk witness generation + proof generation/verification — Node.js native via @aztec/bb.js

**Key Evidence:**
- ✅ 128D models: ~94ms enrollment (real-time capable)
- ✅ 512D models: ~234ms enrollment (still acceptable for registration)
- ✅ Poseidon hashing: constant time ~47ms (dimension-independent)
- ✅ BioHashing dominates enrollment cost (scales with input dimension)
- ✅ Circom Groth16 — Node.js: 2,634–3,341ms proof gen (steady-state), 6–17ms verify
- ✅ Circom Groth16 — Browser WASM (isolated, 50 pairs): **2,744ms ± 98ms** gen, **6ms ± 1ms** verify
- ✅ Noir UltraHonk — Node.js: 14,346–14,448ms gen, 4,267–4,310ms verify, 860–888ms witness
- ✅ Noir UltraHonk — Browser WASM (isolated, 50 pairs): **13,996ms ± 131ms** gen, **4,224ms ± 28ms** verify, **963ms ± 52ms** witness
- ✅ Both systems: GAR 50/50 = 100%, avg match 107/128 (83.6%) — biometric accuracy is proof-system-independent

**Note on FaceNet circom mean (6249ms, Node.js):** Inflated by JIT warmup on run 1. Steady-state is ~3,330ms, consistent with FaceNet512.

**Isolated browser benchmarks (FaceNet, Scenario A, 50 pairs each, separate tabs, 2026-05-08):**

| Metric | Circom Groth16 | Noir UltraHonk | Speedup |
|--------|:--------------:|:--------------:|:-------:|
| GAR | 50/50 = 100% | 50/50 = 100% | — |
| Witness gen | — (included) | 963ms ± 52ms (min 884 / max 1,074) | — |
| Proof gen — mean ± std | **2,744ms ± 98ms** | **13,996ms ± 131ms** | **5.1×** |
| Proof gen — min / max | 2,642ms / 3,000ms | 13,889ms / 14,875ms | — |
| Proof verify — mean ± std | **6ms ± 1ms** | **4,224ms ± 28ms** | **704×** |
| Total (witness+gen) | **2,744ms** | **14,959ms** | **5.5×** |
| Avg match count | 107/128 (83.6%) | 107/128 (83.6%) | — |
| Proof size | 721 bytes (0.7 KB) | 16,256 bytes (15.9 KB) | **22.5×** |

**System Specifications:**
- **Hardware**: Apple M4 Pro
- **CPU**: 16 cores (16 performance + efficiency)
- **RAM**: 48 GB
- **Runtime**: Node.js 22
- **Sample Size**: 50 same-person pairs × 3 proof runs per pair per library

| Library | Key Combination | BioHashing Total | Poseidon Hashing | Total Enrollment | Circom Gen / Verify (Node.js) | Circom Gen / Verify (Browser) | Noir Witness / Gen / Verify (Node.js) | Noir Witness / Gen / Verify (Browser) |
|---------|-----------------|------------------|------------------|------------------|-------------------------------|-------------------------------|---------------------------------------|---------------------------------------|
| FaceNet (128D)    | 0.0018ms | 47.6ms ± 5.5ms   | 46.6ms ± 2.8ms | ~94ms  | 3,330ms / 6ms  | **2,744±98ms / 6±1ms** | 888ms / 14,448ms / 4,310ms | **963±52ms / 13,996±131ms / 4,224±28ms** |
| FaceNet512 (512D) | 0.0018ms | 187.6ms ± 19.5ms | 46.9ms ± 3.8ms | ~234ms | 3,330ms / 10ms | — (same circuit)        | 872ms / 14,346ms / 4,278ms | — (same circuit) |
| ArcFace (512D)    | 0.0018ms | 190.9ms ± 24.5ms | 47.2ms ± 3.6ms | ~238ms | 2,634ms / 6ms  | — (same circuit)        | 861ms / 14,350ms / 4,267ms | — (same circuit) |
| face-api.js (128D)| —        | —                | —              | —      | 3,341ms / 17ms | — (same circuit)        | 859ms / 14,366ms / 4,286ms | — (same circuit) |

**Note:** Circom Node.js steady-state excludes run-1 JIT warmup (raw FaceNet mean 6,249ms). Browser numbers from parallel benchmark (20 pairs, same FaceScrub pairs, both systems). All 4 libraries share identical 128-constraint circuit — browser rows apply equally to all.

**Detailed Breakdown (FaceNet 128D — Enrollment):**
- Matrix Generation: 28.6ms ± 3.3ms (Gaussian + Gram-Schmidt orthogonalization)
- Projection: 16.7ms ± 1.9ms (matrix-vector multiplication)
- Binarization: 2.4ms ± 0.3ms (threshold to binary)
- Field Conversion: 0.032ms ± 0.008ms (binary to BN254 field elements)
- Hash Computation: 46.6ms ± 2.8ms (Poseidon8 × 128 hashes)

**LaTeX:**
```latex
\begin{table}[htbp]
\centering
\caption{Performance Metrics per Pipeline Stage (Apple M4 Pro; Node.js 22 and Chrome WASM)}
\label{tab:performance_metrics}
\begin{tabular}{lccccc}
\hline
\multirow{2}{*}{\textbf{Library}} & \multirow{2}{*}{\textbf{BioHash}} & \multirow{2}{*}{\textbf{Poseidon}} & \multirow{2}{*}{\textbf{Enroll}} & \multicolumn{2}{c}{\textbf{ZK Proof Gen / Verify}} \\
\cline{5-6}
& & & & \textbf{Circom Groth16} & \textbf{Noir UltraHonk} \\
\hline
\multicolumn{6}{l}{\textit{Node.js 22 (Apple M4 Pro)}} \\
FaceNet (128D)     & $47.6 \pm 5.5$ms   & $46.6 \pm 2.8$ms & $\sim$94ms  & 3,330ms / 6ms$^a$   & 888ms$^b$ + 14,448ms / 4,310ms \\
FaceNet512 (512D)  & $187.6 \pm 19.5$ms & $46.9 \pm 3.8$ms & $\sim$234ms & 3,330ms / 10ms      & 872ms + 14,346ms / 4,278ms \\
ArcFace (512D)     & $190.9 \pm 24.5$ms & $47.2 \pm 3.6$ms & $\sim$238ms & 2,634ms / 6ms       & 861ms + 14,350ms / 4,267ms \\
face-api.js (128D) & —                  & —                & —           & 3,341ms / 17ms      & 859ms + 14,366ms / 4,286ms \\
\hline
\multicolumn{6}{l}{\textit{Browser WASM (Chrome, Apple M4 Pro, isolated, 50 pairs each, FaceNet, 2026-05-08)}} \\
FaceNet (128D) & — & — & — & $2{,}744 \pm 98$ms / $6 \pm 1$ms & $963{\pm}52$ms + $13{,}996{\pm}131$ms / $4{,}224{\pm}28$ms \\
\hline
\multicolumn{6}{l}{$^a$ Steady-state (JIT warmup on run 1 excluded; raw mean 6,249ms).} \\
\multicolumn{6}{l}{$^b$ Witness gen (Circom bundles witness into proof gen). Browser: isolated tabs, no cross-WASM interference.} \\
\end{tabular}
\end{table}
```
