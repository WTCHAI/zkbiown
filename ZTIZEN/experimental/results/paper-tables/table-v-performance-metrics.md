### Table V: Performance Metrics (Apple M4 Pro)

**Why This Table Matters:**
Demonstrates practical real-time performance suitable for production deployment, with enrollment time under 250ms and verification under 50ms (excluding ZK proof).

**What It Shows:**
Computational cost breakdown for each pipeline stage: key derivation → BioHashing → Poseidon hashing → ZK proof generation/verification.

**How to Interpret:**
- **Key Combination**: SHA256-based key derivation (negligible ~1.8μs)
- **BioHashing**: Matrix generation + projection + binarization (scales with dimension)
- **Poseidon**: Field conversion + hash computation (constant ~47ms regardless of dimension)
- **Total Enrollment**: One-time cost per user registration (BioHashing + Poseidon)
- **ZK Proof**: Proof generation/verification time from previous web-based implementation

**Key Evidence:**
- ✅ 128D models: ~94ms enrollment (real-time capable)
- ✅ 512D models: ~234ms enrollment (still acceptable for registration)
- ✅ Poseidon hashing: constant time ~47ms (dimension-independent)
- ✅ BioHashing dominates cost (scales quadratically with dimension)

**System Specifications:**
- **Hardware**: Apple M4 Pro
- **CPU**: 16 cores
- **GPU**: 20 cores
- **RAM**: 48 GB
- **Sample Size**: 100 samples per library (real FaceScrub data)

| Library | Key Combination | BioHashing Total | Poseidon Hashing | Total Enrollment | ZK Proof (Gen/Verify) |
|---------|-----------------|------------------|------------------|------------------|-----------------------|
| FaceNet (128D) | 0.0018ms | 47.6ms ± 5.5ms | 46.6ms ± 2.8ms | ~94ms | [User's web data] |
| FaceNet512 (512D) | 0.0018ms | 187.6ms ± 19.5ms | 46.9ms ± 3.8ms | ~234ms | [User's web data] |
| ArcFace (512D) | 0.0018ms | 190.9ms ± 24.5ms | 47.2ms ± 3.6ms | ~238ms | [User's web data] |
| face-api.js (128D) | - | - | - | - | - |

**Performance Notes:**
- Enrollment = BioHashing + Poseidon (one-time per user registration)
- Verification = Poseidon + ZK proof generation + on-chain verification
- All timings measured on real FaceScrub dataset (100 samples per library)
- ZK proof timing from previous web-based implementation measurements

**Detailed Breakdown (FaceNet 128D):**
- Matrix Generation: 28.6ms ± 3.3ms (Gaussian + Gram-Schmidt orthogonalization)
- Projection: 16.7ms ± 1.9ms (matrix-vector multiplication)
- Binarization: 2.4ms ± 0.3ms (threshold to binary)
- Field Conversion: 0.032ms ± 0.008ms (binary to BN254 field elements)
- Hash Computation: 46.6ms ± 2.8ms (Poseidon8 hashing)

