/**
 * ============================================================================
 * PHASE 2: FOUR-SCENARIO ANALYSIS (Instant - Read from JSON)
 * ============================================================================
 *
 * Analyzes pre-computed templates to validate cancelable biometric properties.
 *
 * Purpose:
 * - Load pre-computed templates from JSON (instant!)
 * - Run 4-scenario validation without recomputation
 * - Enable fast iteration on analysis logic
 *
 * Four Scenarios:
 * - A: Same Person + Same Key (Key A vs Key A) → Expect HIGH match (~70-90%)
 * - B: Different Person + Same Key (Key A vs Key A) → Expect RANDOM match (~50%)
 * - C: Same Person + Different Key (Key A vs Key B) → Expect ZERO match (~0%) ← UNLINKABILITY!
 * - D: Different Person + Different Key (Person A KeyA vs Person B KeyB) → Expect ZERO match (~0%)
 *
 * Key Findings:
 * - Scenario C = 0% proves UNLINKABILITY (same person, different keys = uncorrelated)
 * - Scenario D = 0% proves CROSS-KEY PRIVACY (different people, different keys = uncorrelated)
 *
 * Time: ~30 seconds per library (NO recomputation!)
 *
 * Usage:
 *   npx tsx pipeline/01-analyze-four-scenarios.ts --lib=facenet
 *   npx tsx pipeline/01-analyze-four-scenarios.ts  (all libraries)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PrecomputedTemplates } from './00-prepare-templates'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ScenarioStats {
  matchRates: number[]        // All match rates for this scenario
  passed: number              // Count of matches above threshold
  mean: number                // Mean match rate
  std: number                 // Standard deviation
  min: number                 // Minimum match rate
  max: number                 // Maximum match rate
}

interface FourScenarioResults {
  library: string
  outputDim: number
  threshold: number           // Circuit threshold (102/128 = 79.7%)
  thresholdRate: number       // As percentage
  scenarios: {
    A: ScenarioStats          // Same person + Same key (KeyA vs KeyA)
    B: ScenarioStats          // Different person + Same key (KeyA vs KeyA)
    C: ScenarioStats          // Same person + Different key (KeyA vs KeyB) - UNLINKABILITY!
    D: ScenarioStats          // Different person + Different key (Person A KeyA vs Person B KeyB) - CROSS-KEY PRIVACY!
  }
  totalComparisons: number
  computeTime: number         // Seconds
}

// ============================================================================
// POSEIDON MATCH RATE CALCULATION
// ============================================================================

/**
 * Calculate match rate between two Poseidon hash arrays
 *
 * This is the CORRECT comparison metric for ZK circuit validation.
 * Counts how many Poseidon hashes match exactly.
 *
 * @param a First Poseidon hash array (as bigints)
 * @param b Second Poseidon hash array (as bigints)
 * @returns Match rate between 0 and 1 (0 = completely different, 1 = identical)
 */
function poseidonMatchRate(a: bigint[], b: bigint[]): number {
  if (a.length !== b.length) {
    throw new Error(`Array length mismatch: ${a.length} vs ${b.length}`)
  }

  let matches = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) {
      matches++
    }
  }

  return matches / a.length
}

// ============================================================================
// TEMPLATE LOADING
// ============================================================================

/**
 * Load pre-computed templates from JSON file
 *
 * @param library Library name
 * @returns Parsed templates with bigint[] Poseidon hashes
 */
function loadPrecomputedTemplates(
  library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface'
): {
  metadata: PrecomputedTemplates,
  templates: Map<string, Map<number, {
    keyA: { biohash: number[], poseidon: bigint[] },
    keyB: { biohash: number[], poseidon: bigint[] }
  }>>
} {
  const templatesPath = join(
    process.cwd(),
    'data',
    'precomputed-templates',
    `${library}_templates.json`
  )

  console.log(`  Loading from ${templatesPath}...`)

  const data: PrecomputedTemplates = JSON.parse(readFileSync(templatesPath, 'utf-8'))

  // Convert string[] back to bigint[] for Poseidon hashes
  const templates = new Map<string, Map<number, {
    keyA: { biohash: number[], poseidon: bigint[] },
    keyB: { biohash: number[], poseidon: bigint[] }
  }>>()

  for (const [personId, captures] of Object.entries(data.templates)) {
    const captureMap = new Map()

    for (const [captureIdx, captureData] of Object.entries(captures)) {
      captureMap.set(parseInt(captureIdx), {
        keyA: {
          biohash: captureData.keyA.biohash,
          poseidon: captureData.keyA.poseidon.map(s => BigInt(s)),
        },
        keyB: {
          biohash: captureData.keyB.biohash,
          poseidon: captureData.keyB.poseidon.map(s => BigInt(s)),
        },
      })
    }

    templates.set(personId, captureMap)
  }

  console.log(`  ✓ Loaded ${data.totalPersons} persons, ${data.totalCaptures} captures`)

  return { metadata: data, templates }
}

// ============================================================================
// SCENARIO COMPUTATIONS
// ============================================================================

/**
 * Initialize empty scenario stats
 */
function createEmptyScenario(): ScenarioStats {
  return {
    matchRates: [],
    passed: 0,
    mean: 0,
    std: 0,
    min: 1,
    max: 0,
  }
}

/**
 * Compute statistics for a scenario
 */
function computeScenarioStats(scenario: ScenarioStats): void {
  const rates = scenario.matchRates
  if (rates.length === 0) return

  // Mean
  scenario.mean = rates.reduce((a, b) => a + b, 0) / rates.length

  // Standard deviation
  scenario.std = Math.sqrt(
    rates.reduce((sum, x) => sum + Math.pow(x - scenario.mean, 2), 0) / rates.length
  )

  // Min/Max
  scenario.min = Math.min(...rates)
  scenario.max = Math.max(...rates)
}

/**
 * Analyze all four scenarios
 */
async function analyzeFourScenarios(
  library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface'
): Promise<FourScenarioResults> {
  console.log(`\n━━━ Analyzing ${library} ━━━`)

  const startTime = performance.now()

  // Load pre-computed templates
  const { metadata, templates } = loadPrecomputedTemplates(library)

  console.log(`  Keys: A = ${metadata.keys.A}, B = ${metadata.keys.B}`)

  // Initialize scenarios
  const scenarios = {
    A: createEmptyScenario(),
    B: createEmptyScenario(),
    C: createEmptyScenario(),
    D: createEmptyScenario(),
  }

  // Circuit threshold (102/128 = 79.7%)
  const threshold = Math.floor(metadata.outputDim * 0.797)
  const thresholdRate = threshold / metadata.outputDim

  console.log(`  Using threshold: ${threshold}/${metadata.outputDim} (${(thresholdRate * 100).toFixed(1)}%)`)

  // ===== SCENARIO A & C: Same Person =====
  console.log('  Computing Scenarios A & C (Same Person)...')
  const t1 = performance.now()

  for (const [personId, captures] of templates.entries()) {
    const captureIndices = Array.from(captures.keys())

    // Compare all pairs of captures for this person
    for (let i = 0; i < captureIndices.length; i++) {
      for (let j = i + 1; j < captureIndices.length; j++) {
        const capture1 = captures.get(captureIndices[i])!
        const capture2 = captures.get(captureIndices[j])!

        // A: Same person + Same key (Key A vs Key A)
        const rateA = poseidonMatchRate(
          capture1.keyA.poseidon,
          capture2.keyA.poseidon
        )
        scenarios.A.matchRates.push(rateA)
        if (rateA >= thresholdRate) scenarios.A.passed++

        // C: Same person + Different key (Key A vs Key B)
        const rateC = poseidonMatchRate(
          capture1.keyA.poseidon,
          capture2.keyB.poseidon
        )
        scenarios.C.matchRates.push(rateC)
        if (rateC >= thresholdRate) scenarios.C.passed++
      }
    }
  }

  const t2 = performance.now()
  console.log(
    `  ✓ Scenarios A & C: ${scenarios.A.matchRates.length} comparisons ` +
    `in ${((t2 - t1) / 1000).toFixed(1)}s`
  )

  // ===== SCENARIO B & D: Different Person =====
  console.log('  Computing Scenarios B & D (Different Person)...')
  const t3 = performance.now()

  const personIds = Array.from(templates.keys())
  const maxPairs = 10000 // Limit to 10k pairs for speed
  let pairCount = 0

  for (let i = 0; i < personIds.length && pairCount < maxPairs; i++) {
    for (let j = i + 1; j < personIds.length && pairCount < maxPairs; j++) {
      const person1 = templates.get(personIds[i])!
      const person2 = templates.get(personIds[j])!

      // Only compare first capture (capture 0)
      const capture1 = person1.get(0)
      const capture2 = person2.get(0)

      if (!capture1 || !capture2) continue

      // B: Different person + Same key (Key A vs Key A)
      const rateB = poseidonMatchRate(
        capture1.keyA.poseidon,
        capture2.keyA.poseidon
      )
      scenarios.B.matchRates.push(rateB)
      if (rateB >= thresholdRate) scenarios.B.passed++

      // D: Different person + Different key (Person A KeyA vs Person B KeyB)
      const rateD = poseidonMatchRate(
        capture1.keyA.poseidon,  // Person 1, KeyA
        capture2.keyB.poseidon   // Person 2, KeyB (DIFFERENT!)
      )
      scenarios.D.matchRates.push(rateD)
      if (rateD >= thresholdRate) scenarios.D.passed++

      pairCount++
    }
  }

  const t4 = performance.now()
  console.log(
    `  ✓ Scenarios B & D: ${scenarios.B.matchRates.length} comparisons ` +
    `in ${((t4 - t3) / 1000).toFixed(1)}s`
  )

  // Compute statistics
  computeScenarioStats(scenarios.A)
  computeScenarioStats(scenarios.B)
  computeScenarioStats(scenarios.C)
  computeScenarioStats(scenarios.D)

  const totalTime = (performance.now() - startTime) / 1000

  // Print results
  printResults(metadata.library, scenarios, threshold, metadata.outputDim)

  return {
    library: metadata.library,
    outputDim: metadata.outputDim,
    threshold,
    thresholdRate,
    scenarios,
    totalComparisons:
      scenarios.A.matchRates.length +
      scenarios.B.matchRates.length +
      scenarios.C.matchRates.length +
      scenarios.D.matchRates.length,
    computeTime: totalTime,
  }
}

// ============================================================================
// RESULT PRINTING
// ============================================================================

/**
 * Print results in a formatted table
 */
function printResults(
  library: string,
  scenarios: FourScenarioResults['scenarios'],
  threshold: number,
  outputDim: number
): void {
  console.log(`\n  Results for ${library}:`)
  console.log(`  Threshold: ${threshold}/${outputDim} (${(threshold / outputDim * 100).toFixed(1)}%)`)
  console.log('')
  console.log('  ┌─────────────┬───────────┬─────────┬──────────┬──────────┬─────────┐')
  console.log('  │ Scenario    │ Mean      │ Std     │ Min      │ Max      │ Passed  │')
  console.log('  ├─────────────┼───────────┼─────────┼──────────┼──────────┼─────────┤')

  const scenarioNames = [
    { key: 'A', label: 'Same/KeyA' },
    { key: 'B', label: 'Diff/KeyA' },
    { key: 'C', label: 'Same/AB ★' }, // ★ marks unlinkability test
    { key: 'D', label: 'Diff/AB ★' }, // ★ cross-key privacy test
  ]

  for (const { key, label } of scenarioNames) {
    const s = scenarios[key as keyof typeof scenarios]
    const total = s.matchRates.length
    const gar = total > 0 ? (s.passed / total * 100).toFixed(1) : '0.0'

    console.log(
      `  │ ${label.padEnd(11)} │ ` +
      `${(s.mean * 100).toFixed(2)}%   │ ` +
      `${s.std.toFixed(4)} │ ` +
      `${(s.min * 100).toFixed(2)}%  │ ` +
      `${(s.max * 100).toFixed(2)}%  │ ` +
      `${gar.padStart(5)}%  │`
    )
  }

  console.log('  └─────────────┴───────────┴─────────┴──────────┴──────────┴─────────┘')

  // Interpretation
  console.log('\n  Interpretation:')
  console.log(`  • Scenario A (Same/KeyA):   ${(scenarios.A.mean * 100).toFixed(1)}% - Verifiability ✓`)
  console.log(`  • Scenario B (Diff/KeyA):   ${(scenarios.B.mean * 100).toFixed(1)}% - Uniqueness ✓`)
  console.log(`  • Scenario C (Same/AB) ★:   ${(scenarios.C.mean * 100).toFixed(1)}% - UNLINKABILITY ${scenarios.C.mean < 0.1 ? '✓✓✓' : '⚠️'}`)
  console.log(`  • Scenario D (Diff/AB) ★:   ${(scenarios.D.mean * 100).toFixed(1)}% - CROSS-KEY PRIVACY ${scenarios.D.mean < 0.1 ? '✓✓✓' : '⚠️'}`)
}

// ============================================================================
// SAVE RESULTS
// ============================================================================

/**
 * Save results to JSON file
 */
function saveResults(
  library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface',
  results: FourScenarioResults
): void {
  const outputDir = join(process.cwd(), 'results', 'four-scenario-validation')
  mkdirSync(outputDir, { recursive: true })

  const outputPath = join(outputDir, `${library}_results.json`)

  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\n  ✓ Results saved to ${outputPath}`)
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  PHASE 2: FOUR-SCENARIO ANALYSIS (Instant from JSON)')
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

  console.log(`\nAnalyzing ${librariesToProcess.length} library(ies): ${librariesToProcess.join(', ')}`)
  console.log('')

  // Process each library
  for (const lib of librariesToProcess as Array<'faceapijs' | 'facenet' | 'facenet512' | 'arcface'>) {
    try {
      const results = await analyzeFourScenarios(lib)
      saveResults(lib, results)
    } catch (error) {
      console.error(`\n✗ Error analyzing ${lib}:`, error)

      // Check if templates exist
      const templatesPath = join(
        process.cwd(),
        'data',
        'precomputed-templates',
        `${lib}_templates.json`
      )

      console.error(`\n  Did you run the preparation step first?`)
      console.error(`  Run: npx tsx pipeline/00-prepare-templates.ts --lib=${lib}`)

      process.exit(1)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  ✓ All analyses completed successfully!')
  console.log('═══════════════════════════════════════════════════════════')
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

export { analyzeFourScenarios, loadPrecomputedTemplates }
export type { FourScenarioResults, ScenarioStats }
