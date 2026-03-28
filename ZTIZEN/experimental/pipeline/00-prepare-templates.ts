
/**
 * ============================================================================
 * PHASE 1: TEMPLATE PREPARATION (Run Once - Save to JSON)
 * ============================================================================
 *
 * Pre-computes ALL BioHash + Poseidon templates and saves to persistent JSON files.
 *
 * Purpose:
 * - Separate computation (expensive) from analysis (instant)
 * - Enable reproducible experiments with persistent cache
 * - Allow fast iteration on analysis logic without recomputation
 *
 * Pipeline:
 * 1. Load face embeddings from FaceScrub dataset
 * 2. For each person × capture × 2 keys (A & B):
 *    - Generate BioHash template (128 bits)
 *    - Generate Poseidon hashes (128 bigints)
 * 3. Save to JSON: data/precomputed-templates/{library}_templates.json
 *
 * Time: ~4-5 minutes per library (ONE-TIME cost)
 * Output: ~100-150 MB JSON per library
 *
 * Usage:
 *   npx tsx pipeline/00-prepare-templates.ts --lib=facenet
 *   npx tsx pipeline/00-prepare-templates.ts  (all libraries)
 */

import { createHash } from 'crypto'
import { writeFileSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { loadRealEmbeddings } from '../utils/load-embeddings'
import { CRYPTO_KEYS, SZQ_CONFIGS } from '../utils/config'
import { biohash } from '../utils/biohashing'
import { generatePoseidonBitHashes } from '../utils/poseidon'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TemplateData {
  biohash: number[]           // 128 bits (0/1 array)
  poseidon: string[]          // 128 bigints as strings (for JSON serialization)
}

interface CaptureTemplates {
  keyA: TemplateData
  keyB: TemplateData
}

interface PrecomputedTemplates {
  library: string
  outputDim: number
  totalPersons: number
  totalCaptures: number
  keys: {
    A: string                 // Key A identifier (for debugging)
    B: string                 // Key B identifier (for debugging)
  }
  templates: Record<string, Record<string, CaptureTemplates>>
  // Structure: templates[personId][captureIndex] = { keyA, keyB }
}

// ============================================================================
// MAIN PREPARATION FUNCTION
// ============================================================================

/**
 * Prepare templates for a single library
 *
 * Computes BioHash + Poseidon for all persons × captures × 2 keys
 *
 * @param library Library name (faceapijs, facenet, facenet512, arcface)
 * @returns Precomputed templates object
 */
async function prepareTemplatesForLibrary(
  library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface'
): Promise<PrecomputedTemplates> {
  console.log(`\n━━━ Preparing ${library} ━━━`)

  // Load embeddings from FaceScrub dataset
  const { persons, totalCaptures, library: libName } = loadRealEmbeddings(library)
  console.log(`  Loaded ${persons.size} persons, ${totalCaptures} captures`)

  // Get configuration
  const config = library === 'faceapijs'
    ? SZQ_CONFIGS.faceapi
    : SZQ_CONFIGS[library as 'facenet' | 'facenet512' | 'arcface']

  // Generate composite keys (SHA-256(Kp + Kz + Ku))
  const compositeKeyA = createHash('sha256')
    .update(CRYPTO_KEYS.PRODUCT_KEY + CRYPTO_KEYS.ZTIZEN_KEY + CRYPTO_KEYS.USER_KEYS[0])
    .digest()

  const compositeKeyB = createHash('sha256')
    .update(CRYPTO_KEYS.PRODUCT_KEY + CRYPTO_KEYS.ZTIZEN_KEY + CRYPTO_KEYS.USER_KEYS[1])
    .digest()

  // Initialize result structure
  const result: PrecomputedTemplates = {
    library: config.name,
    outputDim: config.outputDim,
    totalPersons: persons.size,
    totalCaptures: 0,
    keys: {
      A: `User Key 0 (${CRYPTO_KEYS.USER_KEYS[0].substring(0, 16)}...)`,
      B: `User Key 1 (${CRYPTO_KEYS.USER_KEYS[1].substring(0, 16)}...)`,
    },
    templates: {},
  }

  let processedPersons = 0
  const startTime = performance.now()

  // Process each person
  for (const [personId, captures] of persons.entries()) {
    result.templates[personId] = {}

    // Process each capture
    for (let captureIdx = 0; captureIdx < captures.length; captureIdx++) {
      const embedding = captures[captureIdx]

      // ===== KEY A: BioHash + Poseidon =====
      const biohashA = await biohash(embedding, compositeKeyA, config.outputDim)
      const poseidonA = generatePoseidonBitHashes(
        biohashA,
        CRYPTO_KEYS.PRODUCT_KEY,
        CRYPTO_KEYS.ZTIZEN_KEY,
        CRYPTO_KEYS.USER_KEYS[0]
      )

      // ===== KEY B: BioHash + Poseidon =====
      const biohashB = await biohash(embedding, compositeKeyB, config.outputDim)
      const poseidonB = generatePoseidonBitHashes(
        biohashB,
        CRYPTO_KEYS.PRODUCT_KEY,
        CRYPTO_KEYS.ZTIZEN_KEY,
        CRYPTO_KEYS.USER_KEYS[1]
      )

      // Store templates (convert bigint[] to string[] for JSON)
      result.templates[personId][captureIdx.toString()] = {
        keyA: {
          biohash: biohashA,
          poseidon: poseidonA.map(bi => bi.toString()),
        },
        keyB: {
          biohash: biohashB,
          poseidon: poseidonB.map(bi => bi.toString()),
        },
      }

      result.totalCaptures++
    }

    processedPersons++

    // Progress logging every 50 persons
    if (processedPersons % 50 === 0) {
      const elapsed = (performance.now() - startTime) / 1000
      const rate = processedPersons / elapsed
      const eta = (persons.size - processedPersons) / rate
      console.log(
        `  Progress: ${processedPersons}/${persons.size} persons ` +
        `(${elapsed.toFixed(1)}s elapsed, ETA: ${eta.toFixed(0)}s)`
      )
    }
  }

  const totalTime = (performance.now() - startTime) / 1000
  console.log(`  ✓ Completed in ${totalTime.toFixed(1)}s`)
  console.log(
    `  ✓ Processed ${result.totalCaptures} captures × 2 keys = ` +
    `${result.totalCaptures * 2} templates`
  )

  return result
}

/**
 * Save precomputed templates to JSON file
 *
 * @param library Library name
 * @param data Precomputed templates
 */
function saveTemplates(
  library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface',
  data: PrecomputedTemplates
): void {
  const outputDir = join(process.cwd(), 'data', 'precomputed-templates')
  mkdirSync(outputDir, { recursive: true })

  const outputPath = join(outputDir, `${library}_templates.json`)

  console.log(`  Writing to ${outputPath}...`)
  writeFileSync(outputPath, JSON.stringify(data, null, 2))

  // Show file size
  const stats = statSync(outputPath)
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
  console.log(`  ✓ Saved ${sizeMB} MB to ${outputPath}`)
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  PHASE 1: TEMPLATE PREPARATION (Pre-compute & Save)')
  console.log('═══════════════════════════════════════════════════════════')

  // Parse command line arguments
  const args = process.argv.slice(2)
  const libArg = args.find(arg => arg.startsWith('--lib='))
  const selectedLib = libArg ? libArg.split('=')[1] : null

  const validLibs = ['faceapijs', 'facenet', 'facenet512', 'arcface']

  // Validate library argument
  if (selectedLib && !validLibs.includes(selectedLib)) {
    console.error(`\n✗ Invalid library: ${selectedLib}`)
    console.error(`  Valid options: ${validLibs.join(', ')}`)
    process.exit(1)
  }

  // Determine which libraries to process
  const librariesToProcess = selectedLib
    ? [selectedLib as typeof validLibs[number]]
    : validLibs

  console.log(`\nProcessing ${librariesToProcess.length} library(ies): ${librariesToProcess.join(', ')}`)
  console.log('')

  // Process each library
  for (const lib of librariesToProcess as Array<'faceapijs' | 'facenet' | 'facenet512' | 'arcface'>) {
    try {
      const templates = await prepareTemplatesForLibrary(lib)
      saveTemplates(lib, templates)
    } catch (error) {
      console.error(`\n✗ Error processing ${lib}:`, error)
      process.exit(1)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  ✓ All templates prepared successfully!')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('\nNext step:')
  console.log('  Run analysis: npx tsx pipeline/01-analyze-four-scenarios.ts')
  console.log('')
}

// Run if called directly (ES module compatible)
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { prepareTemplatesForLibrary, saveTemplates }
export type { PrecomputedTemplates, CaptureTemplates, TemplateData }
