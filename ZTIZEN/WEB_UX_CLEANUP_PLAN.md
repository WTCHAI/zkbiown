# Web UI/UX Cleanup Plan - Align with Experimental Research

**Date:** 2026-03-29
**Priority:** HIGH - Correct misinformation in user-facing UI

---

## 🎯 Objective

Fix critical inconsistencies between web UI descriptions and actual implementation based on experimental research validation.

---

## 🔍 Critical Issues Found

### **Issue 1: WRONG ALGORITHM NAME (HIGH SEVERITY)**

**Current UI:**
- Claims to use "Sparse Gaussian (Achlioptas/Chellappa)"
- References IEEE TPAMI 2011 (Pillai iris biometrics paper)
- Says "2/3 sparse projection matrix"

**Actual Implementation:**
- Uses **Gaussian + Gram-Schmidt Orthogonalization** (Teoh BioHashing 2006)
- NOT sparse ternary projection (Achlioptas 2003)
- Full matrix, not sparse

**Files to Fix:**
1. `web/src/components/AlgorithmSelector.tsx` (lines 37-38, 253-254, 273-278)
2. `web/src/routes/ztizen.register-scan.$credentialId.tsx` (line 25)

---

### **Issue 2: WRONG TEMPLATE SIZE (MEDIUM SEVERITY)**

**Current UI:**
- Says "256 bits (browser ZK)"

**Actual Implementation:**
- Uses **128 bits**

**Files to Fix:**
1. `web/src/components/AlgorithmSelector.tsx` (line 39)

---

### **Issue 3: INCOMPLETE FLOW DESCRIPTION (MEDIUM SEVERITY)**

**Current UI:**
- "Template generation with Sparse Gaussian projection"
- Doesn't mention Gram-Schmidt orthogonalization

**Actual Implementation:**
- Gaussian random matrix generation
- **Gram-Schmidt orthogonalization** (critical security step)
- Projection + binarization

**Files to Fix:**
1. `web/src/routes/ztizen.register-scan.$credentialId.tsx` (lines 1029-1034)

---

### **Issue 4: WRONG PAPER CITATIONS (HIGH SEVERITY)**

**Current UI:**
- References "IEEE TPAMI 2011" (Pillai iris paper)
- Cites Achlioptas 2003 + Pillai/Chellappa 2011

**Actual Implementation:**
- Based on **Teoh, Ngo, Goh - IEEE TPAMI 2006** (BioHashing)

**Files to Fix:**
1. `web/src/components/AlgorithmSelector.tsx` (lines 273-278)

---

## 📝 Fixes Required

### Fix 1: Update AlgorithmSelector.tsx

**Location:** `web/src/components/AlgorithmSelector.tsx`

**Changes:**

```typescript
// OLD (WRONG):
{
  id: 'gaussian-sparse',
  name: 'Sparse Gaussian (Achlioptas/Chellappa)',
  description: '2/3 sparse projection matrix - IEEE TPAMI 2011 verified implementation',
  templateSize: '256 bits (browser ZK)',
  // ...
}

// NEW (CORRECT):
{
  id: 'biohashing-gaussian-gramschmidt',
  name: 'BioHashing (Teoh et al. 2006)',
  description: 'Gaussian random projection with Gram-Schmidt orthogonalization - IEEE TPAMI 2006',
  templateSize: '128 bits',
  // ...
}
```

**Technical Description Update:**

```typescript
// OLD (WRONG):
<strong>How it works:</strong> Uses Achlioptas/Chellappa sparse matrix
Φ[i,j] = {'{'}+√(3/m): 1/6, 0: 2/3, -√(3/m): 1/6{'}'} as per IEEE TPAMI 2011.

// NEW (CORRECT):
<strong>How it works:</strong> Generates Gaussian random matrix R[i,j] ~ (1/√m) × N(0,1),
then applies Gram-Schmidt orthogonalization for statistical independence (Teoh et al. IEEE TPAMI 2006).
```

**Citation Update:**

```typescript
// OLD (WRONG):
<strong>Academic Note:</strong> This implementation uses the Sparse Random
Projection algorithm from "Database-friendly random projections" (Achlioptas, 2003)
and its application to biometrics in "Secure and Robust Iris Recognition Using
Random Projections" (Pillai, Patel, Chellappa, Ratha - IEEE TPAMI 2011).

// NEW (CORRECT):
<strong>Academic Note:</strong> This implementation uses BioHashing from
"Random Multispace Quantization as an Analytic Mechanism for BioHashing"
(Teoh, Ngo, Goh - IEEE Transactions on Pattern Analysis and Machine Intelligence, 2006).
The Gaussian + Gram-Schmidt approach ensures statistical independence of projected dimensions.
```

---

### Fix 2: Update Enrollment Flow Description

**Location:** `web/src/routes/ztizen.register-scan.$credentialId.tsx`

**Changes:**

```typescript
// OLD (INCOMPLETE):
<ol style={styles.processingInfoList}>
  <li>Face capture using face-api.js (128D embedding)</li>
  <li>Template generation with Sparse Gaussian projection</li>
  <li>Poseidon hash commitments (128 hashes)</li>
  <li>Secure storage (only hashes stored, never raw biometric)</li>
</ol>

// NEW (COMPLETE):
<ol style={styles.processingInfoList}>
  <li>Face capture using face-api.js (128D facial embedding)</li>
  <li>Key derivation (three-party: User + Service + Platform keys)</li>
  <li>Gaussian matrix generation with Gram-Schmidt orthogonalization</li>
  <li>Random projection and binarization (128-bit template)</li>
  <li>Poseidon hash commitments (128 individual hashes)</li>
  <li>Secure storage (only commitments stored, never raw biometric)</li>
</ol>
```

---

### Fix 3: Update Hardcoded Algorithm Constant

**Location:** `web/src/routes/ztizen.register-scan.$credentialId.tsx`

**Changes:**

```typescript
// OLD:
// Hardcoded algorithm - Chellappa Sparse Gaussian (IEEE TPAMI 2011)
const HARDCODED_ALGORITHM = 'gaussian-sparse' as const;

// NEW:
// Hardcoded algorithm - BioHashing (Teoh et al. IEEE TPAMI 2006)
// Gaussian random projection with Gram-Schmidt orthogonalization
const HARDCODED_ALGORITHM = 'biohashing-gaussian-gramschmidt' as const;
```

---

### Fix 4: Update "Ready to capture" Message

**Location:** `web/src/routes/ztizen.register-scan.$credentialId.tsx`

**Changes:**

```typescript
// OLD:
✅ Ready to capture biometric (using gaussian-sparse algorithm)

// NEW:
✅ Ready to capture biometric (using BioHashing: Gaussian + Gram-Schmidt)
```

---

### Fix 5: Update Binarization Method Description

**Location:** `web/src/routes/ztizen.register-scan.$credentialId.tsx`

**Changes:**

```typescript
// OLD:
Using Sign + Rank Mean-Centered binarization (128 values, 0-8 symmetric).
Self-normalizing: each session computes its own statistics.

// NEW:
Using Sign + Magnitude-Rank binarization (128 bits, 0-8 symmetric quantization).
Self-normalizing: session-specific statistics ensure consistency across captures.
Paper: Teoh et al. IEEE TPAMI 2006 - Section 3.2 (Binarization Strategies)
```

---

## 🧪 Align with Experimental Research

### Reference Implementation (Correct)

**File:** `experimental/utils/biohashing.ts`

```typescript
/**
 * Generate Gaussian Random Projection Matrix with Gram-Schmidt (BioHashing)
 *
 * Paper: "Random Multispace Quantization as an Analytic Mechanism for BioHashing"
 * Authors: Teoh, Ngo, Goh (IEEE TPAMI 2006)
 *
 * Algorithm:
 * 1. Generate Gaussian random matrix R[i][j] ~ (1/√m) × N(0,1)
 * 2. Apply Gram-Schmidt orthogonalization for statistical independence
 * 3. Each row becomes an orthonormal basis vector
 *
 * @param compositeKey - Deterministic seed from three-party key derivation
 * @param outputDim - Template dimension (128 bits)
 * @param inputDim - Face embedding dimension (128D from face-api.js)
 * @returns Orthonormal projection matrix (outputDim × inputDim)
 */
export async function generateGaussianMatrix(
  compositeKey: Uint8Array,
  outputDim: number,
  inputDim: number
): Promise<number[][]> {
  // ... implementation matches experimental/
}
```

**This is the ground truth!** Web UI must match this.

---

### Validation Data Reference

**From:** `experimental/results/paper-tables/table-iii-tools-libraries.md`

| Component | Tool/Library | Version | Filter/Config |
|-----------|-------------|---------|---------------|
| Biometric Transform | **BioHashing (Teoh et al. 2006)** | Custom | **Gaussian + Gram-Schmidt orthogonalization** |
| Cryptographic Hash | Poseidon8 | circomlibjs | BN254 elliptic curve field |

**This is what should be displayed to users!**

---

## 📋 Testing Checklist

After fixes, verify:

- [ ] Algorithm name says "BioHashing (Teoh et al. 2006)"
- [ ] Template size says "128 bits"
- [ ] Flow description mentions "Gram-Schmidt orthogonalization"
- [ ] Paper citation references "IEEE TPAMI 2006" (NOT 2011)
- [ ] No mention of "Achlioptas" or "Chellappa" sparse projection
- [ ] Binarization method explains "Sign + Magnitude-Rank"
- [ ] Technical descriptions match `experimental/utils/biohashing.ts`

---

## 🔗 Cross-References

### Correct Citations (Use These)

1. **Primary Paper:**
   - Teoh, A.B.J., Ngo, D.C.L., Goh, A. (2006)
   - "Random Multispace Quantization as an Analytic Mechanism for BioHashing of Biometric and Random Identity Inputs"
   - IEEE Transactions on Pattern Analysis and Machine Intelligence (TPAMI), Vol. 28, No. 12

2. **Gram-Schmidt Application:**
   - Same paper (Teoh et al. 2006), Section 2.2 "Random Projection Matrix Generation"

3. **Binarization Strategy:**
   - Same paper (Teoh et al. 2006), Section 3 "Quantization and Binarization"

### AVOID These Citations (Wrong for This System)

1. ❌ Achlioptas, D. (2003) - "Database-friendly random projections" (sparse ternary - NOT USED)
2. ❌ Pillai, J.K., Patel, V.M., Chellappa, R., Ratha, N.K. (2011) - "Secure and Robust Iris Recognition..." (iris biometrics - NOT FACE)

---

## 🚀 Implementation Priority

### Phase 1 (HIGH - Do First):
1. Fix algorithm name in AlgorithmSelector.tsx
2. Fix paper citations (2011 → 2006)
3. Fix template size (256 → 128)

### Phase 2 (MEDIUM - Do Next):
1. Update enrollment flow description (add Gram-Schmidt step)
2. Update "Ready to capture" message
3. Update hardcoded algorithm constant

### Phase 3 (LOW - Polish):
1. Add tooltips explaining Gram-Schmidt orthogonalization
2. Add link to IEEE TPAMI 2006 paper (if publicly available)
3. Consider adding "Why this algorithm?" explanation section

---

## 📊 Impact Assessment

### Before Cleanup:
- ❌ Misleading algorithm name (claimed sparse, actually dense Gaussian)
- ❌ Wrong paper citation (2011 iris paper instead of 2006 face paper)
- ❌ Wrong template size (256 vs 128)
- ❌ Missing critical security step (Gram-Schmidt orthogonalization)

### After Cleanup:
- ✅ Accurate algorithm description matching implementation
- ✅ Correct paper citation (Teoh et al. IEEE TPAMI 2006)
- ✅ Correct template size (128 bits)
- ✅ Complete flow description including all security steps
- ✅ UI aligned with experimental research validation

---

## 📝 Summary

**What Changed:**
- Algorithm name: "Sparse Gaussian" → "BioHashing (Gaussian + Gram-Schmidt)"
- Paper: IEEE TPAMI 2011 → IEEE TPAMI 2006
- Template size: 256 bits → 128 bits
- Flow: Added Gram-Schmidt orthogonalization step

**Why It Matters:**
- **Accuracy:** Users deserve correct technical information
- **Reproducibility:** Researchers need accurate algorithm descriptions
- **Trust:** Correct citations build credibility
- **Alignment:** Web UI must match experimental validation

**References:**
- Experimental implementation: `experimental/utils/biohashing.ts`
- Research tables: `experimental/results/paper-tables/`
- Paper: Teoh et al. IEEE TPAMI 2006

---

**Status:** Ready for implementation
**Estimated Time:** 1-2 hours (mostly find-replace + testing)
**Risk:** Low (UI-only changes, no algorithm changes)
