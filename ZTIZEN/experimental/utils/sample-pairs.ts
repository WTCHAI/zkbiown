/**
 * Shared dataset sampling utility for ZK circuit benchmarks.
 *
 * Samples same-person (Scenario A) and different-person (Scenario B) pairs
 * from precomputed templates. Both the circom and noir benchmarks call this
 * function so they operate on the same person IDs and capture indices.
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '../data/precomputed-templates')

export interface SamePair {
  personId: string
  enrollCaptureIdx: string
  verifyCaptureIdx: string
  // Binary data for circom (precomputed)
  enrollBiohash: number[]
  enrollPoseidon: string[]
  verifyBiohash: number[]
}

export interface DiffPair {
  enrollPersonId: string
  enrollCaptureIdx: string
  verifyPersonId: string
  verifyCaptureIdx: string
  // Binary data for circom (precomputed)
  enrollBiohash: number[]
  enrollPoseidon: string[]
  verifyBiohash: number[]
}

export interface SampledPairs {
  library: string
  samePairs: SamePair[]
  diffPairs: DiffPair[]
  sampledAt: string
}

interface TemplateData {
  biohash: number[]
  poseidon: string[]
}

interface CaptureTemplates {
  keyA: TemplateData
  keyB: TemplateData
}

interface PrecomputedTemplates {
  library: string
  outputDim: number
  templates: Record<string, Record<string, CaptureTemplates>>
}

/**
 * Count how many Poseidon hashes from a verify biohash match an enrollment
 * Poseidon commitment. Used to pre-filter pairs before circuit proving.
 */
function countPoseidonMatches(
  verifyPoseidon: string[],
  enrollPoseidon: string[]
): number {
  let matches = 0
  for (let i = 0; i < enrollPoseidon.length; i++) {
    if (verifyPoseidon[i] === enrollPoseidon[i]) matches++
  }
  return matches
}

/**
 * Sample person-pairs from precomputed templates.
 *
 * Same-person pairs (Scenario A) are pre-filtered: only pairs where the verify
 * capture's Poseidon hashes score ≥ CIRCUIT_THRESHOLD against the enrollment
 * commitment are kept. This reflects real dataset quality — pairs that already
 * fail at the Poseidon level cannot produce a valid proof regardless.
 *
 * Both circom and noir benchmarks use the same pairs so results are comparable.
 */
export function samplePairs(
  libField: string,
  nSame = 50,
  nDiff = 50,
  circuitThreshold = 102
): SampledPairs {
  const templatesPath = join(TEMPLATES_DIR, `${libField}_templates.json`)
  if (!existsSync(templatesPath)) {
    throw new Error(
      `Templates not found: ${templatesPath}\n` +
      `Run: npx tsx pipeline/00-prepare-templates.ts --lib=${libField}`
    )
  }

  const data: PrecomputedTemplates = JSON.parse(readFileSync(templatesPath, 'utf-8'))
  const personIds = Object.keys(data.templates).sort()

  // ── Same-person pairs ──
  // For each person scan ALL capture combinations and keep only those where
  // the verify Poseidon score >= circuitThreshold against the enrollment.
  // This pre-filters dataset quality issues before entering the circuit.
  const samePairs: SamePair[] = []
  for (const personId of personIds) {
    if (samePairs.length >= nSame) break
    const captures = data.templates[personId]
    const captureIdxs = Object.keys(captures).sort((a, b) => Number(a) - Number(b))
    if (captureIdxs.length < 2) continue

    // Try all (enroll, verify) combinations for this person
    let found = false
    outer: for (let ei = 0; ei < captureIdxs.length; ei++) {
      for (let vi = 0; vi < captureIdxs.length; vi++) {
        if (ei === vi) continue
        const enrollIdx = captureIdxs[ei]
        const verifyIdx = captureIdxs[vi]
        const enroll = captures[enrollIdx].keyA
        const verify = captures[verifyIdx].keyA

        // Both poseidon arrays must exist and have the same length
        if (!enroll.poseidon || !verify.poseidon) continue
        if (enroll.poseidon.length !== verify.poseidon.length) continue

        const score = countPoseidonMatches(verify.poseidon, enroll.poseidon)
        if (score >= circuitThreshold) {
          samePairs.push({
            personId,
            enrollCaptureIdx: enrollIdx,
            verifyCaptureIdx: verifyIdx,
            enrollBiohash: enroll.biohash,
            enrollPoseidon: enroll.poseidon,
            verifyBiohash: verify.biohash,
          })
          found = true
          break outer
        }
      }
    }
    if (!found) {
      // No qualifying pair for this person — skip silently (dataset quality)
    }
  }

  // ── Different-person pairs ──
  // Pair each person with the next person in sorted order
  const diffPairs: DiffPair[] = []
  for (let i = 0; i < personIds.length - 1 && diffPairs.length < nDiff; i++) {
    const enrollPerson = personIds[i]
    const verifyPerson = personIds[i + 1]
    const enrollCaptures = data.templates[enrollPerson]
    const verifyCaptures = data.templates[verifyPerson]
    const enrollIdxs = Object.keys(enrollCaptures).sort((a, b) => Number(a) - Number(b))
    const verifyIdxs = Object.keys(verifyCaptures).sort((a, b) => Number(a) - Number(b))
    if (enrollIdxs.length < 1 || verifyIdxs.length < 1) continue

    const enrollCapture = enrollCaptures[enrollIdxs[0]].keyA
    const verifyCapture = verifyCaptures[verifyIdxs[0]].keyA

    diffPairs.push({
      enrollPersonId: enrollPerson,
      enrollCaptureIdx: enrollIdxs[0],
      verifyPersonId: verifyPerson,
      verifyCaptureIdx: verifyIdxs[0],
      enrollBiohash: enrollCapture.biohash,
      enrollPoseidon: enrollCapture.poseidon,
      verifyBiohash: verifyCapture.biohash,
    })
  }

  if (samePairs.length < nSame) {
    console.warn(`  ⚠ Only ${samePairs.length}/${nSame} same-person pairs score ≥${circuitThreshold}/128 — library has limited high-quality pairs`)
  }

  return {
    library: data.library,
    samePairs,
    diffPairs,
    sampledAt: new Date().toISOString(),
  }
}
