/**
 * ============================================================================
 * SZQ (Symmetric Z-Score Quantization) MAIN CONFIGURATION
 * ============================================================================
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL SZQ THRESHOLD CONFIGURATIONS.
 * All experiment files should import from this file to ensure consistency.
 *
 * OPTIMIZED CONFIGURATIONS (User Verified):
 * ┌─────────────────┬────────────────┬───────────────┬──────────────────────────┐
 * │ Library         │ thresholdScale │ Sweet Spot    │ Expected Results         │
 * ├─────────────────┼────────────────┼───────────────┼──────────────────────────┤
 * │ face-api.js     │ 1.4            │ ±0.70σ        │ 100% GAR, ~0.2% FAR      │
 * │ FaceNet (128D)  │ 2.0            │ ±1.00σ        │ 74% GAR, 0% FAR          │
 * │ FaceNet512      │ 2.4            │ ±1.20σ        │ 93% GAR, ~2% FAR         │
 * │ ArcFace         │ 2.4            │ ±1.20σ        │ 77% GAR, 0% FAR          │
 * └─────────────────┴────────────────┴───────────────┴──────────────────────────┘
 *
 * KEY FORMULA:
 *   thresholdScale = 2 × (sweet_spot_sigma)
 *   Example: ±0.70σ → thresholdScale = 1.4
 *            ±1.20σ → thresholdScale = 2.4
 *
 * CIRCUIT THRESHOLD:
 *   All libraries use 102/128 = 79.7% match threshold for ZK circuit verification.
 *
 * DATE: 2026-02-18
 * VERIFIED BY: User preference based on sweep test results
 */

export type LibraryName = 'faceapi' | 'facenet' | 'facenet512' | 'arcface'

// Alternative field names used in different data sources
export type LibraryFieldName = 'faceapi' | 'faceapijs' | 'facenet' | 'facenet512' | 'arcface'

export interface SZQConfig {
  inputDim: number
  outputDim: number
  threshold: number        // Circuit match threshold (79.7% of outputDim)
  thresholdScale: number   // Z-score bin width multiplier
  sweetSpot: string        // Human-readable threshold (±Xσ)
  name: string             // Display name
}

/**
 * MAIN SZQ CONFIGURATION - USE THIS FOR ALL EXPERIMENTS
 */
export const SZQ_CONFIGS: Record<LibraryName, SZQConfig> = {
  faceapi: {
    inputDim: 128,
    outputDim: 128,
    threshold: 102,          // 79.7% of 128
    thresholdScale: 1.4,     // ±0.70σ
    sweetSpot: '±0.70σ',
    name: 'face-api.js (128D)'
  },
  facenet: {
    inputDim: 128,
    outputDim: 128,
    threshold: 102,          // 79.7% of 128
    thresholdScale: 2.0,     // ±1.00σ
    sweetSpot: '±1.00σ',
    name: 'FaceNet (128D)'
  },
  facenet512: {
    inputDim: 512,
    outputDim: 128,          // Project to 128D for ZK circuit
    threshold: 102,          // 79.7% of 128
    thresholdScale: 2.4,     // ±1.20σ
    sweetSpot: '±1.20σ',
    name: 'FaceNet512 (512D)'
  },
  arcface: {
    inputDim: 512,
    outputDim: 128,          // Project to 128D for ZK circuit
    threshold: 102,          // 79.7% of 128
    thresholdScale: 2.4,     // ±1.20σ
    sweetSpot: '±1.20σ',
    name: 'ArcFace (512D)'
  },
}

/**
 * Map field names from different data sources to canonical library names
 */
export const FIELD_TO_LIBRARY: Record<LibraryFieldName, LibraryName> = {
  faceapi: 'faceapi',
  faceapijs: 'faceapi',  // Collected dataset uses this name
  facenet: 'facenet',
  facenet512: 'facenet512',
  arcface: 'arcface',
}

/**
 * Get config by field name (handles faceapijs → faceapi mapping)
 */
export function getConfigByField(fieldName: LibraryFieldName): SZQConfig {
  const libName = FIELD_TO_LIBRARY[fieldName]
  return SZQ_CONFIGS[libName]
}

/**
 * Constants for ZK circuit
 */
export const ZK_CIRCUIT = {
  OUTPUT_DIM: 128,
  THRESHOLD_PERCENT: 79.7,
  THRESHOLD_COUNT: 102,  // Math.floor(128 * 0.797)
}

/**
 * Cryptographic keys for template generation
 */
export const CRYPTO_KEYS = {
  PRODUCT_KEY: '8c2ab53680ab4f6b659dc79c929a7795bc8ce5770854b39402c92f98ef15537d',
  ZTIZEN_KEY: 'ca977f6e6db2eb0e98dcafa82f01c196139c0c4a6f310fc0373c0aa63ef767a4',
  SHARED_USER_KEY: '40ff15de82c75df608e2802d887f4322cccbc4f29e47f851e722f93f04673d1f',
  // Different keys for cancelability testing (one per person, up to 10)
  DIFFERENT_USER_KEYS: [
    '51ee26cf93d86ef719f3913e998f5433ddccd5e3af58f962f833e04e15784e20',
    '62dd37e0a4e97f082ae4a24fa99e6544eeddec4b0c69ea73e944f15f26895f31',
    '73cc48f1b5f08f193bf5b35fb00f7655fffee6bcd7a0fb84fa55f26f37906f42',
    '84bb59d2c6e19e204cf6c46ec11e8766000ff7cde8b1fc95fb66e37e48a17e53',
    '95aa6ae3d7f2af315de7d57fd22f9877111008eff9c20da60c77f48f59b28f64',
    'a6996bf4e803b0426ef8e680e33fa988222119f00ad31eb71d88059f6ac39075',
    'b7887c05f914c1537f09f791f44fba99333220011be42fc82e99060a7bd4a186',
    'c8778d16fa25d2648e1a08a2f55fcbaa4443310120f53ed93faa171b8ce5b297',
    'd9669e27eb36e3759f2b19b3f66fdcbb5554421231064fe04ebb282c9df6c3a8',
    'ea55af38fc47f486a03c2ac4f77fedcc6665532342175ef15fcc393dade7d4b9',
  ],
  // Alias for consistency (USER_KEYS points to DIFFERENT_USER_KEYS)
  get USER_KEYS() {
    return this.DIFFERENT_USER_KEYS;
  },
}

/**
 * Print configuration summary (for logging)
 */
export function printSZQConfigSummary(): string {
  const lines = [
    '┌─────────────────┬────────────────┬───────────────┬───────────────────┐',
    '│ Library         │ thresholdScale │ Sweet Spot    │ Dimensions        │',
    '├─────────────────┼────────────────┼───────────────┼───────────────────┤',
  ]

  for (const [key, config] of Object.entries(SZQ_CONFIGS)) {
    const dimStr = `${config.inputDim}D→${config.outputDim}D`
    lines.push(
      `│ ${config.name.padEnd(15)} │ ${config.thresholdScale.toFixed(1).padStart(14)} │ ${config.sweetSpot.padEnd(13)} │ ${dimStr.padEnd(17)} │`
    )
  }

  lines.push('└─────────────────┴────────────────┴───────────────┴───────────────────┘')

  return lines.join('\n')
}
