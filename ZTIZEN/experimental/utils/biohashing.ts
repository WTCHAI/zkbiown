/**
 * BioHashing Implementation - Extracted from Production Code
 *
 * Paper: "Random Multispace Quantization as an Analytic Mechanism for BioHashing"
 * Authors: Teoh, Ngo, Goh (IEEE TPAMI 2006)
 *
 * This is the CORRECT implementation using:
 * - Gaussian random projection with scaling factor 1/√outputDim
 * - Gram-Schmidt orthogonalization for independent bits
 * - Cryptographically secure RNG seeded from composite key
 *
 * Source: web/src/lib/CancelableBiometric.ts
 */

/**
 * Cryptographically Secure Random Number Generator
 *
 * Uses SHA-256 in counter mode to generate deterministic random stream
 * Based on HMAC-DRBG (NIST SP 800-90A)
 *
 * Reference: NIST SP 800-90A (HMAC-DRBG specification)
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

    const rng = new CryptoRNG(seedBytes);
    await rng.refill(); // Pre-fill buffer
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

/**
 * Gram-Schmidt Orthogonalization
 *
 * Transforms a set of vectors into an orthonormal basis.
 *
 * Purpose in BioHashing:
 * - Ensures each projected bit is statistically independent
 * - Prevents information leakage between bits
 * - Better discrimination between genuine/imposter
 *
 * @param vectors Input vectors [m × n]
 * @returns Orthonormal vectors [m × n]
 */
export function gramSchmidt(vectors: number[][]): number[][] {
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
 * Generate Gaussian Random Projection Matrix with Gram-Schmidt (BioHashing)
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
 *
 * @param compositeKey - 32-byte seed from SHA-256(Kp || Kz || Ku)
 * @param outputDim - Number of output bits (m)
 * @param inputDim - Dimension of input embedding (n)
 * @returns Orthonormal projection matrix [m × n]
 */
export async function generateGaussianMatrix(
  compositeKey: Uint8Array,
  outputDim: number,
  inputDim: number
): Promise<number[][]> {
  // Create CryptoRNG from composite key
  const rng = await CryptoRNG.create(compositeKey);
  const scaleFactor = 1.0 / Math.sqrt(outputDim);

  // Step 1: Generate Gaussian random matrix
  // R[i][j] ~ (1/√m) × N(0,1)
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

  // Step 2: Gram-Schmidt Orthogonalization
  // Transform random vectors into orthonormal basis
  const matrix = gramSchmidt(randomMatrix);

  return matrix;
}

/**
 * Matrix-Vector Multiplication: y = Φ · x
 *
 * @param matrix Projection matrix [m × n]
 * @param vector Input vector [n]
 * @returns Projected vector [m]
 */
export function matrixVectorMultiply(matrix: number[][], vector: number[]): number[] {
  return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
}

/**
 * Binarize vector using threshold τ = 0
 *
 * B[i] = { 1 if y[i] > 0
 *        { 0 otherwise
 *
 * @param vector Projected vector (real-valued)
 * @returns Binary template (0/1)
 */
export function binarize(vector: number[]): number[] {
  return vector.map(v => (v > 0 ? 1 : 0));
}

/**
 * Main BioHashing Function
 *
 * Transforms a biometric embedding into a binary template using:
 * 1. Gaussian random projection with Gram-Schmidt orthogonalization
 * 2. Binary quantization (threshold τ = 0)
 *
 * Properties:
 * - Revocability: Different keys → completely different templates
 * - Unlinkability: Cannot link templates from different keys
 * - Verifiability: Same biometric + same key → similar template
 *
 * @param embedding Input biometric embedding (e.g., face embedding)
 * @param compositeKey 32-byte composite key from SHA-256(Kp || Kz || Ku)
 * @param outputDim Number of output bits (default: 128)
 * @returns Binary template (0/1 array)
 */
export async function biohash(
  embedding: number[],
  compositeKey: Uint8Array,
  outputDim: number = 128
): Promise<number[]> {
  const inputDim = embedding.length;

  // Generate orthonormal projection matrix
  const projectionMatrix = await generateGaussianMatrix(compositeKey, outputDim, inputDim);

  // Project embedding: y = Φ · x
  const projected = matrixVectorMultiply(projectionMatrix, embedding);

  // Binarize: B[i] = 1 if y[i] > 0, else 0
  return binarize(projected);
}

/**
 * Hamming Distance between two binary templates
 *
 * Used to measure similarity:
 * - Distance 0 = identical templates
 * - Distance n = completely different
 *
 * @param template1 First binary template
 * @param template2 Second binary template
 * @returns Number of differing bits
 */
export function hammingDistance(template1: number[], template2: number[]): number {
  if (template1.length !== template2.length) {
    throw new Error(`Template length mismatch: ${template1.length} vs ${template2.length}`);
  }

  let distance = 0;
  for (let i = 0; i < template1.length; i++) {
    if (template1[i] !== template2[i]) {
      distance++;
    }
  }
  return distance;
}

/**
 * Hamming Similarity (normalized)
 *
 * Returns similarity as percentage (0-100%)
 * - 100% = identical
 * - 50% = random (expected for different biometrics or different keys)
 * - 0% = completely opposite
 *
 * @param template1 First binary template
 * @param template2 Second binary template
 * @returns Similarity percentage (0-100)
 */
export function hammingSimilarity(template1: number[], template2: number[]): number {
  const distance = hammingDistance(template1, template2);
  const maxDistance = template1.length;
  return ((maxDistance - distance) / maxDistance) * 100;
}
