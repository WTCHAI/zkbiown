/**
 * Load Real FaceScrub Embeddings
 *
 * Loads actual face embeddings from facescrub-embeddings.json
 * NO synthetic/mock data - uses real pre-computed embeddings only
 */

import { readFileSync } from 'fs'
import { join } from 'path'

export interface Capture {
  faceapijs?: number[]
  facenet?: number[]
  facenet512?: number[]
  arcface?: number[]
}

export interface Person {
  description: string
  original_name: string
  captures: Record<string, Capture>
}

export interface EmbeddingData {
  [personId: string]: Person
}

export interface RootData {
  description: string
  metadata: any
  persons: EmbeddingData
}

export interface LoadedEmbeddings {
  persons: Map<string, number[][]>
  totalPersons: number
  totalCaptures: number
  library: string
}

/**
 * Load embeddings for a specific library from real FaceScrub data
 */
export function loadRealEmbeddings(library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface'): LoadedEmbeddings {
  const dataPath = join(process.cwd(), 'data', 'facescrub', 'facescrub-embeddings.backup.json')

  console.log(`Loading ${library} embeddings from:`, dataPath)

  const root: RootData = JSON.parse(readFileSync(dataPath, 'utf-8'))
  const rawData = root.persons

  const persons = new Map<string, number[][]>()
  let totalCaptures = 0

  for (const [personId, personData] of Object.entries(rawData)) {
    const embeddings: number[][] = []

    for (const [captureId, capture] of Object.entries(personData.captures)) {
      const embedding = capture[library]

      if (embedding && Array.isArray(embedding) && embedding.length > 0) {
        embeddings.push(embedding)
        totalCaptures++
      }
    }

    // Only include persons with at least 2 captures (needed for same-person comparison)
    if (embeddings.length >= 2) {
      persons.set(personId, embeddings)
    }
  }

  return {
    persons,
    totalPersons: persons.size,
    totalCaptures,
    library
  }
}

/**
 * Get available libraries for a dataset
 */
export function getAvailableLibraries(data: EmbeddingData): string[] {
  const libraries = new Set<string>()

  for (const person of Object.values(data)) {
    for (const capture of Object.values(person.captures)) {
      for (const lib of Object.keys(capture)) {
        libraries.add(lib)
      }
    }
  }

  return Array.from(libraries).sort()
}

/**
 * Get statistics for loaded embeddings
 */
export function getEmbeddingStats(library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface'): {
  totalPersons: number
  totalCaptures: number
  avgCapturesPerPerson: number
  embeddingDimension: number
} {
  const loaded = loadRealEmbeddings(library)

  let firstEmbedding: number[] | null = null
  for (const captures of loaded.persons.values()) {
    if (captures.length > 0) {
      firstEmbedding = captures[0]
      break
    }
  }

  return {
    totalPersons: loaded.totalPersons,
    totalCaptures: loaded.totalCaptures,
    avgCapturesPerPerson: loaded.totalCaptures / loaded.totalPersons,
    embeddingDimension: firstEmbedding?.length || 0
  }
}

/**
 * Validate that embeddings are loaded correctly
 */
export function validateEmbeddings(library: 'faceapijs' | 'facenet' | 'facenet512' | 'arcface'): boolean {
  try {
    const loaded = loadRealEmbeddings(library)

    console.log(`\n✓ ${library} Validation:`)
    console.log(`  Persons: ${loaded.totalPersons}`)
    console.log(`  Total captures: ${loaded.totalCaptures}`)
    console.log(`  Avg captures/person: ${(loaded.totalCaptures / loaded.totalPersons).toFixed(1)}`)

    // Check embedding dimensions
    let firstEmb: number[] | null = null
    for (const captures of loaded.persons.values()) {
      if (captures.length > 0) {
        firstEmb = captures[0]
        break
      }
    }

    if (!firstEmb) {
      console.error(`  ✗ No embeddings found for ${library}`)
      return false
    }

    console.log(`  Embedding dimension: ${firstEmb.length}D`)

    // Validate all embeddings have same dimension
    for (const [personId, captures] of loaded.persons.entries()) {
      for (let i = 0; i < captures.length; i++) {
        if (captures[i].length !== firstEmb.length) {
          console.error(`  ✗ Dimension mismatch for ${personId} capture ${i}`)
          return false
        }
      }
    }

    console.log(`  ✓ All embeddings validated`)
    return true

  } catch (error) {
    console.error(`✗ Error loading ${library}:`, error)
    return false
  }
}
