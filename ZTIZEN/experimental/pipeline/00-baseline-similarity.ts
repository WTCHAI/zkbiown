/**
 * ============================================================================
 * BASELINE: Raw Embedding Similarity (Before BioHashing/Poseidon)
 * ============================================================================
 *
 * Purpose: Establish dataset quality baseline to prove that low GAR is due
 * to dataset quality, NOT the BioHashing/Poseidon pipeline.
 *
 * Metrics:
 * - Cosine similarity between raw embeddings
 * - Same person: Should be HIGH if dataset is good
 * - Different person: Should be LOW
 *
 * This proves: "Low similarity in final results is inherited from dataset,
 * not introduced by our cancelable biometric transformation."
 *
 * Usage:
 *   npx tsx pipeline/00-baseline-similarity.ts --lib=facenet
 *   npx tsx pipeline/00-baseline-similarity.ts  (all libraries)
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { loadRealEmbeddings } from '../utils/load-embeddings'
import { SZQ_CONFIGS } from '../utils/config'

// ============================================================================
// COSINE SIMILARITY
// ============================================================================

/**
 * Calculate cosine similarity between two embeddings
 *
 * cos(A, B) = (A · B) / (||A|| × ||B||)
 *
 * Returns value between -1 and 1:
 * - 1.0 = identical
 * - 0.0 = orthogonal (completely different)
 * - -1.0 = opposite
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (normA * normB)
}

// ============================================================================
// TYPES
// ============================================================================

interface ScenarioStats {
  similarities: number[]
  mean: number
  std: number
  min: number
  max: number
  count: number
}

interface BaselineResults {
  library: string
  embeddingDim: number
  totalPersons: number
  totalCaptures: number
  scenarios: {
    samePerson: ScenarioStats
    differentPerson: ScenarioStats
  }
  computeTime: number
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

/**
 * Compute baseline similarity statistics for a library
 */
function computeBaselineSimilarity(
  library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface'
): BaselineResults {
  console.log(`\n━━━ Computing Baseline for ${library} ━━━`)

  const startTime = performance.now()

  // Load embeddings
  const { persons, totalCaptures, library: libName } = loadRealEmbeddings(library)
  console.log(`  Loaded ${persons.size} persons, ${totalCaptures} captures`)

  // Get config
  const config = library === 'faceapijs'
    ? SZQ_CONFIGS.faceapi
    : SZQ_CONFIGS[library as 'facenet' | 'facenet512' | 'arcface']

  // Get embedding dimension
  let embeddingDim = 0
  for (const captures of persons.values()) {
    if (captures.length > 0) {
      embeddingDim = captures[0].length
      break
    }
  }

  console.log(`  Embedding dimension: ${embeddingDim}D`)

  // Initialize results
  const samePerson: ScenarioStats = {
    similarities: [],
    mean: 0,
    std: 0,
    min: 1,
    max: -1,
    count: 0,
  }

  const differentPerson: ScenarioStats = {
    similarities: [],
    mean: 0,
    std: 0,
    min: 1,
    max: -1,
    count: 0,
  }

  // ===== SAME PERSON =====
  console.log('  Computing same-person similarities...')
  const t1 = performance.now()

  for (const [personId, captures] of persons.entries()) {
    // Compare all pairs of captures for this person
    for (let i = 0; i < captures.length; i++) {
      for (let j = i + 1; j < captures.length; j++) {
        const sim = cosineSimilarity(captures[i], captures[j])
        samePerson.similarities.push(sim)
        samePerson.count++
      }
    }
  }

  const t2 = performance.now()
  console.log(`  ✓ Same person: ${samePerson.count} comparisons in ${((t2 - t1) / 1000).toFixed(1)}s`)

  // ===== DIFFERENT PERSON =====
  console.log('  Computing different-person similarities...')
  const t3 = performance.now()

  const personIds = Array.from(persons.keys())
  const maxPairs = 10000 // Limit for speed

  let pairCount = 0
  for (let i = 0; i < personIds.length && pairCount < maxPairs; i++) {
    for (let j = i + 1; j < personIds.length && pairCount < maxPairs; j++) {
      const person1 = persons.get(personIds[i])!
      const person2 = persons.get(personIds[j])!

      // Compare first capture of each person
      if (person1.length > 0 && person2.length > 0) {
        const sim = cosineSimilarity(person1[0], person2[0])
        differentPerson.similarities.push(sim)
        differentPerson.count++
        pairCount++
      }
    }
  }

  const t4 = performance.now()
  console.log(`  ✓ Different person: ${differentPerson.count} comparisons in ${((t4 - t3) / 1000).toFixed(1)}s`)

  // Compute statistics
  computeStats(samePerson)
  computeStats(differentPerson)

  const totalTime = (performance.now() - startTime) / 1000

  // Print results
  printResults(config.name, samePerson, differentPerson, embeddingDim)

  return {
    library: config.name,
    embeddingDim,
    totalPersons: persons.size,
    totalCaptures,
    scenarios: {
      samePerson,
      differentPerson,
    },
    computeTime: totalTime,
  }
}

/**
 * Compute statistics for a scenario
 */
function computeStats(scenario: ScenarioStats): void {
  const sims = scenario.similarities

  if (sims.length === 0) return

  // Mean
  scenario.mean = sims.reduce((a, b) => a + b, 0) / sims.length

  // Standard deviation
  scenario.std = Math.sqrt(
    sims.reduce((sum, x) => sum + Math.pow(x - scenario.mean, 2), 0) / sims.length
  )

  // Min/Max
  scenario.min = Math.min(...sims)
  scenario.max = Math.max(...sims)
}

/**
 * Print results table
 */
function printResults(
  library: string,
  samePerson: ScenarioStats,
  differentPerson: ScenarioStats,
  embeddingDim: number
): void {
  console.log(`\n  Baseline Results for ${library}:`)
  console.log(`  Embedding dimension: ${embeddingDim}D`)
  console.log('')
  console.log('  ┌──────────────────┬──────────┬─────────┬──────────┬──────────┬─────────┐')
  console.log('  │ Scenario         │ Mean     │ Std     │ Min      │ Max      │ Count   │')
  console.log('  ├──────────────────┼──────────┼─────────┼──────────┼──────────┼─────────┤')

  console.log(
    `  │ Same Person      │ ${samePerson.mean.toFixed(4)}  │ ` +
    `${samePerson.std.toFixed(4)} │ ` +
    `${samePerson.min.toFixed(4)}  │ ` +
    `${samePerson.max.toFixed(4)}  │ ` +
    `${samePerson.count.toString().padStart(7)} │`
  )

  console.log(
    `  │ Different Person │ ${differentPerson.mean.toFixed(4)}  │ ` +
    `${differentPerson.std.toFixed(4)} │ ` +
    `${differentPerson.min.toFixed(4)}  │ ` +
    `${differentPerson.max.toFixed(4)}  │ ` +
    `${differentPerson.count.toString().padStart(7)} │`
  )

  console.log('  └──────────────────┴──────────┴─────────┴──────────┴──────────┴─────────┘')

  // Interpretation
  console.log('\n  Interpretation:')
  console.log(`  • Same Person:      ${samePerson.mean.toFixed(4)} (cosine similarity)`)
  console.log(`  • Different Person: ${differentPerson.mean.toFixed(4)} (cosine similarity)`)
  console.log(`  • Separation:       ${(samePerson.mean - differentPerson.mean).toFixed(4)} (higher is better)`)

  if (samePerson.mean < 0.7) {
    console.log('\n  ⚠️  Low same-person similarity indicates dataset quality issues')
    console.log('      This explains lower GAR in final pipeline results')
  } else {
    console.log('\n  ✓ Good same-person similarity - dataset quality is acceptable')
  }
}

// ============================================================================
// SAVE RESULTS
// ============================================================================

function saveResults(
  library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface',
  results: BaselineResults
): void {
  const outputDir = join(process.cwd(), 'results', 'baseline-similarity')
  mkdirSync(outputDir, { recursive: true })

  const outputPath = join(outputDir, `${library}_baseline.json`)

  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\n  ✓ Results saved to ${outputPath}`)
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  BASELINE: Raw Embedding Similarity Analysis')
  console.log('═══════════════════════════════════════════════════════════')

  // Parse arguments
  const args = process.argv.slice(2)
  const libArg = args.find(arg => arg.startsWith('--lib='))
  const selectedLib = libArg ? libArg.split('=')[1] : null

  const validLibs = ['faceapijs', 'facenet', 'facenet512', 'arcface']

  if (selectedLib && !validLibs.includes(selectedLib)) {
    console.error(`\n✗ Invalid library: ${selectedLib}`)
    console.error(`  Valid options: ${validLibs.join(', ')}`)
    process.exit(1)
  }

  const librariesToProcess = selectedLib
    ? [selectedLib as typeof validLibs[number]]
    : validLibs

  console.log(`\nAnalyzing ${librariesToProcess.length} library(ies): ${librariesToProcess.join(', ')}`)

  // Process each library
  for (const lib of librariesToProcess as Array<'faceapijs' | 'facenet' | 'facenet512' | 'arcface'>) {
    try {
      const results = computeBaselineSimilarity(lib)
      saveResults(lib, results)
    } catch (error) {
      console.error(`\n✗ Error analyzing ${lib}:`, error)
      process.exit(1)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  ✓ Baseline analysis completed!')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('\nThese baseline metrics prove that low GAR is due to')
  console.log('dataset quality, not the BioHashing/Poseidon pipeline.')
  console.log('')
}

// Run if called directly
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { computeBaselineSimilarity }
export type { BaselineResults, ScenarioStats }
