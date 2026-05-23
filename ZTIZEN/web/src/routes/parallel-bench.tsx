/**
 * Parallel Circom vs Noir Browser Benchmark — /parallel-bench
 *
 * Runs the same N pre-filtered same-person pairs through BOTH proof systems
 * sequentially per pair, reporting per-stage timing for each:
 *
 *   Circom: fetch wasm+zkey → fullProve (witness+gen) → verify
 *   Noir:   fetch circuit  → witness (noir.execute) → prove (backend.generateProof) → verify
 *
 * Pre-filter mirrors sample-pairs.ts: only keep (enroll, verify) pairs
 * where verify.poseidon scores ≥102/128 against enroll.poseidon.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { groth16 } from 'snarkjs'
import { stringToFieldElement } from '@/lib/poseidon'

export const Route = createFileRoute('/parallel-bench')({
  component: ParallelBenchPage,
})

// ── Keys (same as circom-test and Node.js pipeline) ───────────────────────────
const PRODUCT_KEY = '8c2ab53680ab4f6b659dc79c929a7795bc8ce5770854b39402c92f98ef15537d'
const ZTIZEN_KEY  = 'ca977f6e6db2eb0e98dcafa82f01c196139c0c4a6f310fc0373c0aa63ef767a4'
const USER_KEY    = '51ee26cf93d86ef719f3913e998f5433ddccd5e3af58f962f833e04e15784e20'

const THRESHOLD = 102

// ── Stats ─────────────────────────────────────────────────────────────────────

function stats(arr: number[]) {
  if (arr.length === 0) return { mean: 0, std: 0, min: 0, max: 0, n: 0 }
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const std = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length)
  return {
    mean: Number(mean.toFixed(0)),
    std: Number(std.toFixed(0)),
    min: Number(Math.min(...arr).toFixed(0)),
    max: Number(Math.max(...arr).toFixed(0)),
    n: arr.length,
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PairResult {
  personId: string
  preScore: number
  // Circom
  circomWitnessMs: number   // included in fullProve — reported as total gen
  circomGenMs: number
  circomVerifyMs: number
  circomMatchCount: number | null
  circomValid: boolean | null
  circomPassed: boolean
  circomError?: string
  // Noir
  noirWitnessMs: number
  noirGenMs: number
  noirVerifyMs: number
  noirMatchCount: number | null
  noirValid: boolean | null
  noirPassed: boolean
  noirError?: string
}

interface SystemSummary {
  passed: number
  total: number
  witnessStats: ReturnType<typeof stats>
  genStats: ReturnType<typeof stats>
  verifyStats: ReturnType<typeof stats>
  matchStats: ReturnType<typeof stats>
  proofSize: number
}

interface Summary {
  nPairs: number
  circom: SystemSummary
  noir: SystemSummary
}

// ── Component ─────────────────────────────────────────────────────────────────

function ParallelBenchPage() {
  const [running, setRunning] = useState(false)
  const [nPairs, setNPairs] = useState(10)
  const [log, setLog] = useState<string[]>([])
  const [pairResults, setPairResults] = useState<PairResult[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<string>('')
  const stopRef = useRef(false)

  function addLog(msg: string) {
    const ts = new Date().toISOString().slice(11, 23)
    setLog(prev => [...prev, `${ts} ${msg}`])
  }

  async function run() {
    setRunning(true)
    stopRef.current = false
    setLog([])
    setPairResults([])
    setSummary(null)
    setError(null)

    try {
      // ── 1. Load all artifacts in parallel ────────────────────────────────
      setPhase('Loading artifacts...')
      addLog('Loading Circom (wasm+zkey) + Noir (circuit) + templates + vkey...')
      const t0 = performance.now()

      const [templates, circomWasmBuf, circomZkeyBuf, circomVKey, noirCircuit] = await Promise.all([
        fetch('/circom/facenet_templates.json').then(r => r.json()),
        fetch('/circom/ztizen.wasm').then(r => r.arrayBuffer()),
        fetch('/circom/ztizen.zkey').then(r => r.arrayBuffer()),
        fetch('/circom/verification_key.json').then(r => r.json()),
        fetch('/circuits/ztizen_circuit_biohash128.json').then(r => r.json()),
      ])

      addLog(`All artifacts loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`)

      // ── 2. Init Noir backend (one-time, amortized) ────────────────────────
      setPhase('Initializing Noir...')
      addLog('Initializing Noir + UltraHonkBackend...')
      const tNoir = performance.now()

      const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
        import('@noir-lang/noir_js'),
        import('@aztec/bb.js'),
      ])
      const noirInstance = new Noir(noirCircuit as any)
      const noirBackend = new UltraHonkBackend(noirCircuit.bytecode)
      await noirInstance.init()

      addLog(`Noir initialized in ${((performance.now() - tNoir) / 1000).toFixed(1)}s`)

      // ── 3. Pre-filter pairs ───────────────────────────────────────────────
      setPhase('Pre-filtering pairs...')
      const persons = Object.keys(templates.templates).sort()
      type Pair = {
        personId: string
        enrollBiohash: number[]
        enrollPoseidon: string[]
        verifyBiohash: number[]
        preScore: number
      }
      const pairs: Pair[] = []

      for (const personId of persons) {
        if (pairs.length >= nPairs) break
        const caps = Object.keys(templates.templates[personId]).sort((a, b) => Number(a) - Number(b))
        if (caps.length < 2) continue

        let found = false
        outer: for (let ei = 0; ei < caps.length && !found; ei++) {
          for (let vi = 0; vi < caps.length && !found; vi++) {
            if (ei === vi) continue
            const enroll = templates.templates[personId][caps[ei]].keyA
            const verify  = templates.templates[personId][caps[vi]].keyA
            if (!enroll.poseidon || !verify.poseidon) continue
            let score = 0
            for (let k = 0; k < enroll.poseidon.length; k++) {
              if (verify.poseidon[k] === enroll.poseidon[k]) score++
            }
            if (score >= THRESHOLD) {
              pairs.push({
                personId,
                enrollBiohash: enroll.biohash,
                enrollPoseidon: enroll.poseidon,
                verifyBiohash: verify.biohash,
                preScore: score,
              })
              found = true
            }
          }
        }
      }

      addLog(`Pre-filtered: ${pairs.length}/${persons.length} persons with qualifying pair (Poseidon score ≥${THRESHOLD}/128)`)

      // ── 4. Shared inputs ──────────────────────────────────────────────────
      const circomWasm = new Uint8Array(circomWasmBuf)
      const circomZkey = new Uint8Array(circomZkeyBuf)
      const productKeyField = stringToFieldElement(PRODUCT_KEY).toString()
      const ztizenKeyField  = stringToFieldElement(ZTIZEN_KEY).toString()
      const userKeyField    = stringToFieldElement(USER_KEY).toString()

      // Accumulate per-system stats
      const results: PairResult[] = []
      const cGen: number[] = [], cVerify: number[] = [], cMatch: number[] = []
      const nWitness: number[] = [], nGen: number[] = [], nVerify: number[] = [], nMatch: number[] = []
      let cProofSize = 0, nProofSize = 0
      let cPass = 0, nPass = 0

      // ── 5. Run pairs ──────────────────────────────────────────────────────
      for (let i = 0; i < pairs.length; i++) {
        if (stopRef.current) { addLog('Stopped by user.'); break }

        const pair = pairs[i]
        setPhase(`Pair ${i + 1}/${pairs.length} — ${pair.personId}`)
        addLog(`\n[${i + 1}/${pairs.length}] ${pair.personId}  preScore=${pair.preScore}/128`)

        // ── Circom ──────────────────────────────────────────────────────
        let circomGenMs = 0, circomVerifyMs = 0
        let circomMatchCount: number | null = null
        let circomValid: boolean | null = null
        let circomPassed = false
        let circomError: string | undefined

        try {
          const circomInput = {
            bio_template: pair.verifyBiohash.map((b: number) => b.toString()),
            product_key: productKeyField,
            ztizen_key: ztizenKeyField,
            user_key: userKeyField,
            version: '1',
            nonce: '0',
            product_usage_hash: '0',
            auth_commit_stored: pair.enrollPoseidon,
          }

          const tC1 = performance.now()
          const { proof: cProof, publicSignals } = await groth16.fullProve(circomInput, circomWasm, circomZkey)
          circomGenMs = performance.now() - tC1
          circomMatchCount = Number(publicSignals[0])
          if (cProofSize === 0) cProofSize = JSON.stringify(cProof).length

          const tC2 = performance.now()
          circomValid = await groth16.verify(circomVKey, publicSignals, cProof)
          circomVerifyMs = performance.now() - tC2

          circomPassed = true
          cPass++
          cGen.push(circomGenMs)
          cVerify.push(circomVerifyMs)
          if (circomMatchCount !== null) cMatch.push(circomMatchCount)
        } catch (err: any) {
          circomError = err?.message?.slice(0, 80)
        }

        addLog(`  Circom  gen=${circomGenMs.toFixed(0)}ms  verify=${circomVerifyMs.toFixed(0)}ms  match=${circomMatchCount ?? 'err'}/128  ${circomPassed ? '✓' : '✗'}`)

        // ── Noir ────────────────────────────────────────────────────────
        let noirWitnessMs = 0, noirGenMs = 0, noirVerifyMs = 0
        let noirMatchCount: number | null = null
        let noirValid: boolean | null = null
        let noirPassed = false
        let noirError: string | undefined

        try {
          const noirInput = {
            template: pair.verifyBiohash.map((b: number) => b.toString()),
            product_key: productKeyField,
            ztizen_key: ztizenKeyField,
            user_key: userKeyField,
            version: '1',
            nonce: '0',
            product_usage_hash: '0',
            auth_commit_stored: pair.enrollPoseidon,
          }

          // Witness
          const tN1 = performance.now()
          const { witness } = await noirInstance.execute(noirInput)
          noirWitnessMs = performance.now() - tN1

          // Prove
          const tN2 = performance.now()
          const { proof: nProof, publicInputs } = await noirBackend.generateProof(witness, { keccak: false })
          noirGenMs = performance.now() - tN2
          if (nProofSize === 0) nProofSize = nProof.length

          // match_count is at publicInputs[128] (after auth_commit_stored[0..127])
          noirMatchCount = publicInputs.length > 128
            ? Number(BigInt(publicInputs[128]))
            : null

          // Verify
          const tN3 = performance.now()
          noirValid = await noirBackend.verifyProof({ proof: nProof, publicInputs })
          noirVerifyMs = performance.now() - tN3

          noirPassed = true
          nPass++
          nWitness.push(noirWitnessMs)
          nGen.push(noirGenMs)
          nVerify.push(noirVerifyMs)
          if (noirMatchCount !== null) nMatch.push(noirMatchCount)
        } catch (err: any) {
          noirError = err?.message?.slice(0, 80)
        }

        addLog(`  Noir    witness=${noirWitnessMs.toFixed(0)}ms  gen=${noirGenMs.toFixed(0)}ms  verify=${noirVerifyMs.toFixed(0)}ms  match=${noirMatchCount ?? 'err'}/128  ${noirPassed ? '✓' : '✗'}`)

        const r: PairResult = {
          personId: pair.personId,
          preScore: pair.preScore,
          circomWitnessMs: circomGenMs, // fullProve includes witness
          circomGenMs,
          circomVerifyMs,
          circomMatchCount,
          circomValid,
          circomPassed,
          circomError,
          noirWitnessMs,
          noirGenMs,
          noirVerifyMs,
          noirMatchCount,
          noirValid,
          noirPassed,
          noirError,
        }
        results.push(r)
        setPairResults([...results])
      }

      // ── 6. Summary ────────────────────────────────────────────────────────
      const s: Summary = {
        nPairs: results.length,
        circom: {
          passed: cPass,
          total: results.length,
          witnessStats: stats([]),   // included in gen for Circom
          genStats: stats(cGen),
          verifyStats: stats(cVerify),
          matchStats: stats(cMatch),
          proofSize: cProofSize,
        },
        noir: {
          passed: nPass,
          total: results.length,
          witnessStats: stats(nWitness),
          genStats: stats(nGen),
          verifyStats: stats(nVerify),
          matchStats: stats(nMatch),
          proofSize: nProofSize,
        },
      }
      setSummary(s)
      setPhase('')

      addLog(`\n${'─'.repeat(60)}`)
      addLog(`CIRCOM: ${cPass}/${results.length} passed | gen ${s.circom.genStats.mean}±${s.circom.genStats.std}ms | verify ${s.circom.verifyStats.mean}±${s.circom.verifyStats.std}ms | match ${s.circom.matchStats.mean}/128`)
      addLog(`NOIR:   ${nPass}/${results.length} passed | witness ${s.noir.witnessStats.mean}ms | gen ${s.noir.genStats.mean}±${s.noir.genStats.std}ms | verify ${s.noir.verifyStats.mean}±${s.noir.verifyStats.std}ms | match ${s.noir.matchStats.mean}/128`)

    } catch (err: any) {
      setError(err?.message ?? String(err))
      addLog(`FATAL: ${err?.message}`)
      setPhase('')
    }

    setRunning(false)
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>Circom Groth16 vs Noir UltraHonk — Parallel Benchmark</h2>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
        Same pre-filtered FaceScrub pairs · FaceNet 128D · Both circuits, same inputs · snarkjs + bb.js WASM
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <label>
          Pairs:{' '}
          <select value={nPairs} onChange={e => setNPairs(Number(e.target.value))} disabled={running}>
            {[1, 5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button
          onClick={run}
          disabled={running}
          style={{ padding: '8px 20px', cursor: running ? 'not-allowed' : 'pointer', background: running ? '#ccc' : '#2a6' , color: '#fff', border: 'none', borderRadius: 4 }}
        >
          {running ? `⚙️ ${phase || 'Running...'}` : '▶ Run Parallel Benchmark'}
        </button>
        {running && (
          <button
            onClick={() => { stopRef.current = true }}
            style={{ padding: '8px 16px', cursor: 'pointer', background: '#fee', border: '1px solid #c66', borderRadius: 4 }}
          >
            ■ Stop
          </button>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background: '#111', color: '#0f0', padding: 12, borderRadius: 4, fontSize: 11, lineHeight: 1.7, marginBottom: 16, maxHeight: 280, overflow: 'auto' }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {error && (
        <div style={{ background: '#300', color: '#f88', padding: 12, borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Summary boxes — side by side */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <SummaryBox title="Circom Groth16" s={summary.circom} color="#e8f5e9" border="#4a4" proofUnit="bytes" />
          <SummaryBox title="Noir UltraHonk" s={summary.noir} color="#e3f2fd" border="#48a" proofUnit="bytes" hasWitness />
        </div>
      )}

      {/* Head-to-head speedup row */}
      {summary && summary.circom.genStats.n > 0 && summary.noir.genStats.n > 0 && (
        <div style={{ background: '#fffde7', border: '1px solid #f9a825', padding: 14, borderRadius: 4, marginBottom: 24, fontSize: 13 }}>
          <strong>Head-to-Head:</strong>
          <span style={{ marginLeft: 16 }}>
            Gen speedup: <strong style={{ color: '#2a6' }}>
              {(summary.noir.genStats.mean / summary.circom.genStats.mean).toFixed(1)}× faster (Circom)
            </strong>
          </span>
          <span style={{ marginLeft: 24 }}>
            Verify speedup: <strong style={{ color: '#2a6' }}>
              {(summary.noir.verifyStats.mean / summary.circom.verifyStats.mean).toFixed(0)}× faster (Circom)
            </strong>
          </span>
          <span style={{ marginLeft: 24 }}>
            Proof size: <strong style={{ color: '#2a6' }}>
              {(summary.noir.proofSize / summary.circom.proofSize).toFixed(1)}× smaller (Circom)
            </strong>
          </span>
        </div>
      )}

      {/* Per-pair table */}
      {pairResults.length > 0 && (
        <div>
          <h4 style={{ marginBottom: 8 }}>Per-Pair Results (Scenario A — same person)</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  <th rowSpan={2} style={th}>#</th>
                  <th rowSpan={2} style={th}>Person</th>
                  <th rowSpan={2} style={th}>Pre-score</th>
                  {/* Circom columns */}
                  <th colSpan={4} style={{ ...th, background: '#e8f5e9', borderBottom: '1px solid #4a4' }}>Circom Groth16</th>
                  {/* Noir columns */}
                  <th colSpan={5} style={{ ...th, background: '#e3f2fd', borderBottom: '1px solid #48a' }}>Noir UltraHonk</th>
                </tr>
                <tr style={{ background: '#f5f5f5' }}>
                  <th style={{ ...th, background: '#e8f5e9' }}>Gen (ms)</th>
                  <th style={{ ...th, background: '#e8f5e9' }}>Verify (ms)</th>
                  <th style={{ ...th, background: '#e8f5e9' }}>Match</th>
                  <th style={{ ...th, background: '#e8f5e9' }}>Pass</th>
                  <th style={{ ...th, background: '#e3f2fd' }}>Witness (ms)</th>
                  <th style={{ ...th, background: '#e3f2fd' }}>Gen (ms)</th>
                  <th style={{ ...th, background: '#e3f2fd' }}>Verify (ms)</th>
                  <th style={{ ...th, background: '#e3f2fd' }}>Match</th>
                  <th style={{ ...th, background: '#e3f2fd' }}>Pass</th>
                </tr>
              </thead>
              <tbody>
                {pairResults.map((r, i) => {
                  const rowBg = (!r.circomPassed || !r.noirPassed) ? '#fff0f0' : 'transparent'
                  return (
                    <tr key={i} style={{ background: rowBg, borderBottom: '1px solid #eee' }}>
                      <td style={td}>{i + 1}</td>
                      <td style={td}>{r.personId}</td>
                      <td style={td}>{r.preScore}/128</td>
                      {/* Circom */}
                      <td style={{ ...td, background: '#f9fef9' }}>{r.circomGenMs > 0 ? r.circomGenMs.toFixed(0) : '—'}</td>
                      <td style={{ ...td, background: '#f9fef9' }}>{r.circomVerifyMs > 0 ? r.circomVerifyMs.toFixed(0) : '—'}</td>
                      <td style={{ ...td, background: '#f9fef9' }}>{r.circomMatchCount !== null ? `${r.circomMatchCount}/128` : '—'}</td>
                      <td style={{ ...td, background: '#f9fef9' }}>{r.circomPassed ? '✓' : r.circomError ?? '✗'}</td>
                      {/* Noir */}
                      <td style={{ ...td, background: '#f5f9ff' }}>{r.noirWitnessMs > 0 ? r.noirWitnessMs.toFixed(0) : '—'}</td>
                      <td style={{ ...td, background: '#f5f9ff' }}>{r.noirGenMs > 0 ? r.noirGenMs.toFixed(0) : '—'}</td>
                      <td style={{ ...td, background: '#f5f9ff' }}>{r.noirVerifyMs > 0 ? r.noirVerifyMs.toFixed(0) : '—'}</td>
                      <td style={{ ...td, background: '#f5f9ff' }}>{r.noirMatchCount !== null ? `${r.noirMatchCount}/128` : '—'}</td>
                      <td style={{ ...td, background: '#f5f9ff' }}>{r.noirPassed ? '✓' : r.noirError ?? '✗'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface SummaryBoxProps {
  title: string
  s: {
    passed: number
    total: number
    witnessStats: ReturnType<typeof stats>
    genStats: ReturnType<typeof stats>
    verifyStats: ReturnType<typeof stats>
    matchStats: ReturnType<typeof stats>
    proofSize: number
  }
  color: string
  border: string
  proofUnit: string
  hasWitness?: boolean
}

function SummaryBox({ title, s, color, border, hasWitness }: SummaryBoxProps) {
  const gar = s.total > 0 ? (100 * s.passed / s.total).toFixed(1) : '—'
  const rows: [string, string][] = [
    ['GAR (passed/total)', `${s.passed}/${s.total} = ${gar}%`],
    ...(hasWitness && s.witnessStats.n > 0
      ? [['Witness — mean ± std', `${s.witnessStats.mean}ms ± ${s.witnessStats.std}ms`] as [string, string]]
      : []),
    ['Proof gen — mean ± std', `${s.genStats.mean}ms ± ${s.genStats.std}ms`],
    ['Proof gen — min / max', `${s.genStats.min}ms / ${s.genStats.max}ms`],
    ['Proof verify — mean ± std', `${s.verifyStats.mean}ms ± ${s.verifyStats.std}ms`],
    ['Avg match count', s.matchStats.n > 0 ? `${s.matchStats.mean}/128 (${(s.matchStats.mean / 128 * 100).toFixed(1)}%)` : '—'],
    ['Proof size', s.proofSize > 0 ? `${s.proofSize} bytes (${(s.proofSize / 1024).toFixed(1)} KB)` : '—'],
  ]

  return (
    <div style={{ background: color, border: `1px solid ${border}`, padding: 14, borderRadius: 4 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>{title}</h3>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '3px 12px 3px 0', fontWeight: 'bold', color: '#444', whiteSpace: 'nowrap' }}>{k}</td>
              <td style={{ padding: '3px 0' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Style helpers ──────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '5px 8px',
  textAlign: 'left',
  borderBottom: '2px solid #ddd',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '3px 8px',
  whiteSpace: 'nowrap',
}
