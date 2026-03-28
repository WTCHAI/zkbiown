### Table III: Tools and Libraries

**Why This Table Matters:**
Documents the complete technology stack and filtering criteria, establishing the foundation for reproducibility and demonstrating the use of production-grade cryptographic primitives.

**What It Shows:**
Each component of the ZKBIOWN pipeline with specific libraries, versions, and configuration parameters.

**How to Interpret:**
Rows represent pipeline stages (embedding extraction → biometric transform → cryptographic operations). The filter/config column shows key parameters affecting performance and security.

**Key Evidence:**
- Uses state-of-the-art face recognition models (FaceNet, ArcFace)
- Implements proven cancelable biometric algorithm (Teoh et al. 2006)
- Employs zero-knowledge-friendly hash (Poseidon8) for blockchain compatibility
- Dataset filtered to ensure quality validation (437 persons, ≥2 captures each)

| Component | Tool/Library | Version | Filter/Config |
|-----------|-------------|---------|---------------|
| Embedding Extraction | FaceNet | - | 128D facial embeddings |
| Embedding Extraction | FaceNet512 | - | 512D facial embeddings |
| Embedding Extraction | ArcFace | - | 512D facial embeddings |
| Embedding Extraction | face-api.js | - | 128D facial embeddings |
| Biometric Transform | BioHashing (Teoh et al. 2006) | Custom | Gaussian + Gram-Schmidt orthogonalization |
| Cryptographic Hash | Poseidon8 | circomlibjs | BN254 elliptic curve field |
| ZK Proof System | Groth16 | snarkjs | Universal trusted setup |
| Key Derivation | SHA256 | Node.js crypto | Composite key generation |
| Dataset | FaceScrub | Filtered | 437 persons (≥2 captures/person) |
| Hardware | Apple M4 Pro | - | 16 CPU cores, 20 GPU cores, 48GB RAM |

**Filtering Note:** Original FaceScrub dataset contains 100,000+ faces from 530 celebrities. Filtered to 437 persons with ≥2 captures per person to enable intra-person validation (same-person comparisons).

