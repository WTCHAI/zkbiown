/**
 * IoM Binarization Analysis Test
 *
 * Uses REAL enrollment and verification data to compare:
 * 1. IoM k=4 (32 indices, 64 bits) - current implementation
 * 2. IoM k=2 (64 indices, 64 bits) - alternative
 * 3. IoM + Dynamic Magnitude thresholds
 *
 * Data source: Same person, same credentialId (b6c5cab8-da3a-4066-8932-2e97b20c2e08)
 */

// ============================================================================
// REAL DATA FROM JSON FILES
// ============================================================================

// Enrollment projections (128 values)
const ENROLLMENT_PROJECTIONS = [
  0.033951, -0.151752, -0.084184, -0.065499, 0.142809, 0.002354, 0.068912, -0.003591,
  0.003676, -0.046827, -0.092321, 0.233446, -0.004888, -0.033461, 0.148689, -0.080886,
  -0.060809, 0.047021, -0.012198, 0.137523, -0.107694, 0.104814, -0.129183, 0.275741,
  -0.05932, -0.002984, -0.000181, -0.111737, 0.12197, 0.155048, 0.013082, 0.019824,
  0.170027, -0.022005, 0.098417, 0.110244, -0.137144, 0.021635, -0.040132, -0.022332,
  0.116256, -0.04376, -0.166148, -0.087035, 0.00783, -0.230066, 0.118588, -0.114591,
  -0.069296, 0.158259, 0.213795, -0.080352, -0.190473, 0.001315, 0.152129, -0.102625,
  -0.010578, -0.029942, 0.074276, 0.113843, -0.066815, 0.018345, -0.127382, -0.130497,
  -0.040125, -0.079088, 0.136089, -0.219043, 0.043708, 0.036351, 0.086784, -0.055512,
  -0.14307, -0.053047, 0.154603, 0.050125, -0.136513, -0.047558, -0.052657, 0.120024,
  0.138126, -0.009669, 0.216821, 0.042662, 0.031366, -0.134231, 0.140517, -0.183304,
  -0.019078, 0.087874, 0.082474, -0.024128, -0.013758, 0.074225, -0.086305, 0.130254,
  -0.108508, 0.131005, 0.088604, -0.202161, -0.030996, 0.195294, 0.126076, -0.00475,
  -0.071805, -0.096489, -0.098077, -0.040769, 0.307183, -0.232984, 0.268449, -0.193128,
  -0.267161, -0.20752, -0.011056, -0.267717, -0.058053, 0.047951, 0.015135, -0.089851,
  -0.17316, -0.092409, -0.187938, -0.143421, -0.007538, 0.03928, -0.073669, 0.037118
];

// Verification projections (128 values) - SAME PERSON
const VERIFICATION_PROJECTIONS = [
  0.042917, -0.178239, -0.060405, -0.081557, 0.159528, 0.012801, 0.065701, -0.039525,
  0.024306, -0.077378, -0.038904, 0.243836, -0.016109, -0.057875, 0.160947, -0.089222,
  -0.074198, 0.037169, -0.020339, 0.104297, -0.117627, 0.120202, -0.133118, 0.258762,
  -0.074408, -0.010567, 0.018181, -0.142134, 0.14257, 0.142982, 0.030942, -0.012045,
  0.178208, -0.031114, 0.092062, 0.123422, -0.122934, 0.008946, -0.043218, -0.00719,
  0.139142, -0.038428, -0.190836, -0.068312, 0.031246, -0.211896, 0.133752, -0.135837,
  -0.076269, 0.161777, 0.221407, -0.12788, -0.204901, -0.012893, 0.17528, -0.125316,
  0.024771, -0.060521, 0.094885, 0.13139, -0.091161, 0.010146, -0.114815, -0.142998,
  -0.022307, -0.109324, 0.140346, -0.207603, 0.043354, 0.051145, 0.065048, -0.063311,
  -0.161347, -0.079605, 0.14727, 0.088766, -0.139992, -0.045726, -0.09768, 0.167027,
  0.15036, -0.025734, 0.192396, 0.034029, 0.003498, -0.148963, 0.126966, -0.184336,
  0.002827, 0.108471, 0.086027, -0.025658, -0.003061, 0.082818, -0.085972, 0.089561,
  -0.114169, 0.120284, 0.053613, -0.220589, 0.00115, 0.183253, 0.082587, 0.021361,
  -0.078747, -0.102179, -0.096908, -0.030658, 0.269814, -0.258764, 0.265431, -0.187343,
  -0.264969, -0.182474, -0.035577, -0.283662, -0.070249, 0.050205, 0.038725, -0.071415,
  -0.164011, -0.09679, -0.208638, -0.14624, -0.025162, 0.037886, -0.066857, 0.023283
];

// ============================================================================
// IoM IMPLEMENTATIONS
// ============================================================================

/**
 * Index-of-Max with k=4 (current implementation)
 * Input: 128 projections
 * Output: 32 indices (0-3), each needs 2 bits = 64 bits total
 */
function iomK4(projections: number[]): number[] {
  const result: number[] = [];
  const groupSize = 4;

  for (let i = 0; i < projections.length; i += groupSize) {
    const group = projections.slice(i, i + groupSize);
    let maxIdx = 0;
    let maxVal = group[0];
    for (let j = 1; j < group.length; j++) {
      if (group[j] > maxVal) {
        maxVal = group[j];
        maxIdx = j;
      }
    }
    result.push(maxIdx);
  }

  return result;
}

/**
 * Index-of-Max with k=2
 * Input: 128 projections
 * Output: 64 indices (0-1), each needs 1 bit = 64 bits total
 */
function iomK2(projections: number[]): number[] {
  const result: number[] = [];
  const groupSize = 2;

  for (let i = 0; i < projections.length; i += groupSize) {
    const group = projections.slice(i, i + groupSize);
    const maxIdx = group[0] > group[1] ? 0 : 1;
    result.push(maxIdx);
  }

  return result;
}

/**
 * IoM k=4 + Dynamic Magnitude Level (2 bits each)
 * Uses statistical thresholds based on distribution
 * Output: 32 groups × (2 bits idx + 2 bits mag) = 128 bits total
 */
function iomK4WithMagnitude(projections: number[], thresholds: number[]): { idx: number; mag: number }[] {
  const result: { idx: number; mag: number }[] = [];
  const groupSize = 4;

  for (let i = 0; i < projections.length; i += groupSize) {
    const group = projections.slice(i, i + groupSize);
    let maxIdx = 0;
    let maxVal = group[0];
    for (let j = 1; j < group.length; j++) {
      if (group[j] > maxVal) {
        maxVal = group[j];
        maxIdx = j;
      }
    }

    // Determine magnitude level based on thresholds
    const absMax = Math.abs(maxVal);
    let magLevel = 3; // Default to highest
    for (let t = 0; t < thresholds.length; t++) {
      if (absMax < thresholds[t]) {
        magLevel = t;
        break;
      }
    }

    result.push({ idx: maxIdx, mag: magLevel });
  }

  return result;
}

/**
 * Binary binarization (current failing method)
 * Output: 128 bits
 */
function binaryBinarize(projections: number[]): number[] {
  return projections.map(p => p > 0 ? 1 : 0);
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Calculate match rate between two templates
 */
function matchRate(template1: number[], template2: number[]): { matches: number; total: number; rate: number } {
  let matches = 0;
  for (let i = 0; i < template1.length; i++) {
    if (template1[i] === template2[i]) matches++;
  }
  return {
    matches,
    total: template1.length,
    rate: (matches / template1.length) * 100
  };
}

/**
 * Analyze projection distribution
 */
function analyzeDistribution(projections: number[]): {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  quartiles: { q1: number; median: number; q3: number };
  absMaxDistribution: { values: number[]; mean: number; stdDev: number };
} {
  const sorted = [...projections].sort((a, b) => a - b);
  const n = projections.length;

  const sum = projections.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = projections.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Calculate |max| for each group of 4
  const absMaxValues: number[] = [];
  for (let i = 0; i < projections.length; i += 4) {
    const group = projections.slice(i, i + 4);
    const maxVal = Math.max(...group);
    absMaxValues.push(Math.abs(maxVal));
  }

  const absMaxMean = absMaxValues.reduce((a, b) => a + b, 0) / absMaxValues.length;
  const absMaxVariance = absMaxValues.reduce((acc, v) => acc + (v - absMaxMean) ** 2, 0) / absMaxValues.length;

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    stdDev,
    quartiles: {
      q1: sorted[Math.floor(n * 0.25)],
      median: sorted[Math.floor(n * 0.5)],
      q3: sorted[Math.floor(n * 0.75)]
    },
    absMaxDistribution: {
      values: absMaxValues,
      mean: absMaxMean,
      stdDev: Math.sqrt(absMaxVariance)
    }
  };
}

/**
 * Calculate dynamic thresholds based on distribution
 * Uses percentiles of |max| values to create stable buckets
 */
function calculateDynamicThresholds(absMaxValues: number[]): number[] {
  const sorted = [...absMaxValues].sort((a, b) => a - b);
  const n = sorted.length;

  // Use quartiles as thresholds (25%, 50%, 75%)
  return [
    sorted[Math.floor(n * 0.25)],
    sorted[Math.floor(n * 0.50)],
    sorted[Math.floor(n * 0.75)]
  ];
}

// ============================================================================
// TESTS
// ============================================================================

describe('IoM Binarization Analysis', () => {

  describe('1. Distribution Analysis', () => {
    test('Enrollment projection distribution', () => {
      const stats = analyzeDistribution(ENROLLMENT_PROJECTIONS);
      console.log('\n📊 ENROLLMENT PROJECTION DISTRIBUTION:');
      console.log(`   Min: ${stats.min.toFixed(4)}`);
      console.log(`   Max: ${stats.max.toFixed(4)}`);
      console.log(`   Mean: ${stats.mean.toFixed(4)}`);
      console.log(`   StdDev: ${stats.stdDev.toFixed(4)}`);
      console.log(`   Quartiles: Q1=${stats.quartiles.q1.toFixed(4)}, Median=${stats.quartiles.median.toFixed(4)}, Q3=${stats.quartiles.q3.toFixed(4)}`);
      console.log(`\n   |Max| per group (k=4):`);
      console.log(`     Mean: ${stats.absMaxDistribution.mean.toFixed(4)}`);
      console.log(`     StdDev: ${stats.absMaxDistribution.stdDev.toFixed(4)}`);
      console.log(`     Values: [${stats.absMaxDistribution.values.slice(0, 8).map(v => v.toFixed(3)).join(', ')}...]`);

      expect(stats.min).toBeLessThan(0);
      expect(stats.max).toBeGreaterThan(0);
    });

    test('Verification projection distribution', () => {
      const stats = analyzeDistribution(VERIFICATION_PROJECTIONS);
      console.log('\n📊 VERIFICATION PROJECTION DISTRIBUTION:');
      console.log(`   Min: ${stats.min.toFixed(4)}`);
      console.log(`   Max: ${stats.max.toFixed(4)}`);
      console.log(`   Mean: ${stats.mean.toFixed(4)}`);
      console.log(`   StdDev: ${stats.stdDev.toFixed(4)}`);
      console.log(`   Quartiles: Q1=${stats.quartiles.q1.toFixed(4)}, Median=${stats.quartiles.median.toFixed(4)}, Q3=${stats.quartiles.q3.toFixed(4)}`);

      expect(stats.min).toBeLessThan(0);
      expect(stats.max).toBeGreaterThan(0);
    });
  });

  describe('2. Binary Binarization (Current - FAILING)', () => {
    test('Binary match rate', () => {
      const enrollBinary = binaryBinarize(ENROLLMENT_PROJECTIONS);
      const verifyBinary = binaryBinarize(VERIFICATION_PROJECTIONS);
      const result = matchRate(enrollBinary, verifyBinary);

      console.log('\n🔴 BINARY BINARIZATION (128 bits):');
      console.log(`   Enrollment: [${enrollBinary.slice(0, 20).join('')}...]`);
      console.log(`   Verification: [${verifyBinary.slice(0, 20).join('')}...]`);
      console.log(`   Match: ${result.matches}/${result.total} = ${result.rate.toFixed(2)}%`);

      // Show where mismatches occur (near-zero values)
      const mismatches: { idx: number; enroll: number; verify: number }[] = [];
      for (let i = 0; i < enrollBinary.length; i++) {
        if (enrollBinary[i] !== verifyBinary[i]) {
          mismatches.push({
            idx: i,
            enroll: ENROLLMENT_PROJECTIONS[i],
            verify: VERIFICATION_PROJECTIONS[i]
          });
        }
      }
      console.log(`\n   Mismatches (first 5):`);
      mismatches.slice(0, 5).forEach(m => {
        console.log(`     [${m.idx}] E=${m.enroll.toFixed(4)} → V=${m.verify.toFixed(4)}`);
      });

      expect(result.rate).toBeLessThan(50); // Confirms it's failing
    });
  });

  describe('3. IoM k=4 (32 indices, 64 bits)', () => {
    test('IoM k=4 match rate', () => {
      const enrollIom = iomK4(ENROLLMENT_PROJECTIONS);
      const verifyIom = iomK4(VERIFICATION_PROJECTIONS);
      const result = matchRate(enrollIom, verifyIom);

      console.log('\n🟢 IoM k=4 (32 indices × 2 bits = 64 bits):');
      console.log(`   Enrollment: [${enrollIom.join(',')}]`);
      console.log(`   Verification: [${verifyIom.join(',')}]`);
      console.log(`   Match: ${result.matches}/${result.total} = ${result.rate.toFixed(2)}%`);

      // Show group details for first few
      console.log(`\n   Group details (first 4):`);
      for (let g = 0; g < 4; g++) {
        const eGroup = ENROLLMENT_PROJECTIONS.slice(g * 4, g * 4 + 4);
        const vGroup = VERIFICATION_PROJECTIONS.slice(g * 4, g * 4 + 4);
        console.log(`     Group ${g}: E=[${eGroup.map(v => v.toFixed(3)).join(', ')}] → max idx ${enrollIom[g]}`);
        console.log(`             V=[${vGroup.map(v => v.toFixed(3)).join(', ')}] → max idx ${verifyIom[g]}`);
      }

      expect(result.rate).toBe(100); // Should be 100%
    });
  });

  describe('4. IoM k=2 (64 indices, 64 bits)', () => {
    test('IoM k=2 match rate', () => {
      const enrollIom = iomK2(ENROLLMENT_PROJECTIONS);
      const verifyIom = iomK2(VERIFICATION_PROJECTIONS);
      const result = matchRate(enrollIom, verifyIom);

      console.log('\n🟡 IoM k=2 (64 indices × 1 bit = 64 bits):');
      console.log(`   Enrollment: [${enrollIom.slice(0, 32).join('')}...]`);
      console.log(`   Verification: [${verifyIom.slice(0, 32).join('')}...]`);
      console.log(`   Match: ${result.matches}/${result.total} = ${result.rate.toFixed(2)}%`);

      // Show mismatches
      const mismatches: { idx: number; pair: [number, number]; ePair: [number, number]; vPair: [number, number] }[] = [];
      for (let i = 0; i < enrollIom.length; i++) {
        if (enrollIom[i] !== verifyIom[i]) {
          const eP = [ENROLLMENT_PROJECTIONS[i * 2], ENROLLMENT_PROJECTIONS[i * 2 + 1]] as [number, number];
          const vP = [VERIFICATION_PROJECTIONS[i * 2], VERIFICATION_PROJECTIONS[i * 2 + 1]] as [number, number];
          mismatches.push({ idx: i, pair: [i * 2, i * 2 + 1], ePair: eP, vPair: vP });
        }
      }

      if (mismatches.length > 0) {
        console.log(`\n   Mismatches:`);
        mismatches.forEach(m => {
          console.log(`     Pair ${m.idx} [${m.pair[0]},${m.pair[1]}]:`);
          console.log(`       E=[${m.ePair[0].toFixed(4)}, ${m.ePair[1].toFixed(4)}] → max=${m.ePair[0] > m.ePair[1] ? 0 : 1}`);
          console.log(`       V=[${m.vPair[0].toFixed(4)}, ${m.vPair[1].toFixed(4)}] → max=${m.vPair[0] > m.vPair[1] ? 0 : 1}`);
        });
      }
    });
  });

  describe('5. IoM k=4 + Dynamic Magnitude (128 bits)', () => {
    test('Dynamic threshold calculation', () => {
      const enrollStats = analyzeDistribution(ENROLLMENT_PROJECTIONS);
      const thresholds = calculateDynamicThresholds(enrollStats.absMaxDistribution.values);

      console.log('\n📐 DYNAMIC MAGNITUDE THRESHOLDS:');
      console.log(`   Based on enrollment |max| distribution:`);
      console.log(`     25th percentile (Level 0→1): ${thresholds[0].toFixed(4)}`);
      console.log(`     50th percentile (Level 1→2): ${thresholds[1].toFixed(4)}`);
      console.log(`     75th percentile (Level 2→3): ${thresholds[2].toFixed(4)}`);

      expect(thresholds.length).toBe(3);
    });

    test('IoM k=4 + Magnitude match rate with dynamic thresholds', () => {
      const enrollStats = analyzeDistribution(ENROLLMENT_PROJECTIONS);
      const thresholds = calculateDynamicThresholds(enrollStats.absMaxDistribution.values);

      const enrollIomMag = iomK4WithMagnitude(ENROLLMENT_PROJECTIONS, thresholds);
      const verifyIomMag = iomK4WithMagnitude(VERIFICATION_PROJECTIONS, thresholds);

      // Calculate separate match rates for idx and mag
      let idxMatches = 0;
      let magMatches = 0;
      let bothMatches = 0;

      for (let i = 0; i < enrollIomMag.length; i++) {
        if (enrollIomMag[i].idx === verifyIomMag[i].idx) idxMatches++;
        if (enrollIomMag[i].mag === verifyIomMag[i].mag) magMatches++;
        if (enrollIomMag[i].idx === verifyIomMag[i].idx &&
            enrollIomMag[i].mag === verifyIomMag[i].mag) bothMatches++;
      }

      console.log('\n🟠 IoM k=4 + DYNAMIC MAGNITUDE (32 × 4 bits = 128 bits):');
      console.log(`   Thresholds: [${thresholds.map(t => t.toFixed(3)).join(', ')}]`);
      console.log(`\n   Index match: ${idxMatches}/${enrollIomMag.length} = ${(idxMatches / enrollIomMag.length * 100).toFixed(2)}%`);
      console.log(`   Magnitude match: ${magMatches}/${enrollIomMag.length} = ${(magMatches / enrollIomMag.length * 100).toFixed(2)}%`);
      console.log(`   Both match: ${bothMatches}/${enrollIomMag.length} = ${(bothMatches / enrollIomMag.length * 100).toFixed(2)}%`);

      // Show details
      console.log(`\n   Group details (first 8):`);
      for (let g = 0; g < 8; g++) {
        const eGroup = ENROLLMENT_PROJECTIONS.slice(g * 4, g * 4 + 4);
        const vGroup = VERIFICATION_PROJECTIONS.slice(g * 4, g * 4 + 4);
        const eMax = Math.max(...eGroup);
        const vMax = Math.max(...vGroup);
        const e = enrollIomMag[g];
        const v = verifyIomMag[g];
        const idxMatch = e.idx === v.idx ? '✓' : '✗';
        const magMatch = e.mag === v.mag ? '✓' : '✗';
        console.log(`     [${g}] E: idx=${e.idx} mag=${e.mag} (|max|=${Math.abs(eMax).toFixed(3)}) | V: idx=${v.idx} mag=${v.mag} (|max|=${Math.abs(vMax).toFixed(3)}) | idx:${idxMatch} mag:${magMatch}`);
      }

      // Show magnitude mismatches
      const magMismatches: number[] = [];
      for (let i = 0; i < enrollIomMag.length; i++) {
        if (enrollIomMag[i].mag !== verifyIomMag[i].mag) {
          magMismatches.push(i);
        }
      }

      if (magMismatches.length > 0) {
        console.log(`\n   ⚠️ Magnitude mismatches at groups: [${magMismatches.join(', ')}]`);
        console.log(`   These occur near threshold boundaries!`);
      }
    });

    test('IoM k=4 + Magnitude with FIXED arbitrary thresholds (for comparison)', () => {
      const fixedThresholds = [0.05, 0.10, 0.20]; // My arbitrary thresholds

      const enrollIomMag = iomK4WithMagnitude(ENROLLMENT_PROJECTIONS, fixedThresholds);
      const verifyIomMag = iomK4WithMagnitude(VERIFICATION_PROJECTIONS, fixedThresholds);

      let magMatches = 0;
      for (let i = 0; i < enrollIomMag.length; i++) {
        if (enrollIomMag[i].mag === verifyIomMag[i].mag) magMatches++;
      }

      console.log('\n🔴 IoM k=4 + FIXED MAGNITUDE (arbitrary thresholds):');
      console.log(`   Thresholds: [0.05, 0.10, 0.20] (arbitrary)`);
      console.log(`   Magnitude match: ${magMatches}/${enrollIomMag.length} = ${(magMatches / enrollIomMag.length * 100).toFixed(2)}%`);
      console.log(`   (Compare to dynamic thresholds above)`);
    });
  });

  describe('6. Summary Comparison', () => {
    test('All methods comparison table', () => {
      // Binary
      const enrollBinary = binaryBinarize(ENROLLMENT_PROJECTIONS);
      const verifyBinary = binaryBinarize(VERIFICATION_PROJECTIONS);
      const binaryResult = matchRate(enrollBinary, verifyBinary);

      // IoM k=4
      const enrollIomK4 = iomK4(ENROLLMENT_PROJECTIONS);
      const verifyIomK4 = iomK4(VERIFICATION_PROJECTIONS);
      const iomK4Result = matchRate(enrollIomK4, verifyIomK4);

      // IoM k=2
      const enrollIomK2 = iomK2(ENROLLMENT_PROJECTIONS);
      const verifyIomK2 = iomK2(VERIFICATION_PROJECTIONS);
      const iomK2Result = matchRate(enrollIomK2, verifyIomK2);

      // IoM k=4 + Magnitude (dynamic)
      const enrollStats = analyzeDistribution(ENROLLMENT_PROJECTIONS);
      const dynamicThresholds = calculateDynamicThresholds(enrollStats.absMaxDistribution.values);
      const enrollIomMag = iomK4WithMagnitude(ENROLLMENT_PROJECTIONS, dynamicThresholds);
      const verifyIomMag = iomK4WithMagnitude(VERIFICATION_PROJECTIONS, dynamicThresholds);

      let iomMagIdxMatches = 0;
      let iomMagFullMatches = 0;
      for (let i = 0; i < enrollIomMag.length; i++) {
        if (enrollIomMag[i].idx === verifyIomMag[i].idx) iomMagIdxMatches++;
        if (enrollIomMag[i].idx === verifyIomMag[i].idx &&
            enrollIomMag[i].mag === verifyIomMag[i].mag) iomMagFullMatches++;
      }

      console.log('\n');
      console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
      console.log('║                    BINARIZATION METHOD COMPARISON                         ║');
      console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
      console.log('║ Method                  │ Output Size │ Match Rate │ Recommendation       ║');
      console.log('╠═════════════════════════╪═════════════╪════════════╪══════════════════════╣');
      console.log(`║ Binary (sign)           │ 128 bits    │ ${binaryResult.rate.toFixed(1).padStart(6)}%    │ ❌ FAILING           ║`);
      console.log(`║ IoM k=2                 │ 64 bits     │ ${iomK2Result.rate.toFixed(1).padStart(6)}%    │ ${iomK2Result.rate === 100 ? '✅ WORKS' : '⚠️ CHECK'}             ║`);
      console.log(`║ IoM k=4                 │ 64 bits     │ ${iomK4Result.rate.toFixed(1).padStart(6)}%    │ ${iomK4Result.rate === 100 ? '✅ RECOMMENDED' : '⚠️ CHECK'}       ║`);
      console.log(`║ IoM k=4 + Mag (idx only)│ 64 bits     │ ${(iomMagIdxMatches / 32 * 100).toFixed(1).padStart(6)}%    │ (same as IoM k=4)    ║`);
      console.log(`║ IoM k=4 + Mag (full)    │ 128 bits    │ ${(iomMagFullMatches / 32 * 100).toFixed(1).padStart(6)}%    │ ${iomMagFullMatches === 32 ? '✅ IF NEED 128bit' : '⚠️ MAG UNSTABLE'}    ║`);
      console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
      console.log('\n');

      // Assert IoM k=4 is 100%
      expect(iomK4Result.rate).toBe(100);
    });
  });
});
