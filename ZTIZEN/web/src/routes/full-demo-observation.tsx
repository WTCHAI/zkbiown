import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
  toHex,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia, arbitrumSepolia, type Chain } from 'viem/chains'
import { groth16 } from 'snarkjs'
import { stringToFieldElement, createFullAuthCommit } from '@/lib/poseidon'
import { ztizenCircomABI } from '@/lib/abis/zkBiownVerifier'

export const Route = createFileRoute('/full-demo-observation')({
  component: FullDemoObservation,
})

// ─── Network config ───────────────────────────────────────────────────────────

type NetworkId = 'sepolia' | 'arbsep'

const NETWORKS: Record<NetworkId, {
  label: string
  chain: Chain
  rpcUrl: string
  explorerBase: string
  ztizenAddress: Hex
  verifierAddress: Hex
}> = {
  sepolia: {
    label: 'Ethereum Sepolia',
    chain: sepolia,
    rpcUrl: import.meta.env.VITE_RPC_SEPOLIA as string,
    explorerBase: 'https://eth-sepolia.blockscout.com',
    ztizenAddress:   '0xe912e2728dd57dbad4796e0887ff917855bac37b',
    verifierAddress: '0x659cb73ed8673df8ce4c5a620888931c63064986',
  },
  arbsep: {
    label: 'Arbitrum Sepolia',
    chain: arbitrumSepolia,
    rpcUrl: import.meta.env.VITE_RPC_ARB_SEPOLIA as string,
    explorerBase: 'https://arbitrum-sepolia.blockscout.com',
    ztizenAddress:   '0x0f976eb3d4256f8a1ce651681dad2d9c606952ef',
    verifierAddress: '0xe0abf17803cad3ff0d557679487dd5d0ece5e65d',
  },
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCT_KEY = '8c2ab53680ab4f6b659dc79c929a7795bc8ce5770854b39402c92f98ef15537d'
const ZTIZEN_KEY  = 'ca977f6e6db2eb0e98dcafa82f01c196139c0c4a6f310fc0373c0aa63ef767a4'
const USER_KEY    = '51ee26cf93d86ef719f3913e998f5433ddccd5e3af58f962f833e04e15784e20'

const DEFAULT_TEMPLATE = Array(128).fill(0) as number[]

const DEFAULT_CREDENTIAL_STR = 'ztizen-demo-credential'
const DEFAULT_SERVICE_STR    = 'ztizen-demo-service'
const DEFAULT_PRODUCT_TX_STR = 'ztizen-demo-tx'

const CREDENTIAL_ID = keccak256(toHex(DEFAULT_CREDENTIAL_STR)) as Hex
const SERVICE_ID    = keccak256(toHex(DEFAULT_SERVICE_STR))    as Hex
const PRODUCT_TX_ID = keccak256(toHex(DEFAULT_PRODUCT_TX_STR)) as Hex
const INITIAL_NONCE = 1n

const PRODUCT_USAGE = { product_id: 'demo', service_id: 'demo', service_type: 'demo' }
const PRODUCT_USAGE_HASH_STR = stringToFieldElement('demo:demo:demo').toString()

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'error'

interface StepState {
  status: StepStatus
  txHash?: string
  error?: string
  detail?: string
}

interface ContractState {
  isWhitelisted?: boolean
  credentialExists?: boolean
  isInitialized?: boolean
  zkEnabled?: boolean
  nonce?: string
  commitmentHash?: string
  isProofUsed?: boolean
}

interface ProofData {
  pA: [bigint, bigint]
  pB: [[bigint, bigint], [bigint, bigint]]
  pC: [bigint, bigint]
  pubSignals: bigint[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: StepStatus) {
  return { pending: '#888', running: '#f90', done: '#2a2', error: '#e44' }[s]
}
function statusLabel(s: StepStatus) {
  return { pending: 'PENDING', running: 'RUNNING…', done: 'DONE', error: 'ERROR' }[s]
}
function shortHex(h: string, head = 10, tail = 6) {
  return h.length > head + tail + 3 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h
}
type NetConfig = typeof NETWORKS[NetworkId]
function buildPublicClient(net: NetConfig) {
  return createPublicClient({ chain: net.chain, transport: http(net.rpcUrl) })
}
function buildWalletClient(net: NetConfig, privateKey: string) {
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const account = privateKeyToAccount(key as Hex)
  const walletClient = createWalletClient({ account, chain: net.chain, transport: http(net.rpcUrl) })
  return { walletClient, account }
}

// ─── ParamRow helper ──────────────────────────────────────────────────────────
function ParamRow({ label, value, mono = true, highlight }: { label: string; value: string; mono?: boolean; highlight?: 'green' | 'blue' | 'orange' }) {
  const colors = { green: '#2a6', blue: '#36c', orange: '#c60' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 4, borderBottom: '1px solid #e8e8e8', padding: '3px 0', fontSize: 11 }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all', color: highlight ? colors[highlight] : '#333' }}>{value}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

function FullDemoObservation() {
  const [networkId, setNetworkId] = useState<NetworkId>('sepolia')
  const net = NETWORKS[networkId]

  const [privateKey, setPrivateKey] = useState('')
  const [ownerAddress, setOwnerAddress] = useState('')
  const [keyError, setKeyError] = useState('')

  // Biometric state
  const [bioTemplate, setBioTemplate] = useState<number[]>(DEFAULT_TEMPLATE)
  const [bioScanned, setBioScanned] = useState(false)

  const [steps, setSteps] = useState<Record<string, StepState>>({
    compute:   { status: 'pending' },
    whitelist: { status: 'pending' },
    register:  { status: 'pending' },
    init:      { status: 'pending' },
    enable:    { status: 'pending' },
    proof:     { status: 'pending' },
    verify:    { status: 'pending' },
    oracle:    { status: 'pending' },
  })

  // Toggle state for each step's parameter panel
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [contractState, setContractState] = useState<ContractState>({})
  const [proofData, setProofData] = useState<ProofData | null>(null)
  const [authCommit, setAuthCommit] = useState<bigint[] | null>(null)
  const [commitHash, setCommitHash] = useState<Hex | null>(null)
  const [newNonce, setNewNonce] = useState<bigint | null>(null)
  const [newCommitHash, setNewCommitHash] = useState<Hex | null>(null)
  const [nullifier, setNullifier] = useState<Hex | null>(null)

  // ── Credential input state ──
  const [credentialStr, setCredentialStr] = useState(DEFAULT_CREDENTIAL_STR)
  const [serviceStr, setServiceStr] = useState(DEFAULT_SERVICE_STR)
  const [customCredId, setCustomCredId] = useState<Hex>(CREDENTIAL_ID)
  const [customSvcId, setCustomSvcId] = useState<Hex>(SERVICE_ID)

  // ── Monitor state ──
  const [monitorActive, setMonitorActive] = useState(false)
  const [monitorData, setMonitorData] = useState<{ nonce: string; commitHash: string; timestamp: string } | null>(null)
  const [monitorError, setMonitorError] = useState('')
  const monitorRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Rotate credential state ──
  const [rotateStatus, setRotateStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [rotateDetail, setRotateDetail] = useState('')

  const logRef = useRef<HTMLTextAreaElement>(null)
  const [logs, setLogs] = useState<string[]>([
    'ZTIZEN Full Pipeline Demo — ready.',
    'Select a network above, paste the deployer key, then run steps 1→8.',
  ])

  const log = useCallback((msg: string) => {
    setLogs(prev => {
      const next = [...prev, `[${new Date().toISOString().slice(11, 19)}] ${msg}`]
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 10)
      return next
    })
  }, [])

  function setStep(key: string, update: Partial<StepState>) {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], ...update } }))
  }
  function toggleExpanded(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Credential input ──
  function handleCredentialStr(val: string) {
    setCredentialStr(val)
    // Accept either a plain string (keccak'd) or a raw 0x hex bytes32
    if (/^0x[0-9a-fA-F]{64}$/.test(val)) {
      setCustomCredId(val as Hex)
    } else {
      try { setCustomCredId(keccak256(toHex(val)) as Hex) } catch { /* ignore */ }
    }
  }
  function handleServiceStr(val: string) {
    setServiceStr(val)
    if (/^0x[0-9a-fA-F]{64}$/.test(val)) {
      setCustomSvcId(val as Hex)
    } else {
      try { setCustomSvcId(keccak256(toHex(val)) as Hex) } catch { /* ignore */ }
    }
  }

  // ── Monitor poll ──
  async function pollMonitor() {
    try {
      const pc = buildPublicClient(net)
      const [nonce, commitH] = await Promise.all([
        pc.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'getNonce', args: [customCredId, customSvcId] }),
        pc.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'getCommitmentHash', args: [customCredId] }),
      ])
      setMonitorData({
        nonce: (nonce as bigint).toString(),
        commitHash: commitH as string,
        timestamp: new Date().toISOString().slice(11, 19),
      })
      setMonitorError('')
    } catch (e: any) {
      setMonitorError(e.shortMessage ?? e.message ?? String(e))
    }
  }

  function toggleMonitor() {
    if (monitorActive) {
      if (monitorRef.current) clearInterval(monitorRef.current)
      monitorRef.current = null
      setMonitorActive(false)
    } else {
      pollMonitor()
      monitorRef.current = setInterval(pollMonitor, 5000)
      setMonitorActive(true)
    }
  }

  // Stop monitor on network change or unmount
  useEffect(() => {
    return () => { if (monitorRef.current) clearInterval(monitorRef.current) }
  }, [networkId])

  // ── Rotate credential (standalone oracle update) ──
  async function runRotateCredential() {
    if (!bioScanned) { log('⚠ run Biometric Scan first — need bio_template to recompute auth_commit'); return }
    if (!privateKey || !ownerAddress) { log('⚠ paste owner private key first'); return }
    setRotateStatus('running')
    setRotateDetail('')
    log(`Rotate Credential — reading on-chain nonce for ${shortHex(customCredId)}…`)
    try {
      const pc = buildPublicClient(net)
      const { walletClient, account } = buildWalletClient(net, privateKey)

      // 1. Read current on-chain nonce
      const onChainNonce = await pc.readContract({
        address: net.ztizenAddress, abi: ztizenCircomABI,
        functionName: 'getNonce', args: [customCredId, customSvcId],
      }) as bigint
      log(`  on-chain nonce = ${onChainNonce}`)

      // 2. Recompute auth_commit[128] with that nonce
      const userKeyBytes = new TextEncoder().encode(USER_KEY)
      const commits = createFullAuthCommit(bioTemplate, PRODUCT_KEY, ZTIZEN_KEY, userKeyBytes, 1, onChainNonce, PRODUCT_USAGE)
      const commitsAs128 = commits as unknown as readonly [
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
      ]
      const newHash = keccak256(encodeAbiParameters(parseAbiParameters('uint256[128]'), [commitsAs128]))
      log(`  new auth_commit[0] = ${commits[0].toString().slice(0, 24)}…`)
      log(`  new commitHash     = ${newHash}`)

      // 3. Call updateCommitmentHash
      const txHash = await walletClient.writeContract({
        address: net.ztizenAddress, abi: ztizenCircomABI,
        functionName: 'updateCommitmentHash', args: [customCredId, newHash],
        account,
      })
      log(`  tx: ${txHash}`)
      const receipt = await pc.waitForTransactionReceipt({ hash: txHash, confirmations: 1 })
      log(`  confirmed block ${receipt.blockNumber} · gas ${receipt.gasUsed.toLocaleString()}`)
      log(`  ✓ commitHash rotated for nonce=${onChainNonce}`)

      // 4. Refresh monitor
      await pollMonitor()
      setRotateStatus('done')
      setRotateDetail(`nonce=${onChainNonce} · gas ${receipt.gasUsed.toLocaleString()} · tx ${shortHex(txHash)}`)
    } catch (e: any) {
      const msg = e.shortMessage ?? e.message ?? String(e)
      setRotateStatus('error')
      setRotateDetail(msg.slice(0, 160))
      log(`  ERROR: ${msg.slice(0, 160)}`)
    }
  }

  // ── Private key ──
  function handleKeyInput(val: string) {
    setPrivateKey(val)
    setKeyError('')
    setOwnerAddress('')
    const normalized = val.startsWith('0x') ? val : `0x${val}`
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
      if (val.length > 0) setKeyError('Must be 64 hex chars (with or without 0x)')
      return
    }
    try {
      const account = privateKeyToAccount(normalized as Hex)
      setOwnerAddress(account.address)
    } catch { setKeyError('Invalid private key') }
  }

  // ── Simulated biometric scan ──
  function runBioScan() {
    log('Biometric scan — simulating face capture…')
    // Simulate a realistic-looking 128-bit biohash (random 0/1 pattern)
    const template = Array.from({ length: 128 }, () => Math.random() > 0.5 ? 1 : 0)
    setBioTemplate(template)
    setBioScanned(true)
    log(`  Generated 128-bit biohash: ${template.slice(0, 16).join('')}… (${template.filter(b => b === 1).length}/128 bits set)`)
    log('  Scan complete ✓  (demo: random biohash — production uses face embeddings)')
  }

  // ── Read contract state ──
  async function readState(pubClient: ReturnType<typeof buildPublicClient>, ownerAddr: Hex) {
    try {
      const [whitelisted, exists, initialized, zkEnabled, nonce, commitH] = await Promise.all([
        pubClient.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'isUserWhitelisted', args: [ownerAddr] }),
        pubClient.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'credentialExists', args: [CREDENTIAL_ID] }),
        pubClient.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'isCredentialInitializedForService', args: [CREDENTIAL_ID, SERVICE_ID] }),
        pubClient.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'zkVerificationEnabled', args: [] }),
        pubClient.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'getNonce', args: [CREDENTIAL_ID, SERVICE_ID] }),
        pubClient.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'getCommitmentHash', args: [CREDENTIAL_ID] }),
      ])
      setContractState({
        isWhitelisted: whitelisted as boolean,
        credentialExists: exists as boolean,
        isInitialized: initialized as boolean,
        zkEnabled: zkEnabled as boolean,
        nonce: (nonce as bigint).toString(),
        commitmentHash: commitH as string,
      })
    } catch (e) {
      log(`⚠ state read partial: ${String(e).slice(0, 80)}`)
    }
  }

  // ── Generic sendTx helper ──
  async function sendTx(stepKey: string, label: string, fn: (wc: ReturnType<typeof createWalletClient>) => Promise<Hex>) {
    if (!privateKey || !ownerAddress) { log('⚠ paste owner private key first'); return }
    setStep(stepKey, { status: 'running' })
    log(`Step — ${label}…`)
    try {
      const pubClient = buildPublicClient(net)
      const { walletClient } = buildWalletClient(net, privateKey)
      const hash = await fn(walletClient)
      log(`  tx: ${hash}`)
      const receipt = await pubClient.waitForTransactionReceipt({ hash, confirmations: 1 })
      log(`  confirmed block ${receipt.blockNumber} · gas ${receipt.gasUsed.toLocaleString()}`)
      await readState(pubClient, ownerAddress as Hex)
      setStep(stepKey, { status: 'done', txHash: hash, detail: `gas ${receipt.gasUsed.toLocaleString()}` })
    } catch (e: any) {
      const msg = e.shortMessage ?? e.message ?? String(e)
      setStep(stepKey, { status: 'error', error: msg.slice(0, 160) })
      log(`  ERROR: ${msg.slice(0, 160)}`)
    }
  }

  // ── Step 1 — Compute auth_commit + commitHash ──
  async function runCompute() {
    if (!bioScanned) { log('⚠ run Biometric Scan first'); return }
    setStep('compute', { status: 'running' })
    log('Step 1 — computing auth_commit[128] with Poseidon8…')
    try {
      const userKeyBytes = new TextEncoder().encode(USER_KEY)
      const commits = createFullAuthCommit(bioTemplate, PRODUCT_KEY, ZTIZEN_KEY, userKeyBytes, 1, INITIAL_NONCE, PRODUCT_USAGE)
      setAuthCommit(commits)

      const commitsAs128 = commits as unknown as readonly [
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
      ]
      const hash = keccak256(encodeAbiParameters(parseAbiParameters('uint256[128]'), [commitsAs128]))
      setCommitHash(hash)

      log(`  product_key field   = ${stringToFieldElement(PRODUCT_KEY).toString().slice(0, 24)}…`)
      log(`  ztizen_key field    = ${stringToFieldElement(ZTIZEN_KEY).toString().slice(0, 24)}…`)
      log(`  user_key field      = ${stringToFieldElement(USER_KEY).toString().slice(0, 24)}…`)
      log(`  nonce_0             = ${INITIAL_NONCE}`)
      log(`  auth_commit[0]      = ${commits[0].toString().slice(0, 24)}…`)
      log(`  auth_commit[127]    = ${commits[127].toString().slice(0, 24)}…`)
      log(`  commitHash          = ${hash}`)
      setStep('compute', { status: 'done', detail: `commitHash = ${hash.slice(0, 14)}…` })
    } catch (e: any) {
      setStep('compute', { status: 'error', error: String(e) })
      log(`  ERROR: ${e.message ?? e}`)
    }
  }

  // ── Step 2 — addWhitelistedUser ──
  function runWhitelist() {
    return sendTx('whitelist', 'addWhitelistedUser', (wc) =>
      (wc as any).writeContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'addWhitelistedUser', args: [ownerAddress as Hex] })
    )
  }

  // ── Step 3 — registerCredential ──
  function runRegister() {
    if (!commitHash) { log('⚠ run Step 1 first to compute commitHash'); return }
    return sendTx('register', 'registerCredential', (wc) =>
      (wc as any).writeContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'registerCredential', args: [CREDENTIAL_ID, ownerAddress as Hex, 1n, commitHash] })
    )
  }

  // ── Step 4 — initializeCredentialForService ──
  function runInit() {
    return sendTx('init', 'initializeCredentialForService', (wc) =>
      (wc as any).writeContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'initializeCredentialForService', args: [CREDENTIAL_ID, SERVICE_ID, INITIAL_NONCE] })
    )
  }

  // ── Step 5 — setZKVerificationEnabled ──
  function runEnable() {
    return sendTx('enable', 'setZKVerificationEnabled(true)', (wc) =>
      (wc as any).writeContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'setZKVerificationEnabled', args: [true] })
    )
  }

  // ── Step 6 — Generate Groth16 proof ──
  async function runProof() {
    if (!authCommit) { log('⚠ run Step 1 first'); return }
    setStep('proof', { status: 'running' })
    log('Step 6 — generating Groth16 proof…')
    try {
      const input = {
        bio_template:        bioTemplate.map(String),
        product_key:         stringToFieldElement(PRODUCT_KEY).toString(),
        ztizen_key:          stringToFieldElement(ZTIZEN_KEY).toString(),
        user_key:            stringToFieldElement(USER_KEY).toString(),
        version:             '1',
        nonce:               INITIAL_NONCE.toString(),
        product_usage_hash:  PRODUCT_USAGE_HASH_STR,
        auth_commit_stored:  authCommit.map(String),
      }
      log(`  circuit input: bio_template[0..7]=${bioTemplate.slice(0, 8).join('')}…`)
      log(`  fetching wasm + zkey from /circom/…`)
      const [wasmBuf, zkeyBuf] = await Promise.all([
        fetch('/circom/ztizen.wasm').then(r => r.arrayBuffer()),
        fetch('/circom/ztizen.zkey').then(r => r.arrayBuffer()),
      ])
      const { proof, publicSignals } = await groth16.fullProve(input, new Uint8Array(wasmBuf), new Uint8Array(zkeyBuf))
      log('  snarkjs.groth16.fullProve ✓')

      const pA: [bigint, bigint] = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])]
      const pB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ]
      const pC: [bigint, bigint] = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])]
      const pubSigs = publicSignals.map((s: string) => BigInt(s))

      log(`  pubSignals[0] match_count = ${pubSigs[0]}`)
      log(`  pA[0] = ${pA[0].toString().slice(0, 24)}…`)
      log(`  pB[0][0] = ${pB[0][0].toString().slice(0, 24)}…`)
      log(`  pC[0] = ${pC[0].toString().slice(0, 24)}…`)

      setProofData({ pA, pB, pC, pubSignals: pubSigs })
      setStep('proof', { status: 'done', detail: `match_count = ${pubSigs[0]}` })
    } catch (e: any) {
      setStep('proof', { status: 'error', error: e.message ?? String(e) })
      log(`  ERROR: ${e.message ?? e}`)
    }
  }

  // ── Step 7 — verifyProof on-chain ──
  async function runVerify() {
    if (!proofData) { log('⚠ run Step 6 first'); return }
    if (!privateKey || !ownerAddress) { log('⚠ paste owner private key first'); return }
    setStep('verify', { status: 'running' })
    log('Step 7 — submitting verifyProof to ZTIZENCircom…')
    try {
      const pubClient = buildPublicClient(net)
      const { walletClient, account } = buildWalletClient(net, privateKey)
      const currentNonce = BigInt(contractState.nonce ?? '1')

      const pubSignals129 = proofData.pubSignals as unknown as readonly [
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint
      ]

      log(`  args: credentialId = ${CREDENTIAL_ID.slice(0, 14)}…`)
      log(`  args: serviceId    = ${SERVICE_ID.slice(0, 14)}…`)
      log(`  args: currentNonce = ${currentNonce}`)
      log(`  args: productTxId  = ${PRODUCT_TX_ID.slice(0, 14)}…`)

      const hash = await walletClient.writeContract({
        address: net.ztizenAddress, abi: ztizenCircomABI,
        functionName: 'verifyProof',
        args: [CREDENTIAL_ID, SERVICE_ID, currentNonce, PRODUCT_TX_ID, proofData.pA, proofData.pB, proofData.pC, pubSignals129],
        account,
      })
      log(`  tx: ${hash}`)
      const receipt = await pubClient.waitForTransactionReceipt({ hash, confirmations: 1 })
      log(`  confirmed block ${receipt.blockNumber} · gas ${receipt.gasUsed.toLocaleString()}`)

      // Decode ProofVerified event
      const eventSig = keccak256(toHex('ProofVerified(bytes32,bytes32,bytes32,address,uint256,uint256,uint256)'))
      let extractedNewNonce = 0n
      for (const l of receipt.logs) {
        if (l.topics[0] === eventSig) {
          const data = l.data
          extractedNewNonce = BigInt('0x' + data.slice(66, 130))
          log(`  ProofVerified event → oldNonce=${currentNonce}`)
          log(`  ProofVerified event → newNonce=${extractedNewNonce}`)
          setNewNonce(extractedNewNonce)
          break
        }
      }

      // Compute & check nullifier
      const nullif = keccak256(
        encodePacked(
          ['uint256','uint256','uint256','uint256','uint256','uint256','uint256','uint256','uint256'],
          [...proofData.pA, ...proofData.pB[0], ...proofData.pB[1], ...proofData.pC, proofData.pubSignals[0]] as [bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint]
        )
      )
      setNullifier(nullif)
      const isUsed = await pubClient.readContract({ address: net.ztizenAddress, abi: ztizenCircomABI, functionName: 'isProofUsed', args: [nullif] })
      log(`  nullifier          = ${nullif.slice(0, 14)}…`)
      log(`  isProofUsed        = ${isUsed}  ← replay blocked ✓`)
      setContractState(prev => ({ ...prev, isProofUsed: isUsed as boolean, nonce: extractedNewNonce.toString() }))
      await readState(pubClient, ownerAddress as Hex)
      setStep('verify', { status: 'done', txHash: hash, detail: `newNonce rolled · gas ${receipt.gasUsed.toLocaleString()}` })
    } catch (e: any) {
      const msg = e.shortMessage ?? e.message ?? String(e)
      setStep('verify', { status: 'error', error: msg.slice(0, 160) })
      log(`  ERROR: ${msg.slice(0, 160)}`)
    }
  }

  // ── Step 8 — Oracle post-auth update ──
  async function runOracleUpdate() {
    if (newNonce === null) { log('⚠ run Step 7 first'); return }
    if (!privateKey || !ownerAddress) { log('⚠ paste owner private key first'); return }
    setStep('oracle', { status: 'running' })
    log(`Step 8 — Oracle recomputing auth_commit with newNonce=${newNonce}…`)
    try {
      const pubClient = buildPublicClient(net)
      const { walletClient, account } = buildWalletClient(net, privateKey)
      const userKeyBytes = new TextEncoder().encode(USER_KEY)
      const newCommits = createFullAuthCommit(bioTemplate, PRODUCT_KEY, ZTIZEN_KEY, userKeyBytes, 1, newNonce, PRODUCT_USAGE)

      const newCommitsAs128 = newCommits as unknown as readonly [
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
        bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,
      ]
      const newHash = keccak256(encodeAbiParameters(parseAbiParameters('uint256[128]'), [newCommitsAs128]))
      setNewCommitHash(newHash)

      log(`  new auth_commit[0] = ${newCommits[0].toString().slice(0, 24)}…`)
      log(`  new commitHash     = ${newHash}`)

      const hash = await walletClient.writeContract({
        address: net.ztizenAddress, abi: ztizenCircomABI,
        functionName: 'updateCommitmentHash', args: [CREDENTIAL_ID, newHash],
        account,
      })
      log(`  tx: ${hash}`)
      const receipt = await pubClient.waitForTransactionReceipt({ hash, confirmations: 1 })
      log(`  confirmed block ${receipt.blockNumber} · gas ${receipt.gasUsed.toLocaleString()}`)
      log(`  ✓ on-chain commitmentHash updated — ready for next login`)

      await readState(pubClient, ownerAddress as Hex)
      setStep('oracle', { status: 'done', txHash: hash, detail: `commitHash rotated · gas ${receipt.gasUsed.toLocaleString()}` })
    } catch (e: any) {
      const msg = e.shortMessage ?? e.message ?? String(e)
      setStep('oracle', { status: 'error', error: msg.slice(0, 160) })
      log(`  ERROR: ${msg.slice(0, 160)}`)
    }
  }

  const hasKey = !!ownerAddress && !keyError

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function Btn({ onClick, disabled, children, color = '#3366cc' }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; color?: string }) {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        padding: '5px 14px', fontFamily: 'monospace', fontSize: 11,
        background: disabled ? '#ccc' : color, color: '#fff',
        border: 'none', borderRadius: 3, cursor: disabled ? 'default' : 'pointer', marginRight: 6,
      }}>
        {children}
      </button>
    )
  }

  function ToggleBtn({ id }: { id: string }) {
    return (
      <button onClick={() => toggleExpanded(id)} style={{
        padding: '2px 8px', fontSize: 10, fontFamily: 'monospace',
        background: 'transparent', border: '1px solid #ccc', borderRadius: 3,
        cursor: 'pointer', color: '#666', marginLeft: 6,
      }}>
        {expanded[id] ? '▲ hide params' : '▼ show params'}
      </button>
    )
  }

  function StepCard({ id, title, role, desc, children, params }: {
    id: string; title: string; role: string; desc: string;
    children: React.ReactNode;
    params: React.ReactNode;
  }) {
    const s = steps[id]
    return (
      <div style={{ borderLeft: `4px solid ${statusColor(s.status)}`, padding: '12px 16px', marginBottom: 10, background: '#fafafa', borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{title}</strong>
            <span style={{ fontSize: 10, color: '#888', marginLeft: 8, fontFamily: 'monospace' }}>[{role}]</span>
            <ToggleBtn id={id} />
          </div>
          <span style={{ fontSize: 11, fontFamily: 'monospace', background: statusColor(s.status), color: '#fff', padding: '2px 8px', borderRadius: 3, whiteSpace: 'nowrap' }}>
            {statusLabel(s.status)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#666', margin: '4px 0 8px' }}>{desc}</div>

        {/* Collapsible parameter panel */}
        {expanded[id] && (
          <div style={{ background: '#f0f4ff', border: '1px solid #c8d8ff', borderRadius: 4, padding: '10px 12px', marginBottom: 10 }}>
            {params}
          </div>
        )}

        {/* Status line */}
        {s.txHash && (
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#468', marginBottom: 4 }}>
            tx: <a href={`${net.explorerBase}/tx/${s.txHash}`} target="_blank" rel="noreferrer" style={{ color: '#36c' }}>{shortHex(s.txHash)}</a>
            {s.detail && <span style={{ color: '#888', marginLeft: 8 }}>{s.detail}</span>}
          </div>
        )}
        {s.status !== 'pending' && !s.txHash && s.detail && (
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#468', marginBottom: 4 }}>{s.detail}</div>
        )}
        {s.error && <div style={{ fontSize: 11, color: '#e44', fontFamily: 'monospace', marginTop: 4 }}>⚠ {s.error}</div>}

        <div style={{ marginTop: 6 }}>{children}</div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'monospace', padding: 32, maxWidth: 1050, margin: 'auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 2 }}>ZTIZEN — Full Pipeline Observation</h1>
      <p style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        Biometric Scan → BioHash → Key Distribution → auth_commit[128] → On-chain Enrollment → ZK Proof → On-chain Verification → Oracle Rotation
      </p>

      {/* ── Network selector ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#555' }}>Network:</span>
        {(Object.keys(NETWORKS) as NetworkId[]).map(id => (
          <button
            key={id}
            onClick={() => {
              setNetworkId(id)
              setContractState({})
              setLogs(prev => [...prev, `[network] switched to ${NETWORKS[id].label}`])
            }}
            style={{
              padding: '5px 14px', fontFamily: 'monospace', fontSize: 12,
              background: networkId === id ? '#1a1a2e' : '#eee',
              color: networkId === id ? '#fff' : '#333',
              border: `2px solid ${networkId === id ? '#3366cc' : '#ccc'}`,
              borderRadius: 4, cursor: 'pointer', fontWeight: networkId === id ? 'bold' : 'normal',
            }}
          >
            {NETWORKS[id].label}
          </button>
        ))}
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
          chainId: {net.chain.id}
        </span>
      </div>

      {/* ── Contract addresses for selected network ── */}
      <div style={{ fontSize: 11, color: '#555', marginBottom: 16, background: '#f4f8ff', border: '1px solid #c8d8ff', borderRadius: 4, padding: '8px 12px' }}>
        <span style={{ color: '#666' }}>ZTIZENCircom: </span>
        <a href={`${net.explorerBase}/address/${net.ztizenAddress}`} target="_blank" rel="noreferrer" style={{ color: '#36c' }}>{net.ztizenAddress}</a>
        <span style={{ color: '#aaa', margin: '0 8px' }}>·</span>
        <span style={{ color: '#666' }}>CircomVerifier: </span>
        <a href={`${net.explorerBase}/address/${net.verifierAddress}`} target="_blank" rel="noreferrer" style={{ color: '#36c' }}>{net.verifierAddress}</a>
        <span style={{ color: '#aaa', margin: '0 8px' }}>·</span>
        <a href={`${net.explorerBase}`} target="_blank" rel="noreferrer" style={{ color: '#888', fontSize: 10 }}>Blockscout ↗</a>
      </div>

      {/* ── Owner key ── */}
      <div style={{ background: '#fff8e1', border: '1px solid #f0c040', borderRadius: 4, padding: 14, marginBottom: 20 }}>
        <strong style={{ fontSize: 12 }}>Deployer / Oracle Private Key</strong>
        <p style={{ fontSize: 11, color: '#888', margin: '4px 0 8px' }}>
          The contract owner key signs all oracle + admin txs. Held in React state only — never stored or transmitted.
        </p>
        <input
          type="password"
          placeholder="0x… (64 hex chars, deployer key for selected network)"
          value={privateKey}
          onChange={e => handleKeyInput(e.target.value)}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', border: `1px solid ${keyError ? '#e44' : '#ccc'}`, borderRadius: 3, boxSizing: 'border-box' }}
        />
        {keyError && <div style={{ fontSize: 11, color: '#e44', marginTop: 4 }}>{keyError}</div>}
        {ownerAddress && <div style={{ fontSize: 11, color: '#2a2', marginTop: 4 }}>✓ address: {ownerAddress}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
        <div>

          {/* ─── KEY DISTRIBUTION ─────────────────────────────────────────── */}
          <h2 style={{ fontSize: 13, marginBottom: 8, borderBottom: '2px solid #3366cc', paddingBottom: 4, color: '#3366cc' }}>KEY DISTRIBUTION</h2>
          <div style={{ background: '#f0f4ff', border: '1px solid #c8d8ff', borderRadius: 4, padding: 14, marginBottom: 16, fontSize: 11 }}>
            <div style={{ marginBottom: 6, color: '#555', fontStyle: 'italic' }}>
              Three independent keys are combined with Poseidon8 to bind each auth_commit to a specific (product × service × user) triple.
              No single party holds all three keys.
            </div>
            <ParamRow label="PRODUCT_KEY (service side)" value={PRODUCT_KEY} highlight="blue" />
            <ParamRow label="  → field element" value={stringToFieldElement(PRODUCT_KEY).toString().slice(0, 32) + '…'} />
            <ParamRow label="ZTIZEN_KEY (platform side)" value={ZTIZEN_KEY} highlight="blue" />
            <ParamRow label="  → field element" value={stringToFieldElement(ZTIZEN_KEY).toString().slice(0, 32) + '…'} />
            <ParamRow label="USER_KEY (user-bound)" value={USER_KEY} highlight="blue" />
            <ParamRow label="  → field element" value={stringToFieldElement(USER_KEY).toString().slice(0, 32) + '…'} />
            <ParamRow label="credentialId" value={CREDENTIAL_ID} />
            <ParamRow label="serviceId" value={SERVICE_ID} />
            <ParamRow label="productTxId" value={PRODUCT_TX_ID} />
            <ParamRow label="product_usage_hash" value={PRODUCT_USAGE_HASH_STR.slice(0, 32) + '…'} />
            <ParamRow label="  (input string)" value="demo:demo:demo" mono={false} />
          </div>

          {/* ─── BIOMETRIC SCAN ───────────────────────────────────────────── */}
          <h2 style={{ fontSize: 13, marginBottom: 8, borderBottom: '2px solid #aa6600', paddingBottom: 4, color: '#aa6600' }}>BIOMETRIC INPUT</h2>
          <div style={{ borderLeft: '4px solid #aa6600', padding: '12px 16px', marginBottom: 10, background: '#fafafa', borderRadius: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Face Scan → 128-bit BioHash</strong>
              <span style={{ fontSize: 11, fontFamily: 'monospace', background: bioScanned ? '#2a2' : '#888', color: '#fff', padding: '2px 8px', borderRadius: 3 }}>
                {bioScanned ? 'SCANNED' : 'PENDING'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#666', margin: '4px 0 8px' }}>
              Production: face embedding → BioHash quantization → 128 binary bits.
              Demo: simulated random biohash (same math, realistic distribution).
            </div>
            <Btn onClick={runBioScan} color="#aa6600">Simulate Face Scan</Btn>
            {bioScanned && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>128-bit biohash (binary):</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#111', color: '#4af', padding: '8px', borderRadius: 3, lineHeight: 1.6, wordBreak: 'break-all' }}>
                  {Array.from({ length: 8 }, (_, row) =>
                    bioTemplate.slice(row * 16, row * 16 + 16).join(' ')
                  ).join('\n')}
                </div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                  bits set: {bioTemplate.filter(b => b === 1).length} / 128
                  &nbsp;·&nbsp;Hamming weight: {(bioTemplate.filter(b => b === 1).length / 1.28).toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          {/* ─── ENROLLMENT PHASE ─────────────────────────────────────────── */}
          <h2 style={{ fontSize: 13, margin: '16px 0 8px', borderBottom: '2px solid #228822', paddingBottom: 4, color: '#228822' }}>ENROLLMENT PHASE</h2>

          <StepCard
            id="compute"
            title="Step 1 — BioHash → auth_commit[128]"
            role="off-chain"
            desc="Runs Poseidon8(bio_bit_i, i, product_key, ztizen_key, user_key, version, nonce_0, usage_hash) × 128 → auth_commit[128]. Then keccak256(abi.encode(auth_commit)) → commitHash stored on-chain."
            params={
              <div>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 6, fontStyle: 'italic' }}>Poseidon8 inputs (same 7 scalars, only bio_bit_i varies per slot):</div>
                <ParamRow label="bio_template[0..7]" value={bioTemplate.slice(0, 8).join(', ')} />
                <ParamRow label="product_key (field)" value={stringToFieldElement(PRODUCT_KEY).toString().slice(0, 36) + '…'} />
                <ParamRow label="ztizen_key (field)" value={stringToFieldElement(ZTIZEN_KEY).toString().slice(0, 36) + '…'} />
                <ParamRow label="user_key (field)" value={stringToFieldElement(USER_KEY).toString().slice(0, 36) + '…'} />
                <ParamRow label="version" value="1" />
                <ParamRow label="nonce_0" value={INITIAL_NONCE.toString()} highlight="orange" />
                <ParamRow label="product_usage_hash" value={PRODUCT_USAGE_HASH_STR.slice(0, 36) + '…'} />
                {authCommit && <>
                  <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>Outputs:</div>
                  <ParamRow label="auth_commit[0]" value={authCommit[0].toString().slice(0, 36) + '…'} highlight="green" />
                  <ParamRow label="auth_commit[127]" value={authCommit[127].toString().slice(0, 36) + '…'} highlight="green" />
                  <ParamRow label="commitHash (keccak)" value={commitHash ?? '—'} highlight="green" />
                </>}
              </div>
            }
          >
            <Btn onClick={runCompute} disabled={!bioScanned || steps.compute.status === 'running'}>Compute (no tx)</Btn>
            {!bioScanned && <span style={{ fontSize: 10, color: '#888', marginLeft: 6 }}>run Face Scan first</span>}
          </StepCard>

          <StepCard
            id="whitelist"
            title="Step 2 — addWhitelistedUser"
            role="oracle tx"
            desc="Oracle whitelists the user address on-chain. ZTIZENCircom requires whitelist membership before registerCredential."
            params={
              <div>
                <ParamRow label="contract" value={net.ztizenAddress} />
                <ParamRow label="function" value="addWhitelistedUser(address)" mono={false} />
                <ParamRow label="userAddress" value={ownerAddress || '(paste key above)'} highlight="blue" />
                <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>On-chain effect:</div>
                <ParamRow label="whitelistedUsers[addr]" value="→ true" highlight="green" />
              </div>
            }
          >
            <Btn onClick={runWhitelist} disabled={!hasKey || steps.whitelist.status === 'running'}>Send Tx</Btn>
          </StepCard>

          <StepCard
            id="register"
            title="Step 3 — registerCredential"
            role="oracle tx"
            desc="Oracle registers the credential with the enrollment commitHash on-chain. This anchors the user's biometric identity to a keccak256 of their auth_commit[128]."
            params={
              <div>
                <ParamRow label="contract" value={net.ztizenAddress} />
                <ParamRow label="function" value="registerCredential(bytes32,address,uint256,bytes32)" mono={false} />
                <ParamRow label="credentialId" value={CREDENTIAL_ID} />
                <ParamRow label="  (source string)" value="'ztizen-demo-credential'" mono={false} />
                <ParamRow label="userAddress" value={ownerAddress || '—'} highlight="blue" />
                <ParamRow label="version" value="1" />
                <ParamRow label="commitmentHash" value={commitHash ?? '(compute Step 1 first)'} highlight="orange" />
                <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>On-chain effect:</div>
                <ParamRow label="_credentials[credId]" value="→ CredentialMeta{owner, version, isActive, registeredAt}" />
                <ParamRow label="_credentialCommitmentHash[credId]" value="→ commitHash" highlight="green" />
              </div>
            }
          >
            <Btn onClick={runRegister} disabled={!hasKey || !commitHash || steps.register.status === 'running'}>Send Tx</Btn>
            {!commitHash && <span style={{ fontSize: 10, color: '#888', marginLeft: 6 }}>compute Step 1 first</span>}
          </StepCard>

          <StepCard
            id="init"
            title="Step 4 — initializeCredentialForService"
            role="oracle tx"
            desc="Oracle anchors nonce_0 = 1 on-chain for (credentialId, serviceId). This is the replay-protection seed — verifyProof will only accept calls with the current on-chain nonce."
            params={
              <div>
                <ParamRow label="contract" value={net.ztizenAddress} />
                <ParamRow label="function" value="initializeCredentialForService(bytes32,bytes32,uint256)" mono={false} />
                <ParamRow label="credentialId" value={CREDENTIAL_ID} />
                <ParamRow label="serviceId" value={SERVICE_ID} />
                <ParamRow label="  (source string)" value="'ztizen-demo-service'" mono={false} />
                <ParamRow label="initialNonce" value={INITIAL_NONCE.toString()} highlight="orange" />
                <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>On-chain effect:</div>
                <ParamRow label="credentialServiceNonces[credId][svcId]" value="→ 1" highlight="green" />
              </div>
            }
          >
            <Btn onClick={runInit} disabled={!hasKey || steps.init.status === 'running'}>Send Tx</Btn>
          </StepCard>

          <StepCard
            id="enable"
            title="Step 5 — setZKVerificationEnabled(true)"
            role="admin tx"
            desc="Admin enables the ZK verification gate. verifyProof reverts with 'ZK verification not enabled' until this flag is set."
            params={
              <div>
                <ParamRow label="contract" value={net.ztizenAddress} />
                <ParamRow label="function" value="setZKVerificationEnabled(bool)" mono={false} />
                <ParamRow label="enabled" value="true" highlight="green" />
                <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>On-chain effect:</div>
                <ParamRow label="zkVerificationEnabled" value="→ true" highlight="green" />
              </div>
            }
          >
            <Btn onClick={runEnable} disabled={!hasKey || steps.enable.status === 'running'}>Send Tx</Btn>
          </StepCard>

          {/* ─── AUTHENTICATION PHASE ─────────────────────────────────────── */}
          <h2 style={{ fontSize: 13, margin: '16px 0 8px', borderBottom: '2px solid #884488', paddingBottom: 4, color: '#884488' }}>AUTHENTICATION PHASE</h2>

          <StepCard
            id="proof"
            title="Step 6 — Generate Groth16 Proof"
            role="user / off-chain"
            desc="Runs snarkjs.groth16.fullProve with the enrolled bio_template + same keys + same nonce_0. Circuit verifies ≥102/128 Poseidon slots match auth_commit_stored. Produces pA, pB, pC + pubSignals[129]."
            params={
              <div>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 6, fontStyle: 'italic' }}>Circuit private inputs:</div>
                <ParamRow label="bio_template[0..7]" value={bioTemplate.slice(0, 8).join(', ')} />
                <ParamRow label="product_key" value={stringToFieldElement(PRODUCT_KEY).toString().slice(0, 36) + '…'} />
                <ParamRow label="ztizen_key" value={stringToFieldElement(ZTIZEN_KEY).toString().slice(0, 36) + '…'} />
                <ParamRow label="user_key" value={stringToFieldElement(USER_KEY).toString().slice(0, 36) + '…'} />
                <ParamRow label="version" value="1" />
                <ParamRow label="nonce" value={INITIAL_NONCE.toString()} highlight="orange" />
                <ParamRow label="product_usage_hash" value={PRODUCT_USAGE_HASH_STR.slice(0, 36) + '…'} />
                <ParamRow label="auth_commit_stored[128]" value="[computed in Step 1, passed as public input]" mono={false} />
                {proofData && <>
                  <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>Public outputs (pubSignals[0..128]):</div>
                  <ParamRow label="pubSignals[0] match_count" value={proofData.pubSignals[0].toString()} highlight="green" />
                  <ParamRow label="pubSignals[1] = commit[0]" value={proofData.pubSignals[1].toString().slice(0, 36) + '…'} />
                  <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>Proof points (BN254 G1/G2, pB swapped for Solidity):</div>
                  <ParamRow label="pA[0]" value={proofData.pA[0].toString().slice(0, 36) + '…'} />
                  <ParamRow label="pA[1]" value={proofData.pA[1].toString().slice(0, 36) + '…'} />
                  <ParamRow label="pB[0][0]" value={proofData.pB[0][0].toString().slice(0, 36) + '…'} />
                  <ParamRow label="pB[0][1]" value={proofData.pB[0][1].toString().slice(0, 36) + '…'} />
                  <ParamRow label="pC[0]" value={proofData.pC[0].toString().slice(0, 36) + '…'} />
                  <ParamRow label="pC[1]" value={proofData.pC[1].toString().slice(0, 36) + '…'} />
                </>}
              </div>
            }
          >
            <Btn onClick={runProof} disabled={!authCommit || steps.proof.status === 'running'} color="#884488">Generate Proof</Btn>
            {!authCommit && <span style={{ fontSize: 10, color: '#888', marginLeft: 6 }}>compute Step 1 first</span>}
          </StepCard>

          <StepCard
            id="verify"
            title="Step 7 — verifyProof (on-chain)"
            role="user tx"
            desc="Submits pA/pB/pC + pubSignals to ZTIZENCircom. Contract checks: ① nonce guard ② commitHash integrity ③ nullifier (replay block) ④ Groth16 pairing ⑤ rolls nonce via keccak(nonce_N ‖ block context)."
            params={
              <div>
                <ParamRow label="contract" value={net.ztizenAddress} />
                <ParamRow label="function" value="verifyProof(bytes32,bytes32,uint256,bytes32,uint256[2],uint256[2][2],uint256[2],uint256[129])" mono={false} />
                <ParamRow label="credentialId" value={CREDENTIAL_ID} />
                <ParamRow label="serviceId" value={SERVICE_ID} />
                <ParamRow label="currentNonce" value={contractState.nonce ?? INITIAL_NONCE.toString()} highlight="orange" />
                <ParamRow label="productTxId" value={PRODUCT_TX_ID} />
                {proofData && <>
                  <ParamRow label="pA" value={`[${proofData.pA[0].toString().slice(0,16)}…, ${proofData.pA[1].toString().slice(0,16)}…]`} />
                  <ParamRow label="pubSignals[0] match_count" value={proofData.pubSignals[0].toString()} highlight="green" />
                </>}
                <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>Contract validation sequence:</div>
                <ParamRow label="① nonce guard" value="currentNonce == storedNonce  (~800 gas)" />
                <ParamRow label="② commitHash check" value="keccak256(pubSignals[1..128]) == _credentialCommitmentHash  (~5k gas)" />
                <ParamRow label="③ nullifier check" value="!_usedProofNullifiers[keccak(pA‖pB‖pC‖pubSignals)]  (~800 gas)" />
                <ParamRow label="④ Groth16 pairing" value="CircomVerifier.verifyProof(pA,pB,pC,pubSignals)  (~1.16M gas)" />
                <ParamRow label="⑤ nonce roll" value="keccak256(nonce_N ‖ timestamp ‖ blockNum ‖ prevrandao)" />
                {newNonce !== null && <>
                  <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>ProofVerified event output:</div>
                  <ParamRow label="newNonce" value={newNonce.toString()} highlight="green" />
                  <ParamRow label="nullifier" value={nullifier ?? '—'} highlight="green" />
                  <ParamRow label="isProofUsed(nullifier)" value={contractState.isProofUsed ? 'true ← replay blocked ✓' : '—'} highlight={contractState.isProofUsed ? 'green' : undefined} />
                </>}
              </div>
            }
          >
            <Btn onClick={runVerify} disabled={!hasKey || !proofData || steps.verify.status === 'running'} color="#884488">Send Tx</Btn>
          </StepCard>

          <StepCard
            id="oracle"
            title="Step 8 — Oracle Post-Auth Rotation"
            role="oracle tx"
            desc="After ProofVerified event, oracle recomputes auth_commit[128] with newNonce, calls updateCommitmentHash. The on-chain commitHash now reflects the next session's commitment — previous pubSignals are invalidated."
            params={
              <div>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 6, fontStyle: 'italic' }}>Oracle recomputes auth_commit with rolled nonce:</div>
                <ParamRow label="same bio_template" value={bioTemplate.slice(0, 8).join(', ') + '…'} />
                <ParamRow label="same keys" value="product_key, ztizen_key, user_key (unchanged)" mono={false} />
                <ParamRow label="NEW nonce" value={newNonce !== null ? newNonce.toString() : '(from ProofVerified event)'} highlight="orange" />
                {newCommitHash && <>
                  <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>updateCommitmentHash call:</div>
                  <ParamRow label="contract" value={net.ztizenAddress} />
                  <ParamRow label="function" value="updateCommitmentHash(bytes32,bytes32)" mono={false} />
                  <ParamRow label="credentialId" value={CREDENTIAL_ID} />
                  <ParamRow label="newCommitmentHash" value={newCommitHash} highlight="green" />
                  <div style={{ borderTop: '1px solid #c8d8ff', marginTop: 6, paddingTop: 6, fontSize: 10, color: '#555' }}>Security guarantee:</div>
                  <ParamRow label="old pubSignals rejected" value="commitHash check will fail for any stale proof ✓" mono={false} highlight="green" />
                  <ParamRow label="old proof rejected" value="nullifier already in _usedProofNullifiers ✓" mono={false} highlight="green" />
                </>}
              </div>
            }
          >
            <Btn onClick={runOracleUpdate} disabled={!hasKey || newNonce === null || steps.oracle.status === 'running'} color="#226622">Run Oracle Update</Btn>
            {newNonce === null && <span style={{ fontSize: 10, color: '#888', marginLeft: 6 }}>complete Step 7 first</span>}
          </StepCard>

        </div>

        {/* ─── Right column: contract state + pipeline diagram ─────────────── */}
        <div>
          <h2 style={{ fontSize: 13, marginBottom: 8, borderBottom: '1px solid #ddd', paddingBottom: 4 }}>Live Contract State</h2>
          <div style={{ background: '#f4f4f4', borderRadius: 4, padding: 12, fontSize: 11, fontFamily: 'monospace', lineHeight: 2 }}>
            {([
              ['isUserWhitelisted', contractState.isWhitelisted],
              ['credentialExists', contractState.credentialExists],
              ['isInitialized', contractState.isInitialized],
              ['zkVerificationEnabled', contractState.zkEnabled],
              ['nonce', contractState.nonce],
              ['commitmentHash', contractState.commitmentHash ? shortHex(contractState.commitmentHash, 8, 4) : undefined],
              ['isProofUsed', contractState.isProofUsed],
            ] as [string, boolean | string | undefined][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e8e8e8', paddingBottom: 1 }}>
                <span style={{ color: '#555', fontSize: 10 }}>{k}</span>
                <span style={{ color: v === true ? '#2a2' : v === false ? '#e44' : '#468', fontWeight: 'bold', fontSize: 10 }}>
                  {v === undefined ? '—' : v === true ? 'true' : v === false ? 'false' : String(v)}
                </span>
              </div>
            ))}
          </div>
          {hasKey && (
            <button
              onClick={async () => { const pc = buildPublicClient(net); await readState(pc, ownerAddress as Hex) }}
              style={{ marginTop: 6, width: '100%', fontSize: 10, padding: '4px 0', fontFamily: 'monospace', background: '#eef', border: '1px solid #99c', borderRadius: 3, cursor: 'pointer' }}
            >↻ Refresh</button>
          )}

          <h2 style={{ fontSize: 13, margin: '20px 0 8px', borderBottom: '1px solid #ddd', paddingBottom: 4 }}>Security Model</h2>
          <div style={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.85, color: '#555', background: '#f4f4f4', padding: 10, borderRadius: 4 }}>
            <div style={{ color: '#228', fontWeight: 'bold' }}>verifyProof guard order:</div>
            <div style={{ paddingLeft: 8 }}>① nonce guard  (~800 gas)</div>
            <div style={{ paddingLeft: 8 }}>② commitHash   (~5k gas)</div>
            <div style={{ paddingLeft: 8 }}>③ nullifier    (~800 gas)</div>
            <div style={{ paddingLeft: 8 }}>④ Groth16      (~1.16M gas)</div>
            <div style={{ paddingLeft: 8 }}>⑤ roll nonce</div>
            <div style={{ borderTop: '1px solid #ddd', marginTop: 6, paddingTop: 6, color: '#228', fontWeight: 'bold' }}>Replay attacks blocked by:</div>
            <div style={{ paddingLeft: 8 }}>• commitHash  → stale pubSignals</div>
            <div style={{ paddingLeft: 8 }}>• nullifier   → exact proof reuse</div>
            <div style={{ paddingLeft: 8 }}>• nonce roll  → pre-computed proof</div>
            <div style={{ borderTop: '1px solid #ddd', marginTop: 6, paddingTop: 6, color: '#228', fontWeight: 'bold' }}>Key separation:</div>
            <div style={{ paddingLeft: 8 }}>• product_key  — service owner</div>
            <div style={{ paddingLeft: 8 }}>• ztizen_key   — platform</div>
            <div style={{ paddingLeft: 8 }}>• user_key     — user-bound</div>
          </div>

          <h2 style={{ fontSize: 13, margin: '20px 0 8px', borderBottom: '1px solid #ddd', paddingBottom: 4 }}>Poseidon8 Formula</h2>
          <div style={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.85, background: '#111', color: '#4af', padding: 10, borderRadius: 4 }}>
            <div>for i in 0..127:</div>
            <div style={{ paddingLeft: 8 }}>auth_commit[i] =</div>
            <div style={{ paddingLeft: 16 }}>Poseidon8(</div>
            <div style={{ paddingLeft: 24 }}>bio_bit[i],</div>
            <div style={{ paddingLeft: 24 }}>i,</div>
            <div style={{ paddingLeft: 24 }}>product_key,</div>
            <div style={{ paddingLeft: 24 }}>ztizen_key,</div>
            <div style={{ paddingLeft: 24 }}>user_key,</div>
            <div style={{ paddingLeft: 24 }}>version,</div>
            <div style={{ paddingLeft: 24 }}>nonce_N,</div>
            <div style={{ paddingLeft: 24 }}>usage_hash</div>
            <div style={{ paddingLeft: 16 }}>)</div>
            <div style={{ marginTop: 6 }}>commitHash =</div>
            <div style={{ paddingLeft: 8 }}>keccak256(abi.encode(</div>
            <div style={{ paddingLeft: 16 }}>auth_commit[0..127]</div>
            <div style={{ paddingLeft: 8 }}>))</div>
          </div>
        </div>
      </div>

      {/* ─── Credential Inspector + Monitor + Rotate ───────────────────── */}
      <div style={{ marginTop: 28, borderTop: '2px solid #3366cc', paddingTop: 20 }}>
        <h2 style={{ fontSize: 14, margin: '0 0 16px', color: '#3366cc' }}>Credential Inspector &amp; On-Chain Monitor</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>

          {/* ── Panel 1: Credential input ── */}
          <div style={{ background: '#f8f8ff', border: '1px solid #c8d8ff', borderRadius: 6, padding: 16 }}>
            <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 10, color: '#334' }}>Credential Lookup</div>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 8, fontStyle: 'italic' }}>
              Enter plain string (auto-keccak'd) or raw 0x[64hex] bytes32.
              Changes here do <strong>not</strong> affect the enrollment steps above.
            </div>
            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Credential string / bytes32</label>
            <input
              value={credentialStr}
              onChange={e => handleCredentialStr(e.target.value)}
              placeholder="e.g. ztizen-demo-credential"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: '5px 7px', border: '1px solid #c8d8ff', borderRadius: 3, boxSizing: 'border-box', marginBottom: 4 }}
            />
            <div style={{ fontSize: 10, color: '#468', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 10 }}>
              → {customCredId}
            </div>

            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Service string / bytes32</label>
            <input
              value={serviceStr}
              onChange={e => handleServiceStr(e.target.value)}
              placeholder="e.g. ztizen-demo-service"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: '5px 7px', border: '1px solid #c8d8ff', borderRadius: 3, boxSizing: 'border-box', marginBottom: 4 }}
            />
            <div style={{ fontSize: 10, color: '#468', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              → {customSvcId}
            </div>
          </div>

          {/* ── Panel 2: Live On-Chain Monitor ── */}
          <div style={{ background: '#f8fff8', border: '1px solid #b8ddb8', borderRadius: 6, padding: 16 }}>
            <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 10, color: '#264' }}>Live On-Chain Monitor</div>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 10, fontStyle: 'italic' }}>
              Polls getNonce + getCommitmentHash every 5s for the credential above.
            </div>
            <button
              onClick={toggleMonitor}
              style={{
                padding: '5px 14px', fontFamily: 'monospace', fontSize: 11,
                background: monitorActive ? '#884400' : '#228822', color: '#fff',
                border: 'none', borderRadius: 3, cursor: 'pointer', marginBottom: 12,
              }}
            >
              {monitorActive ? '⏹ Stop Monitor' : '▶ Start Monitor'}
            </button>

            {monitorError && (
              <div style={{ fontSize: 10, color: '#e44', fontFamily: 'monospace', marginBottom: 8, wordBreak: 'break-all' }}>
                ⚠ {monitorError.slice(0, 120)}
              </div>
            )}

            {monitorData ? (
              <div style={{ background: '#111', borderRadius: 4, padding: '10px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                <div style={{ color: '#888', marginBottom: 4, fontSize: 10 }}>last updated {monitorData.timestamp}</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#888' }}>nonce:       </span>
                  <span style={{ color: '#4af' }}>{monitorData.nonce}</span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>commitHash:  </span>
                  <span style={{ color: '#4af', wordBreak: 'break-all' }}>{monitorData.commitHash}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: '#aaa', fontStyle: 'italic' }}>
                {monitorActive ? 'Polling…' : 'Not started'}
              </div>
            )}
          </div>

          {/* ── Panel 3: Rotate CommitmentHash ── */}
          <div style={{ background: '#fff8f4', border: '1px solid #ddb8a0', borderRadius: 6, padding: 16 }}>
            <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 10, color: '#622' }}>Rotate CommitmentHash</div>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 10, fontStyle: 'italic' }}>
              Reads on-chain nonce, recomputes auth_commit[128] with that nonce, and calls updateCommitmentHash.
              Works independently of the step flow above.
            </div>

            <div style={{ fontSize: 11, marginBottom: 4 }}>
              Bio template: {bioScanned
                ? <span style={{ color: '#228' }}>{bioTemplate.filter(b => b === 1).length}/128 bits set</span>
                : <span style={{ color: '#e44' }}>not scanned — run Face Scan first</span>
              }
            </div>
            <div style={{ fontSize: 11, marginBottom: 8 }}>
              On-chain nonce: {monitorData
                ? <span style={{ color: '#228', fontFamily: 'monospace' }}>{monitorData.nonce}</span>
                : <span style={{ color: '#888' }}>start monitor to view</span>
              }
            </div>

            <Btn
              onClick={() => { setRotateStatus('idle'); setRotateDetail(''); runRotateCredential() }}
              disabled={!hasKey || !bioScanned || rotateStatus === 'running'}
              color="#cc4400"
            >
              Rotate CommitmentHash
            </Btn>

            {rotateStatus !== 'idle' && (
              <div style={{ marginTop: 10 }}>
                <span style={{
                  fontSize: 11, fontFamily: 'monospace',
                  background: { running: '#f90', done: '#2a2', error: '#e44', idle: '#888' }[rotateStatus],
                  color: '#fff', padding: '2px 8px', borderRadius: 3,
                }}>
                  {rotateStatus.toUpperCase()}
                </span>
                {rotateDetail && (
                  <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', marginTop: 6, wordBreak: 'break-all' }}>
                    {rotateDetail}
                  </div>
                )}
              </div>
            )}

            {!hasKey && <div style={{ fontSize: 10, color: '#e44', marginTop: 6 }}>paste owner key above first</div>}
            {!bioScanned && hasKey && <div style={{ fontSize: 10, color: '#e44', marginTop: 6 }}>run Face Scan first</div>}
          </div>

        </div>
      </div>

      {/* ─── Log ── */}
      <h2 style={{ fontSize: 13, margin: '24px 0 6px' }}>Execution Log</h2>
      <textarea
        ref={logRef}
        readOnly
        value={logs.join('\n')}
        style={{ width: '100%', height: 240, background: '#111', color: '#4af', fontFamily: 'monospace', fontSize: 11, padding: 12, border: 'none', borderRadius: 4, resize: 'vertical', boxSizing: 'border-box' }}
      />
    </div>
  )
}
