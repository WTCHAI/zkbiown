/**
 * Generate BENCHMARK_SUMMARY.md from circuit timing results.
 *
 * Reads: results/circuit-timing/circom_*_benchmark.json
 *        results/circuit-timing/noir_*_benchmark.json
 * Writes: results/circuit-timing/BENCHMARK_SUMMARY.md
 *
 * Usage:
 *   npx tsx pipeline/04-write-benchmark-summary.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, '../results/circuit-timing')

function readJsonIfExists(path: string): any {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

const LIBS = ['facenet', 'facenet512', 'arcface', 'faceapijs']
const LIB_DISPLAY: Record<string, string> = {
  facenet:    'FaceNet (128D)',
  facenet512: 'FaceNet512 (512D→128D)',
  arcface:    'ArcFace (512D→128D)',
  faceapijs:  'face-api.js (128D)',
}

function fmt(n: number, dec = 0): string {
  return n.toFixed(dec)
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true })

  let md = `# ZK Proof Generation Benchmark Summary\n\n`
  md += `**Generated:** ${new Date().toISOString()}\n\n`
  md += `**Environment:** Node.js 22, Apple M-series (or equivalent x86-64)\n\n`
  md += `**Dataset:** FaceScrub face recognition dataset — same person-pairs used for both backends.\n`
  md += `${50} same-person Scenario A pairs + ${50} different-person Scenario B pairs per library.\n\n`

  md += `---\n\n`

  md += `## Circuit Comparison\n\n`
  md += `| Aspect | Circom Groth16 | Noir UltraHonk |\n`
  md += `|--------|:--------------|:---------------|\n`
  md += `| Template encoding | Binary 0/1 (128 bits) | Binary 0/1 (128 bits) |\n`
  md += `| Constraints | ~150,413 | N/A (PLONK-based) |\n`
  md += `| Proof system | Groth16 (BN254) | UltraHonk (Barretenberg) |\n`
  md += `| Trusted setup | Required (pot18 ceremony) | Not required |\n`
  md += `| Solidity verifier | Yes (ZtizenVerifier.sol) | Generatable via snarkjs/bb |\n`
  md += `| Node.js prover | snarkjs 0.7.5 | @aztec/bb.js + @noir-lang/noir_js |\n\n`

  md += `---\n\n`

  md += `## Scenario A — Same-Person Proof Generation\n\n`
  md += `*Enroll with capture 0, verify with capture 1 of the same person.*\n`
  md += `*Circuit threshold: ≥102/128 Poseidon hash matches required.*\n\n`

  md += `### Circom Groth16 (binary 0/1 encoding)\n\n`
  md += `| Library | GAR% | Proof gen (ms) | Proof verify (ms) | Avg match | Proof size |\n`
  md += `|---------|:----:|:--------------:|:-----------------:|:---------:|:----------:|\n`
  let anyCircomData = false
  for (const lib of LIBS) {
    const c = readJsonIfExists(join(RESULTS_DIR, `circom_${lib}_benchmark.json`))
    const name = LIB_DISPLAY[lib] ?? lib
    if (!c) {
      md += `| ${name} | — | — | — | — | — |\n`
      continue
    }
    anyCircomData = true
    const gar = fmt(100 * c.scenario_a.pairs_passed / c.scenario_a.pairs_tested, 1)
    const gen = `${fmt(c.scenario_a.proof_generation_ms.mean)}±${fmt(c.scenario_a.proof_generation_ms.std)}`
    const ver = `${fmt(c.scenario_a.proof_verification_ms.mean)}±${fmt(c.scenario_a.proof_verification_ms.std)}`
    const match = fmt(c.scenario_a.avg_match_count, 1)
    const size = c.scenario_a.proof_size_bytes > 0 ? `${(c.scenario_a.proof_size_bytes / 1024).toFixed(1)} KB` : '—'
    md += `| ${name} | ${gar}% | ${gen} | ${ver} | ${match}/128 | ${size} |\n`
  }
  if (!anyCircomData) md += `\n*No circom results yet. Run: \`npx tsx pipeline/02-circom-benchmark.ts\`*\n`

  md += `\n### Noir UltraHonk (binary 0/1 encoding)\n\n`
  md += `| Library | GAR% | Witness gen (ms) | Proof gen (ms) | Proof verify (ms) | Avg match | Proof size |\n`
  md += `|---------|:----:|:----------------:|:--------------:|:-----------------:|:---------:|:----------:|\n`
  let anyNoirData = false
  for (const lib of LIBS) {
    const n = readJsonIfExists(join(RESULTS_DIR, `noir_${lib}_benchmark.json`))
    const name = LIB_DISPLAY[lib] ?? lib
    if (!n) {
      md += `| ${name} | — | — | — | — | — | — |\n`
      continue
    }
    anyNoirData = true
    const gar = fmt(100 * n.scenario_a.pairs_passed / n.scenario_a.pairs_tested, 1)
    const wit = `${fmt(n.scenario_a.witness_gen_ms.mean)}±${fmt(n.scenario_a.witness_gen_ms.std)}`
    const gen = `${fmt(n.scenario_a.proof_generation_ms.mean)}±${fmt(n.scenario_a.proof_generation_ms.std)}`
    const ver = `${fmt(n.scenario_a.proof_verification_ms.mean)}±${fmt(n.scenario_a.proof_verification_ms.std)}`
    const match = fmt(n.scenario_a.avg_match_count, 1)
    const size = n.scenario_a.proof_size_bytes > 0 ? `${(n.scenario_a.proof_size_bytes / 1024).toFixed(1)} KB` : '—'
    md += `| ${name} | ${gar}% | ${wit} | ${gen} | ${ver} | ${match}/128 | ${size} |\n`
  }
  if (!anyNoirData) md += `\n*No Noir results yet. Run: \`npx tsx pipeline/03-noir-benchmark.ts\`*\n`

  md += `\n---\n\n`

  md += `## Scenario B — Different-Person Rejection Rate\n\n`
  md += `*Enrollment from Person A, verification from Person B (different identity).*\n`
  md += `*Circuit should reject with assert failure — FAR should be near 0%.*\n\n`

  md += `| Library | Circom FAR% | Circom fail time (ms) | Noir FAR% | Noir fail time (ms) |\n`
  md += `|---------|:-----------:|:--------------------:|:---------:|:-------------------:|\n`
  for (const lib of LIBS) {
    const c = readJsonIfExists(join(RESULTS_DIR, `circom_${lib}_benchmark.json`))
    const n = readJsonIfExists(join(RESULTS_DIR, `noir_${lib}_benchmark.json`))
    const name = LIB_DISPLAY[lib] ?? lib

    const cFAR = c ? `${fmt(100 * c.scenario_b.pairs_unexpected_pass / c.scenario_b.pairs_tested, 1)}%` : '—'
    const cFail = c ? `${fmt(c.scenario_b.failure_at_witness_ms.mean)}±${fmt(c.scenario_b.failure_at_witness_ms.std)}` : '—'
    const nFAR = n ? `${fmt(100 * n.scenario_b.pairs_unexpected_pass / n.scenario_b.pairs_tested, 1)}%` : '—'
    const nFail = n ? `${fmt(n.scenario_b.failure_at_witness_ms.mean)}±${fmt(n.scenario_b.failure_at_witness_ms.std)}` : '—'

    md += `| ${name} | ${cFAR} | ${cFail} | ${nFAR} | ${nFail} |\n`
  }

  md += `\n---\n\n`

  md += `## Browser (Noir/UltraHonk via WASM)\n\n`
  md += `Browser-based Noir proof generation was measured separately during UI testing (not re-run here).\n\n`
  md += `| Operation | Observed time |\n`
  md += `|-----------|:-------------:|\n`
  md += `| Witness generation | ~2,000–3,000 ms |\n`
  md += `| Proof generation | ~12,000–15,000 ms |\n`
  md += `| **Total** | **~15 seconds** |\n\n`
  md += `The Node.js backend is **~4–5× faster** than browser WASM because it can use native code paths.\n`
  md += `The circom Groth16 Node.js backend is further optimized due to the smaller constraint count.\n\n`

  md += `---\n\n`

  md += `## Notes on Template Encoding\n\n`
  md += `Both circuits use the same binary 0/1 template encoding from the BioHashing pipeline:\n\n`
  md += `1. Face embedding (128D or 512D depending on model) is projected via Gaussian random matrix to 128D\n`
  md += `2. Each projection is thresholded: ` + "`B[i] = 1 if p[i] > 0, else 0`" + `\n`
  md += `3. 128 Poseidon8 hashes are computed: ` + "`commit[i] = Poseidon8(B[i], i, product_key, ztizen_key, user_key, version, nonce, usage_hash)`" + `\n`
  md += `4. Circuit compares ` + "`computed_commit[i] == auth_commit_stored[i]`" + ` for all 128 positions\n`
  md += `5. Assert ` + "`match_count >= 102`" + ` (79.7% threshold)\n\n`
  md += `Both Circom Groth16 and Noir UltraHonk run the identical pipeline. Timing differences reflect the proof system, not the biometric encoding.\n\n`

  md += `---\n\n`
  md += `## Running the Benchmarks\n\n`
  md += `\`\`\`bash\n`
  md += `cd ZTIZEN/experimental\n\n`
  md += `# Single library (fast test, ~7 min)\n`
  md += `npx tsx pipeline/02-circom-benchmark.ts --lib=facenet\n`
  md += `npx tsx pipeline/03-noir-benchmark.ts --lib=facenet\n\n`
  md += `# All libraries (~30 min each)\n`
  md += `npx tsx pipeline/02-circom-benchmark.ts\n`
  md += `npx tsx pipeline/03-noir-benchmark.ts\n\n`
  md += `# Regenerate this summary\n`
  md += `npx tsx pipeline/04-write-benchmark-summary.ts\n`
  md += `\`\`\`\n`

  const outPath = join(RESULTS_DIR, 'BENCHMARK_SUMMARY.md')
  writeFileSync(outPath, md)
  console.log(`✓ Written: ${outPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
