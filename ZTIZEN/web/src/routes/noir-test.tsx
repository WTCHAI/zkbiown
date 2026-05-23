/**
 * Noir UltraHonk Browser Benchmark — /noir-test
 *
 * Runs N pre-filtered same-person pairs from real FaceScrub data in the browser,
 * measuring proof generation and verification separately.
 *
 * Uses ProofProvider (IndexedDB-cached circuit + shared Noir/Backend instances)
 * and GenerateProofWithProvider — same code path as production auth flow.
 *
 * Public inputs layout for biohash128 circuit:
 *   publicInputs[0]      = match_count
 *   publicInputs[1..128] = computed_commit
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { stringToFieldElement } from '@/lib/poseidon'
import { useProofContext } from '@/contexts/ProofProvider'

export const Route = createFileRoute('/noir-test')({
  component: NoirTestPage,
})

const PRODUCT_KEY = '8c2ab53680ab4f6b659dc79c929a7795bc8ce5770854b39402c92f98ef15537d'
const ZTIZEN_KEY  = 'ca977f6e6db2eb0e98dcafa82f01c196139c0c4a6f310fc0373c0aa63ef767a4'
const USER_KEY    = '51ee26cf93d86ef719f3913e998f5433ddccd5e3af58f962f833e04e15784e20'
const THRESHOLD   = 102

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

interface PairResult {
  personId: string
  preScore: number
  witnessMs: number
  proofGenMs: number
  verifyMs: number
  matchCount: number | null
  proofValid: boolean | null
  passed: boolean
  proofSize: number
  error?: string
}

interface Summary {
  nPairs: number
  passed: number
  witnessStats: ReturnType<typeof stats>
  genStats: ReturnType<typeof stats>
  verifyStats: ReturnType<typeof stats>
  matchStats: ReturnType<typeof stats>
  proofSize: number
}

function NoirTestPage() {
  const { noir, backend, isInitialized, isLoading, error: circuitError } = useProofContext()

  const [running, setRunning] = useState(false)
  const [nPairs, setNPairs] = useState(10)
  const [useKeccak, setUseKeccak] = useState(false)
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
    if (!noir || !backend) return

    setRunning(true)
    stopRef.current = false
    setLog([])
    setPairResults([])
    setSummary(null)
    setError(null)

    try {
      addLog('Loading templates...')
      const t0 = performance.now()
      const templates = await fetch('/circom/facenet_templates.json').then(r => {
        if (!r.ok) throw new Error(`Failed to fetch templates: ${r.statusText}`)
        return r.json()
      })
      addLog(`Templates loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`)

      // Pre-filter: only persons with a same-person pair scoring >=102/128
      const persons = Object.keys(templates.templates).sort()
      type Pair = { personId: string; enrollPoseidon: string[]; verifyBiohash: number[]; preScore: number }
      const pairs: Pair[] = []

      for (const personId of persons) {
        if (pairs.length >= nPairs) break
        const caps = Object.keys(templates.templates[personId]).sort((a, b) => Number(a) - Number(b))
        if (caps.length < 2) continue

        let found = false
        for (let ei = 0; ei < caps.length && !found; ei++) {
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
              pairs.push({ personId, enrollPoseidon: enroll.poseidon, verifyBiohash: verify.biohash, preScore: score })
              found = true
            }
          }
        }
      }

      addLog(`Pre-filtered: ${pairs.length}/${persons.length} persons with qualifying pair (score ≥${THRESHOLD}/128)`)

      const productKeyField = stringToFieldElement(PRODUCT_KEY).toString()
      const ztizenKeyField  = stringToFieldElement(ZTIZEN_KEY).toString()
      const userKeyField    = stringToFieldElement(USER_KEY).toString()

      const results: PairResult[] = []
      const witnessTimes: number[] = []
      const genTimes: number[] = []
      const verifyTimes: number[] = []
      const matchCounts: number[] = []
      let proofSize = 0
      let passCount = 0

      for (let i = 0; i < pairs.length; i++) {
        if (stopRef.current) { addLog('Stopped by user.'); break }

        const pair = pairs[i]
        let witnessMs = 0, proofGenMs = 0, verifyMs = 0
        let matchCount: number | null = null
        let proofValid: boolean | null = null
        let passed = false
        let errorMsg: string | undefined
        let pairProofSize = 0

        try {
          const input = {
            template: pair.verifyBiohash.map((b: number) => b.toString()),
            product_key: productKeyField,
            ztizen_key: ztizenKeyField,
            user_key: userKeyField,
            version: '1',
            nonce: '0',
            product_usage_hash: '0',
            auth_commit_stored: pair.enrollPoseidon,
          }

          const t1 = performance.now()
          const { witness } = await noir.execute(input)
          witnessMs = performance.now() - t1

          const t2 = performance.now()
          const { proof, publicInputs } = await backend.generateProof(witness, { keccak: useKeccak })
          proofGenMs = performance.now() - t2
          pairProofSize = proof.length
          if (proofSize === 0) proofSize = proof.length

          // publicInputs layout: [auth_commit_stored[0..127], match_count, computed_commit[0..127]]
          matchCount = publicInputs.length > 128 ? Number(BigInt(publicInputs[128])) : null

          const t3 = performance.now()
          proofValid = await backend.verifyProof({ proof, publicInputs }, { keccak: useKeccak })
          verifyMs = performance.now() - t3

          passed = proofValid === true
          if (passed) passCount++
          witnessTimes.push(witnessMs)
          genTimes.push(proofGenMs)
          verifyTimes.push(verifyMs)
          if (matchCount !== null) matchCounts.push(matchCount)
        } catch (err: any) {
          errorMsg = err?.message?.slice(0, 80)
        }

        const r: PairResult = {
          personId: pair.personId,
          preScore: pair.preScore,
          witnessMs,
          proofGenMs,
          verifyMs,
          matchCount,
          proofValid,
          passed,
          proofSize: pairProofSize,
          error: errorMsg,
        }
        results.push(r)
        setPairResults([...results])
        addLog(`[${i + 1}/${pairs.length}] ${pair.personId} — witness=${witnessMs.toFixed(0)}ms  gen=${proofGenMs.toFixed(0)}ms  verify=${verifyMs.toFixed(0)}ms  match=${matchCount ?? 'err'}/128  ${passed ? '✓' : '✗'}`)
      }

      const s: Summary = {
        nPairs: results.length,
        passed: passCount,
        witnessStats: stats(witnessTimes),
        genStats: stats(genTimes),
        verifyStats: stats(verifyTimes),
        matchStats: stats(matchCounts),
        proofSize,
      }
      setSummary(s)
      addLog(`Done: ${passCount}/${results.length} passed`)
      addLog(`Witness gen:  ${s.witnessStats.mean}ms ± ${s.witnessStats.std}ms`)
      addLog(`Proof gen:    ${s.genStats.mean}ms ± ${s.genStats.std}ms  (min=${s.genStats.min} max=${s.genStats.max})`)
      addLog(`Proof verify: ${s.verifyStats.mean}ms ± ${s.verifyStats.std}ms`)
      addLog(`Total:        ${s.witnessStats.mean + s.genStats.mean}ms avg`)
      addLog(`Avg match:    ${s.matchStats.mean}/128`)
      addLog(`Proof size:   ${proofSize} bytes (${(proofSize / 1024).toFixed(1)} KB)`)

    } catch (err: any) {
      setError(err?.message ?? String(err))
      addLog(`FATAL: ${err?.message}`)
    }

    setRunning(false)
  }

  if (circuitError) {
    return (
      <div style={{ fontFamily: 'monospace', padding: 32 }}>
        <h2>Circuit Error</h2>
        <div style={{ background: '#300', color: '#f88', padding: 12, borderRadius: 4 }}>{circuitError}</div>
      </div>
    )
  }

  if (isLoading || !isInitialized) {
    return (
      <div style={{ fontFamily: 'monospace', padding: 32 }}>
        <h2>Noir UltraHonk — Browser Benchmark</h2>
        <div style={{ color: '#888' }}>⚙️ Initializing circuit (IndexedDB cache + WASM)...</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>Noir UltraHonk — Browser Benchmark</h2>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
        Real FaceScrub dataset · FaceNet 128D · bb.js WASM in-browser · Scenario A (same person)
        · ProofProvider (IndexedDB-cached)
      </p>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <label>
          Pairs:{' '}
          <select value={nPairs} onChange={e => setNPairs(Number(e.target.value))} disabled={running}>
            {[1, 5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={useKeccak} onChange={e => setUseKeccak(e.target.checked)} disabled={running} />
          Keccak (on-chain mode)
        </label>
        <button
          onClick={run}
          disabled={running || !isInitialized}
          style={{ padding: '8px 20px', cursor: running ? 'not-allowed' : 'pointer', background: running ? '#ccc' : '#48a', color: '#fff', border: 'none', borderRadius: 4 }}
        >
          {running ? '⚙️ Running...' : '▶ Run Noir Benchmark'}
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

      {log.length > 0 && (
        <div style={{ background: '#111', color: '#4af', padding: 12, borderRadius: 4, fontSize: 12, lineHeight: 1.7, marginBottom: 16, maxHeight: 280, overflow: 'auto' }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {error && (
        <div style={{ background: '#300', color: '#f88', padding: 12, borderRadius: 4, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {summary && (
        <div style={{ background: '#e3f2fd', border: '1px solid #48a', padding: 16, borderRadius: 4, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px' }}>Summary — Noir UltraHonk, {summary.nPairs} pairs (Scenario A)</h3>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {([
                ['GAR (passed/total)', `${summary.passed}/${summary.nPairs} = ${(100 * summary.passed / summary.nPairs).toFixed(1)}%`],
                ['Witness gen — mean ± std', `${summary.witnessStats.mean}ms ± ${summary.witnessStats.std}ms`],
                ['Proof gen — mean ± std', `${summary.genStats.mean}ms ± ${summary.genStats.std}ms`],
                ['Proof gen — min / max', `${summary.genStats.min}ms / ${summary.genStats.max}ms`],
                ['Proof verify — mean ± std', `${summary.verifyStats.mean}ms ± ${summary.verifyStats.std}ms`],
                ['Total per proof (witness+gen)', `${summary.witnessStats.mean + summary.genStats.mean}ms`],
                ['Avg match count', `${summary.matchStats.mean}/128 (${(summary.matchStats.mean / 128 * 100).toFixed(1)}%)`],
                ['Proof size', `${summary.proofSize} bytes (${(summary.proofSize / 1024).toFixed(1)} KB)`],
                ['Keccak mode', useKeccak ? 'ON (on-chain/Solidity)' : 'OFF (off-chain/faster)'],
              ] as [string, string][]).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '4px 16px 4px 0', fontWeight: 'bold', color: '#444' }}>{k}</td>
                  <td style={{ padding: '4px 0' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pairResults.length > 0 && (
        <div>
          <h4>Per-Pair Results</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#e3f2fd' }}>
                {['#', 'Person', 'Pre-score', 'Witness (ms)', 'Gen (ms)', 'Verify (ms)', 'Match', 'Valid', 'Pass', 'Size'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '2px solid #48a' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairResults.map((r, i) => (
                <tr key={i} style={{ background: r.passed ? 'transparent' : '#fff0f0', borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 10px' }}>{i + 1}</td>
                  <td style={{ padding: '4px 10px' }}>{r.personId}</td>
                  <td style={{ padding: '4px 10px' }}>{r.preScore}/128</td>
                  <td style={{ padding: '4px 10px' }}>{r.witnessMs > 0 ? r.witnessMs.toFixed(0) : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.proofGenMs > 0 ? r.proofGenMs.toFixed(0) : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.verifyMs > 0 ? r.verifyMs.toFixed(0) : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.matchCount !== null ? `${r.matchCount}/128` : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.proofValid === true ? '✓' : r.proofValid === false ? '✗' : '—'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.passed ? '✓' : r.error ?? '✗'}</td>
                  <td style={{ padding: '4px 10px' }}>{r.proofSize > 0 ? `${(r.proofSize / 1024).toFixed(1)}KB` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
