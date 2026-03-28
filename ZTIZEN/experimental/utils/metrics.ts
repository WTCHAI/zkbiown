/**
 * Statistical Metrics Library for ZTIZEN Uniqueness Proof
 *
 * Implements:
 * - ROC curve analysis
 * - Distance metrics (Euclidean, Hamming)
 * - Information theory (KL divergence, Mutual Information)
 * - Statistical tests (Chi-square, Spearman correlation)
 * - Biometric performance metrics (EER, AUC, TPR/FPR)
 */

// ============================================================================
// DISTANCE METRICS
// ============================================================================

/**
 * Cosine similarity between two vectors
 * Returns value in range [-1, 1], where 1 = identical direction
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    throw new Error('Vectors must have same length')
  }

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i]
    norm1 += v1[i] * v1[i]
    norm2 += v2[i] * v2[i]
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

/**
 * Euclidean distance between two vectors
 */
export function euclideanDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    throw new Error('Vectors must have same length')
  }

  let sumSquares = 0
  for (let i = 0; i < v1.length; i++) {
    sumSquares += Math.pow(v1[i] - v2[i], 2)
  }

  return Math.sqrt(sumSquares)
}

/**
 * Hamming distance between two integer arrays
 */
export function hammingDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    throw new Error('Vectors must have same length')
  }

  let distance = 0
  for (let i = 0; i < v1.length; i++) {
    if (v1[i] !== v2[i]) {
      distance++
    }
  }

  return distance
}

/**
 * Hamming similarity (1 - normalized distance)
 * Returns value in range [0, 1], where 1 = identical
 */
export function hammingSimilarity(v1: number[], v2: number[]): number {
  const distance = hammingDistance(v1, v2)
  return 1 - (distance / v1.length)
}

/**
 * Circuit-accurate match - EXACT same logic as Noir circuit
 * Matches ztizen_circuit_signmag128/src/main.nr lines 67-76
 *
 * The circuit counts exact positional matches (Hamming):
 *   if computed_commit[i] == auth_commit_stored[i] { match_count += 1; }
 *
 * @returns Object with matchCount, matchRate, and passed (threshold check)
 */
export function circuitMatch(t1: number[], t2: number[]): {
  matchCount: number
  matchRate: number
  passed: boolean
} {
  const CIRCUIT_THRESHOLD = 102 // 79.7% of 128, from circuit: global MATCH_THRESHOLD: Field = 102
  const TEMPLATE_LENGTH = 128

  if (t1.length !== t2.length) {
    throw new Error('Templates must have same length')
  }

  let matchCount = 0
  for (let i = 0; i < t1.length; i++) {
    if (t1[i] === t2[i]) matchCount++
  }

  return {
    matchCount,
    matchRate: matchCount / t1.length,
    passed: matchCount >= CIRCUIT_THRESHOLD
  }
}

/**
 * @deprecated Use hammingSimilarity() or circuitMatch() instead.
 *
 * This function gives partial credit for "close" codes, but the actual
 * Noir circuit uses EXACT matching only (Hamming distance).
 * Using this function produces ~95% similarity while the real system
 * reports ~80% because it uses strict Hamming matching.
 *
 * Weighted similarity for 9-level (0-8) quantized templates
 * Accounts for code proximity - adjacent Z-score bands are more similar.
 */
export function weightedSimilarity9Level(t1: number[], t2: number[]): number {
  if (t1.length !== t2.length) {
    throw new Error('Templates must have same length')
  }

  let totalScore = 0
  for (let i = 0; i < t1.length; i++) {
    const diff = Math.abs(t1[i] - t2[i])
    // Weighted scoring based on code distance
    // Max diff is 8 (code 0 vs code 8)
    if (diff === 0) totalScore += 1.0       // Exact match
    else if (diff === 1) totalScore += 0.75 // Adjacent code (same σ band)
    else if (diff === 2) totalScore += 0.5  // 2 codes apart
    else if (diff === 3) totalScore += 0.25 // 3 codes apart
    else totalScore += 0.0                   // 4+ codes apart (opposite extremes)
  }
  return totalScore / t1.length
}

// ============================================================================
// ROC CURVE ANALYSIS
// ============================================================================

export interface ROCPoint {
  threshold: number
  tpr: number  // True Positive Rate
  fpr: number  // False Positive Rate
}

export interface PairwiseComparison {
  person1: string
  capture1: string
  person2: string
  capture2: string
  rawEuclideanDistance: number
  binarizedHammingDistance: number
  binarizedSimilarity: number
  // Circuit-accurate matching (exact Hamming)
  matchCount: number          // Number of exact matches (0-128)
  matchRate: number           // matchCount / 128
  circuitPassed: boolean      // matchCount >= 102 (circuit threshold)
  isGenuinePair: boolean
}

/**
 * Compute ROC curve from pairwise comparisons
 *
 * @param pairs - Array of pairwise comparisons
 * @param metricField - Which metric to use for thresholding
 * @param isDistanceMetric - true if lower = more similar (distance), false if higher = more similar (similarity)
 */
export function computeROC(
  pairs: PairwiseComparison[],
  metricField: 'rawEuclideanDistance' | 'binarizedHammingDistance' | 'matchRate',
  isDistanceMetric: boolean = true
): ROCPoint[] {
  // Get all unique thresholds
  const allValues = pairs.map(p => p[metricField])
  const uniqueThresholds = [...new Set(allValues)].sort((a, b) => a - b)

  const rocPoints: ROCPoint[] = []

  for (const threshold of uniqueThresholds) {
    let tp = 0, fp = 0, tn = 0, fn = 0

    for (const pair of pairs) {
      const value = pair[metricField]
      // For distance: predict match if value <= threshold (lower = more similar)
      // For similarity: predict match if value >= threshold (higher = more similar)
      const predictedMatch = isDistanceMetric ? (value <= threshold) : (value >= threshold)
      const actualMatch = pair.isGenuinePair

      if (predictedMatch && actualMatch) tp++
      else if (predictedMatch && !actualMatch) fp++
      else if (!predictedMatch && !actualMatch) tn++
      else fn++
    }

    const tpr = (tp + fn) > 0 ? tp / (tp + fn) : 0  // Sensitivity (True Positive Rate)
    const fpr = (fp + tn) > 0 ? fp / (fp + tn) : 0  // 1 - Specificity (False Positive Rate)

    rocPoints.push({ threshold, tpr, fpr })
  }

  return rocPoints
}

/**
 * Compute Area Under Curve (AUC) using trapezoidal rule
 */
export function computeAUC(rocPoints: ROCPoint[]): number {
  // Sort by FPR
  const sorted = [...rocPoints].sort((a, b) => a.fpr - b.fpr)

  let auc = 0
  for (let i = 1; i < sorted.length; i++) {
    const dx = sorted[i].fpr - sorted[i - 1].fpr
    const avgY = (sorted[i].tpr + sorted[i - 1].tpr) / 2
    auc += dx * avgY
  }

  return auc
}

/**
 * Find Equal Error Rate (EER) - where TPR = 1 - FPR
 */
export function findEER(rocPoints: ROCPoint[]): number {
  let minDiff = Infinity
  let eer = 0

  for (const point of rocPoints) {
    const diff = Math.abs(point.tpr - (1 - point.fpr))
    if (diff < minDiff) {
      minDiff = diff
      eer = point.fpr
    }
  }

  return eer
}

/**
 * Find TPR at a specific FPR threshold
 */
export function findTPRatFPR(rocPoints: ROCPoint[], targetFPR: number): number {
  // Sort by FPR
  const sorted = [...rocPoints].sort((a, b) => a.fpr - b.fpr)

  // Find closest FPR to target
  let closestIdx = 0
  let minDiff = Infinity

  for (let i = 0; i < sorted.length; i++) {
    const diff = Math.abs(sorted[i].fpr - targetFPR)
    if (diff < minDiff) {
      minDiff = diff
      closestIdx = i
    }
  }

  return sorted[closestIdx].tpr
}

// ============================================================================
// SIMILARITY ANALYSIS
// ============================================================================

/**
 * Compute all pairwise template similarities
 */
export function computePairwiseSimilarities(templates: number[][]): number[] {
  const similarities: number[] = []

  for (let i = 0; i < templates.length; i++) {
    for (let j = i + 1; j < templates.length; j++) {
      const sim = hammingSimilarity(templates[i], templates[j])
      similarities.push(sim)
    }
  }

  return similarities
}

// ============================================================================
// INFORMATION THEORY
// ============================================================================

/**
 * Kullback-Leibler divergence between two probability distributions
 */
export function computeKLDivergence(p: number[], q: number[]): number {
  if (p.length !== q.length) {
    throw new Error('Distributions must have same length')
  }

  let kl = 0
  const epsilon = 1e-10 // Avoid log(0)

  for (let i = 0; i < p.length; i++) {
    if (p[i] > epsilon) {
      kl += p[i] * Math.log((p[i] + epsilon) / (q[i] + epsilon))
    }
  }

  return kl
}

/**
 * Mutual Information between continuous projections and discrete codes
 * I(Y; T) = H(T) - H(T|Y)
 */
export function computeMutualInformation(
  projections: number[],
  codes: number[]
): number {
  if (projections.length !== codes.length) {
    throw new Error('Projections and codes must have same length')
  }

  // Compute entropy of codes H(T)
  const codeFreq = new Array(9).fill(0)
  for (const code of codes) {
    codeFreq[code]++
  }
  const codeDist = codeFreq.map(count => count / codes.length)

  const entropyT = -codeDist.reduce((sum, p) => {
    if (p > 0) sum += p * Math.log2(p)
    return sum
  }, 0)

  // Compute conditional entropy H(T|Y) using discretized projections
  // Discretize projections into bins
  const numBins = 20
  const minProj = Math.min(...projections)
  const maxProj = Math.max(...projections)
  const binWidth = (maxProj - minProj) / numBins

  const jointCounts: number[][] = Array(numBins).fill(0).map(() => Array(9).fill(0))
  const binCounts = new Array(numBins).fill(0)

  for (let i = 0; i < projections.length; i++) {
    const binIdx = Math.min(numBins - 1, Math.floor((projections[i] - minProj) / binWidth))
    jointCounts[binIdx][codes[i]]++
    binCounts[binIdx]++
  }

  // Compute H(T|Y)
  let conditionalEntropy = 0
  for (let b = 0; b < numBins; b++) {
    if (binCounts[b] === 0) continue

    const pBin = binCounts[b] / projections.length

    let entropyGivenBin = 0
    for (let c = 0; c < 9; c++) {
      const pCodeGivenBin = jointCounts[b][c] / binCounts[b]
      if (pCodeGivenBin > 0) {
        entropyGivenBin -= pCodeGivenBin * Math.log2(pCodeGivenBin)
      }
    }

    conditionalEntropy += pBin * entropyGivenBin
  }

  // Mutual information
  const mutualInfo = entropyT - conditionalEntropy

  return mutualInfo
}

// ============================================================================
// STATISTICAL TESTS
// ============================================================================

/**
 * Chi-square goodness of fit test
 */
export function chiSquareTest(
  observed: number[],
  expected: number[]
): { statistic: number; pValue: number } {
  if (observed.length !== expected.length) {
    throw new Error('Observed and expected must have same length')
  }

  let chiSquare = 0
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] > 0) {
      chiSquare += Math.pow(observed[i] - expected[i], 2) / expected[i]
    }
  }

  // Degrees of freedom
  const df = observed.length - 1

  // Approximate p-value using chi-square CDF
  const pValue = 1 - chiSquareCDF(chiSquare, df)

  return { statistic: chiSquare, pValue }
}

/**
 * Approximate chi-square CDF (cumulative distribution function)
 */
function chiSquareCDF(x: number, df: number): number {
  // Use gamma function approximation for chi-square CDF
  // This is a simplified approximation
  if (x < 0) return 0
  if (x === 0) return 0

  // Use normal approximation for large df
  if (df > 30) {
    const mean = df
    const std = Math.sqrt(2 * df)
    const z = (x - mean) / std
    return normalCDF(z)
  }

  // Use series expansion for small df
  let sum = 0
  let term = 1
  for (let k = 0; k < 100; k++) {
    sum += term
    term *= x / (2 * (k + 1))
    if (term < 1e-10) break
  }

  return 1 - Math.exp(-x / 2) * sum / Math.pow(2, df / 2) / gamma(df / 2)
}

/**
 * Approximate gamma function
 */
function gamma(z: number): number {
  // Stirling's approximation
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  }

  z -= 1
  const g = 7
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ]

  let x = c[0]
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i)
  }

  const t = z + g + 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x
}

/**
 * Normal CDF (cumulative distribution function)
 */
function normalCDF(z: number): number {
  // Use error function approximation
  return 0.5 * (1 + erf(z / Math.sqrt(2)))
}

/**
 * Error function approximation
 */
function erf(x: number): number {
  // Abramowitz and Stegun approximation
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)

  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return sign * y
}

/**
 * Spearman rank correlation coefficient
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length) {
    throw new Error('Arrays must have same length')
  }

  const n = x.length

  // Convert to ranks
  const rankX = getRanks(x)
  const rankY = getRanks(y)

  // Compute sum of squared differences
  let sumSquaredDiff = 0
  for (let i = 0; i < n; i++) {
    sumSquaredDiff += Math.pow(rankX[i] - rankY[i], 2)
  }

  // Spearman's rho
  const rho = 1 - (6 * sumSquaredDiff) / (n * (n * n - 1))

  return rho
}

/**
 * Convert array to ranks
 */
function getRanks(arr: number[]): number[] {
  const sorted = arr.map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val)

  const ranks = new Array(arr.length)

  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i].idx] = i + 1
  }

  return ranks
}

// ============================================================================
// FISHER DISCRIMINANT
// ============================================================================

export interface PipelineData {
  personId: string
  projections: number[]
  template: number[]
}

/**
 * Compute Fisher discriminant score
 * Fisher = (Between-class variance) / (Within-class variance)
 *
 * Higher Fisher score = better class separability
 * Fisher > 1.0 indicates good discrimination between classes
 */
export function computeFisherScore(
  allData: PipelineData[],
  numPeople: number
): number {
  // Guard against empty data
  if (allData.length === 0 || numPeople <= 1) {
    return 0
  }

  // Compute global mean
  let globalSum = 0
  let totalCount = 0

  for (const data of allData) {
    if (!data.projections || data.projections.length === 0) continue
    for (const val of data.projections) {
      if (isFinite(val)) {
        globalSum += val
        totalCount++
      }
    }
  }

  if (totalCount === 0) return 0
  const globalMean = globalSum / totalCount

  // Compute between-class variance
  let betweenClassVariance = 0

  for (let p = 0; p < numPeople; p++) {
    const personData = allData.filter(d => d.personId === `P${p}`)
    if (personData.length === 0) continue

    // Class mean
    let classSum = 0
    let classCount = 0
    for (const data of personData) {
      if (!data.projections) continue
      for (const val of data.projections) {
        if (isFinite(val)) {
          classSum += val
          classCount++
        }
      }
    }
    if (classCount === 0) continue
    const classMean = classSum / classCount

    // Add to between-class variance
    betweenClassVariance += classCount * Math.pow(classMean - globalMean, 2)
  }

  if (numPeople <= 1) return 0
  betweenClassVariance /= (numPeople - 1)

  // Compute within-class variance
  let withinClassVariance = 0

  for (let p = 0; p < numPeople; p++) {
    const personData = allData.filter(d => d.personId === `P${p}`)
    if (personData.length === 0) continue

    // Class mean
    let classSum = 0
    let classCount = 0
    for (const data of personData) {
      if (!data.projections) continue
      for (const val of data.projections) {
        if (isFinite(val)) {
          classSum += val
          classCount++
        }
      }
    }
    if (classCount === 0) continue
    const classMean = classSum / classCount

    // Add to within-class variance
    for (const data of personData) {
      if (!data.projections) continue
      for (const val of data.projections) {
        if (isFinite(val)) {
          withinClassVariance += Math.pow(val - classMean, 2)
        }
      }
    }
  }

  const denominator = totalCount - numPeople
  if (denominator <= 0) return 0
  withinClassVariance /= denominator

  // Fisher score (guard against division by zero)
  if (withinClassVariance === 0) return Infinity
  const fisher = betweenClassVariance / withinClassVariance

  return isFinite(fisher) ? fisher : 0
}

// ============================================================================
// RECONSTRUCTION AND QUANTIZATION
// ============================================================================

/**
 * Theoretical code distribution from N(0,1)
 */
export function theoreticalCodeDistribution(): number[] {
  // Based on Z-score thresholds:
  // Code 0,8: |z| ≥ 2.0    (4.6% each)
  // Code 1,7: 1.5 ≤ |z| < 2.0  (8.5% each)
  // Code 2,6: 1.0 ≤ |z| < 1.5  (13.6% each)
  // Code 3,5: 0.5 ≤ |z| < 1.0  (24.2% each)
  // Code 4: |z| < 0.5    (38.3%)

  return [
    0.023,  // Code 0 (z ≤ -2.0): 2.3%
    0.044,  // Code 1 (-2.0 < z ≤ -1.5): 4.4%
    0.092,  // Code 2 (-1.5 < z ≤ -1.0): 9.2%
    0.150,  // Code 3 (-1.0 < z ≤ -0.5): 15.0%
    0.383,  // Code 4 (-0.5 < z < 0.5): 38.3%
    0.150,  // Code 5 (0.5 ≤ z < 1.0): 15.0%
    0.092,  // Code 6 (1.0 ≤ z < 1.5): 9.2%
    0.044,  // Code 7 (1.5 ≤ z < 2.0): 4.4%
    0.023   // Code 8 (z ≥ 2.0): 2.3%
  ]
}

/**
 * Dequantize template codes back to approximate Z-scores
 */
export function dequantizeTemplate(template: number[]): number[] {
  const dequantized = new Array(template.length)

  // Map codes to representative Z-scores
  const codeToZScore: { [key: number]: number } = {
    0: -2.25,  // z ≤ -2.0
    1: -1.75,  // -2.0 < z ≤ -1.5
    2: -1.25,  // -1.5 < z ≤ -1.0
    3: -0.75,  // -1.0 < z ≤ -0.5
    4: 0.0,    // -0.5 < z < 0.5
    5: 0.75,   // 0.5 ≤ z < 1.0
    6: 1.25,   // 1.0 ≤ z < 1.5
    7: 1.75,   // 1.5 ≤ z < 2.0
    8: 2.25    // z ≥ 2.0
  }

  for (let i = 0; i < template.length; i++) {
    dequantized[i] = codeToZScore[template[i]]
  }

  return dequantized
}

/**
 * Mean Squared Error between two arrays
 */
export function meanSquaredError(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length) {
    throw new Error('Arrays must have same length')
  }

  let sumSquares = 0
  for (let i = 0; i < actual.length; i++) {
    sumSquares += Math.pow(actual[i] - predicted[i], 2)
  }

  return sumSquares / actual.length
}

// ============================================================================
// FRÉCHET INCEPTION DISTANCE (FID)
// ============================================================================

/**
 * Compute mean of an array
 */
function mean(arr: number[]): number {
  return arr.reduce((sum, val) => sum + val, 0) / arr.length
}

/**
 * Compute standard deviation of an array
 */
function standardDeviation(arr: number[]): number {
  const mu = mean(arr)
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mu, 2), 0) / arr.length
  return Math.sqrt(variance)
}

/**
 * Fréchet Inception Distance (FID) for 1D projection distributions
 *
 * Full FID formula: FID = ||μ₁ - μ₂||² + Tr(Σ₁ + Σ₂ - 2√(Σ₁·Σ₂))
 *
 * For 1D projections, this simplifies to:
 * FID = (μ₁ - μ₂)² + (σ₁ - σ₂)²
 *
 * Lower FID = more similar distributions
 * - Intra-person FID should be LOW (same person, similar projections)
 * - Inter-person FID should be HIGH (different people, different projections)
 */
export function computeFID(projections1: number[], projections2: number[]): number {
  // Guard against empty arrays
  if (!projections1 || projections1.length === 0 ||
      !projections2 || projections2.length === 0) {
    return 0
  }

  // Filter out non-finite values
  const valid1 = projections1.filter(v => isFinite(v))
  const valid2 = projections2.filter(v => isFinite(v))

  if (valid1.length === 0 || valid2.length === 0) {
    return 0
  }

  const mu1 = mean(valid1)
  const mu2 = mean(valid2)
  const sigma1 = standardDeviation(valid1)
  const sigma2 = standardDeviation(valid2)

  // Simplified 1D FID
  const meanDiff = Math.pow(mu1 - mu2, 2)
  const stdDiff = Math.pow(sigma1 - sigma2, 2)

  const fid = meanDiff + stdDiff
  return isFinite(fid) ? fid : 0
}

/**
 * Compute FID between two sets of projection vectors
 * Aggregates across all dimensions
 */
export function computeMultiDimFID(
  projections1: number[][],
  projections2: number[][]
): number {
  if (projections1.length === 0 || projections2.length === 0) {
    return Infinity
  }

  const dim = projections1[0].length

  // Compute mean vector for each set
  const mean1 = new Array(dim).fill(0)
  const mean2 = new Array(dim).fill(0)

  for (const proj of projections1) {
    for (let d = 0; d < dim; d++) {
      mean1[d] += proj[d]
    }
  }
  for (let d = 0; d < dim; d++) {
    mean1[d] /= projections1.length
  }

  for (const proj of projections2) {
    for (let d = 0; d < dim; d++) {
      mean2[d] += proj[d]
    }
  }
  for (let d = 0; d < dim; d++) {
    mean2[d] /= projections2.length
  }

  // Compute mean squared difference
  let meanDiffSquared = 0
  for (let d = 0; d < dim; d++) {
    meanDiffSquared += Math.pow(mean1[d] - mean2[d], 2)
  }

  // Compute variance for each dimension and sum differences
  let varianceDiff = 0
  for (let d = 0; d < dim; d++) {
    let var1 = 0, var2 = 0
    for (const proj of projections1) {
      var1 += Math.pow(proj[d] - mean1[d], 2)
    }
    var1 /= projections1.length

    for (const proj of projections2) {
      var2 += Math.pow(proj[d] - mean2[d], 2)
    }
    var2 /= projections2.length

    varianceDiff += Math.pow(Math.sqrt(var1) - Math.sqrt(var2), 2)
  }

  return meanDiffSquared + varianceDiff
}

// ============================================================================
// D-PRIME (DISCRIMINABILITY INDEX)
// ============================================================================

/**
 * Compute d-prime (d') - a measure of the separation between two distributions
 *
 * Formula: d' = (μ_genuine - μ_impostor) / σ_pooled
 * where σ_pooled = √((σ_genuine² + σ_impostor²) / 2)
 *
 * Interpretation:
 * - d' > 3.0: Excellent separation (FAR/FRR << 1%)
 * - d' > 2.0: Good separation
 * - d' > 1.0: Moderate separation
 * - d' < 1.0: Poor separation
 *
 * @param genuineScores - Array of genuine (same-person) match scores
 * @param impostorScores - Array of impostor (different-person) match scores
 * @returns d-prime value
 */
export function computeDPrime(genuineScores: number[], impostorScores: number[]): number {
  if (genuineScores.length === 0 || impostorScores.length === 0) {
    return 0
  }

  // Compute means
  const genuineMean = genuineScores.reduce((a, b) => a + b, 0) / genuineScores.length
  const impostorMean = impostorScores.reduce((a, b) => a + b, 0) / impostorScores.length

  // Compute standard deviations
  const genuineVariance = genuineScores.reduce((sum, x) => sum + Math.pow(x - genuineMean, 2), 0) / genuineScores.length
  const impostorVariance = impostorScores.reduce((sum, x) => sum + Math.pow(x - impostorMean, 2), 0) / impostorScores.length

  const genuineStd = Math.sqrt(genuineVariance)
  const impostorStd = Math.sqrt(impostorVariance)

  // Pooled standard deviation
  const pooledStd = Math.sqrt((genuineVariance + impostorVariance) / 2)

  if (pooledStd === 0) {
    return genuineMean === impostorMean ? 0 : Infinity
  }

  return (genuineMean - impostorMean) / pooledStd
}

// ============================================================================
// SECURITY MARGIN
// ============================================================================

/**
 * Compute security margin - the gap between the decision threshold and the maximum impostor score
 *
 * Security Margin = threshold - max(impostor_scores)
 *
 * Interpretation:
 * - Positive: Impostors are below threshold by this many units
 * - Zero: At least one impostor exactly hits the threshold
 * - Negative: Impostors exceed the threshold (security breach)
 *
 * For biometric systems:
 * - Margin > 10: Comfortable buffer
 * - Margin > 5: Acceptable
 * - Margin < 5: Tight security
 * - Margin < 0: Security risk
 *
 * @param impostorScores - Array of impostor match scores
 * @param threshold - Decision threshold for acceptance
 * @returns Security margin value
 */
export function computeSecurityMargin(impostorScores: number[], threshold: number): number {
  if (impostorScores.length === 0) {
    return threshold // No impostors means full margin
  }

  const maxImpostor = Math.max(...impostorScores)
  return threshold - maxImpostor
}

// ============================================================================
// FALSE ACCEPT/REJECT RATES
// ============================================================================

/**
 * Compute FAR (False Accept Rate) at a given threshold
 *
 * FAR = (number of impostors accepted) / (total impostors)
 *
 * For match scores where higher = more similar:
 * FAR counts impostors with score >= threshold
 *
 * @param impostorScores - Array of impostor match scores
 * @param threshold - Decision threshold
 * @returns FAR as a value between 0 and 1
 */
export function computeFAR(impostorScores: number[], threshold: number): number {
  if (impostorScores.length === 0) return 0
  const accepted = impostorScores.filter(score => score >= threshold).length
  return accepted / impostorScores.length
}

/**
 * Compute FRR (False Reject Rate) at a given threshold
 *
 * FRR = (number of genuine rejected) / (total genuine)
 *
 * For match scores where higher = more similar:
 * FRR counts genuine with score < threshold
 *
 * @param genuineScores - Array of genuine match scores
 * @param threshold - Decision threshold
 * @returns FRR as a value between 0 and 1
 */
export function computeFRR(genuineScores: number[], threshold: number): number {
  if (genuineScores.length === 0) return 0
  const rejected = genuineScores.filter(score => score < threshold).length
  return rejected / genuineScores.length
}

/**
 * Compute GAR (Genuine Accept Rate) at a given threshold
 *
 * GAR = (number of genuine accepted) / (total genuine) = 1 - FRR
 *
 * @param genuineScores - Array of genuine match scores
 * @param threshold - Decision threshold
 * @returns GAR as a value between 0 and 1
 */
export function computeGAR(genuineScores: number[], threshold: number): number {
  return 1 - computeFRR(genuineScores, threshold)
}

// ============================================================================
// STANDARD BIOMETRIC METRICS (Per Patel et al.)
// ============================================================================

export interface BiometricMetrics {
  // Basic rates at operating threshold
  gar: number           // Genuine Accept Rate = TP / (TP + FN)
  far: number           // False Accept Rate = FP / (FP + TN)
  frr: number           // False Rejection Rate = 1 - GAR

  // EER computation
  eer: number           // Equal Error Rate (where FAR ≈ FRR)
  eerThreshold: number  // Threshold at EER

  // AUC
  auc: number           // Area Under ROC Curve

  // Distribution statistics
  genuineMean: number
  genuineStd: number
  impostorMean: number
  impostorStd: number

  // Separation metrics
  dPrime: number        // d' = (μ_genuine - μ_impostor) / σ_pooled
  securityMargin: number // threshold - max(impostor)
}

/**
 * Compute EER (Equal Error Rate) by threshold sweep
 *
 * EER is the point where FAR = FRR
 * Lower EER = Better biometric system
 *
 * Reference: Patel et al., "Cancelable Biometrics: A Review"
 *
 * @param genuineScores - Array of genuine (same-person) match scores
 * @param impostorScores - Array of impostor (different-person) match scores
 * @returns Object with EER value and the threshold at which it occurs
 */
export function computeEER(
  genuineScores: number[],
  impostorScores: number[]
): { eer: number; threshold: number } {
  if (genuineScores.length === 0 || impostorScores.length === 0) {
    return { eer: 0, threshold: 0 }
  }

  // For large datasets, use percentile-based thresholds instead of all unique values
  // This prevents memory issues with millions of pairs
  const allScores = [...genuineScores, ...impostorScores]
  allScores.sort((a, b) => a - b)

  // Sample at most 1000 thresholds evenly across the score range
  const maxThresholds = 1000
  let thresholds: number[]
  if (allScores.length <= maxThresholds) {
    thresholds = [...new Set(allScores)]
  } else {
    thresholds = []
    const step = Math.floor(allScores.length / maxThresholds)
    for (let i = 0; i < allScores.length; i += step) {
      thresholds.push(allScores[i])
    }
    // Ensure we include the last value
    if (thresholds[thresholds.length - 1] !== allScores[allScores.length - 1]) {
      thresholds.push(allScores[allScores.length - 1])
    }
  }

  let minDiff = Infinity
  let eerThreshold = 0
  let eerValue = 0

  for (const threshold of thresholds) {
    // FAR: impostor scores >= threshold (incorrectly accepted)
    const far = impostorScores.filter(s => s >= threshold).length / impostorScores.length

    // FRR: genuine scores < threshold (incorrectly rejected)
    const frr = genuineScores.filter(s => s < threshold).length / genuineScores.length

    const diff = Math.abs(far - frr)
    if (diff < minDiff) {
      minDiff = diff
      eerThreshold = threshold
      eerValue = (far + frr) / 2  // Average when FAR ≈ FRR
    }
  }

  return { eer: eerValue, threshold: eerThreshold }
}

/**
 * Compute all standard biometric metrics at once
 *
 * This is the main function to call for comprehensive biometric evaluation.
 * Computes GAR, FAR, FRR, EER, AUC, d-prime, and security margin.
 *
 * @param genuineScores - Match scores for genuine (same-person) pairs
 * @param impostorScores - Match scores for impostor (different-person) pairs
 * @param operatingThreshold - The decision threshold (e.g., 102/128 = 0.797)
 * @returns Complete BiometricMetrics object
 */
export function computeAllBiometricMetrics(
  genuineScores: number[],
  impostorScores: number[],
  operatingThreshold: number
): BiometricMetrics {
  // Basic rates at operating threshold
  const frr = computeFRR(genuineScores, operatingThreshold)
  const gar = 1 - frr
  const far = computeFAR(impostorScores, operatingThreshold)

  // EER computation
  const { eer, threshold: eerThreshold } = computeEER(genuineScores, impostorScores)

  // Distribution statistics
  const genuineMean = genuineScores.length > 0
    ? genuineScores.reduce((a, b) => a + b, 0) / genuineScores.length
    : 0
  const impostorMean = impostorScores.length > 0
    ? impostorScores.reduce((a, b) => a + b, 0) / impostorScores.length
    : 0

  const genuineVariance = genuineScores.length > 0
    ? genuineScores.reduce((sum, x) => sum + Math.pow(x - genuineMean, 2), 0) / genuineScores.length
    : 0
  const impostorVariance = impostorScores.length > 0
    ? impostorScores.reduce((sum, x) => sum + Math.pow(x - impostorMean, 2), 0) / impostorScores.length
    : 0

  const genuineStd = Math.sqrt(genuineVariance)
  const impostorStd = Math.sqrt(impostorVariance)

  // d-prime
  const dPrime = computeDPrime(genuineScores, impostorScores)

  // Security margin
  const securityMargin = computeSecurityMargin(impostorScores, operatingThreshold)

  // AUC computation (using match rate as score, higher = more similar)
  let auc = 0
  if (genuineScores.length > 0 && impostorScores.length > 0) {
    // Mann-Whitney U statistic approach
    for (const g of genuineScores) {
      for (const im of impostorScores) {
        if (g > im) auc += 1
        else if (g === im) auc += 0.5
      }
    }
    auc /= (genuineScores.length * impostorScores.length)
  }

  return {
    gar,
    far,
    frr,
    eer,
    eerThreshold,
    auc,
    genuineMean,
    genuineStd,
    impostorMean,
    impostorStd,
    dPrime,
    securityMargin
  }
}
