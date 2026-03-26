/**
 * IoM Binarization Analysis Script
 *
 * Run with: npx tsx src/lib/__tests__/iom-analysis.ts
 *
 * Compares:
 * 1. Binary (128 bits) - current failing method
 * 2. IoM k=4 (32 indices, 64 bits)
 * 3. IoM k=2 (64 indices, 64 bits)
 * 4. IoM k=4 + Dynamic Magnitude (128 bits)
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
const VERIFICATION_SAME_PERSON = [
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

function iomK4(projections: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < projections.length; i += 4) {
    const group = projections.slice(i, i + 4);
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

function iomK2(projections: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < projections.length; i += 2) {
    const maxIdx = projections[i] > projections[i + 1] ? 0 : 1;
    result.push(maxIdx);
  }
  return result;
}

function iomK4WithMagnitude(projections: number[], thresholds: number[]): { idx: number; mag: number }[] {
  const result: { idx: number; mag: number }[] = [];
  for (let i = 0; i < projections.length; i += 4) {
    const group = projections.slice(i, i + 4);
    let maxIdx = 0;
    let maxVal = group[0];
    for (let j = 1; j < group.length; j++) {
      if (group[j] > maxVal) {
        maxVal = group[j];
        maxIdx = j;
      }
    }
    const absMax = Math.abs(maxVal);
    let magLevel = 3;
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

function binaryBinarize(projections: number[]): number[] {
  return projections.map(p => p > 0 ? 1 : 0);
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function matchRate(t1: number[], t2: number[]): { matches: number; total: number; rate: number } {
  let matches = 0;
  for (let i = 0; i < t1.length; i++) {
    if (t1[i] === t2[i]) matches++;
  }
  return { matches, total: t1.length, rate: (matches / t1.length) * 100 };
}

function analyzeDistribution(projections: number[]) {
  const sorted = [...projections].sort((a, b) => a - b);
  const n = projections.length;
  const sum = projections.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const stdDev = Math.sqrt(projections.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n);

  // |max| for each group of 4
  const absMaxValues: number[] = [];
  for (let i = 0; i < projections.length; i += 4) {
    const group = projections.slice(i, i + 4);
    const maxVal = Math.max(...group);
    absMaxValues.push(Math.abs(maxVal));
  }
  const absMaxMean = absMaxValues.reduce((a, b) => a + b, 0) / absMaxValues.length;
  const absMaxStdDev = Math.sqrt(absMaxValues.reduce((acc, v) => acc + (v - absMaxMean) ** 2, 0) / absMaxValues.length);

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    stdDev,
    q1: sorted[Math.floor(n * 0.25)],
    median: sorted[Math.floor(n * 0.5)],
    q3: sorted[Math.floor(n * 0.75)],
    absMaxValues,
    absMaxMean,
    absMaxStdDev
  };
}

function calculateDynamicThresholds(absMaxValues: number[]): number[] {
  const sorted = [...absMaxValues].sort((a, b) => a - b);
  const n = sorted.length;
  return [
    sorted[Math.floor(n * 0.25)],
    sorted[Math.floor(n * 0.50)],
    sorted[Math.floor(n * 0.75)]
  ];
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

console.log('\n');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('                    IoM BINARIZATION ANALYSIS');
console.log('    Real Data: Same person, credentialId b6c5cab8-da3a-4066-8932-2e97b20c2e08');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

// 1. Distribution Analysis
console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
console.log('│ 1. PROJECTION DISTRIBUTION ANALYSIS                                         │');
console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

const enrollStats = analyzeDistribution(ENROLLMENT_PROJECTIONS);
const verifyStats = analyzeDistribution(VERIFICATION_PROJECTIONS);

console.log('  ENROLLMENT:');
console.log(`    Range: [${enrollStats.min.toFixed(4)}, ${enrollStats.max.toFixed(4)}]`);
console.log(`    Mean: ${enrollStats.mean.toFixed(4)}, StdDev: ${enrollStats.stdDev.toFixed(4)}`);
console.log(`    |Max| per group mean: ${enrollStats.absMaxMean.toFixed(4)}, stdDev: ${enrollStats.absMaxStdDev.toFixed(4)}`);
console.log(`    |Max| values: [${enrollStats.absMaxValues.slice(0, 8).map(v => v.toFixed(3)).join(', ')}...]\n`);

console.log('  VERIFICATION:');
console.log(`    Range: [${verifyStats.min.toFixed(4)}, ${verifyStats.max.toFixed(4)}]`);
console.log(`    Mean: ${verifyStats.mean.toFixed(4)}, StdDev: ${verifyStats.stdDev.toFixed(4)}`);
console.log(`    |Max| per group mean: ${verifyStats.absMaxMean.toFixed(4)}, stdDev: ${verifyStats.absMaxStdDev.toFixed(4)}\n`);

// 2. Binary (Current FAILING)
console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
console.log('│ 2. BINARY BINARIZATION (128 bits) - CURRENT FAILING                         │');
console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

const enrollBinary = binaryBinarize(ENROLLMENT_PROJECTIONS);
const verifyBinary = binaryBinarize(VERIFICATION_PROJECTIONS);
const binaryResult = matchRate(enrollBinary, verifyBinary);

console.log(`  Match: ${binaryResult.matches}/${binaryResult.total} = ${binaryResult.rate.toFixed(2)}%`);
console.log(`  ❌ FAILING - too many sign flips near zero\n`);

// 3. IoM k=4
console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
console.log('│ 3. IoM k=4 (32 indices × 2 bits = 64 bits)                                  │');
console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

const enrollIomK4 = iomK4(ENROLLMENT_PROJECTIONS);
const verifyIomK4 = iomK4(VERIFICATION_PROJECTIONS);
const iomK4Result = matchRate(enrollIomK4, verifyIomK4);

console.log(`  Enrollment:  [${enrollIomK4.join(',')}]`);
console.log(`  Verification: [${verifyIomK4.join(',')}]`);
console.log(`  Match: ${iomK4Result.matches}/${iomK4Result.total} = ${iomK4Result.rate.toFixed(2)}%`);
console.log(`  ${iomK4Result.rate === 100 ? '✅ PERFECT MATCH' : '⚠️ HAS MISMATCHES'}\n`);

// 4. IoM k=2
console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
console.log('│ 4. IoM k=2 (64 indices × 1 bit = 64 bits)                                   │');
console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

const enrollIomK2 = iomK2(ENROLLMENT_PROJECTIONS);
const verifyIomK2 = iomK2(VERIFICATION_PROJECTIONS);
const iomK2Result = matchRate(enrollIomK2, verifyIomK2);

console.log(`  Enrollment:  [${enrollIomK2.slice(0, 32).join('')}...]`);
console.log(`  Verification: [${verifyIomK2.slice(0, 32).join('')}...]`);
console.log(`  Match: ${iomK2Result.matches}/${iomK2Result.total} = ${iomK2Result.rate.toFixed(2)}%`);

// Find k=2 mismatches
const k2Mismatches: number[] = [];
for (let i = 0; i < enrollIomK2.length; i++) {
  if (enrollIomK2[i] !== verifyIomK2[i]) k2Mismatches.push(i);
}

if (k2Mismatches.length > 0) {
  console.log(`\n  ⚠️ Mismatches at pairs: [${k2Mismatches.join(', ')}]`);
  k2Mismatches.slice(0, 3).forEach(i => {
    const eP = [ENROLLMENT_PROJECTIONS[i * 2], ENROLLMENT_PROJECTIONS[i * 2 + 1]];
    const vP = [VERIFICATION_PROJECTIONS[i * 2], VERIFICATION_PROJECTIONS[i * 2 + 1]];
    console.log(`    Pair ${i}: E=[${eP[0].toFixed(4)}, ${eP[1].toFixed(4)}] V=[${vP[0].toFixed(4)}, ${vP[1].toFixed(4)}]`);
  });
}
console.log('');

// 5. IoM k=4 + Dynamic Magnitude
console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
console.log('│ 5. IoM k=4 + DYNAMIC MAGNITUDE (32 × 4 bits = 128 bits)                     │');
console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

const dynamicThresholds = calculateDynamicThresholds(enrollStats.absMaxValues);
console.log(`  Dynamic thresholds from enrollment |max| distribution:`);
console.log(`    Level 0→1 (25th %ile): ${dynamicThresholds[0].toFixed(4)}`);
console.log(`    Level 1→2 (50th %ile): ${dynamicThresholds[1].toFixed(4)}`);
console.log(`    Level 2→3 (75th %ile): ${dynamicThresholds[2].toFixed(4)}\n`);

const enrollIomMag = iomK4WithMagnitude(ENROLLMENT_PROJECTIONS, dynamicThresholds);
const verifyIomMag = iomK4WithMagnitude(VERIFICATION_PROJECTIONS, dynamicThresholds);

let idxMatches = 0, magMatches = 0, bothMatches = 0;
for (let i = 0; i < enrollIomMag.length; i++) {
  if (enrollIomMag[i].idx === verifyIomMag[i].idx) idxMatches++;
  if (enrollIomMag[i].mag === verifyIomMag[i].mag) magMatches++;
  if (enrollIomMag[i].idx === verifyIomMag[i].idx && enrollIomMag[i].mag === verifyIomMag[i].mag) bothMatches++;
}

console.log(`  Index match:     ${idxMatches}/${enrollIomMag.length} = ${(idxMatches / enrollIomMag.length * 100).toFixed(2)}%`);
console.log(`  Magnitude match: ${magMatches}/${enrollIomMag.length} = ${(magMatches / enrollIomMag.length * 100).toFixed(2)}%`);
console.log(`  Both match:      ${bothMatches}/${enrollIomMag.length} = ${(bothMatches / enrollIomMag.length * 100).toFixed(2)}%\n`);

// Show magnitude mismatches
const magMismatches: number[] = [];
for (let i = 0; i < enrollIomMag.length; i++) {
  if (enrollIomMag[i].mag !== verifyIomMag[i].mag) magMismatches.push(i);
}

if (magMismatches.length > 0) {
  console.log(`  ⚠️ Magnitude mismatches at groups: [${magMismatches.join(', ')}]`);
  console.log('  Details:');
  magMismatches.slice(0, 5).forEach(g => {
    const eMax = Math.max(...ENROLLMENT_PROJECTIONS.slice(g * 4, g * 4 + 4));
    const vMax = Math.max(...VERIFICATION_PROJECTIONS.slice(g * 4, g * 4 + 4));
    console.log(`    Group ${g}: E |max|=${Math.abs(eMax).toFixed(4)} → level ${enrollIomMag[g].mag}, V |max|=${Math.abs(vMax).toFixed(4)} → level ${verifyIomMag[g].mag}`);
  });
}
console.log('');

// 6. Compare with FIXED arbitrary thresholds
console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
console.log('│ 6. IoM k=4 + FIXED Magnitude (arbitrary thresholds: 0.05, 0.10, 0.20)       │');
console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

const fixedThresholds = [0.05, 0.10, 0.20];
const enrollIomMagFixed = iomK4WithMagnitude(ENROLLMENT_PROJECTIONS, fixedThresholds);
const verifyIomMagFixed = iomK4WithMagnitude(VERIFICATION_PROJECTIONS, fixedThresholds);

let magMatchesFixed = 0, bothMatchesFixed = 0;
for (let i = 0; i < enrollIomMagFixed.length; i++) {
  if (enrollIomMagFixed[i].mag === verifyIomMagFixed[i].mag) magMatchesFixed++;
  if (enrollIomMagFixed[i].idx === verifyIomMagFixed[i].idx && enrollIomMagFixed[i].mag === verifyIomMagFixed[i].mag) bothMatchesFixed++;
}

console.log(`  Magnitude match: ${magMatchesFixed}/${enrollIomMagFixed.length} = ${(magMatchesFixed / enrollIomMagFixed.length * 100).toFixed(2)}%`);
console.log(`  Both match:      ${bothMatchesFixed}/${enrollIomMagFixed.length} = ${(bothMatchesFixed / enrollIomMagFixed.length * 100).toFixed(2)}%\n`);

// 7. Summary Table
console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                         SUMMARY COMPARISON TABLE                              ║');
console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
console.log('║ Method                      │ Output  │ Match Rate │ Recommendation           ║');
console.log('╠═════════════════════════════╪═════════╪════════════╪══════════════════════════╣');
console.log(`║ Binary (sign threshold)     │ 128 bit │ ${binaryResult.rate.toFixed(1).padStart(6)}%    │ ❌ FAILING               ║`);
console.log(`║ IoM k=2                     │  64 bit │ ${iomK2Result.rate.toFixed(1).padStart(6)}%    │ ${iomK2Result.rate >= 95 ? '✅ GOOD' : '⚠️ UNSTABLE'}               ║`);
console.log(`║ IoM k=4                     │  64 bit │ ${iomK4Result.rate.toFixed(1).padStart(6)}%    │ ${iomK4Result.rate === 100 ? '✅ RECOMMENDED ★' : '⚠️ CHECK'}         ║`);
console.log(`║ IoM k=4 + Mag (dynamic)     │ 128 bit │ ${(bothMatches / 32 * 100).toFixed(1).padStart(6)}%    │ ${bothMatches === 32 ? '✅ IF NEED 128bit' : '⚠️ MAG UNSTABLE'}       ║`);
console.log(`║ IoM k=4 + Mag (fixed)       │ 128 bit │ ${(bothMatchesFixed / 32 * 100).toFixed(1).padStart(6)}%    │ ${bothMatchesFixed === 32 ? '✅ OK' : '⚠️ MAG UNSTABLE'}             ║`);
console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

// 8. Conclusion
console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
console.log('│ CONCLUSION                                                                   │');
console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

if (iomK4Result.rate === 100) {
  console.log('  ★ IoM k=4 (64 bits) achieves 100% match rate - RECOMMENDED');
  console.log('    - Ranking-based, no threshold boundaries to cross');
  console.log('    - 64 bits is sufficient entropy for biometric authentication');
} else {
  console.log('  ⚠️ IoM k=4 does not achieve 100% - investigate the mismatches');
}

if (magMatches < 32) {
  console.log(`\n  ⚠️ Magnitude levels are UNSTABLE (${32 - magMatches} mismatches)`);
  console.log('    - Even with dynamic thresholds, values near boundaries flip');
  console.log('    - Same fundamental problem as binary binarization');
  console.log('    - NOT recommended unless you need 128 bits');
}

console.log('\n');
