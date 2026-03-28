# Four-Scenario Validation Analysis
*Generated: 2026-03-27T09:46:49.006Z*
*Method: BioHashing (Teoh et al. 2006)*
*Dataset: Real FaceScrub Embeddings (437 persons, 2138 captures)*

## TABLE VIII: Four-Scenario Validation Results

| Library | A (Same/Same) | B (Diff/Same) | C (Same/Diff) | D (Diff/Diff) |
|---------|---------------|---------------|---------------|---------------|
| FaceNet (128D) | 73.1% | 52.2% | 49.6% | 52.9% |
| FaceNet512 (512D) | 72.1% | 51.1% | 49.7% | 50.9% |
| ArcFace (512D) | 69.6% | 51.8% | 50.1% | 51.5% |

## TABLE IX: Security Metrics

| Library | GAR | FAR |
|---------|-----|-----|
| FaceNet (128D) | 25.5% | 0.04% |
| FaceNet512 (512D) | 21.0% | 0.01% |
| ArcFace (512D) | 15.9% | 0.72% |

---

**Interpretation:**
- **Scenario A:** Verifiability (Same person can authenticate)
- **Scenario B:** Uniqueness (Different persons are separated)
- **Scenario C:** Cancelability (Key change decorrelates templates)
- **Scenario D:** Unlinkability (Cross-service tracking prevented)

**Method:** Traditional BioHashing
- Projection: H = R · embedding (R is random matrix from key)
- Binarization: B[i] = 1 if H[i] > 0, else 0
- Threshold: 102/128 bits (79.7%)

**Data Source:** Real FaceScrub embeddings (437 persons, 2138 captures)
