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
- All libraries use identical aligned dataset (437 persons, 2,137 captures) — same persons, same captures
- Raw same-person similarity ranges from ~55-95% depending on library
- Exhaustive test sets (5,431 same-person, 2,276,885 different-person comparisons)
- This baseline quality propagates through our pipeline (not degraded by our method)

| Library | Dim | Persons | Captures | Avg/Person | Same-Person Pairs | Diff-Person Pairs | Quality Notes (Raw Cosine Similarity) |
|---------|-----|---------|----------|------------|-------------------|-------------------|---------------------------------------|
| FaceNet | 128 | 437 | 2,137 | 4.9 | 5,431 | 2,276,885 | 63.96% ± 21.03% |
| FaceNet512 | 512 | 437 | 2,137 | 4.9 | 5,431 | 2,276,885 | 62.46% ± 20.67% |
| ArcFace | 512 | 437 | 2,137 | 4.9 | 5,431 | 2,276,885 | 55.09% ± 22.79% |
| face-api.js | 128 | 437 | 2,137 | 4.9 | 5,431 | 2,276,885 | 95.28% ± 1.79% |

**Dataset Filtering Rationale:**
Original FaceScrub: 530 persons, 100,000+ faces → Aligned: 437 persons, 2,137 captures (intersection of capture IDs present in ALL 4 libraries, min 2 captures per person) → All 4 libraries use identical person and capture sets — one source of truth.

