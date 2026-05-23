/**
 * Proof Calldata & Remix Testing Steps — /proof-demo
 *
 * Generates a real ZK proof and lays out every Remix step with
 * copyable calldata + a gas-recording field per step.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { groth16 } from 'snarkjs'
import { stringToFieldElement, bytesToFieldElement } from '@/lib/poseidon'
import { exportSolidityCallData } from '@/lib/circom'
import { poseidon8 } from 'poseidon-lite'
import { useProofContext } from '@/contexts/ProofProvider'
import { encodeFunctionData } from 'viem'

export const Route = createFileRoute('/proof-demo')({
  component: ProofDemoPage,
})

// ─── Defaults (match Prover.toml / noir-test.tsx) ────────────────────────────

const DEFAULT_PRODUCT_KEY = '8c2ab53680ab4f6b659dc79c929a7795bc8ce5770854b39402c92f98ef15537d'
const DEFAULT_ZTIZEN_KEY  = 'ca977f6e6db2eb0e98dcafa82f01c196139c0c4a6f310fc0373c0aa63ef767a4'
const DEFAULT_USER_KEY    = '51ee26cf93d86ef719f3913e998f5433ddccd5e3af58f962f833e04e15784e20'
const DEFAULT_VERSION     = '1'
const DEFAULT_NONCE       = '1'           // must be > 0 for initializeCredentialForService
const DEFAULT_USAGE_HASH  = '0'
const DEFAULT_TEMPLATE    = Array(128).fill(0).join(', ')

// Stable demo bytes32 IDs — ASCII prefix zero-padded to exactly 32 bytes (64 hex chars)
const CREDENTIAL_ID = '0x63726564656e7469616c00000000000000000000000000000000000000000000'
const SERVICE_ID    = '0x7365727669636500000000000000000000000000000000000000000000000000'
const PRODUCT_TX_ID = '0x70726f6475637454780000000000000000000000000000000000000000000000'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CircomCalldata {
  pA: string[]
  pB: string[][]
  pC: string[]
  pubSignals: string[]   // decimal strings from snarkjs
  rawCalldata: string    // full verifyProof calldata for Low Level Interaction tab
}

interface NoirCalldata {
  proofHex: string
  publicInputs: string[]
  rawCalldata: string
}

// ABI for ZTIZENCircom.verifyProof — pA/pB/pC/pubSignals directly
const CIRCOM_VERIFY_ABI = [{
  name: 'verifyProof',
  type: 'function',
  inputs: [
    { name: 'credentialId', type: 'bytes32' },
    { name: 'serviceId',    type: 'bytes32' },
    { name: 'currentNonce', type: 'uint256' },
    { name: 'productTxId',  type: 'bytes32' },
    { name: 'pA',           type: 'uint256[2]'    },
    { name: 'pB',           type: 'uint256[2][2]' },
    { name: 'pC',           type: 'uint256[2]'    },
    { name: 'pubSignals',   type: 'uint256[129]'  },
  ],
  outputs: [{ name: 'success', type: 'bool' }, { name: 'newNonce', type: 'uint256' }],
  stateMutability: 'nonpayable',
}] as const

// ABI for ZTIZENNoir.verifyProof — raw bytes proof + bytes32[] publicInputs
const NOIR_VERIFY_ABI = [{
  name: 'verifyProof',
  type: 'function',
  inputs: [
    { name: 'credentialId',  type: 'bytes32'   },
    { name: 'serviceId',     type: 'bytes32'   },
    { name: 'currentNonce',  type: 'uint256'   },
    { name: 'productTxId',   type: 'bytes32'   },
    { name: 'proof',         type: 'bytes'     },
    { name: 'publicInputs',  type: 'bytes32[]' },
  ],
  outputs: [{ name: 'success', type: 'bool' }, { name: 'newNonce', type: 'uint256' }],
  stateMutability: 'nonpayable',
}] as const

// ─── Small helpers ────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <button onClick={copy} style={{
      padding: '3px 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
      background: copied ? '#2a7' : '#555', color: '#fff', border: 'none', borderRadius: 3,
    }}>
      {copied ? '✓ copied' : label}
    </button>
  )
}

function Field({ label, value, accent = '#333', rows = 2 }: {
  label: string; value: string; accent?: string; rows?: number
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 'bold', color: accent }}>{label}</span>
        <CopyButton text={value} />
      </div>
      <textarea readOnly value={value} rows={rows} style={{
        width: '100%', fontFamily: 'monospace', fontSize: 10, padding: '5px 7px',
        border: '1px solid #ddd', borderRadius: 3, background: '#fafafa',
        resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
      }} />
    </div>
  )
}

// ─── Step card with gas input ─────────────────────────────────────────────────

function Step({
  num, title, contract, fn, params, note, gasKey, gasMap, onGas,
}: {
  num: number
  title: string
  contract: string
  fn: string
  params: { label: string; value: string; rows?: number }[]
  note?: string
  gasKey: string
  gasMap: Record<string, string>
  onGas: (key: string, val: string) => void
}) {
  const gas = gasMap[gasKey] ?? ''
  return (
    <div style={{
      border: '1px solid #ddd', borderRadius: 6, marginBottom: 14,
      background: '#fff', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#f5f5f5', borderBottom: '1px solid #ddd', padding: '8px 14px',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: '50%', background: '#444',
          color: '#fff', fontSize: 12, fontWeight: 'bold', flexShrink: 0,
        }}>{num}</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 'bold', fontSize: 13 }}>{title}</span>
          <span style={{ marginLeft: 10, fontSize: 11, color: '#888' }}>
            {contract} → <code style={{ background: '#e8e8e8', padding: '1px 4px', borderRadius: 3 }}>{fn}</code>
          </span>
        </div>
        {/* Gas field inline in header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#666' }}>Gas used:</span>
          <input
            type="text"
            placeholder="paste from Remix"
            value={gas}
            onChange={e => onGas(gasKey, e.target.value)}
            style={{
              fontFamily: 'monospace', fontSize: 12, padding: '3px 8px',
              border: gas ? '1px solid #2a7' : '1px solid #ccc',
              borderRadius: 4, width: 140,
              background: gas ? '#f0fff0' : '#fff',
              color: gas ? '#155724' : '#333',
            }}
          />
        </div>
      </div>

      {/* params */}
      <div style={{ padding: '12px 14px' }}>
        {params.map(p => (
          <Field key={p.label} label={p.label} value={p.value} rows={p.rows ?? 1} />
        ))}
        {note && (
          <div style={{
            marginTop: 8, padding: '6px 10px', background: '#fffde7',
            border: '1px solid #f0c040', borderRadius: 3, fontSize: 11, color: '#555',
          }}>
            {note}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Gas summary table ────────────────────────────────────────────────────────

function GasSummary({ gasMap, steps }: {
  gasMap: Record<string, string>
  steps: { key: string; label: string }[]
}) {
  const filled = steps.filter(s => gasMap[s.key])
  if (filled.length === 0) return null

  return (
    <div style={{
      marginTop: 20, padding: 14, background: '#e3f2fd',
      border: '1px solid #48a', borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>Gas Cost Summary</strong>
        <CopyButton label="Copy table"
          text={steps.filter(s => gasMap[s.key]).map(s => `${s.label}: ${gasMap[s.key]}`).join('\n')}
        />
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#bbdefb' }}>
            <th style={{ padding: '4px 10px', textAlign: 'left', border: '1px solid #90caf9' }}>Step</th>
            <th style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #90caf9' }}>Gas Used</th>
          </tr>
        </thead>
        <tbody>
          {steps.map(s => gasMap[s.key] ? (
            <tr key={s.key} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '4px 10px', border: '1px solid #e3f2fd' }}>{s.label}</td>
              <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'monospace', border: '1px solid #e3f2fd' }}>
                {Number(gasMap[s.key].replace(/,/g, '')).toLocaleString()}
              </td>
            </tr>
          ) : null)}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function ProofDemoPage() {
  const { noir, backend, isInitialized, isLoading, error: circuitError } = useProofContext()

  const [backendSel, setBackendSel] = useState<'circom' | 'noir'>('circom')
  const [productKey, setProductKey] = useState(DEFAULT_PRODUCT_KEY)
  const [ztizenKey, setZtizenKey]   = useState(DEFAULT_ZTIZEN_KEY)
  const [userKey, setUserKey]       = useState(DEFAULT_USER_KEY)
  const [version, setVersion]       = useState(DEFAULT_VERSION)
  const [nonce, setNonce]           = useState(DEFAULT_NONCE)
  const [usageHash, setUsageHash]   = useState(DEFAULT_USAGE_HASH)
  const [templateStr, setTemplateStr] = useState(DEFAULT_TEMPLATE)
  const [userAddress, setUserAddress] = useState('0x')   // filled by user — their Remix wallet address

  const [circomOut, setCircomOut] = useState<CircomCalldata | null>(null)
  const [noirOut, setNoirOut]     = useState<NoirCalldata | null>(null)
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [log, setLog]     = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gasMap, setGasMap] = useState<Record<string, string>>({})

  function addLog(msg: string) {
    const ts = new Date().toISOString().slice(11, 23)
    setLog(prev => [...prev, `${ts}  ${msg}`])
  }

  function setGas(key: string, val: string) {
    setGasMap(prev => ({ ...prev, [key]: val }))
  }

  function parseTemplate(): number[] | null {
    try {
      const bits = templateStr.split(',').map(s => {
        const n = parseInt(s.trim(), 10)
        if (n !== 0 && n !== 1) throw new Error(`Non-binary value: ${n}`)
        return n
      })
      if (bits.length !== 128) throw new Error(`Expected 128 bits, got ${bits.length}`)
      return bits
    } catch (e: any) {
      setError(`Template error: ${e.message}`)
      return null
    }
  }

  async function generate() {
    setRunning(true)
    setLog([])
    setCircomOut(null)
    setNoirOut(null)
    setMatchCount(null)
    setError(null)

    try {
      const template = parseTemplate()
      if (!template) { setRunning(false); return }

      addLog('Computing auth_commit_stored[128] via Poseidon8...')
      const t0 = performance.now()

      const productKeyField = stringToFieldElement(productKey).toString()
      const ztizenKeyField  = stringToFieldElement(ztizenKey).toString()
      const userKeyField    = stringToFieldElement(userKey).toString()

      const pkBig    = stringToFieldElement(productKey)
      const zkBig    = stringToFieldElement(ztizenKey)
      const ukBig    = bytesToFieldElement(new TextEncoder().encode(userKey))
      const verBig   = BigInt(version)
      const nonceBig = BigInt(nonce)
      const usageBig = BigInt(usageHash)

      const authCommitStrs: string[] = []
      for (let i = 0; i < 128; i++) {
        const h = poseidon8([
          BigInt(template[i]), BigInt(i),
          pkBig, zkBig, ukBig, verBig, nonceBig, usageBig,
        ])
        authCommitStrs.push(h.toString())
      }
      addLog(`  Done in ${(performance.now() - t0).toFixed(0)}ms`)

      if (backendSel === 'circom') {
        await runCircom(template, productKeyField, ztizenKeyField, userKeyField, authCommitStrs)
      } else {
        await runNoir(template, productKeyField, ztizenKeyField, userKeyField, authCommitStrs)
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      setError(msg)
      addLog(`ERROR: ${msg}`)
    }

    setRunning(false)
  }

  async function runCircom(
    template: number[], productKeyField: string, ztizenKeyField: string,
    userKeyField: string, authCommitStrs: string[]
  ) {
    addLog('Loading Circom wasm + zkey...')
    const t1 = performance.now()
    const [wasmBuf, zkeyBuf] = await Promise.all([
      fetch('/circom/ztizen.wasm').then(r => { if (!r.ok) throw new Error(r.statusText); return r.arrayBuffer() }),
      fetch('/circom/ztizen.zkey').then(r => { if (!r.ok) throw new Error(r.statusText); return r.arrayBuffer() }),
    ])
    addLog(`  Loaded in ${((performance.now() - t1) / 1000).toFixed(1)}s`)

    const input = {
      bio_template: template.map(b => b.toString()),
      product_key: productKeyField, ztizen_key: ztizenKeyField, user_key: userKeyField,
      version, nonce, product_usage_hash: usageHash,
      auth_commit_stored: authCommitStrs,
    }

    addLog('Running groth16.fullProve...')
    const t2 = performance.now()
    const { proof, publicSignals } = await groth16.fullProve(input, new Uint8Array(wasmBuf), new Uint8Array(zkeyBuf))
    addLog(`  Proof in ${((performance.now() - t2) / 1000).toFixed(1)}s`)

    const mc = Number(publicSignals[0])
    setMatchCount(mc)
    addLog(`  match_count = ${mc}/128 ${mc >= 102 ? '✓' : '✗'}`)

    const cd = await exportSolidityCallData(proof, publicSignals)

    // pubSignals from snarkjs are decimal strings — convert to bigint for viem
    // cast through unknown to satisfy viem's fixed-tuple type requirements
    const pABig = [BigInt(cd.pA[0]), BigInt(cd.pA[1])] as unknown as readonly [bigint, bigint]
    const pBBig = [
      [BigInt(cd.pB[0][0]), BigInt(cd.pB[0][1])],
      [BigInt(cd.pB[1][0]), BigInt(cd.pB[1][1])],
    ] as unknown as readonly [readonly [bigint, bigint], readonly [bigint, bigint]]
    const pCBig = [BigInt(cd.pC[0]), BigInt(cd.pC[1])] as unknown as readonly [bigint, bigint]
    const pubSignalsBig = cd.pubSignals.map(v => BigInt(v)) as unknown as readonly [...bigint[]] & { length: 129 }

    const rawCalldata = encodeFunctionData({
      abi: CIRCOM_VERIFY_ABI,
      functionName: 'verifyProof',
      args: [
        CREDENTIAL_ID as `0x${string}`,
        SERVICE_ID    as `0x${string}`,
        BigInt(nonce),
        PRODUCT_TX_ID as `0x${string}`,
        pABig,
        pBBig,
        pCBig,
        pubSignalsBig,
      ],
    })

    setCircomOut({ ...cd, rawCalldata })
    addLog('Done.')
  }

  async function runNoir(
    template: number[], productKeyField: string, ztizenKeyField: string,
    userKeyField: string, authCommitStrs: string[]
  ) {
    if (!noir || !backend) throw new Error('Noir circuit not initialized — wait for loading')

    const input = {
      template: template.map(b => b.toString()),
      product_key: productKeyField, ztizen_key: ztizenKeyField, user_key: userKeyField,
      version, nonce, product_usage_hash: usageHash,
      auth_commit_stored: authCommitStrs,
    }

    addLog('Executing Noir witness...')
    const t1 = performance.now()
    const { witness } = await noir.execute(input)
    addLog(`  Witness in ${(performance.now() - t1).toFixed(0)}ms`)

    addLog('Generating UltraHonk proof...')
    const t2 = performance.now()
    const { proof, publicInputs } = await backend.generateProof(witness, { keccak: false })
    addLog(`  Proof in ${((performance.now() - t2) / 1000).toFixed(1)}s  (${proof.length} bytes)`)

    const mc = publicInputs.length > 128 ? Number(BigInt(publicInputs[128])) : null
    if (mc !== null) {
      setMatchCount(mc)
      addLog(`  match_count = ${mc}/128 ${mc >= 102 ? '✓' : '✗'}`)
    }

    const proofHex = ('0x' + Array.from(proof).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`

    // publicInputs from bb.js are already 0x-prefixed bytes32 hex strings
    const pubInputsTyped = publicInputs.map(v => v as `0x${string}`)

    const rawCalldata = encodeFunctionData({
      abi: NOIR_VERIFY_ABI,
      functionName: 'verifyProof',
      args: [
        CREDENTIAL_ID as `0x${string}`,
        SERVICE_ID    as `0x${string}`,
        BigInt(nonce),
        PRODUCT_TX_ID as `0x${string}`,
        proofHex,
        pubInputsTyped,
      ],
    })

    setNoirOut({ proofHex, publicInputs, rawCalldata })
    addLog('Done.')
  }

  // ─── Derived calldata strings for step cards ──────────────────────────────

  const isNoirReady = isInitialized && !isLoading
  const proofReady  = backendSel === 'circom' ? !!circomOut : !!noirOut

  // verifyProof proof param — Circom: abi.encode(pA,pB,pC) representation
  // Remix's bytes param accepts comma-free hex; we give raw pA/pB/pC as separate fields
  const verifyProofParams = circomOut ? {
    proof:        `${JSON.stringify(circomOut.pA)},${JSON.stringify(circomOut.pB)},${JSON.stringify(circomOut.pC)}`,
    publicInputs: JSON.stringify(circomOut.pubSignals),
    pA:           JSON.stringify(circomOut.pA),
    pB:           JSON.stringify(circomOut.pB),
    pC:           JSON.stringify(circomOut.pC),
    pubSignals:   JSON.stringify(circomOut.pubSignals),
  } : noirOut ? {
    proof:        noirOut.proofHex,
    publicInputs: JSON.stringify(noirOut.publicInputs),
  } : null

  const contractLabel = backendSel === 'circom' ? 'ZTIZENCircom.sol' : 'ZTIZENNoir.sol'
  const verifierLabel = backendSel === 'circom' ? 'CircomVerifier.sol' : 'NoirVerifier.sol'

  // Gas step definitions
  const gasSteps = [
    { key: 'deploy_verifier',  label: `Deploy ${verifierLabel}` },
    { key: 'deploy_main',      label: `Deploy ${contractLabel}` },
    { key: 'whitelist',        label: 'addWhitelistedUser' },
    { key: 'register',         label: 'registerCredential' },
    { key: 'init_service',     label: 'initializeCredentialForService' },
    { key: 'enable_zk',        label: 'setZKVerificationEnabled' },
    { key: 'verify_proof',     label: 'verifyProof' },
  ]

  return (
    <div style={{ fontFamily: 'monospace', padding: 28, maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Header ── */}
      <h2 style={{ margin: '0 0 4px' }}>ZTIZEN — Remix Testing Guide</h2>
      <p style={{ color: '#666', fontSize: 12, margin: '0 0 20px' }}>
        Generate a ZK proof, then follow each numbered step in Remix. Paste the gas cost from each transaction into the field on the right.
      </p>

      {/* ── Backend + User address ── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 12 }}>ZK Backend:</strong>
          {(['circom', 'noir'] as const).map(b => (
            <label key={b} style={{ marginLeft: 14, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" name="be" value={b} checked={backendSel === b}
                onChange={() => { setBackendSel(b); setCircomOut(null); setNoirOut(null) }}
                disabled={running} />
              {' '}{b === 'circom' ? 'Circom / Groth16' : 'Noir / UltraHonk'}
            </label>
          ))}
          {backendSel === 'noir' && isLoading && <span style={{ marginLeft: 10, color: '#888', fontSize: 11 }}>⚙ Loading circuit...</span>}
          {backendSel === 'noir' && isNoirReady && <span style={{ marginLeft: 10, color: '#2a7', fontSize: 11 }}>✓ ready</span>}
          {circuitError && <span style={{ marginLeft: 10, color: '#c44', fontSize: 11 }}>✗ {circuitError}</span>}
        </div>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#555', whiteSpace: 'nowrap' }}>Your Remix wallet address:</span>
          <input value={userAddress} onChange={e => setUserAddress(e.target.value)}
            placeholder="0x..."
            style={{ fontFamily: 'monospace', fontSize: 11, padding: '3px 7px', border: '1px solid #ccc', borderRadius: 3, width: 340 }} />
        </label>
      </div>

      {/* ── Key inputs (collapsible row) ── */}
      <details style={{ marginBottom: 14, border: '1px solid #ddd', borderRadius: 4 }}>
        <summary style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', background: '#f9f9f9' }}>
          Circuit Inputs (prefilled — expand to edit)
        </summary>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {([
              ['Product Key (hex)', productKey, setProductKey],
              ['ZTIZEN Key (hex)',  ztizenKey,  setZtizenKey],
              ['User Key (hex)',    userKey,    setUserKey],
              ['Version',          version,    setVersion],
              ['Nonce (must be > 0)', nonce,   setNonce],
              ['Product Usage Hash', usageHash, setUsageHash],
            ] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
              <label key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                <span style={{ color: '#555' }}>{lbl}</span>
                <input value={val} onChange={e => set(e.target.value)} disabled={running}
                  style={{ fontFamily: 'monospace', fontSize: 11, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3 }} />
              </label>
            ))}
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
            <span style={{ color: '#555' }}>BioHash Template — 128 binary bits (comma-separated)</span>
            <textarea value={templateStr} onChange={e => setTemplateStr(e.target.value)} disabled={running} rows={2}
              style={{ fontFamily: 'monospace', fontSize: 10, padding: '4px 6px', border: '1px solid #ccc', borderRadius: 3, resize: 'vertical' }} />
          </label>
        </div>
      </details>

      {/* ── Generate button ── */}
      <div style={{ marginBottom: 16 }}>
        <button onClick={generate}
          disabled={running || (backendSel === 'noir' && !isNoirReady)}
          style={{
            padding: '9px 24px', fontSize: 13, cursor: running ? 'not-allowed' : 'pointer',
            background: running ? '#999' : '#444', color: '#fff', border: 'none', borderRadius: 4,
          }}>
          {running ? '⚙ Generating proof...' : '▶ Generate Proof + Prepare Steps'}
        </button>
      </div>

      {/* ── Log ── */}
      {log.length > 0 && (
        <div style={{
          background: '#111', color: '#4af', padding: 10, borderRadius: 4,
          fontSize: 11, lineHeight: 1.8, marginBottom: 14, maxHeight: 160, overflow: 'auto',
        }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {error && (
        <div style={{ background: '#300', color: '#f99', padding: 10, borderRadius: 4, marginBottom: 12, fontSize: 12 }}>
          {error}
        </div>
      )}

      {matchCount !== null && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16,
          padding: '5px 12px', borderRadius: 4, fontSize: 12,
          background: matchCount >= 102 ? '#d4edda' : '#f8d7da',
          border: `1px solid ${matchCount >= 102 ? '#4a8' : '#c44'}`,
          color: matchCount >= 102 ? '#155724' : '#721c24',
        }}>
          <strong>match_count = {matchCount}/128</strong>
          <span>({(matchCount / 128 * 100).toFixed(1)}%)</span>
          <span>{matchCount >= 102 ? '✓ threshold met' : '✗ below threshold'}</span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          REMIX TESTING STEPS
          ════════════════════════════════════════════════════════════════════ */}

      <div style={{ marginTop: 8, marginBottom: 8, padding: '7px 12px', background: '#f5f5f5', borderRadius: 4, fontSize: 12, color: '#555' }}>
        <strong>Remix workflow:</strong> Deploy verifier → deploy main contract → enroll → verify proof.
        {!proofReady && <span style={{ color: '#c66', marginLeft: 8 }}>⚠ Generate a proof first to fill in Step 7.</span>}
      </div>

      {/* Step 1 — Deploy verifier */}
      <Step num={1} title={`Deploy ${verifierLabel}`} contract={verifierLabel} fn="constructor"
        params={[
          { label: 'File', value: `contracts/${verifierLabel}`, rows: 1 },
          { label: 'Note', value: 'No constructor args. Copy the deployed address — you need it for Step 2.', rows: 1 },
        ]}
        note="After deploy: copy the contract address from Remix → paste into Step 2 constructor arg."
        gasKey="deploy_verifier" gasMap={gasMap} onGas={setGas}
      />

      {/* Step 2 — Deploy main contract */}
      <Step num={2} title={`Deploy ${contractLabel}`} contract={contractLabel} fn="constructor"
        params={[
          { label: 'File', value: `contracts/${contractLabel}`, rows: 1 },
          {
            label: backendSel === 'circom' ? '_circomVerifier  (address)' : '_noirVerifier  (address)',
            value: '<paste verifier address from Step 1>',
            rows: 1,
          },
        ]}
        note="After deploy: copy this contract address. All subsequent calls go to this contract."
        gasKey="deploy_main" gasMap={gasMap} onGas={setGas}
      />

      {/* Step 3 — Whitelist user */}
      <Step num={3} title="Whitelist your address" contract={contractLabel} fn="addWhitelistedUser"
        params={[
          { label: 'userAddress  (address)', value: userAddress || '<your Remix wallet address>', rows: 1 },
        ]}
        note="Must be called as owner (deployer). Use the same address you'll use to call registerCredential."
        gasKey="whitelist" gasMap={gasMap} onGas={setGas}
      />

      {/* Step 4 — Register credential */}
      <Step num={4} title="Register credential" contract={contractLabel} fn="registerCredential"
        params={[
          { label: 'credentialId  (bytes32)', value: CREDENTIAL_ID, rows: 1 },
          { label: 'userAddress   (address)', value: userAddress || '<your Remix wallet address>', rows: 1 },
          { label: 'version       (uint256)', value: version, rows: 1 },
        ]}
        note="Called as owner. Creates the credential record on-chain."
        gasKey="register" gasMap={gasMap} onGas={setGas}
      />

      {/* Step 5 — Initialize for service (anchors nonce_0) */}
      <Step num={5} title="Initialize credential for service (anchor nonce)" contract={contractLabel} fn="initializeCredentialForService"
        params={[
          { label: 'credentialId   (bytes32)', value: CREDENTIAL_ID, rows: 1 },
          { label: 'serviceId      (bytes32)', value: SERVICE_ID, rows: 1 },
          { label: 'initialNonce   (uint256)', value: nonce, rows: 1 },
        ]}
        note={`Anchors nonce = ${nonce} on-chain. The proof was generated with this nonce — they must match.`}
        gasKey="init_service" gasMap={gasMap} onGas={setGas}
      />

      {/* Step 6 — Enable ZK verification */}
      <Step num={6} title="Enable ZK verification" contract={contractLabel} fn="setZKVerificationEnabled"
        params={[
          { label: 'enabled  (bool)', value: 'true', rows: 1 },
        ]}
        note="ZK verification is disabled by default. Must enable before verifyProof will work."
        gasKey="enable_zk" gasMap={gasMap} onGas={setGas}
      />

      {/* Step 7 — verifyProof */}
      <div style={{
        border: `2px solid ${proofReady ? '#2a7' : '#ccc'}`, borderRadius: 6, marginBottom: 14,
        background: proofReady ? '#fff' : '#fafafa', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: proofReady ? '#e8f5e9' : '#f5f5f5',
          borderBottom: `1px solid ${proofReady ? '#a5d6a7' : '#ddd'}`, padding: '8px 14px',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: '50%',
            background: proofReady ? '#2a7' : '#bbb',
            color: '#fff', fontSize: 12, fontWeight: 'bold', flexShrink: 0,
          }}>7</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 'bold', fontSize: 13 }}>Verify ZK Proof</span>
            <span style={{ marginLeft: 10, fontSize: 11, color: '#888' }}>
              {contractLabel} → <code style={{ background: '#e8e8e8', padding: '1px 4px', borderRadius: 3 }}>verifyProof</code>
            </span>
            {!proofReady && <span style={{ marginLeft: 10, fontSize: 11, color: '#c66' }}>⚠ generate proof first</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#666' }}>Gas used:</span>
            <input type="text" placeholder="paste from Remix"
              value={gasMap['verify_proof'] ?? ''}
              onChange={e => setGas('verify_proof', e.target.value)}
              style={{
                fontFamily: 'monospace', fontSize: 12, padding: '3px 8px',
                border: gasMap['verify_proof'] ? '1px solid #2a7' : '1px solid #ccc',
                borderRadius: 4, width: 140,
                background: gasMap['verify_proof'] ? '#f0fff0' : '#fff',
                color: gasMap['verify_proof'] ? '#155724' : '#333',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '12px 14px' }}>
          <Field label="credentialId  (bytes32)" value={CREDENTIAL_ID} />
          <Field label="serviceId     (bytes32)" value={SERVICE_ID} />
          <Field label="currentNonce  (uint256)" value={nonce} />
          <Field label="productTxId   (bytes32)" value={PRODUCT_TX_ID} />

          {/* Proof params — different per backend */}
          {backendSel === 'circom' && circomOut ? (
            <>
              <Field label="pA  (uint256[2])"    value={JSON.stringify(circomOut.pA)} rows={1} accent="#2a7" />
              <Field label="pB  (uint256[2][2])" value={JSON.stringify(circomOut.pB)} rows={2} accent="#2a7" />
              <Field label="pC  (uint256[2])"    value={JSON.stringify(circomOut.pC)} rows={1} accent="#2a7" />
              <Field label="pubSignals  (uint256[129])" value={JSON.stringify(circomOut.pubSignals)} rows={3} accent="#2a7" />
            </>
          ) : backendSel === 'noir' && noirOut ? (
            <>
              <Field label="proof  (bytes)" value={noirOut.proofHex} rows={3} accent="#48a" />
              <Field label={`publicInputs  (bytes32[${noirOut.publicInputs.length}])`}
                value={JSON.stringify(noirOut.publicInputs)} rows={3} accent="#48a" />
            </>
          ) : (
            <div style={{ color: '#999', fontSize: 12, padding: '10px 0' }}>
              — proof calldata will appear here after generation —
            </div>
          )}

          <div style={{ marginTop: 10, padding: '6px 10px', background: '#fffde7', border: '1px solid #f0c040', borderRadius: 3, fontSize: 11 }}>
            <strong>Expected result:</strong> tx succeeds · event <code>ProofVerified</code> emitted · <code>newNonce</code> returned (different from {nonce})
          </div>
        </div>
      </div>

      {/* ── Gas summary ── */}
      <GasSummary gasMap={gasMap} steps={gasSteps} />

    </div>
  )
}
