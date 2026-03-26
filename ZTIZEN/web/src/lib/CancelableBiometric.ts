/**
 * Cancelable Biometric Class
 *
 * Implementation of cancelable biometric template generation using
 * BioHashing with Gaussian Random Projection + Gram-Schmidt Orthogonalization,
 * combined with novel Self-normalizing Z-score Quantization (SZQ).
 *
 * Paper References:
 * - "Random Multispace Quantization as an Analytic Mechanism for BioHashing"
 *   (Teoh, Ngo, Goh - IEEE TPAMI 2006) - Gaussian + Gram-Schmidt projection
 * - "BioHashing: Two factor authentication featuring fingerprint data and tokenised random number"
 *   (Teoh, Ngo, Goh - Pattern Recognition 2004) - Original BioHashing concept
 *
 * Novel Contributions (ZK-BIOWN):
 * - Three-party key derivation (Product + ZTIZEN + User keys)
 * - Self-normalizing Z-score Quantization (SZQ) - 9-level σ-based bins
 * - Browser-native ZK integration with Poseidon Hash
 *
 * This class provides:
 * - Gaussian random projection with Gram-Schmidt orthogonalization (BioHashing)
 * - Cryptographically secure PRNG (SHA-256 based)
 * - SZQ: Self-normalizing quantization (no helper data required)
 * - Security features (revocability, non-invertibility, cancelability)
 */

import { useMetricsStore, METRIC_OPERATIONS } from '@/stores/useMetricsStore';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Algorithm type for projection matrix generation
 *
 * - 'biohashing': Gaussian + Gram-Schmidt (Teoh et al. 2006) - for binary templates
 * - 'sparse-szq': Sparse Ternary (Achlioptas 2003) - for multi-level SZQ templates
 *
 * Legacy alias 'gaussian-sparse' maps to 'biohashing' for backwards compatibility
 */
export type AlgorithmType = 'biohashing' | 'sparse-szq' | 'gaussian-sparse';

/**
 * Paper Reference for academic citation
 */
export interface PaperReference {
  title: string;
  authors: string;
  institution: string;
  year: number;
  keyProperty: string;
  doi?: string;
}

/**
 * Academic paper references for the algorithm
 */
export const ALGORITHM_PAPERS: Record<AlgorithmType, PaperReference[]> = {
  'biohashing': [
    {
      title: 'Random Multispace Quantization as an Analytic Mechanism for BioHashing',
      authors: 'Teoh, A.B.J., Ngo, D.C.L., Goh, A.',
      institution: 'Multimedia University, Malaysia',
      year: 2006,
      keyProperty: 'Gaussian projection + Gram-Schmidt orthogonalization for orthonormal basis',
      doi: '10.1109/TPAMI.2006.250',
    },
    {
      title: 'BioHashing: Two factor authentication featuring fingerprint data and tokenised random number',
      authors: 'Teoh, A.B.J., Ngo, D.C.L., Goh, A.',
      institution: 'Multimedia University, Malaysia',
      year: 2004,
      keyProperty: 'Original two-factor cancelable biometrics using random projections',
      doi: '10.1016/j.patcog.2004.05.024',
    },
  ],
  'sparse-szq': [
    {
      title: 'Database-friendly random projections: Johnson-Lindenstrauss with binary coins',
      authors: 'Achlioptas, D.',
      institution: 'Microsoft Research',
      year: 2003,
      keyProperty: 'Sparse ternary projection {-1, 0, +1} with 2/3 sparsity',
      doi: '10.1016/S0022-0000(03)00025-4',
    },
    {
      title: 'Sectored Random Projections for Cancelable Iris Biometrics',
      authors: 'Pillai, J.K., Patel, V.M., Chellappa, R., Ratha, N.K.',
      institution: 'University of Maryland',
      year: 2011,
      keyProperty: 'Sparse random projection for cancelable biometrics',
      doi: '10.1109/ICASSP.2011.5946608',
    },
  ],
  // Legacy alias for backwards compatibility
  'gaussian-sparse': [
    {
      title: 'Random Multispace Quantization as an Analytic Mechanism for BioHashing',
      authors: 'Teoh, A.B.J., Ngo, D.C.L., Goh, A.',
      institution: 'Multimedia University, Malaysia',
      year: 2006,
      keyProperty: 'Gaussian projection + Gram-Schmidt orthogonalization for orthonormal basis',
      doi: '10.1109/TPAMI.2006.250',
    },
  ],
};

export interface BiometricConfig {
  // Algorithm selection (only gaussian-sparse supported)
  algorithm: AlgorithmType;

  // Dimension configuration
  inputDim: number;           // Input biometric dimension (e.g., 128 for face-api.js descriptor)
  outputDim?: number;         // Output dimension (default: 128 for ZK circuit)

  // Key configuration (3-key mechanism)
  productKey: string;         // Product-specific key
  ztizenKey: string;          // ZTIZEN credential key
  userKey: Uint8Array;        // User-specific key (32 bytes from wallet signature)
  version?: number;           // Version for revocability (default: 1)

  // Algorithm-specific parameters
  params?: {
    /** Distortion tolerance ε for JL lemma (default: 0.15 = ±15% distance preservation) */
    epsilon?: number;
    /** Sparsity level for sparse projection (default: 2/3) */
    sparsity?: number;
    /**
     * SZQ step size in σ units for variable-bin quantization.
     * Determines the bin boundaries as multiples of stepSize × σ.
     *
     * Recommended values (from sweet_spot_finding.json):
     * - face-api.js (128D): stepSize=0.8 → 9 bins (GAR=100%, FAR=4.4%)
     * - FaceNet (128D): stepSize=1.2 → 7 bins (GAR=92%, FAR=0%)
     * - FaceNet512 (512D): stepSize=1.2 → 7 bins (GAR=88%, FAR=0%)
     * - ArcFace (512D): stepSize=1.4 → 7 bins (GAR=87%, FAR=0%)
     *
     * Default: 0.8 (9 bins, good for face-api.js 128D)
     *
     * Bin formula: thresholds = [stepSize×1σ, stepSize×2σ, stepSize×3σ, ...]
     * Coverage: ±3σ from mean
     */
    stepSize?: number;
    /**
     * @deprecated Use stepSize instead. thresholdScale is kept for backwards compatibility.
     * If both are set, stepSize takes precedence.
     */
    thresholdScale?: number;
  };
}

export interface BiometricTemplate {
  // Template data
  template: number[];         // Binary template (array of 0/1)
  templateBytes: Uint8Array;  // Packed bytes

  // Original data
  biometric: number[];        // Original biometric vector

  // Metadata
  algorithm: AlgorithmType;
  config: BiometricConfig;
  timestamp: number;

  // Intermediate data (for debugging/analysis)
  intermediate?: {
    projectionMatrix?: number[][];  // Sparse projection matrix
    projections?: number[];         // Projected values before binarization
  };
}

export interface MatchResult {
  isMatch: boolean;
  matchRate: number;          // Percentage (0-100)
  hammingDistance: number;
  threshold: number;          // Threshold used
  details?: {
    bitMatches: number;
    bitDifferences: number;
    templateLength: number;
  };
}

// =============================================================================
// 3-DIGIT BINARIZATION TYPES (ZK BiOwn)
// =============================================================================

/**
 * 3-Digit Encoded Dimension
 *
 * Encoding scheme: [sign_digit][magnitude_2_digits]
 * - Sign: 1 = positive (value >= 0), 0 = negative (value < 0)
 * - Magnitude: Round(|value| × 100), clamped to 0-99
 *
 * Examples:
 *   +0.073 → sign=1, magnitude=7  → "107"
 *   -0.147 → sign=0, magnitude=15 → "015"
 *   -0.009 → sign=0, magnitude=1  → "001"
 *   +0.257 → sign=1, magnitude=26 → "126"
 *   +0.003 → sign=1, magnitude=0  → "100"
 *
 * Binary representation: 8 bits per dimension
 * - Sign: 1 bit
 * - Magnitude (0-99): 7 bits (2^7 = 128 covers 0-99)
 * - Total: 8 bits × 128 dimensions = 1024 bits = 128 bytes
 */
export interface EncodedDimension {
  sign: 0 | 1;           // 0 = negative, 1 = positive
  magnitude: number;      // 0-99 (rounded |value| × 100)
  raw: number;           // Original projection value for debugging
}

/**
 * Configuration for tolerance-based matching
 *
 * Biometric noise handling:
 * - magnitudeThreshold: If magnitude < threshold, sign is unstable (ignore sign mismatch)
 * - magnitudeTolerance: Allow ±tolerance difference in magnitude
 * - maxFailures: Maximum dimensions that can fail and still pass verification
 */
export interface ThreeDigitMatchConfig {
  /** Magnitude below which sign is considered unstable (default: 5 = |value| < 0.05) */
  magnitudeThreshold: number;
  /** Allowed magnitude difference (default: 5 = ±0.05) */
  magnitudeTolerance: number;
  /** Maximum failed dimensions (default: 12 = ~90% must pass) */
  maxFailures: number;
}

/**
 * Default matching configuration for 3-digit encoding
 * Tuned for face-api.js 128D embeddings with typical projection ranges of ±0.30
 */
export const DEFAULT_3DIGIT_CONFIG: ThreeDigitMatchConfig = {
  magnitudeThreshold: 5,   // |value| < 0.05 considered unstable
  magnitudeTolerance: 5,   // Allow ±0.05 magnitude difference
  maxFailures: 12          // ~90% dimensions must pass
};

/**
 * Stricter configuration for higher security
 */
export const STRICT_3DIGIT_CONFIG: ThreeDigitMatchConfig = {
  magnitudeThreshold: 3,   // |value| < 0.03 considered unstable
  magnitudeTolerance: 3,   // Allow ±0.03 magnitude difference
  maxFailures: 8           // ~94% dimensions must pass
};

/**
 * Detail of dimension matching result
 */
export interface DimensionMatchDetail {
  index: number;
  enrollment: EncodedDimension;
  verification: EncodedDimension;
  signMatch: boolean;
  magnitudeDiff: number;
  isUnstable: boolean;  // True if either magnitude < threshold
  passed: boolean;
}

/**
 * Result of 3-digit template matching
 */
export interface ThreeDigitMatchResult {
  isMatch: boolean;
  matchedDimensions: number;
  failedDimensions: number;
  matchRate: number;        // Percentage (0-100)
  threshold: number;        // maxFailures used
  config: ThreeDigitMatchConfig;
  details: DimensionMatchDetail[];
  statistics: {
    unstableDimensions: number;
    signMismatches: number;
    magnitudeFailures: number;
  };
}

/**
 * 3-Digit Enrollment Result
 */
export interface ThreeDigitEnrollmentResult {
  encoded: EncodedDimension[];  // 128 encoded dimensions
  packedBytes: Uint8Array;      // 128 bytes (8 bits per dimension)
  templateString: string;       // Human-readable "107015001..." format
}

/**
 * Projection statistics for analyzing the distribution of projected values
 */
export interface ProjectionStats {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  median: number;
  q1: number;
  q3: number;
  histogram: {
    'very_negative_[-1,-0.3)': number;
    'negative_[-0.3,-0.1)': number;
    'near_zero_[-0.1,0.1)': number;
    'positive_[0.1,0.3)': number;
    'very_positive_[0.3,1]': number;
  };
  percentPositive: string;
  percentNearZero: string;
}

/**
 * Poseidon hash input parameters for debugging
 * These are the exact values that go into the Poseidon hash
 */
export interface PoseidonInputs {
  productKey: {
    raw: string;
    fieldElement: string;
  };
  ztizenKey: {
    raw: string;
    fieldElement: string;
  };
  userKey: {
    hexBytes: string;
    fieldElement: string;
  };
  version: number;
  nonce: string;
  productUsageDetails: {
    product_id: string;
    service_id: string;
    service_type: string;
    hash: string;
  };
}

/**
 * Full debug data for analyzing template generation pipeline
 *
 * This interface captures the COMPLETE pipeline for debugging:
 * 1. Raw_biometric: Input face descriptor (128D from face-api.js)
 * 2. Projections: Result of Rand_matrix × Raw_biometric
 * 3. Poseidon: Hash parameters for commitment generation
 */
export interface FullDebugData {
  phase: 'enrollment' | 'verification';
  timestamp: string;
  credentialId: string;

  // 1. RAW BIOMETRIC (input to pipeline)
  rawBiometric: {
    source: string;
    dimensions: number;
    values: number[];
    statistics: {
      min: number;
      max: number;
      mean: number;
      stdDev: number;
    };
  };

  // 2. RAND MATRIX (for verification that same matrix is used)
  randMatrix: {
    dimensions: string;
    totalElements: number;
    hash: string;  // SHA-256 hash for verification
    scaleFactor: number;
    sparsity: {
      zeroCount: number;
      zeroPercent: string;
      positiveCount: number;
      negativeCount: number;
    };
    samples: {
      row0: number[];
      row127: number[];
    };
  };

  // 3. PROJECTIONS (Rand_matrix × Raw_biometric = Template_Projection)
  projections: {
    count: number;
    values: number[];
    statistics: ProjectionStats;
  };

  // 4. BINARIZATION (only the executed method - simplified)
  binarization: {
    method: string;
    template: number[];
    histogram: number[];
    stats: { mean: number; stdDev: number };
  };

  // 5. KEYS (hashed for identification without exposing full keys)
  keys: {
    productKeyHash: string;
    ztizenKeyHash: string;
    userKeyHash: string;
    version: number;
  };

  // 6. POSEIDON INPUTS (optional - populated by route after template generation)
  // These are the exact values that go into the Poseidon hash
  poseidonInputs?: PoseidonInputs;
}

// =============================================================================
// MAIN CLASS
// =============================================================================

export class CancelableBiometric {
  private config: BiometricConfig;

  constructor(config: BiometricConfig) {
    this.validateConfig(config);

    // Determine default stepSize based on input dimension
    // 128D (face-api.js): 0.8σ → 9 bins
    // 512D (FaceNet512/ArcFace): 1.2σ → 7 bins
    const defaultStepSize = (config.inputDim >= 512) ? 1.2 : 0.8;

    this.config = {
      ...config,
      // Normalize algorithm type (legacy 'gaussian-sparse' → 'biohashing')
      algorithm: config.algorithm === 'gaussian-sparse' ? 'biohashing' : config.algorithm,
      outputDim: config.outputDim || 128, // Default to 128 for ZK circuit
      version: config.version || 1,
      params: {
        epsilon: 0.15,
        sparsity: 2 / 3,
        stepSize: config.params?.stepSize ?? defaultStepSize,
        ...config.params,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // TEMPLATE GENERATION
  // ---------------------------------------------------------------------------

  /**
   * Generate cancelable biometric template using Sparse Gaussian Projection
   *
   * @param biometric - Input biometric vector (e.g., 128 dimensions from face-api.js)
   * @returns Biometric template (128 bits)
   */
  async generateTemplate(biometric: Float32Array | number[]): Promise<BiometricTemplate> {
    const biometricArray = Array.from(biometric);

    console.log(`🔐 CancelableBiometric: Generating template using ${this.config.algorithm}`);
    console.log(`   Input: ${this.config.inputDim} dimensions`);
    console.log(`   Output: ${this.config.outputDim} dimensions`);

    return this.generateGaussianSparse(biometricArray);
  }

  // ---------------------------------------------------------------------------
  // BIOHASHING PROJECTION (Teoh 2006 + SZQ)
  // ---------------------------------------------------------------------------

  /**
   * BioHashing with Gaussian + Gram-Schmidt Projection
   *
   * Paper: "Random Multispace Quantization as an Analytic Mechanism for BioHashing"
   * Authors: Teoh, Ngo, Goh (IEEE TPAMI 2006)
   *
   * Pipeline:
   * 1. Three-party key derivation: SHA-256(productKey || ztizenKey || userKey)
   * 2. Gaussian matrix generation: R[i][j] ~ (1/√m) × N(0,1)
   * 3. Gram-Schmidt orthogonalization: R⊥ = orthonormalize(R)
   * 4. Projection: y = R⊥ × x
   * 5. Quantization: Binary sign(y) or SZQ σ-bins (novel contribution)
   *
   * Key Properties:
   * - Orthonormal basis: Each bit is statistically independent
   * - Cancelability: Different keys → completely different templates
   * - Non-invertibility: Cannot recover biometric from template
   * - Revocability: Version increment generates new template
   *
   * ZK-BIOWN Novel Contributions:
   * - Three-party key distribution (no single entity can reconstruct)
   * - SZQ: Self-normalizing Z-score Quantization (9 levels, no helper data)
   * - Poseidon Hash integration for ZK circuits
   */
  private async generateGaussianSparse(biometric: number[]): Promise<BiometricTemplate> {
    const { inputDim, outputDim } = this.config;

    // Step 1: Derive composite key (32 bytes from SHA-256)
    const compositeKey = await this.deriveCompositeKey();

    // Step 2: Generate Sparse matrix Φ ∈ ℝ^(outputDim × inputDim)
    const Φ = await this.generateProjectionMatrix(compositeKey, outputDim!, inputDim);

    // Step 3: Project biometric: y = Φ · x
    const projections = this.matrixVectorMultiply(Φ, biometric);

    // Step 4: Binarize using sign function (threshold at 0)
    const template = projections.map(p => (p > 0 ? 1 : 0));

    // Pack into bytes
    const templateBytes = this.packBitsToBytes(template);

    const stats = this.calculateTemplateStats(template);
    console.log(`✅ Sparse Gaussian template generated:`, stats);

    return {
      template,
      templateBytes,
      biometric,
      algorithm: 'gaussian-sparse',
      config: this.config,
      timestamp: Date.now(),
      intermediate: {
        projectionMatrix: Φ,
        projections,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // TEMPLATE MATCHING
  // ---------------------------------------------------------------------------

  /**
   * Match two biometric templates using Hamming distance
   *
   * @param template1 - Enrolled template
   * @param template2 - Verification template
   * @param threshold - Match threshold percentage (default: 80)
   * @returns Match result
   */
  match(
    template1: BiometricTemplate,
    template2: BiometricTemplate,
    threshold: number = 80
  ): MatchResult {
    if (template1.template.length !== template2.template.length) {
      throw new Error(
        `Template length mismatch: ${template1.template.length} vs ${template2.template.length}`
      );
    }

    // Calculate Hamming distance
    let hammingDistance = 0;
    for (let i = 0; i < template1.template.length; i++) {
      if (template1.template[i] !== template2.template[i]) {
        hammingDistance++;
      }
    }

    const totalBits = template1.template.length;
    const matchingBits = totalBits - hammingDistance;
    const matchRate = (matchingBits / totalBits) * 100;
    const isMatch = matchRate >= threshold;

    console.log(`🎯 Template Matching:`, {
      hammingDistance,
      matchingBits,
      totalBits,
      matchRate: `${matchRate.toFixed(2)}%`,
      threshold: `${threshold}%`,
      isMatch: isMatch ? '✅ MATCH' : '❌ NO MATCH',
    });

    return {
      isMatch,
      matchRate,
      hammingDistance,
      threshold,
      details: {
        bitMatches: matchingBits,
        bitDifferences: hammingDistance,
        templateLength: totalBits,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // HELPER FUNCTIONS: KEY DERIVATION
  // ---------------------------------------------------------------------------

  /**
   * Derive composite key from 3 keys + version
   *
   * Combines:
   * - Product key (product-specific)
   * - ZTIZEN key (credential-specific)
   * - User key (user-specific from wallet signature)
   * - Version (for revocability)
   *
   * @returns 32-byte composite key (suitable for AES-256)
   */
  private async deriveCompositeKey(): Promise<Uint8Array> {
    const startTime = performance.now();

    const { productKey, ztizenKey, userKey, version } = this.config;

    const encoder = new TextEncoder();
    const combined = new Uint8Array([
      ...encoder.encode('PRODUCT:'),
      ...encoder.encode(productKey),
      ...encoder.encode('|ZTIZEN:'),
      ...encoder.encode(ztizenKey),
      ...encoder.encode('|USER:'),
      ...userKey,
      ...encoder.encode('|VERSION:'),
      ...encoder.encode(version!.toString()),
    ]);

    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    const result = new Uint8Array(hashBuffer);

    // Record timing metric
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.COMPOSITE_KEY_DERIVATION, durationMs);

    return result;
  }

  // ---------------------------------------------------------------------------
  // HELPER FUNCTIONS: GAUSSIAN + GRAM-SCHMIDT MATRIX GENERATION (BioHashing)
  // ---------------------------------------------------------------------------

  /**
   * Gram-Schmidt Orthogonalization
   *
   * Paper: Teoh et al. 2006 (IEEE TPAMI)
   * "Apply Gram-Schmidt process on {rᵢ} to transform into orthonormal set"
   *
   * Converts a set of random vectors into an orthonormal basis.
   * Each output vector is:
   * 1. Orthogonal to all previous vectors
   * 2. Normalized to unit length
   *
   * Why this matters for BioHashing:
   * - Orthogonal bits are statistically independent
   * - Maximum information per bit (no redundancy)
   * - Better discrimination between genuine/imposter
   *
   * @param vectors Input vectors [m × n]
   * @returns Orthonormal vectors [m × n]
   */
  private gramSchmidt(vectors: number[][]): number[][] {
    const orthogonal: number[][] = [];

    for (let i = 0; i < vectors.length; i++) {
      let v = [...vectors[i]];

      // Subtract projections onto all previous orthogonal vectors
      // v_i = v_i - Σ proj_{u_j}(v_i) for j < i
      for (let j = 0; j < orthogonal.length; j++) {
        const dotVU = v.reduce((sum, val, k) => sum + val * orthogonal[j][k], 0);
        const dotUU = orthogonal[j].reduce((sum, val) => sum + val * val, 0);
        if (dotUU > 1e-10) {
          const scalar = dotVU / dotUU;
          v = v.map((val, k) => val - scalar * orthogonal[j][k]);
        }
      }

      // Normalize to unit vector
      const magnitude = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 1e-10) {
        v = v.map(x => x / magnitude);
      }

      orthogonal.push(v);
    }

    return orthogonal;
  }

  /**
   * Generate Gaussian Random Projection Matrix with Gram-Schmidt Orthogonalization
   *
   * Paper: "Random Multispace Quantization as an Analytic Mechanism for BioHashing"
   * Authors: Teoh, Ngo, Goh (IEEE TPAMI 2006)
   *
   * Algorithm:
   * 1. Generate Gaussian random matrix R ∈ ℝ^(m × n)
   *    R[i][j] ~ (1/√m) × N(0,1)
   * 2. Apply Gram-Schmidt orthogonalization to rows
   *    R⊥ = gramSchmidt(R)
   *
   * Properties:
   * - Orthonormal rows: ⟨rᵢ, rⱼ⟩ = δᵢⱼ (Kronecker delta)
   * - Each projected bit is statistically independent
   * - Preserves relative distances (Johnson-Lindenstrauss)
   * - Cryptographically secure via SHA-256 based PRNG
   *
   * ZK-BIOWN Enhancement:
   * - Three-party key derivation for seed generation
   * - Combined with SZQ for multi-level quantization
   */
  /**
   * Generate projection matrix based on algorithm type
   */
  private async generateProjectionMatrix(
    compositeKey: Uint8Array,
    outputDim: number,
    inputDim: number
  ): Promise<number[][]> {
    if (this.config.algorithm === 'sparse-szq') {
      return this.generateSparseTernaryMatrix(compositeKey, outputDim, inputDim);
    }
    // Default: biohashing (Gaussian + Gram-Schmidt)
    return this.generateGaussianMatrix(compositeKey, outputDim, inputDim);
  }

  /**
   * Generate Sparse Ternary Projection Matrix (Achlioptas 2003)
   *
   * Paper: "Database-friendly random projections"
   * Matrix elements: R[i][j] ∈ {-√(3/m), 0, +√(3/m)} with probabilities {1/6, 2/3, 1/6}
   *
   * Properties:
   * - Sparse: 2/3 of elements are zero (efficient computation)
   * - Johnson-Lindenstrauss: Preserves pairwise distances
   * - No orthogonalization needed (simpler than BioHashing)
   *
   * Recommended for: SZQ multi-level quantization
   */
  private async generateSparseTernaryMatrix(
    compositeKey: Uint8Array,
    outputDim: number,
    inputDim: number
  ): Promise<number[][]> {
    const startTime = performance.now();

    console.log(`🔐 [Sparse-SZQ] Creating Sparse Ternary projection matrix...`);
    console.log(
      `   Seed (compositeKey): ${Array.from(compositeKey.slice(0, 8))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')}... (first 8 bytes)`
    );

    const rng = await CryptoRNG.create(compositeKey);
    const scaleFactor = Math.sqrt(3 / outputDim); // √(3/m) per Achlioptas
    const sparsity = this.config.params?.sparsity ?? (2 / 3);

    console.log(`   Scale factor: √(3/${outputDim}) = ${scaleFactor.toFixed(6)}`);
    console.log(`   Sparsity: ${(sparsity * 100).toFixed(0)}% zeros`);
    console.log(`   Matrix dimensions: ${outputDim} × ${inputDim} = ${outputDim * inputDim} elements`);
    console.log(`   Method: Sparse Ternary {-1, 0, +1} (Achlioptas 2003)`);

    const matrix: number[][] = [];
    let zeroCount = 0;
    let positiveCount = 0;
    let negativeCount = 0;

    for (let i = 0; i < outputDim; i++) {
      const row: number[] = [];
      for (let j = 0; j < inputDim; j++) {
        const r = await rng.next();
        // Probability distribution: P(-1) = 1/6, P(0) = 2/3, P(+1) = 1/6
        if (r < (1 - sparsity) / 2) {
          row.push(scaleFactor);
          positiveCount++;
        } else if (r < 1 - (1 - sparsity) / 2) {
          row.push(0);
          zeroCount++;
        } else {
          row.push(-scaleFactor);
          negativeCount++;
        }
      }
      matrix.push(row);
    }

    const totalElements = outputDim * inputDim;
    console.log(`✅ [Sparse-SZQ Matrix] Generated successfully`);
    console.log(`   Distribution: ${positiveCount} (+), ${zeroCount} (0), ${negativeCount} (-)`);
    console.log(`   Actual sparsity: ${((zeroCount / totalElements) * 100).toFixed(1)}%`);
    console.log(`   First row sample: [${matrix[0].slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

    // Record timing metric
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.SPARSE_MATRIX_GENERATION, durationMs);

    return matrix;
  }

  /**
   * Generate Gaussian Random Projection Matrix with Gram-Schmidt (BioHashing)
   *
   * Paper: "Random Multispace Quantization as an Analytic Mechanism for BioHashing"
   * Authors: Teoh, Ngo, Goh (IEEE TPAMI 2006)
   *
   * Recommended for: Binary quantization (threshold τ=0)
   */
  private async generateGaussianMatrix(
    compositeKey: Uint8Array,
    outputDim: number,
    inputDim: number
  ): Promise<number[][]> {
    const startTime = performance.now();

    // ═══════════════════════════════════════════════════════════════
    // LOGGING: CryptoRNG Creation
    // ═══════════════════════════════════════════════════════════════
    console.log(`🔐 [BioHashing] Creating Gaussian + Gram-Schmidt projection matrix...`);
    console.log(
      `   Seed (compositeKey): ${Array.from(compositeKey.slice(0, 8))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')}... (first 8 bytes)`
    );

    const rng = await CryptoRNG.create(compositeKey);
    const scaleFactor = 1.0 / Math.sqrt(outputDim);

    console.log(`   Scale factor: 1/√${outputDim} = ${scaleFactor.toFixed(6)}`);
    console.log(`   Matrix dimensions: ${outputDim} × ${inputDim} = ${outputDim * inputDim} elements`);
    console.log(`   Method: Gaussian random → Gram-Schmidt orthogonalization (Teoh 2006)`);

    // ═══════════════════════════════════════════════════════════════
    // Step 1: Generate Gaussian random matrix
    // R[i][j] ~ (1/√m) × N(0,1)
    // ═══════════════════════════════════════════════════════════════
    const randomMatrix: number[][] = [];

    for (let i = 0; i < outputDim; i++) {
      const row: number[] = [];
      for (let j = 0; j < inputDim; j++) {
        // Box-Muller transform for Gaussian distribution
        const u1 = Math.max(await rng.next(), 1e-10); // Avoid log(0)
        const u2 = await rng.next();
        const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        row.push(gaussian * scaleFactor);
      }
      randomMatrix.push(row);
    }

    console.log(`   ✓ Gaussian matrix generated`);

    // ═══════════════════════════════════════════════════════════════
    // Step 2: Gram-Schmidt Orthogonalization
    // Transform random vectors into orthonormal basis
    // ═══════════════════════════════════════════════════════════════
    const matrix = this.gramSchmidt(randomMatrix);

    console.log(`   ✓ Gram-Schmidt orthogonalization complete`);

    // ═══════════════════════════════════════════════════════════════
    // LOGGING: Verification statistics
    // ═══════════════════════════════════════════════════════════════
    const totalElements = outputDim * inputDim;

    // Verify orthonormality (check a few dot products)
    let orthogonalityCheck = true;
    for (let i = 0; i < Math.min(5, outputDim); i++) {
      // Check unit length
      const selfDot = matrix[i].reduce((sum, val) => sum + val * val, 0);
      if (Math.abs(selfDot - 1.0) > 0.01) {
        console.warn(`   ⚠️ Row ${i} not normalized: ||r_${i}||² = ${selfDot.toFixed(6)}`);
        orthogonalityCheck = false;
      }

      // Check orthogonality with next row
      if (i + 1 < outputDim) {
        const crossDot = matrix[i].reduce((sum, val, k) => sum + val * matrix[i + 1][k], 0);
        if (Math.abs(crossDot) > 0.01) {
          console.warn(`   ⚠️ Rows ${i} and ${i + 1} not orthogonal: dot = ${crossDot.toFixed(6)}`);
          orthogonalityCheck = false;
        }
      }
    }

    // Compute matrix statistics
    let sum = 0, sumSq = 0;
    let positiveCount = 0, negativeCount = 0;
    for (const row of matrix) {
      for (const val of row) {
        sum += val;
        sumSq += val * val;
        if (val > 0) positiveCount++;
        else if (val < 0) negativeCount++;
      }
    }
    const mean = sum / totalElements;
    const variance = sumSq / totalElements - mean * mean;

    console.log(`✅ [BioHashing Matrix] Generated successfully`);
    console.log(`   Orthonormality check: ${orthogonalityCheck ? '✓ PASSED' : '⚠️ FAILED'}`);
    console.log(`   Distribution: ${positiveCount} positive, ${negativeCount} negative`);
    console.log(`   Mean: ${mean.toFixed(6)} (expected: ~0)`);
    console.log(`   Variance: ${variance.toFixed(6)}`);
    console.log(`   First row sample: [${matrix[0].slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

    // Record timing metric
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.SPARSE_MATRIX_GENERATION, durationMs);

    return matrix;
  }

  /**
   * Matrix-vector multiplication: y = Φ · x
   *
   * @param matrix - Projection matrix Φ (m × n)
   * @param vector - Input biometric x (n × 1)
   * @returns Projected vector y (m × 1)
   */
  private matrixVectorMultiply(matrix: number[][], vector: number[]): number[] {
    const startTime = performance.now();
    const result: number[] = [];

    for (let i = 0; i < matrix.length; i++) {
      let sum = 0;
      for (let j = 0; j < vector.length; j++) {
        sum += matrix[i][j] * vector[j];
      }
      result.push(sum);
    }

    // Record timing metric
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.MATRIX_VECTOR_PROJECTION, durationMs);

    return result;
  }

  // ---------------------------------------------------------------------------
  // SIGN + MAGNITUDE BINARIZATION (5-bit encoding)
  // ---------------------------------------------------------------------------

  /**
   * Sign + Magnitude Binarization (Original)
   *
   * Encodes each projection as [sign bit][4 magnitude bits] = 5 bits total.
   * Preserves both direction (sign) and confidence (magnitude).
   *
   * Encoding:
   *   - Sign bit: + = 1, - = 0
   *   - Magnitude: |value| × scale, clamped to [0, 15]
   *
   * Example:
   *   +0.9 → sign=1, mag=9 → 11001 (binary) = 25 (decimal)
   *   -0.5 → sign=0, mag=5 → 00101 (binary) = 5 (decimal)
   *
   * @param projections - Array of projection values (floats)
   * @param scale - Magnitude scaling factor (default: 10 for 0.1 precision)
   * @returns Array of 5-bit encoded values (0-31)
   */
  private signMagnitudeBinarization(
    projections: number[],
    scale: number = 10
  ): number[] {
    const template: number[] = [];

    // Track distribution for logging
    let signPositive = 0;
    let signNegative = 0;
    const magnitudeHist: number[] = new Array(16).fill(0);
    let clampedCount = 0;

    for (const p of projections) {
      // Sign bit: positive (including 0) = 1, negative = 0
      const signBit = p >= 0 ? 1 : 0;
      if (signBit === 1) signPositive++;
      else signNegative++;

      // Magnitude: scale and clamp to 4 bits (0-15)
      const scaledMag = Math.abs(p) * scale;
      const magnitude = Math.min(15, Math.floor(scaledMag));

      if (scaledMag > 15) clampedCount++;
      magnitudeHist[magnitude]++;

      // Combine: sign in bit 4, magnitude in bits 0-3
      // Format: [S][M3][M2][M1][M0]
      const encoded = (signBit << 4) | magnitude;

      template.push(encoded);
    }

    // Log distribution
    console.log(`✅ Sign + Magnitude encoding complete:`);
    console.log(`   Sign distribution: +${signPositive} / -${signNegative} (${(signPositive / projections.length * 100).toFixed(1)}% positive)`);
    console.log(`   Magnitude histogram: [${magnitudeHist.slice(0, 8).join(', ')}, ...]`);
    if (clampedCount > 0) {
      console.warn(`   ⚠️ ${clampedCount} values clamped (exceeded scale range)`);
    }
    console.log(`   Template values: 0-31 (5-bit), unique values: ${new Set(template).size}`);

    return template;
  }

  // ---------------------------------------------------------------------------
  // DECIMAL SIGN-MAGNITUDE BINARIZATION (User-proposed encoding)
  // ---------------------------------------------------------------------------

  /**
   * Decimal Sign-Magnitude Binarization
   *
   * User-proposed encoding scheme:
   *   - Sign: + = 1, - = 0 (prefix bit)
   *   - Magnitude: 0-9 from decimal digit (0.X → X)
   *   - Combined: [S][M3][M2][M1][M0] = 5 bits
   *
   * Encoding Examples:
   *   +0.9 → 1 (sign) + 1001 (9 in binary) = 11001 = 25 decimal
   *   -0.3 → 0 (sign) + 0011 (3 in binary) = 00011 = 3 decimal
   *   +0.0 → 1 (sign) + 0000 (0 in binary) = 10000 = 16 decimal
   *   -1.0 → 0 (sign) + 1010 (10 clamped to 9) = 01001 = 9 decimal
   *
   * Value mapping: |projection| → first decimal digit
   *   |p| < 0.1  → 0
   *   0.1 ≤ |p| < 0.2 → 1
   *   ...
   *   0.9 ≤ |p| < 1.0 → 9
   *   |p| ≥ 1.0 → 9 (clamped)
   *
   * This preserves 0.1 precision in the magnitude while being
   * compatible with trustless ZK architecture (no helper data).
   *
   * @param projections - Array of projection values (floats)
   * @returns Array of 5-bit encoded values (0-31)
   */
  decimalSignMagnitudeBinarization(projections: number[]): number[] {
    const template: number[] = [];

    // Track statistics
    let signPositive = 0;
    let signNegative = 0;
    const magnitudeHist: number[] = new Array(10).fill(0); // 0-9 only
    let clampedCount = 0;

    console.log(`🔢 Decimal Sign-Magnitude Binarization:`);
    console.log(`   Encoding: + = 1, - = 0 | Magnitude: 0-9 (0.1 precision)`);
    console.log(`   Format: [Sign][Mag3][Mag2][Mag1][Mag0] = 5 bits`);

    for (let i = 0; i < projections.length; i++) {
      const p = projections[i];

      // Sign bit: positive (including 0) = 1, negative = 0
      const signBit = p >= 0 ? 1 : 0;
      if (signBit === 1) signPositive++;
      else signNegative++;

      // Magnitude: extract first decimal digit (0.X → X)
      // |p| × 10, then floor, then clamp to 0-9
      const absValue = Math.abs(p);
      const decimalDigit = Math.floor(absValue * 10); // e.g., 0.9 × 10 = 9, 0.35 × 10 = 3
      const magnitude = Math.min(9, decimalDigit); // Clamp to 0-9 (4 bits can hold 0-15, but we use 0-9)

      if (decimalDigit > 9) clampedCount++;
      magnitudeHist[magnitude]++;

      // Combine: sign in bit 4, magnitude in bits 0-3
      // Format: [S][M3][M2][M1][M0]
      // +0.9 → signBit=1, magnitude=9 → (1 << 4) | 9 = 16 + 9 = 25 = 11001 binary
      const encoded = (signBit << 4) | magnitude;

      template.push(encoded);

      // Debug first 5
      if (i < 5) {
        const binaryStr = encoded.toString(2).padStart(5, '0');
        console.log(`   [${i}] ${p >= 0 ? '+' : ''}${p.toFixed(3)} → sign=${signBit}, mag=${magnitude} → ${binaryStr} (${encoded})`);
      }
    }

    // Summary
    const signBalance = (signPositive / projections.length * 100).toFixed(1);
    console.log(`✅ Decimal Sign-Magnitude complete:`);
    console.log(`   Sign: +${signPositive} / -${signNegative} (${signBalance}% positive)`);
    console.log(`   Magnitude distribution: [${magnitudeHist.join(', ')}]`);
    if (clampedCount > 0) {
      console.warn(`   ⚠️ ${clampedCount} values clamped (|p| ≥ 1.0)`);
    }
    console.log(`   Output: ${template.length} × 5-bit values, unique: ${new Set(template).size}`);

    return template;
  }

  // ---------------------------------------------------------------------------
  // COMPACT 4-BIT SIGN-MAGNITUDE BINARIZATION
  // ---------------------------------------------------------------------------

  /**
   * Compact 4-bit Sign-Magnitude Binarization
   *
   * Optimized encoding scheme using only 4 bits per value:
   *   - Sign: + = 1, - = 0 (1 bit)
   *   - Magnitude: 0-7 (representing 1-8, shifted from decimal digit) (3 bits)
   *   - Format: [S][M2][M1][M0] = 4 bits total
   *
   * Encoding Examples:
   *   +0.7 → sign=1, digit=7, mag=7 → (1 << 3) | 7 = 15 (1111₂)
   *   -0.3 → sign=0, digit=3, mag=3 → (0 << 3) | 3 = 3  (0011₂)
   *   +0.0 → sign=1, digit=0, mag=0 → (1 << 3) | 0 = 8  (1000₂)
   *   +0.9 → sign=1, digit=9, mag=7 → (1 << 3) | 7 = 15 (1111₂) [clamped]
   *
   * Value mapping: |projection| → first decimal digit → clamp to 0-7
   *   |p| < 0.1  → 0 → stored as 0
   *   0.1 ≤ |p| < 0.2 → 1 → stored as 1
   *   ...
   *   0.7 ≤ |p| < 0.8 → 7 → stored as 7
   *   0.8 ≤ |p| → 8+ → clamped to 7
   *
   * Benefits over 5-bit:
   *   - 20% smaller template size (64 bytes vs 80 bytes for 128 values)
   *   - Template values 0-15 (vs 0-31)
   *   - Same sign discrimination
   *
   * @param projections - Array of projection values (floats)
   * @returns Array of 4-bit encoded values (0-15)
   */
  private compactSignMagnitudeBinarization(projections: number[]): number[] {
    const template: number[] = [];

    // Track statistics
    let signPositive = 0;
    let signNegative = 0;
    const magnitudeHist: number[] = new Array(8).fill(0); // 0-7 only
    let clampedCount = 0;

    console.log(`🔢 Compact 4-bit Sign-Magnitude Binarization:`);
    console.log(`   Encoding: + = 1, - = 0 | Magnitude: 0-7 (3 bits)`);
    console.log(`   Format: [Sign][Mag2][Mag1][Mag0] = 4 bits`);

    for (let i = 0; i < projections.length; i++) {
      const p = projections[i];

      // Sign bit: positive (including 0) = 1, negative = 0
      const signBit = p >= 0 ? 1 : 0;
      if (signBit === 1) signPositive++;
      else signNegative++;

      // Magnitude: extract first decimal digit, then clamp to 0-7
      // |p| × 10, then floor, then clamp to 0-7
      const absValue = Math.abs(p);
      const decimalDigit = Math.floor(absValue * 10); // e.g., 0.7 × 10 = 7, 0.35 × 10 = 3
      const magnitude = Math.min(7, decimalDigit); // Clamp to 0-7 (3 bits)

      if (decimalDigit > 7) clampedCount++;
      magnitudeHist[magnitude]++;

      // Combine: sign in bit 3, magnitude in bits 0-2
      // Format: [S][M2][M1][M0]
      // +0.7 → signBit=1, magnitude=7 → (1 << 3) | 7 = 8 + 7 = 15 = 1111 binary
      const encoded = (signBit << 3) | magnitude;

      template.push(encoded);

      // Debug first 5
      if (i < 5) {
        const binaryStr = encoded.toString(2).padStart(4, '0');
        console.log(`   [${i}] ${p >= 0 ? '+' : ''}${p.toFixed(3)} → sign=${signBit}, mag=${magnitude} → ${binaryStr} (${encoded})`);
      }
    }

    // Summary
    const signBalance = (signPositive / projections.length * 100).toFixed(1);
    console.log(`✅ Compact 4-bit Sign-Magnitude complete:`);
    console.log(`   Sign: +${signPositive} / -${signNegative} (${signBalance}% positive)`);
    console.log(`   Magnitude distribution (0-7): [${magnitudeHist.join(', ')}]`);
    if (clampedCount > 0) {
      console.log(`   ⚠️ ${clampedCount} values clamped (digit > 7)`);
    }
    console.log(`   Output: ${template.length} × 4-bit values (0-15), unique: ${new Set(template).size}`);

    return template;
  }

  /**
   * Pack 4-bit values into bytes
   *
   * 128 values × 4 bits = 512 bits = 64 bytes
   * Two 4-bit values fit perfectly in one byte (nibbles).
   *
   * @param template - Array of 4-bit values (0-15)
   * @returns Packed bytes (64 bytes for 128 values)
   */
  private pack4BitToBytes(template: number[]): Uint8Array {
    // 128 values × 4 bits = 512 bits = 64 bytes
    const bytes = new Uint8Array(Math.ceil(template.length / 2));

    for (let i = 0; i < template.length; i += 2) {
      const low = template[i] & 0x0F;       // First nibble (lower 4 bits)
      const high = (template[i + 1] ?? 0) & 0x0F; // Second nibble (upper 4 bits)
      bytes[Math.floor(i / 2)] = low | (high << 4);
    }

    console.log(`   Packed ${template.length} × 4-bit values → ${bytes.length} bytes`);
    return bytes;
  }

  // ---------------------------------------------------------------------------
  // 3-BIT SIGN-MAGNITUDE BINARIZATION (For signmag128 circuit)
  // ---------------------------------------------------------------------------

  /**
   * Self-normalizing Z-score Quantization (SZQ) - Variable Bin Encoding
   *
   * Novel contribution: Multi-level σ-based quantization with configurable stepSize.
   *
   * Unlike BioHashing's binary quantization (τ=0), SZQ uses variable bins based on
   * statistical distance from mean, preserving more discriminative information.
   *
   * BIN CONFIGURATION (derived from stepSize):
   *   - stepSize = 0.8σ → 9 bins (best for face-api.js 128D)
   *   - stepSize = 1.2σ → 7 bins (best for FaceNet/FaceNet512)
   *   - stepSize = 1.4σ → 7 bins (best for ArcFace 512D)
   *
   * SYMMETRIC ENCODING around center bin:
   *   For 9 bins (stepSize=0.8, centerBin=4):
   *     ←── Below Mean ──→    Mean    ←── Above Mean ──→
   *     8    7    6    5       4       3    2    1    0
   *    ≥3s  2.4s 1.6s 0.8s  <0.8s   0.8s 1.6s 2.4s  ≥3s
   *
   *   For 7 bins (stepSize=1.2, centerBin=3):
   *     ←── Below Mean ──→   Mean   ←── Above Mean ──→
   *     6    5    4    3       2       1    0
   *    ≥3s  2.4s 1.2s <1.2s  <1.2s   1.2s 2.4s  ≥3s
   *
   * SELF-NORMALIZING DESIGN:
   *   - Both enrollment and verification compute their OWN mean/stdDev
   *   - Same person → similar projections → similar relative positions → same codes
   *   - No helper data needs to be stored - only Poseidon hashes
   *
   * Recommended stepSize values (from sweet_spot_finding.json):
   *   - face-api.js (128D): stepSize=0.8 → GAR=100%, FAR=4.4%
   *   - FaceNet (128D): stepSize=1.2 → GAR=92%, FAR=0%
   *   - FaceNet512 (512D): stepSize=1.2 → GAR=88%, FAR=0%
   *   - ArcFace (512D): stepSize=1.4 → GAR=87%, FAR=0%
   *
   * @param projections - Array of 128 projection values
   * @returns Object containing template array with values 0 to (numBins-1)
   */
  signMagnitudeRankMeanCentered(
    projections: number[]
  ): { template: number[] } {
    const startTime = performance.now();

    // Get stepSize from config (prefer stepSize over deprecated thresholdScale)
    // Default: 0.8 (9 bins, good for face-api.js 128D)
    const stepSize = this.config.params?.stepSize ??
      (this.config.params?.thresholdScale ? 0.5 * this.config.params.thresholdScale : 0.8);

    // Calculate bin configuration from stepSize
    const maxCoverage = 3.0; // Cover ±3σ from mean
    const stepsPerSide = Math.ceil(maxCoverage / stepSize);
    const numBins = 2 * stepsPerSide + 1;
    const centerBin = stepsPerSide;

    // Generate thresholds: [stepSize, 2×stepSize, 3×stepSize, ...]
    const thresholds: number[] = [];
    for (let i = 1; i <= stepsPerSide; i++) {
      thresholds.push(i * stepSize);
    }

    // Compute statistics from current projections (self-normalizing)
    const mean = projections.reduce((a, b) => a + b, 0) / projections.length;
    const variance = projections.reduce((acc, p) => acc + (p - mean) ** 2, 0) / projections.length;
    const stdDev = Math.sqrt(variance);

    console.log(`🔢 SZQ Variable-Bin Quantization - SELF-NORMALIZING:`);
    console.log(`   Step size: ${stepSize}σ → ${numBins} bins (center=${centerBin})`);
    console.log(`   📊 Session mean: ${mean.toFixed(6)}, stdDev: ${stdDev.toFixed(6)}`);
    console.log(`   ✅ SELF-NORMALIZING: Each session adapts to its own distribution`);
    console.log(`   Thresholds: [${thresholds.map(t => `${t.toFixed(2)}σ`).join(', ')}]`);

    // Track statistics
    const codeHist: number[] = new Array(numBins).fill(0);
    let aboveCount = 0;
    let belowCount = 0;
    let centerCount = 0;

    const template = projections.map((p, i) => {
      // Distance from mean
      const diff = p - mean;

      // Compute Z-score
      const zScore = Math.abs(diff) / stdDev;

      // Determine rank based on thresholds
      let rank = 0;
      for (let t = 0; t < thresholds.length; t++) {
        if (zScore >= thresholds[t]) {
          rank = t + 1;
        }
      }

      // Symmetric encoding around centerBin
      // Above mean: centerBin - rank → decreasing as distance increases
      // Below mean: centerBin + rank → increasing as distance increases
      let code: number;
      if (rank === 0) {
        // Near mean - always centerBin
        code = centerBin;
        centerCount++;
      } else if (diff >= 0) {
        // Above mean: centerBin - rank
        code = centerBin - rank;
        aboveCount++;
      } else {
        // Below mean: centerBin + rank
        code = centerBin + rank;
        belowCount++;
      }

      // Clamp to valid range
      code = Math.max(0, Math.min(numBins - 1, code));
      codeHist[code]++;

      // Debug first 5
      if (i < 5) {
        const direction = rank === 0 ? 'center' : (diff >= 0 ? 'above' : 'below');
        console.log(`   [${i}] p=${p >= 0 ? '+' : ''}${p.toFixed(4)}, diff=${diff >= 0 ? '+' : ''}${diff.toFixed(4)}, Z=${zScore.toFixed(2)}, rank=${rank}, dir=${direction} → code=${code}`);
      }

      return code;
    });

    // Summary
    console.log(`✅ SZQ Variable-Bin Quantization complete:`);
    console.log(`   Distribution: ${centerCount} center (code ${centerBin}), ${aboveCount} above (0-${centerBin - 1}), ${belowCount} below (${centerBin + 1}-${numBins - 1})`);
    console.log(`   Code histogram [0-${numBins - 1}]: [${codeHist.join(', ')}]`);
    console.log(`   Output: ${template.length} values (each 0-${numBins - 1}), unique codes: ${new Set(template).size}`);
    console.log(`   Self-normalizing: No stats need to be stored`);

    // Record timing metric
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.ZSCORE_ENCODING, durationMs);

    return { template };
  }

  /**
   * 16-Value Sign-Magnitude Rank (Mean-Centered) Binarization
   *
   * Enhanced version with finer outlier detection while maintaining noise tolerance.
   *
   * Encoding scheme (16 values, 4 bits per value):
   *   Value:   0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15
   *   Z-score: ≥3.5 3.0  2.5  2.0  1.5  1.0  0.5  <0.5 <0.5 0.5  1.0  1.5  2.0  2.5  3.0  ≥3.5
   *            ←─── Above Mean (far→near) ───→  CENTER  ←─── Below Mean (near→far) ───→
   *
   * This follows the same pattern as 9-value encoding:
   *   - 9-value: [0←far above] ... [4=CENTER] ... [8←far below]
   *   - 16-value: [0←far above] ... [7-8=CENTER] ... [15←far below]
   *
   * Key differences from 9-value encoding:
   *   - Same ±0.5σ tolerance bands (same noise tolerance)
   *   - Extended outlier detection: ±3.5σ vs ±2σ
   *   - Better discrimination for imposters (different faces)
   *   - Same bit size: 128 × 4 = 512 bits
   *
   * Z-score thresholds (8 ranks, 0-7):
   *   - Rank 0: |Z| < 0.5σ  → codes 7,8 (center)
   *   - Rank 1: 0.5σ ≤ |Z| < 1.0σ  → codes 6,9
   *   - Rank 2: 1.0σ ≤ |Z| < 1.5σ  → codes 5,10
   *   - Rank 3: 1.5σ ≤ |Z| < 2.0σ  → codes 4,11
   *   - Rank 4: 2.0σ ≤ |Z| < 2.5σ  → codes 3,12
   *   - Rank 5: 2.5σ ≤ |Z| < 3.0σ  → codes 2,13
   *   - Rank 6: 3.0σ ≤ |Z| < 3.5σ  → codes 1,14
   *   - Rank 7: |Z| ≥ 3.5σ  → codes 0,15 (extreme outliers)
   *
   * SELF-NORMALIZING DESIGN:
   * Both enrollment and verification compute their OWN mean/stdDev from their own projections.
   * Same person → similar projections → similar relative positions → same ranks.
   *
   * @param projections - Array of 128 projection values
   * @returns Object containing template array (0-15)
   */
  signMagnitudeRank16Value(
    projections: number[]
  ): { template: number[] } {
    // Compute statistics from current projections (self-normalizing)
    const mean = projections.reduce((a, b) => a + b, 0) / projections.length;
    const variance = projections.reduce((acc, p) => acc + (p - mean) ** 2, 0) / projections.length;
    const stdDev = Math.sqrt(variance);

    console.log(`🔢 Sign + Magnitude Rank 16-Value (Mean-Centered) Binarization - SELF-NORMALIZING:`);
    console.log(`   Encoding: 16 values symmetric around mean (7-8=center)`);
    console.log(`   📊 Session mean: ${mean.toFixed(6)}, stdDev: ${stdDev.toFixed(6)}`);
    console.log(`   ✅ SELF-NORMALIZING: Each session adapts to its own distribution`);
    console.log(`   Layout: [0←≥3.5σ above] ... [7-8=CENTER] ... [15←≥3.5σ below]`);
    console.log(`   Z-score thresholds: ±0.5σ, ±1σ, ±1.5σ, ±2σ, ±2.5σ, ±3σ, ±3.5σ`);

    // Track statistics - 16 codes (0-15)
    const codeHist: number[] = new Array(16).fill(0);
    let aboveCount = 0;
    let belowCount = 0;
    let centerCount = 0;

    const template = projections.map((p, i) => {
      // Distance from enrollment mean
      const diff = p - mean;

      // Magnitude rank based on Z-score (|diff| / stdDev)
      // 8 ranks (0-7) based on statistical thresholds
      const zScore = Math.abs(diff) / stdDev;
      let rank: number;

      if (zScore >= 3.5) rank = 7;       // Extreme outlier (≥3.5σ)
      else if (zScore >= 3.0) rank = 6;  // Far outlier (3.0-3.5σ)
      else if (zScore >= 2.5) rank = 5;  // Outlier (2.5-3.0σ)
      else if (zScore >= 2.0) rank = 4;  // Strong (2.0-2.5σ)
      else if (zScore >= 1.5) rank = 3;  // Significant (1.5-2.0σ)
      else if (zScore >= 1.0) rank = 2;  // Moderate (1.0-1.5σ)
      else if (zScore >= 0.5) rank = 1;  // Slight (0.5-1.0σ)
      else rank = 0;                      // Near mean (<0.5σ)

      // Symmetric encoding around 7.5 (center between 7 and 8)
      // Above mean: 7, 6, 5, 4, 3, 2, 1, 0 (7 - rank)
      // Below mean: 8, 9, 10, 11, 12, 13, 14, 15 (8 + rank)
      let code: number;
      if (rank === 0) {
        // Near mean (<0.5σ) - use 7 for above/at mean, 8 for below mean
        if (diff >= 0) {
          code = 7;  // At or slightly above mean
        } else {
          code = 8;  // Slightly below mean
        }
        centerCount++;
      } else if (diff >= 0) {
        // Above mean: 7 - rank → 6, 5, 4, 3, 2, 1, 0
        code = 7 - rank;
        aboveCount++;
      } else {
        // Below mean: 8 + rank → 9, 10, 11, 12, 13, 14, 15
        code = 8 + rank;
        belowCount++;
      }

      codeHist[code]++;

      // Debug first 5
      if (i < 5) {
        const direction = rank === 0 ? (diff >= 0 ? 'center+' : 'center-') : (diff >= 0 ? 'above' : 'below');
        console.log(`   [${i}] p=${p >= 0 ? '+' : ''}${p.toFixed(4)}, diff=${diff >= 0 ? '+' : ''}${diff.toFixed(4)}, Z=${zScore.toFixed(2)}, rank=${rank}, dir=${direction} → code=${code}`);
      }

      return code;
    });

    // Summary
    console.log(`✅ Sign + Magnitude Rank 16-Value (Mean-Centered) complete:`);
    console.log(`   Distribution: ${centerCount} center (codes 7-8), ${aboveCount} above (0-6), ${belowCount} below (9-15)`);
    console.log(`   Code histogram [0-15]: [${codeHist.join(', ')}]`);
    console.log(`   Output: ${template.length} values (each 0-15), unique codes: ${new Set(template).size}`);
    console.log(`   Self-normalizing: No stats need to be stored`);

    return { template };
  }

  /**
   * 3-bit Sign-Magnitude Binarization
   *
   * Optimized encoding scheme using only 3 bits per value:
   *   - Sign: + = 1, - = 0 (1 bit)
   *   - Magnitude: 0-3 (scaled from projection value) (2 bits)
   *   - Format: [Sign][Mag1][Mag0] = 3 bits total
   *
   * Encoding Examples:
   *   +0.7 → sign=1, mag=3 → (1 << 2) | 3 = 7 (111₂)
   *   -0.3 → sign=0, mag=1 → (0 << 2) | 1 = 1 (001₂)
   *   +0.0 → sign=1, mag=0 → (1 << 2) | 0 = 4 (100₂)
   *   +0.9 → sign=1, mag=3 → (1 << 2) | 3 = 7 (111₂) [clamped]
   *
   * Value mapping: |projection| → magnitude (0-3)
   *   |p| < 0.25  → 0
   *   0.25 ≤ |p| < 0.50 → 1
   *   0.50 ≤ |p| < 0.75 → 2
   *   0.75 ≤ |p| → 3
   *
   * Benefits:
   *   - Smaller output: 128 values × 3 bits = 384 bits (48 bytes)
   *   - Compatible with signmag128 Noir circuit
   *   - Preserves both sign and magnitude information
   *
   * Output: 128 values, each 0-7
   *
   * @param projections - Array of projection values (floats)
   * @returns Array of 3-bit encoded values (0-7)
   */
  signMagnitude3Bit(projections: number[]): number[] {
    const template: number[] = [];

    // Track statistics
    let signPositive = 0;
    let signNegative = 0;
    const magnitudeHist: number[] = new Array(4).fill(0); // 0-3 only
    let clampedCount = 0;

    console.log(`🔢 3-bit Sign-Magnitude Binarization:`);
    console.log(`   Encoding: + = 1, - = 0 | Magnitude: 0-3 (2 bits)`);
    console.log(`   Format: [Sign][Mag1][Mag0] = 3 bits`);
    console.log(`   Output range: 0-7`);

    for (let i = 0; i < projections.length; i++) {
      const p = projections[i];

      // Sign bit: positive (including 0) = 1, negative = 0
      const signBit = p >= 0 ? 1 : 0;
      if (signBit === 1) signPositive++;
      else signNegative++;

      // Magnitude: scale |p| to 0-3 range (2 bits)
      // Using quarters: 0-0.25 → 0, 0.25-0.5 → 1, 0.5-0.75 → 2, 0.75+ → 3
      const absValue = Math.abs(p);
      const scaledMag = Math.floor(absValue * 4); // 0.0-0.25 → 0, 0.25-0.5 → 1, etc.
      const magnitude = Math.min(3, scaledMag); // Clamp to 0-3 (2 bits)

      if (scaledMag > 3) clampedCount++;
      magnitudeHist[magnitude]++;

      // Combine: sign in bit 2, magnitude in bits 0-1
      // Format: [S][M1][M0]
      // +0.7 → signBit=1, magnitude=2 → (1 << 2) | 2 = 4 + 2 = 6 = 110 binary
      const encoded = (signBit << 2) | magnitude;

      template.push(encoded);

      // Debug first 5
      if (i < 5) {
        const binaryStr = encoded.toString(2).padStart(3, '0');
        console.log(`   [${i}] ${p >= 0 ? '+' : ''}${p.toFixed(3)} → sign=${signBit}, mag=${magnitude} → ${binaryStr} (${encoded})`);
      }
    }

    // Summary
    const signBalance = (signPositive / projections.length * 100).toFixed(1);
    console.log(`✅ 3-bit Sign-Magnitude complete:`);
    console.log(`   Sign: +${signPositive} / -${signNegative} (${signBalance}% positive)`);
    console.log(`   Magnitude distribution (0-3): [${magnitudeHist.join(', ')}]`);
    if (clampedCount > 0) {
      console.log(`   ⚠️ ${clampedCount} values clamped (|p| ≥ 1.0)`);
    }
    console.log(`   Output: ${template.length} × 3-bit values (0-7), unique: ${new Set(template).size}`);

    return template;
  }

  /**
   * Pack 3-bit values into bytes
   *
   * 128 values × 3 bits = 384 bits = 48 bytes
   *
   * @param template - Array of 3-bit values (0-7)
   * @returns Packed bytes (48 bytes for 128 values)
   */
  private pack3BitToBytes(template: number[]): Uint8Array {
    const totalBits = template.length * 3;
    const totalBytes = Math.ceil(totalBits / 8);
    const bytes = new Uint8Array(totalBytes);

    let bitOffset = 0;
    for (const value of template) {
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;
      const bitsLeft = 8 - bitInByte;

      if (3 <= bitsLeft) {
        // Fits entirely in current byte
        bytes[byteIndex] |= (value << bitInByte) & 0xFF;
      } else {
        // Spans two bytes
        bytes[byteIndex] |= (value << bitInByte) & 0xFF;
        if (byteIndex + 1 < totalBytes) {
          bytes[byteIndex + 1] |= value >> (8 - bitInByte);
        }
      }

      bitOffset += 3;
    }

    console.log(`   Packed ${template.length} × 3-bit values → ${bytes.length} bytes`);
    return bytes;
  }

  // ---------------------------------------------------------------------------
  // INDEX-OF-MAX BINARIZATION (Alternative: uses ranking)
  // ---------------------------------------------------------------------------

  /**
   * Index-of-Max (IoM) Hashing
   *
   * Paper: "Ranking Based LSH Enabled Cancelable Biometrics" (Jin et al., IEEE TIFS 2017)
   *
   * Instead of encoding magnitude, encode the INDEX of the maximum value
   * within each group of projections. This preserves ranking order.
   *
   * For group size k=4:
   *   Group [0.23, -0.45, 0.89, 0.12] → max is at index 2 → output: 2 (binary: 10)
   *
   * Properties:
   *   - Ranking-based (invariant to scaling)
   *   - No helper data needed (trustless compatible)
   *   - Each output is log2(k) bits
   *
   * @param projections - Array of projection values
   * @param groupSize - Number of projections per group (default: 4)
   * @returns Array of indices (each 0 to groupSize-1)
   */
  indexOfMaxHashing(projections: number[], groupSize: number = 4): number[] {
    const template: number[] = [];
    const bitsPerIndex = Math.ceil(Math.log2(groupSize));

    console.log(`📊 Index-of-Max (IoM) Hashing:`);
    console.log(`   Group size: ${groupSize}`);
    console.log(`   Bits per output: ${bitsPerIndex}`);
    console.log(`   Input: ${projections.length} → Output: ${Math.ceil(projections.length / groupSize)} values`);

    // Distribution tracking
    const indexHist: number[] = new Array(groupSize).fill(0);

    for (let i = 0; i < projections.length; i += groupSize) {
      const group = projections.slice(i, Math.min(i + groupSize, projections.length));

      // Find index of maximum value in this group
      let maxIndex = 0;
      let maxValue = group[0];
      for (let j = 1; j < group.length; j++) {
        if (group[j] > maxValue) {
          maxValue = group[j];
          maxIndex = j;
        }
      }

      template.push(maxIndex);
      indexHist[maxIndex]++;

      // Debug first few groups
      if (template.length <= 3) {
        const groupStr = group.map(v => v.toFixed(3)).join(', ');
        console.log(`   Group ${template.length - 1}: [${groupStr}] → max at index ${maxIndex}`);
      }
    }

    // Summary
    console.log(`✅ IoM Hashing complete:`);
    console.log(`   Index distribution: [${indexHist.join(', ')}]`);
    console.log(`   Output: ${template.length} × ${bitsPerIndex}-bit values`);
    console.log(`   Total bits: ${template.length * bitsPerIndex}`);

    return template;
  }

  // ---------------------------------------------------------------------------
  // COMBINED: Sign-Magnitude OR Index-of-Max
  // ---------------------------------------------------------------------------

  /**
   * Generate template using specified binarization method
   *
   * @param biometric - Input biometric vector
   * @param method - Binarization method:
   *   - 'iom' (default): Index-of-Max, 32 indices, best accuracy
   *   - 'signmag3bit': 3-bit sign-magnitude, 128 values (0-7)
   *   - 'sign-mag-rank': Sign + Magnitude Rank (mean-centered), 128 values (0-8 symmetric) - SELF-NORMALIZING
   *   - 'sign-mag-rank-16': Sign + Magnitude Rank 16-value (mean-centered), 128 values (0-15) - SELF-NORMALIZING
   *   - 'binary': Simple 1-bit sign
   *   - 'sign-mag': 5-bit sign + magnitude
   *   - 'decimal-sign-mag': 5-bit decimal sign-magnitude
   *   - 'compact-sign-mag': 4-bit compact sign-magnitude
   * @param options - Method-specific options (scale, groupSize)
   *
   * NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING.
   * Each session computes its own mean/stdDev - no stats need to be stored or passed.
   */
  async generateTemplateWithMethod(
    biometric: Float32Array | number[],
    method: 'binary' | 'sign-mag' | 'decimal-sign-mag' | 'compact-sign-mag' | 'signmag3bit' | 'sign-mag-rank' | 'sign-mag-rank-16' | 'iom' = 'iom',
    options?: {
      scale?: number;
      groupSize?: number;
    }
  ): Promise<BiometricTemplate> {
    const biometricArray = Array.from(biometric);

    console.log(`🔐 CancelableBiometric: Template with method '${method}'`);
    console.log(`   Input: ${this.config.inputDim} dimensions`);

    // Step 1: Derive composite key
    const compositeKey = await this.deriveCompositeKey();

    // Step 2: Generate Sparse matrix
    const Φ = await this.generateProjectionMatrix(compositeKey, this.config.outputDim!, this.config.inputDim);

    // Step 3: Project biometric
    const projections = this.matrixVectorMultiply(Φ, biometricArray);

    // Step 4: Binarize using selected method
    let template: number[];
    let templateBytes: Uint8Array;

    switch (method) {
      case 'sign-mag':
        template = this.signMagnitudeBinarization(projections, options?.scale ?? 10);
        templateBytes = this.pack5BitToBytes(template);
        break;

      case 'decimal-sign-mag':
        template = this.decimalSignMagnitudeBinarization(projections);
        templateBytes = this.pack5BitToBytes(template);
        break;

      case 'compact-sign-mag':
        template = this.compactSignMagnitudeBinarization(projections);
        templateBytes = this.pack4BitToBytes(template);
        break;

      case 'signmag3bit':
        // 3-bit sign-magnitude: 128 values, each 0-7
        // Compatible with signmag128 Noir circuit
        template = this.signMagnitude3Bit(projections);
        templateBytes = this.pack3BitToBytes(template);
        break;

      case 'sign-mag-rank':
        // Sign + Magnitude Rank (mean-centered): 128 values, each 0-8 (symmetric around 4)
        // SELF-NORMALIZING: Each session computes its own mean/stdDev
        // 9 possible values require 4 bits per value
        const signMagRankResult = this.signMagnitudeRankMeanCentered(projections);
        template = signMagRankResult.template;
        // Pack as 4-bit values (0-8 range needs 4 bits)
        templateBytes = this.pack4BitToBytes(template);
        break;

      case 'sign-mag-rank-16':
        // Sign + Magnitude Rank 16-Value (mean-centered): 128 values, each 0-15
        // SELF-NORMALIZING: Each session computes its own mean/stdDev
        // Better discrimination for imposters while same noise tolerance
        // 16 possible values require 4 bits per value
        const signMagRank16Result = this.signMagnitudeRank16Value(projections);
        template = signMagRank16Result.template;
        // Pack as 4-bit values (0-15 range, exactly 4 bits)
        templateBytes = this.pack4BitToBytes(template);
        break;

      case 'iom':
        template = this.indexOfMaxHashing(projections, options?.groupSize ?? 4);
        // Pack IoM indices (2 bits for k=4)
        const bitsPerIndex = Math.ceil(Math.log2(options?.groupSize ?? 4));
        templateBytes = this.packNBitToBytes(template, bitsPerIndex);
        break;

      case 'binary':
      default:
        template = projections.map(p => (p > 0 ? 1 : 0));
        templateBytes = this.packBitsToBytes(template);
        break;
    }

    console.log(`✅ Template generated with '${method}' method`);

    return {
      template,
      templateBytes,
      biometric: biometricArray,
      algorithm: 'gaussian-sparse',
      config: this.config,
      timestamp: Date.now(),
      intermediate: {
        projectionMatrix: Φ,
        projections,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // FULL DEBUG EXPORT (For analyzing binarization mismatch)
  // ---------------------------------------------------------------------------

  /**
   * Compute SHA-256 hash of the projection matrix for verification
   *
   * This hash ensures the random matrix is deterministically identical
   * between enrollment and verification when using the same keys.
   */
  private async computeMatrixHash(matrix: number[][]): Promise<string> {
    // Flatten matrix and convert to string for hashing
    // Use fixed precision to ensure consistent hashing
    const matrixStr = matrix.map(row => row.map(v => v.toFixed(6)).join(',')).join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(matrixStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Analyze projection value distribution
   *
   * Provides statistics to understand how projections are distributed,
   * which informs the optimal binarization strategy:
   * - If projections cluster near zero → magnitude encoding preserves info
   * - If projections are clearly bimodal (positive/negative) → binary might suffice
   */
  private analyzeProjections(projections: number[]): ProjectionStats {
    const sorted = [...projections].sort((a, b) => a - b);
    const n = projections.length;

    const sum = projections.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = projections.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    // Histogram: count projections in ranges
    const histogram = {
      'very_negative_[-1,-0.3)': projections.filter(p => p >= -1 && p < -0.3).length,
      'negative_[-0.3,-0.1)': projections.filter(p => p >= -0.3 && p < -0.1).length,
      'near_zero_[-0.1,0.1)': projections.filter(p => p >= -0.1 && p < 0.1).length,
      'positive_[0.1,0.3)': projections.filter(p => p >= 0.1 && p < 0.3).length,
      'very_positive_[0.3,1]': projections.filter(p => p >= 0.3 && p <= 1).length,
    };

    return {
      min: sorted[0],
      max: sorted[n - 1],
      mean,
      stdDev,
      median: sorted[Math.floor(n / 2)],
      q1: sorted[Math.floor(n / 4)],
      q3: sorted[Math.floor(3 * n / 4)],
      histogram,
      percentPositive: (projections.filter(p => p > 0).length / n * 100).toFixed(1) + '%',
      percentNearZero: (projections.filter(p => Math.abs(p) < 0.1).length / n * 100).toFixed(1) + '%',
    };
  }

  /**
   * Hash a key value for export (without exposing full key)
   */
  private async hashKeyForDebug(value: string | Uint8Array): Promise<string> {
    const encoder = new TextEncoder();
    const data = typeof value === 'string' ? encoder.encode(value) : value;
    // Type assertion needed for TypeScript's strict BufferSource typing
    const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Return first 16 characters of hash for identification
    return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate template with full debug data for analysis
   *
   * This method provides comprehensive export of the entire template generation
   * pipeline for debugging binarization mismatches between enrollment and verification:
   *
   * 1. Raw biometric → statistics
   * 2. Random matrix → hash (must match between enrollment/verification)
   * 3. Projections → distribution analysis
   * 4. Binarization → comparison of both methods
   *
   * NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING.
   * Each session computes its own mean/stdDev - no stats need to be stored or passed.
   *
   * @param biometric - Input biometric vector
   * @param method - Binarization method for primary template
   * @param phase - 'enrollment' or 'verification' (for export labeling)
   * @param credentialId - Credential ID for export labeling
   * @returns Template and full debug data for export
   */
  async generateTemplateWithFullDebug(
    biometric: Float32Array | number[],
    method: 'binary' | 'compact-sign-mag' | 'iom' | 'signmag3bit' | 'sign-mag-rank' | 'sign-mag-rank-16' = 'iom',
    phase: 'enrollment' | 'verification' = 'enrollment',
    credentialId: string = 'unknown'
  ): Promise<{
    template: BiometricTemplate;
    debug: FullDebugData;
  }> {
    const biometricArray = Array.from(biometric);

    console.log(`\n═══════════════════════════════════════════════════════════════════`);
    console.log(`🔬 FULL DEBUG TEMPLATE GENERATION [${phase.toUpperCase()}]`);
    console.log(`═══════════════════════════════════════════════════════════════════`);
    console.log(`   Phase: ${phase}`);
    console.log(`   Credential: ${credentialId}`);
    console.log(`   Selected method: ${method}`);
    console.log(`   Input dimensions: ${this.config.inputDim}`);
    console.log(`   Output dimensions: ${this.config.outputDim}`);
    console.log(`═══════════════════════════════════════════════════════════════════\n`);

    // Step 1: Compute raw biometric statistics
    const rawMin = Math.min(...biometricArray);
    const rawMax = Math.max(...biometricArray);
    const rawSum = biometricArray.reduce((a, b) => a + b, 0);
    const rawMean = rawSum / biometricArray.length;
    const rawVariance = biometricArray.reduce((acc, v) => acc + (v - rawMean) ** 2, 0) / biometricArray.length;
    const rawStdDev = Math.sqrt(rawVariance);

    console.log(`📊 Step 1: Raw Biometric Statistics`);
    console.log(`   Dimensions: ${biometricArray.length}`);
    console.log(`   Min: ${rawMin.toFixed(6)}`);
    console.log(`   Max: ${rawMax.toFixed(6)}`);
    console.log(`   Mean: ${rawMean.toFixed(6)}`);
    console.log(`   StdDev: ${rawStdDev.toFixed(6)}`);

    // Step 2: Derive composite key
    const compositeKey = await this.deriveCompositeKey();

    // Step 3: Generate Sparse matrix
    const Φ = await this.generateProjectionMatrix(compositeKey, this.config.outputDim!, this.config.inputDim);

    // Compute matrix hash for verification
    const matrixHash = await this.computeMatrixHash(Φ);

    // Analyze matrix sparsity
    let zeroCount = 0, positiveCount = 0, negativeCount = 0;
    for (const row of Φ) {
      for (const val of row) {
        if (val === 0) zeroCount++;
        else if (val > 0) positiveCount++;
        else negativeCount++;
      }
    }
    const totalElements = this.config.outputDim! * this.config.inputDim;
    const scaleFactor = Math.sqrt(3.0 / this.config.outputDim!);

    console.log(`\n📊 Step 2: Random Matrix Analysis`);
    console.log(`   Dimensions: ${this.config.outputDim} × ${this.config.inputDim}`);
    console.log(`   Total elements: ${totalElements}`);
    console.log(`   ⭐ Matrix Hash: ${matrixHash}`);
    console.log(`   Scale factor: ${scaleFactor.toFixed(6)}`);
    console.log(`   Sparsity: ${(zeroCount / totalElements * 100).toFixed(1)}% zeros`);

    // Step 4: Project biometric
    const projections = this.matrixVectorMultiply(Φ, biometricArray);

    // Analyze projection distribution
    const projectionStats = this.analyzeProjections(projections);

    console.log(`\n📊 Step 3: Projection Analysis`);
    console.log(`   Count: ${projections.length}`);
    console.log(`   Min: ${projectionStats.min.toFixed(6)}`);
    console.log(`   Max: ${projectionStats.max.toFixed(6)}`);
    console.log(`   Mean: ${projectionStats.mean.toFixed(6)}`);
    console.log(`   StdDev: ${projectionStats.stdDev.toFixed(6)}`);
    console.log(`   Median: ${projectionStats.median.toFixed(6)}`);
    console.log(`   Q1: ${projectionStats.q1.toFixed(6)}, Q3: ${projectionStats.q3.toFixed(6)}`);
    console.log(`   Percent positive: ${projectionStats.percentPositive}`);
    console.log(`   Percent near zero: ${projectionStats.percentNearZero}`);
    console.log(`   Histogram:`);
    console.log(`     Very negative [-1, -0.3): ${projectionStats.histogram['very_negative_[-1,-0.3)']}`);
    console.log(`     Negative [-0.3, -0.1): ${projectionStats.histogram['negative_[-0.3,-0.1)']}`);
    console.log(`     Near zero [-0.1, 0.1): ${projectionStats.histogram['near_zero_[-0.1,0.1)']}`);
    console.log(`     Positive [0.1, 0.3): ${projectionStats.histogram['positive_[0.1,0.3)']}`);
    console.log(`     Very positive [0.3, 1]: ${projectionStats.histogram['very_positive_[0.3,1]']}`);

    // Step 4: Z-Score Quantization - Create template based on selected method
    let selectedTemplate: number[];
    let templateBytes: Uint8Array;
    let codeHistogram: number[] = [];

    console.log(`\n📊 Step 4: Z-Score Quantization (${method})`);

    if (method === 'sign-mag-rank') {
      // Sign + Magnitude Rank (Mean-Centered): 128 values, each 0-8 (symmetric around 4)
      // SELF-NORMALIZING: Each session computes its own mean/stdDev
      const signMagRankResult = this.signMagnitudeRankMeanCentered(projections);
      selectedTemplate = signMagRankResult.template;
      templateBytes = this.pack4BitToBytes(selectedTemplate); // 9 values need 4 bits

      // Compute histogram
      codeHistogram = new Array(9).fill(0);
      selectedTemplate.forEach(code => codeHistogram[code]++);
      const centerCount = codeHistogram[4];
      const aboveCount = codeHistogram.slice(0, 4).reduce((a, b) => a + b, 0);
      const belowCount = codeHistogram.slice(5, 9).reduce((a, b) => a + b, 0);

      console.log(`   ┌─────────────────────────────────────────────────────────────────┐`);
      console.log(`   │  8   7   6   5   4   3   2   1   0                              │`);
      console.log(`   │ ≥2σ 1.5σ 1σ 0.5σ MEAN 0.5σ 1σ 1.5σ ≥2σ                         │`);
      console.log(`   │ below ←─────────────→ above                                     │`);
      console.log(`   └─────────────────────────────────────────────────────────────────┘`);
      console.log(`   Template (first 20): [${selectedTemplate.slice(0, 20).join(', ')}]`);
      console.log(`   Distribution [0-8]: [${codeHistogram.join(', ')}]`);
      console.log(`   Center (4): ${centerCount}, Above (0-3): ${aboveCount}, Below (5-8): ${belowCount}`);

    } else if (method === 'sign-mag-rank-16') {
      // Sign + Magnitude Rank 16-Value (Mean-Centered): 128 values, each 0-15
      const signMagRank16Result = this.signMagnitudeRank16Value(projections);
      selectedTemplate = signMagRank16Result.template;
      templateBytes = this.pack4BitToBytes(selectedTemplate);

      codeHistogram = new Array(16).fill(0);
      selectedTemplate.forEach(code => codeHistogram[code]++);
      console.log(`   Range: 0-15 (16 values), 4 bits/value`);
      console.log(`   Template (first 20): [${selectedTemplate.slice(0, 20).join(', ')}]`);
      console.log(`   Distribution [0-15]: [${codeHistogram.join(', ')}]`);

    } else if (method === 'iom') {
      // Index-of-Max (IoM) - ranking based
      const groupSize = 4;
      const bitsPerIndex = Math.ceil(Math.log2(groupSize));
      const indexOfMaxTemplate: number[] = [];
      const indexDistribution: number[] = new Array(groupSize).fill(0);

      for (let i = 0; i < projections.length; i += groupSize) {
        const group = projections.slice(i, Math.min(i + groupSize, projections.length));
        let maxIndex = 0;
        let maxValue = group[0];
        for (let j = 1; j < group.length; j++) {
          if (group[j] > maxValue) {
            maxValue = group[j];
            maxIndex = j;
          }
        }
        indexOfMaxTemplate.push(maxIndex);
        indexDistribution[maxIndex]++;
      }

      selectedTemplate = indexOfMaxTemplate;
      templateBytes = this.packNBitToBytes(indexOfMaxTemplate, bitsPerIndex);
      codeHistogram = indexDistribution;
      console.log(`   Group size: ${groupSize}, Bits per output: ${bitsPerIndex}`);
      console.log(`   Template (first 20): [${selectedTemplate.slice(0, 20).join(', ')}]`);
      console.log(`   Index distribution: [${indexDistribution.join(', ')}]`);

    } else if (method === 'signmag3bit') {
      // 3-bit Sign-Magnitude: 128 values, each 0-7
      selectedTemplate = this.signMagnitude3Bit(projections);
      templateBytes = this.pack3BitToBytes(selectedTemplate);
      codeHistogram = new Array(8).fill(0);
      selectedTemplate.forEach(code => codeHistogram[code]++);
      console.log(`   Range: 0-7, 3 bits/value`);
      console.log(`   Template (first 20): [${selectedTemplate.slice(0, 20).join(', ')}]`);

    } else if (method === 'compact-sign-mag') {
      // Compact-sign-mag (4-bit: sign + magnitude)
      const compactTemplate: number[] = [];
      for (const p of projections) {
        const signBit = p >= 0 ? 1 : 0;
        const absValue = Math.abs(p);
        const decimalDigit = Math.floor(absValue * 10);
        const magnitude = Math.min(7, decimalDigit);
        const encoded = (signBit << 3) | magnitude;
        compactTemplate.push(encoded);
      }
      selectedTemplate = compactTemplate;
      templateBytes = this.pack4BitToBytes(compactTemplate);
      console.log(`   4-bit encoding: sign(1) + magnitude(3)`);
      console.log(`   Template (first 20): [${selectedTemplate.slice(0, 20).join(', ')}]`);

    } else {
      // Binary (1-bit) - legacy method
      const binaryTemplate = projections.map(p => (p > 0 ? 1 : 0));
      selectedTemplate = binaryTemplate;
      templateBytes = this.packBitsToBytes(binaryTemplate);
      const ones = binaryTemplate.filter(v => v === 1).length;
      console.log(`   1-bit encoding: p > 0 ? 1 : 0`);
      console.log(`   Template (first 20): [${selectedTemplate.slice(0, 20).join(', ')}]`);
      console.log(`   Balance: ${(ones / projections.length * 100).toFixed(1)}% ones`);
    }

    // Hash keys for debug output (without exposing full keys)
    const productKeyHash = await this.hashKeyForDebug(this.config.productKey);
    const ztizenKeyHash = await this.hashKeyForDebug(this.config.ztizenKey);
    const userKeyHash = await this.hashKeyForDebug(this.config.userKey);

    console.log(`\n📊 Step 5: Key Identification`);
    console.log(`   Product Key Hash: ${productKeyHash}`);
    console.log(`   ZTIZEN Key Hash: ${ztizenKeyHash}`);
    console.log(`   User Key Hash: ${userKeyHash}`);
    console.log(`   Version: ${this.config.version}`);

    console.log(`\n═══════════════════════════════════════════════════════════════════`);
    console.log(`✅ FULL DEBUG TEMPLATE GENERATION COMPLETE`);
    console.log(`═══════════════════════════════════════════════════════════════════\n`);

    // Build debug data
    const debug: FullDebugData = {
      phase,
      timestamp: new Date().toISOString(),
      credentialId,

      rawBiometric: {
        source: 'face-api-128d',
        dimensions: biometricArray.length,
        values: biometricArray.map(v => parseFloat(v.toFixed(6))),
        statistics: {
          min: parseFloat(rawMin.toFixed(6)),
          max: parseFloat(rawMax.toFixed(6)),
          mean: parseFloat(rawMean.toFixed(6)),
          stdDev: parseFloat(rawStdDev.toFixed(6)),
        },
      },

      randMatrix: {
        dimensions: `${this.config.outputDim}x${this.config.inputDim}`,
        totalElements,
        hash: matrixHash,
        scaleFactor: parseFloat(scaleFactor.toFixed(6)),
        sparsity: {
          zeroCount,
          zeroPercent: (zeroCount / totalElements * 100).toFixed(1) + '%',
          positiveCount,
          negativeCount,
        },
        samples: {
          row0: Φ[0].slice(0, 20).map(v => parseFloat(v.toFixed(6))),
          row127: Φ[this.config.outputDim! - 1].slice(0, 20).map(v => parseFloat(v.toFixed(6))),
        },
      },

      projections: {
        count: projections.length,
        values: projections.map(v => parseFloat(v.toFixed(6))),
        statistics: {
          ...projectionStats,
          min: parseFloat(projectionStats.min.toFixed(6)),
          max: parseFloat(projectionStats.max.toFixed(6)),
          mean: parseFloat(projectionStats.mean.toFixed(6)),
          stdDev: parseFloat(projectionStats.stdDev.toFixed(6)),
          median: parseFloat(projectionStats.median.toFixed(6)),
          q1: parseFloat(projectionStats.q1.toFixed(6)),
          q3: parseFloat(projectionStats.q3.toFixed(6)),
        },
      },

      binarization: {
        // Only store the executed method - no unused comparison methods
        method,
        template: selectedTemplate,
        histogram: codeHistogram,
        stats: {
          mean: parseFloat(projectionStats.mean.toFixed(6)),
          stdDev: parseFloat(projectionStats.stdDev.toFixed(6)),
        },
      },

      keys: {
        productKeyHash,
        ztizenKeyHash,
        userKeyHash,
        version: this.config.version!,
      },
    };

    // Return template and debug data
    // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
    // No stats need to be stored - each session computes its own mean/stdDev
    return {
      template: {
        template: selectedTemplate,
        templateBytes,
        biometric: biometricArray,
        algorithm: 'gaussian-sparse',
        config: this.config,
        timestamp: Date.now(),
        intermediate: {
          projectionMatrix: Φ,
          projections,
        },
      },
      debug,
    };
  }

  /**
   * Pack N-bit values into bytes (generic version)
   *
   * @param values - Array of values (each 0 to 2^n - 1)
   * @param bitsPerValue - Number of bits per value
   * @returns Packed bytes
   */
  private packNBitToBytes(values: number[], bitsPerValue: number): Uint8Array {
    const totalBits = values.length * bitsPerValue;
    const totalBytes = Math.ceil(totalBits / 8);
    const bytes = new Uint8Array(totalBytes);

    let bitOffset = 0;
    for (const value of values) {
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;
      const bitsLeft = 8 - bitInByte;

      if (bitsPerValue <= bitsLeft) {
        // Fits in current byte
        bytes[byteIndex] |= (value << bitInByte) & 0xFF;
      } else {
        // Spans multiple bytes
        bytes[byteIndex] |= (value << bitInByte) & 0xFF;
        let remaining = bitsPerValue - bitsLeft;
        let nextValue = value >> bitsLeft;
        let nextByteIndex = byteIndex + 1;

        while (remaining > 0 && nextByteIndex < totalBytes) {
          bytes[nextByteIndex] |= nextValue & 0xFF;
          nextValue >>= 8;
          remaining -= 8;
          nextByteIndex++;
        }
      }

      bitOffset += bitsPerValue;
    }

    console.log(`   Packed ${values.length} × ${bitsPerValue}-bit values → ${bytes.length} bytes`);
    return bytes;
  }

  /**
   * Pack 5-bit values into bytes
   *
   * 256 values × 5 bits = 1280 bits = 160 bytes
   *
   * @param template - Array of 5-bit values (0-31)
   * @returns Packed bytes
   */
  private pack5BitToBytes(template: number[]): Uint8Array {
    const totalBits = template.length * 5;
    const totalBytes = Math.ceil(totalBits / 8);
    const bytes = new Uint8Array(totalBytes);

    let bitOffset = 0;
    for (const value of template) {
      // value is 0-31 (5 bits)
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;

      if (bitInByte <= 3) {
        // Fits entirely in current byte (bits 0-4)
        bytes[byteIndex] |= (value << bitInByte) & 0xFF;
      } else {
        // Spans two bytes
        bytes[byteIndex] |= (value << bitInByte) & 0xFF;
        if (byteIndex + 1 < totalBytes) {
          bytes[byteIndex + 1] |= value >> (8 - bitInByte);
        }
      }

      bitOffset += 5;
    }

    console.log(`   Packed ${template.length} × 5-bit values → ${bytes.length} bytes`);

    return bytes;
  }

  /**
   * Calculate template statistics for 5-bit Sign+Magnitude encoding
   */
  private calculateSignMagStats(template: number[]): {
    length: number;
    positiveCount: number;
    negativeCount: number;
    avgMagnitude: number;
    uniqueValues: number;
    balance: string;
  } {
    let positiveCount = 0;
    let magnitudeSum = 0;

    for (const v of template) {
      const sign = (v >> 4) & 1;
      const magnitude = v & 0xF;

      if (sign === 1) positiveCount++;
      magnitudeSum += magnitude;
    }

    const negativeCount = template.length - positiveCount;
    const avgMagnitude = magnitudeSum / template.length;
    const uniqueValues = new Set(template).size;
    const balance = `${(positiveCount / template.length * 100).toFixed(1)}% positive`;

    return {
      length: template.length,
      positiveCount,
      negativeCount,
      avgMagnitude,
      uniqueValues,
      balance,
    };
  }

  // ---------------------------------------------------------------------------
  // UTILITY FUNCTIONS
  // ---------------------------------------------------------------------------

  /**
   * Pack binary array into bytes
   */
  private packBitsToBytes(bits: number[]): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));

    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === 1) {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = i % 8;
        bytes[byteIndex] |= 1 << bitIndex;
      }
    }

    return bytes;
  }

  /**
   * Calculate template statistics
   */
  private calculateTemplateStats(template: number[]): {
    length: number;
    ones: number;
    zeros: number;
    balance: string;
  } {
    const ones = template.filter(b => b === 1).length;
    const zeros = template.length - ones;
    const balance = ((ones / template.length) * 100).toFixed(1);

    return {
      length: template.length,
      ones,
      zeros,
      balance: `${balance}% ones`,
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: BiometricConfig): void {
    if (config.inputDim < 64) {
      throw new Error(`Input dimension too small: ${config.inputDim} (minimum 64)`);
    }

    if (config.userKey.length !== 32) {
      throw new Error(`User key must be 32 bytes, got ${config.userKey.length}`);
    }

    if (!config.productKey || !config.ztizenKey) {
      throw new Error('Product key and ZTIZEN key are required');
    }

    const validAlgorithms: AlgorithmType[] = ['biohashing', 'sparse-szq', 'gaussian-sparse'];
    if (!validAlgorithms.includes(config.algorithm)) {
      throw new Error(`Invalid algorithm: '${config.algorithm}'. Valid options: ${validAlgorithms.join(', ')}`);
    }
  }
}

// =============================================================================
// CRYPTOGRAPHICALLY SECURE RNG (SHA-256)
// =============================================================================

/**
 * Cryptographically Secure RNG using SHA-256 (HMAC-DRBG style)
 *
 * Replaces AES-CTR for simpler, more portable implementation.
 * Uses Web Crypto API for native SHA-256 implementation.
 *
 * Security Properties:
 * - SHA-256 is NIST approved (FIPS 180-4)
 * - Counter mode: H(state || counter) for each output
 * - Outputs are computationally indistinguishable from random
 * - Cannot derive internal state from outputs
 *
 * Determinism:
 * - Same 32-byte seed produces identical sequence
 * - Required for enrollment/verification matching
 *
 * Performance:
 * - Buffered generation (4K floats per refill)
 * - Native crypto implementation via Web Crypto API
 *
 * Reference: NIST SP 800-90A (HMAC-DRBG specification)
 *
 * @see MATH_WALKTHROUGH.md Appendix B for security analysis
 */
class CryptoRNG {
  private state: Uint8Array;
  private counter: number;
  private buffer: Float32Array;
  private cursor: number;
  readonly BUFFER_SIZE = 4096; // 4K floats per batch (each SHA-256 gives 8 floats)

  private constructor(seedBytes: Uint8Array) {
    this.state = seedBytes;
    this.counter = 0;
    this.buffer = new Float32Array(0);
    this.cursor = 0;
  }

  /**
   * Create a CryptoRNG instance from a 32-byte seed
   *
   * @param seedBytes - 32-byte seed (e.g., from SHA-256 of composite key)
   * @returns Initialized CryptoRNG ready for use
   * @throws Error if seed is not exactly 32 bytes
   */
  static async create(seedBytes: Uint8Array): Promise<CryptoRNG> {
    // Validate seed length
    if (seedBytes.length !== 32) {
      throw new Error(`CryptoRNG requires 32-byte seed, got ${seedBytes.length}`);
    }

    console.log(`   ┌─ CryptoRNG.create() ─────────────────────────────────────`);
    console.log(`   │ Using SHA-256 based CSPRNG (HMAC-DRBG style)`);
    console.log(`   │ Seed: ${Array.from(seedBytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}...`);

    const rng = new CryptoRNG(seedBytes);
    console.log(`   │ Counter initialized: 0`);

    await rng.refill(); // Pre-fill buffer
    console.log(`   │ ✓ Initial buffer filled: ${rng.BUFFER_SIZE} floats ready`);
    console.log(
      `   │ First 5 buffer values: [${Array.from(rng.buffer.slice(0, 5))
        .map(v => v.toFixed(4))
        .join(', ')}]`
    );
    console.log(`   └────────────────────────────────────────────────────────────`);

    return rng;
  }

  /**
   * Generate next random number in [0, 1)
   *
   * Uses buffered generation for efficiency.
   * Each call consumes one float from the buffer.
   */
  async next(): Promise<number> {
    if (this.cursor >= this.buffer.length) {
      await this.refill();
    }
    return this.buffer[this.cursor++];
  }

  /**
   * Refill the internal buffer with fresh random floats
   *
   * Uses SHA-256 in counter mode: H(state || counter)
   * Each SHA-256 hash produces 32 bytes = 8 floats
   */
  private async refill(): Promise<void> {
    const hashesNeeded = Math.ceil(this.BUFFER_SIZE / 8); // 8 floats per hash
    this.buffer = new Float32Array(this.BUFFER_SIZE);
    let bufferIndex = 0;

    for (let i = 0; i < hashesNeeded && bufferIndex < this.BUFFER_SIZE; i++) {
      // Create input: state || counter (32 bytes + 4 bytes)
      const input = new Uint8Array(36);
      input.set(this.state, 0);
      // Write counter as big-endian 32-bit integer
      input[32] = (this.counter >> 24) & 0xff;
      input[33] = (this.counter >> 16) & 0xff;
      input[34] = (this.counter >> 8) & 0xff;
      input[35] = this.counter & 0xff;

      // Compute SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', input);
      const hashView = new DataView(hashBuffer);

      // Extract 8 floats from 32-byte hash
      for (let j = 0; j < 8 && bufferIndex < this.BUFFER_SIZE; j++) {
        const randomInt = hashView.getUint32(j * 4, false); // big-endian
        this.buffer[bufferIndex++] = randomInt / 0xffffffff;
      }

      this.counter++;
    }

    this.cursor = 0;
  }
}
