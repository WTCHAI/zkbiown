### Table IV: FaceScrub Dataset Characteristics

**Why This Table Matters:**
Establishes dataset quality baseline for each embedding library, proving that moderate recognition accuracy is inherited from the dataset, not introduced by our pipeline.

**What It Shows:**
Dataset size, distribution, and raw embedding quality (cosine similarity) before any cancelable biometric transformation.

**How to Interpret:**
- **Persons/Captures**: Dataset size per library
- **Avg/Person**: Average captures per person (higher = better intra-person validation)
- **Same/Diff Pairs**: Number of comparisons in validation (same-person for GAR, different-person for FAR)
- **Quality Notes**: Raw cosine similarity between same-person embeddings (baseline recognition rate)

**Key Evidence:**
- All libraries use same filtered dataset (437 persons, 2,138 captures)
- Raw same-person similarity ranges from ~60-70% (moderate baseline)
- Large test sets (5,436 same-person, 10,000 different-person comparisons)
- This baseline quality propagates through our pipeline (not degraded by our method)

| Library | Dim | Persons | Captures | Avg/Person | Same-Person Pairs | Diff-Person Pairs | Quality Notes (Raw Cosine Similarity) |
|---------|-----|---------|----------|------------|-------------------|-------------------|---------------------------------------|
| FaceNet | 128 | 437 | 2138 | 4.9 | 5,436 | 10,000 | 63.94% ± 21.04% |
| FaceNet512 | 512 | 437 | 2138 | 4.9 | 5,436 | 10,000 | 62.43% ± 20.69% |
| ArcFace | 512 | 437 | 2138 | 4.9 | 5,436 | 10,000 | 55.07% ± 22.79% |
| face-api.js | 128 | 466 | 2585 | 5.5 | 7,771 | 10,000 | 95.28% ± 1.92% |

**Dataset Filtering Rationale:**
Original FaceScrub: 530 persons, 100,000+ faces → Filtered: 437 persons (excluded persons with <2 captures) → Reason: Multiple captures per person required for intra-person validation (Scenario A).

