/**
 * Circom Groth16 Browser Benchmark — /circom-test
 *
 * Runs N same-person pairs from real FaceScrub data in the browser,
 * collecting per-pair timings and computing mean/std — mirrors the
 * Node.js benchmark in pipeline/02-circom-benchmark.ts.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { groth16 } from 'snarkjs'
import { stringToFieldElement } from '@/lib/poseidon'


export const Route = createFileRoute('/circom-test')({
  component: CircomTestPage,
})

const PRODUCT_KEY = '8c2ab53680ab4f6b659dc79c929a7795bc8ce5770854b39402c92f98ef15537d'
const ZTIZEN_KEY  = 'ca977f6e6db2eb0e98dcafa82f01c196139c0c4a6f310fc0373c0aa63ef767a4'
const USER_KEY    = '51ee26cf93d86ef719f3913e998f5433ddccd5e3af58f962f833e04e15784e20'

// ─── Stats ────────────────────────────────────────────────────────────────────

function stats(arr: number[]) {
  if (arr.length === 0) return { mean: 0, std: 0, min: 0, max: 0 }
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const std = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length)
  return {
    mean: Number(mean.toFixed(0)),
    std: Number(std.toFixed(0)),
    min: Number(Math.min(...arr).toFixed(0)),
    max: Number(Math.max(...arr).toFixed(0)),
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PairResult {
  personId: string
  scenario: 'A' | 'B'
  matchCount: number | null
  proofValid: boolean | null
  proofGenMs: number
  verifyMs: number
  passed: boolean
  error?: string
}

interface Summary {
  nPairs: number
  passed: number
  genStats: ReturnType<typeof stats>
  verifyStats: ReturnType<typeof stats>
  matchStats: ReturnType<typeof stats>
  proofSize: number
}

// ─── Component ────────────────────────────────────────────────────────────────

function CircomTestPage() {
  const [running, setRunning] = useState(false)
  const [scenario, setScenario] = useState<'A' | 'B'>('A')
  const [nPairs, setNPairs] = useState(10)
  const [log, setLog] = useState<string[]>([])
  const [pairResults, setPairResults] = useState<PairResult[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
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
      // ── Load artifacts ────────────────────────────────────────────────
      addLog('Loading templates + wasm + zkey...')
      const t0 = performance.now()
      const [templates, wasmBuf, zkeyBuf] = await Promise.all([
        fetch('/circom/facenet_templates.json').then(r => r.json()),
        fetch('/circom/ztizen.wasm').then(r => r.arrayBuffer()),
        fetch('/circom/ztizen.zkey').then(r => r.arrayBuffer()),
      ])
      addLog(`Loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`)

      const vkRes = await fetch('/circom/verification_key.json')
      const vKey = await vkRes.json()

      // ── Build same-person pairs (Scenario A) ──────────────────────────
      // Mirrors sample-pairs.ts: only keep pairs where verify poseidon
      // scores ≥ THRESHOLD against enroll poseidon (pre-circuit filter).
      const THRESHOLD = 102
      const persons = Object.keys(templates.templates).sort()
      type Pair = { personId: string; enrollBiohash: number[]; enrollPoseidon: string[]; verifyBiohash: number[]; preScore: number }
      const pairs: Pair[] = []
      let totalCandidates = 0

      for (const personId of persons) {
        if (pairs.length >= nPairs) break
        const caps = Object.keys(templates.templates[personId]).sort((a, b) => Number(a) - Number(b))
        if (caps.length < 2) continue

        // Try all (enroll, verify) combinations for this person
        let found = false
        outer: for (let ei = 0; ei < caps.length && !found; ei++) {
          for (let vi = 0; vi < caps.length && !found; vi++) {
            if (ei === vi) continue
            totalCandidates++
            const enroll = templates.templates[personId][caps[ei]].keyA
            const verify  = templates.templates[personId][caps[vi]].keyA
            if (!enroll.poseidon || !verify.poseidon) continue
            // Pre-filter: count poseidon matches before running circuit
            let score = 0
            for (let k = 0; k < enroll.poseidon.length; k++) {
              if (verify.poseidon[k] === enroll.poseidon[k]) score++
            }
            if (score >= THRESHOLD) {
              pairs.push({ personId, enrollBiohash: enroll.biohash, enrollPoseidon: enroll.poseidon, verifyBiohash: verify.biohash, preScore: score })
              found = true
            }
          }
        }
      }

      addLog(`Pre-filtered: ${pairs.length}/${persons.length} persons have a qualifying pair (score ≥${THRESHOLD}/128)`)

      // ── Run proofs ────────────────────────────────────────────────────
      const wasm = new Uint8Array(wasmBuf)
      const zkey = new Uint8Array(zkeyBuf)
      const results: PairResult[] = []
      const genTimes: number[] = []
      const verifyTimes: number[] = []
      const matchCounts: number[] = []
      let proofSize = 0
      let passCount = 0

      for (let i = 0; i < pairs.length; i++) {
        if (stopRef.current) { addLog('Stopped by user.'); break }

        const pair = pairs[i]
        const biohash = scenario === 'A' ? pair.verifyBiohash : pair.enrollBiohash
        const input = {
          bio_template: biohash.map((b: number) => b.toString()),
          product_key: stringToFieldElement(PRODUCT_KEY).toString(),
          ztizen_key:  stringToFieldElement(ZTIZEN_KEY).toString(),
          user_key:    stringToFieldElement(USER_KEY).toString(),
          version: '1',
          nonce: '0',
          product_usage_hash: '0',
          auth_commit_stored: pair.enrollPoseidon,
        }

        let matchCount: number | null = null
        let proofValid: boolean | null = null
        let genMs = 0
        let verMs = 0
        let passed = false
        let errorMsg: string | undefined

        try {
          const t1 = performance.now()
          const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey)
          genMs = performance.now() - t1
          matchCount = Number(publicSignals[0])
          if (proofSize === 0) proofSize = JSON.stringify(proof).length

          const t2 = performance.now()
          proofValid = await groth16.verify(vKey, publicSignals, proof)
          verMs = performance.now() - t2

          passed = proofValid === true
          if (passed) passCount++
          genTimes.push(genMs)
          verifyTimes.push(verMs)
          if (matchCount !== null) matchCounts.push(matchCount)
        } catch (err: any) {
          errorMsg = err?.message?.slice(0, 80)
          genMs = 0
        }

        const r: PairResult = { personId: pair.personId, scenario, matchCount, proofValid, proofGenMs: genMs, verifyMs: verMs, passed, error: errorMsg }
        results.push(r)
        setPairResults([...results])
        addLog(`[${i + 1}/${pairs.length}] ${pair.personId} — match=${matchCount ?? 'err'}/128  gen=${genMs.toFixed(0)}ms  verify=${verMs.toFixed(0)}ms  ${passed ? '✓' : '✗'}`)
      }

      // ── Summary ───────────────────────────────────────────────────────
      const s: Summary = {
        nPairs: results.length,
        passed: passCount,
        genStats: stats(genTimes),
        verifyStats: stats(verifyTimes),
        matchStats: stats(matchCounts),
        proofSize,
      }
      setSummary(s)
      addLog(`\nDone: ${passCount}/${results.length} passed`)
      addLog(`Proof gen:   ${s.genStats.mean}ms ± ${s.genStats.std}ms  (min=${s.genStats.min} max=${s.genStats.max})`)
      addLog(`Proof verify: ${s.verifyStats.mean}ms ± ${s.verifyStats.std}ms`)
      addLog(`Avg match:   ${s.matchStats.mean}/128`)

    } catch (err: any) {
      setError(err?.message ?? String(err))
      addLog(`FATAL: ${err?.message}`)
    }

    setRunning(false)
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>Circom Groth16 — Browser Benchmark</h2>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
        Real FaceScrub dataset · FaceNet 128D · snarkjs WASM in-browser
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <label>
          Scenario:{' '}
          <select value={scenario} onChange={e => setScenario(e.target.value as 'A' | 'B')} disabled={running}>
            <option value="A">A — same person (cap0 enroll vs cap1 verify, expect ≥102/128)</option>
            <option value="B">B — enroll vs self (trivial 128/128 baseline)</option>
          </select>
        </label>
        <label>
          Pairs:{' '}
          <select value={nPairs} onChange={e => setNPairs(Number(e.target.value))} disabled={running}>
            {[1, 5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={run} disabled={running} style={{ padding: '8px 20px', cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? '⚙️ Running...' : '▶ Run Benchmark'}
        </button>
        {running && (
          <button onClick={() => { stopRef.current = true }} style={{ padding: '8px 16px', cursor: 'pointer', background: '#fee', border: '1px solid #c66' }}>
            ■ Stop
          </button>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background: '#111', color: '#0f0', padding: 12, borderRadius: 4, fontSize: 12, lineHeight: 1.7, marginBottom: 16, maxHeight: 240, overflow: 'auto' }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {error && (
        <div style={{ background: '#300', color: '#f88', padding: 12, borderRadius: 4, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Summary box */}
      {summary && (
        <div style={{ background: '#f0fff0', border: '1px solid #4a4', padding: 16, borderRadius: 4, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px' }}>Summary — Scenario {scenario}, {summary.nPairs} pairs</h3>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {([
                ['GAR (passed/total)', `${summary.passed}/${summary.nPairs} = ${(100*summary.passed/summary.nPairs).toFixed(1)}%`],
                ['Proof gen — mean ± std', `${summary.genStats.mean}ms ± ${summary.genStats.std}ms`],
                ['Proof gen — min / max', `${summary.genStats.min}ms / ${summary.genStats.max}ms`],
                ['Proof verify — mean ± std', `${summary.verifyStats.mean}ms ± ${summary.verifyStats.std}ms`],
                ['Avg match count', `${summary.matchStats.mean}/128 (${(summary.matchStats.mean/128*100).toFixed(1)}%)`],
                ['Proof size', `${summary.proofSize} bytes (${(summary.proofSize/1024).toFixed(1)} KB)`],
              ] as [string,string][]).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '4px 16px 4px 0', fontWeight: 'bold', color: '#444' }}>{k}</td>
                  <td style={{ padding: '4px 0' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-pair table */}
      {pairResults.length > 0 && (
        <div>
          <h4>Per-Pair Results</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                {['#', 'Person', 'Match', 'Gen (ms)', 'Verify (ms)', 'Valid', 'Pass'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairResults.map((r, i) => (
                <tr key={i} style={{ background: r.passed ? 'transparent' : '#fff0f0', borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 10px' }}>{i + 1}</td>
                  <td style={{ padding: '4px 10px' }}>{r.personId}</td>
                  <td style={{ padding: '4px 10px' }}>{r.matchCount !== null ? `${r.matchCount}/128` : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.proofGenMs > 0 ? r.proofGenMs.toFixed(0) : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.verifyMs > 0 ? r.verifyMs.toFixed(0) : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.proofValid === true ? '✓' : r.proofValid === false ? '✗' : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.passed ? '✓' : r.error ?? '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
