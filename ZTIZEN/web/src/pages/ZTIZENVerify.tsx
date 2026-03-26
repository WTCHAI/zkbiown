/**
 * ZTIZEN Verification Page - Staged Flow
 * Matching enrollment UI style
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearch, useParams } from '@tanstack/react-router';
import BiometricCapture from '../components/BiometricCapture';
import type { BiometricVector } from '../lib/biohashing-mediapipe';
import { CancelableBiometric } from '@/lib/CancelableBiometric';
import { createFullAuthCommit, generateNonce, stringToFieldElement, bytesToFieldElement } from '../lib/poseidon';
import { useWalletSignature } from '../hooks/useWalletSignature';
import { useZKProof } from '../hooks/useZKProof';
import { PINInput } from '@/components/PINInput';
import { ZTIZEN_CLIENT, PRODUCT_CLIENT } from '@/lib/api';
import { useSimulationStore, type VerificationStep } from '@/stores/useSimulationStore';
import { useDemoNavigationStore } from '@/stores/useDemoNavigationStore';
import { useMetricsStore, METRIC_OPERATIONS } from '@/stores/useMetricsStore';
import { FlowBreadcrumb, StepIndicator } from '@/components/FlowBreadcrumb';

// Hardcoded algorithm - Chellappa Sparse Gaussian (IEEE TPAMI 2011)
// This ensures enrollment and verification always use the same algorithm
const HARDCODED_ALGORITHM = 'gaussian-sparse' as const;

type Stage = 'pin' | 'password' | 'signing' | 'scan' | 'result'; // Removed 'algorithm' - hardcoded to gaussian-sparse

// Verification export with all 3 processing stages
interface VerificationExport {
  verified: boolean;
  matchRate: number;
  matchCount: number;
  totalBits: number;
  threshold: number;
  credentialId: string;
  timestamp: string;
  algorithm: string;

  // Stage 1: Raw biometric (verification scan)
  rawBiometric: {
    source?: string;
    dimensions: number;
    data: number[];
    statistics?: {
      min: number;
      max: number;
      mean: number;
      stdDev: number;
    };
  };

  // Stage 2: After CancelableBiometric transformation
  cancelableBiometricTemplate: {
    dimensions: number;
    data: number[];
    algorithm: string;
    binarizationMethod?: string;
    // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
    // No enrollment stats stored - each session computes its own mean/stdDev
  };

  // PROJECTIONS: raw_biometric × rand_matrix (before binarization)
  projections?: {
    count: number;
    values: number[];
    matrixDimensions: string;
    sparse: boolean;
    sparsity: string;
  };

  // Binarization (executed method only)
  binarization?: {
    method?: string;
    template?: number[];
    histogram?: number[];
  };

  // Stage 3: After Poseidon hashing (verification commit)
  poseidonVerifyCommit: {
    count: number;
    hashes: string[];
    nonce: string;
    version: number;
  };

  // Comparison results
  comparison: {
    storedCommit: string[];
    verifyCommit: string[];
    bitMatches: boolean[];
  };

  // ZK Proof (if available)
  zkProof?: {
    verified: boolean;
    matchCount: number;
    proofSize: number;
    proof: string;
    publicInputs: string[];
  };

  // Poseidon input parameters for debugging hash mismatches
  poseidonInputs: {
    productKey: {
      raw: string;
      fieldElement: string;
    };
    ztizenKey: {
      raw: string;
      fieldElement: string;
    };
    userKey: {
      hexBytes: string;
      fieldElement: string;
    };
    version: number;
    nonce: string;
    productUsageDetails: {
      product_id: string;
      service_id: string;
      service_type: string;
      hash: string;
    };
  };
}

interface CredentialInfo {
  credential_id: string;
  product_id: string;
  product_name: string;
  service_name: string;
  status: string;
}

// Get icon based on service name
const getServiceIcon = (serviceName: string) => {
  const name = serviceName.toLowerCase();
  if (name.includes('login') || name.includes('auth')) return '🚪';
  if (name.includes('balance') || name.includes('account')) return '💰';
  if (name.includes('transfer') || name.includes('send')) return '💸';
  if (name.includes('payment') || name.includes('pay')) return '💳';
  if (name.includes('profile') || name.includes('user')) return '👤';
  return '👆'; // Default: biometric fingerprint
};

export function ZTIZENVerify() {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as any;
  const routeParams = useParams({ strict: false }) as any;
  const { signPassword, isLoading: isSigningPassword } = useWalletSignature();
  const { generateProof, verifyProof, isGenerating: isGeneratingProof } = useZKProof();

  // Simulation flow tracking
  const { setFlowType, setCurrentStep: setSimulationStep, markStepComplete } = useSimulationStore();

  // Demo navigation tracking
  const { completeStep: completeDemoStep, setLastCredential } = useDemoNavigationStore();

  const credentialId = routeParams?.credentialId || routeParams?.['*'] || searchParams?.credential_id || '';
  const serviceName = searchParams?.service_name || '';
  const returnUrl = searchParams?.return_url || '/ztizen/me';

  const [credentialInfo, setCredentialInfo] = useState<CredentialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('pin'); // Start at PIN - algorithm is hardcoded

  // Use hardcoded algorithm - no more selection or detection needed
  const algorithm = HARDCODED_ALGORITHM;
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [userKey, setUserKey] = useState<Uint8Array | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [verificationExportData, setVerificationExportData] = useState<VerificationExport | null>(null);
  const [rawBiometricData, setRawBiometricData] = useState<Float32Array | null>(null); // Store raw biometric for download
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isRollingNonce, setIsRollingNonce] = useState(false);
  const [nonceRolled, setNonceRolled] = useState(false);

  // Loading modal state - shows during biometric scan AND ZK proof generation
  const [loadingModalVisible, setLoadingModalVisible] = useState(false);
  const [loadingModalStage, setLoadingModalStage] = useState<'biometric' | 'zkproof'>('biometric');

  // Download results as JSON
  const downloadResults = (data: object, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Store verification context for ZK proof generation
  const [verificationContext, setVerificationContext] = useState<{
    verifyTemplate: number[];
    productKey: string;
    ztizenKey: string;
    storedNonce: string;
    version: number;
    product_id: string;
    service_name: string;
    service_type: string;
    storedAuthCommit: string[];
  } | null>(null);

  // Initialize simulation flow on mount
  useEffect(() => {
    setFlowType('verification');
    setSimulationStep('pin'); // This page starts at PIN
    if (credentialId) {
      setLastCredential(credentialId);
    }
  }, [setFlowType, setSimulationStep, setLastCredential, credentialId]);

  // Fetch credential info (algorithm is hardcoded - no detection needed)
  useEffect(() => {
    const fetchCredential = async () => {
      try {
        const data = await ZTIZEN_CLIENT.getCredential(credentialId);
        if (data.success) {
          setCredentialInfo(data.credential);
          console.log(`🔧 Using hardcoded algorithm: ${algorithm} (Chellappa/IEEE TPAMI 2011)`);
          // Stage is already 'pin' - no need to change
        } else {
          setError('Credential not found');
        }
      } catch (err) {
        setError('Failed to load credential');
      } finally {
        setLoading(false);
      }
    };
    if (credentialId) fetchCredential();
  }, [credentialId, algorithm]);

  const handlePinContinue = async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    setError('');
    setStatus('Verifying PIN...');

    try {
      // Hash PIN before sending to server
      const hashedPin = await hashPin(pin);
      
      const data = await ZTIZEN_CLIENT.verifyPinOnly({
        credential_id: credentialId,
        pin_hash: hashedPin,
      });

      if (!data.success) throw new Error(data.message || 'Invalid PIN');

      setStatus('');
      // Track: PIN complete, moving to password
      markStepComplete('pin');
      setSimulationStep('password');
      setStage('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PIN');
    }
  };

  const handlePasswordContinue = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    // Track: Password complete, moving to signature
    markStepComplete('password');
    setSimulationStep('signature');
    setStage('signing');
  };

  const handleWalletSign = async () => {
    setError('');
    setStatus('Requesting signature...');

    try {
      const result = await signPassword(password, pin);
      setUserKey(result.userKey);
      setAddress(result.address);
      setStatus('');
      // Track: Signature complete, moving to biometric
      markStepComplete('signature');
      setSimulationStep('biometric');
      setStage('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signature failed');
      setStatus('');
    }
  };

  const handleBiometricVerify = async (biometricData: Float32Array) => {
    // Start metrics session for verification
    const sessionId = useMetricsStore.getState().startSession('verification', credentialId);
    console.log(`📊 [Metrics] Started verification session: ${sessionId}`);

    // Store raw biometric data immediately for download (even if verification fails)
    setRawBiometricData(biometricData);
    console.log('📥 Raw biometric data captured:', biometricData.length, 'dimensions');

    if (!userKey) {
      setError('User key not available');
      useMetricsStore.getState().endSession();
      return;
    }

    // Show loading modal for biometric processing
    setLoadingModalVisible(true);
    setLoadingModalStage('biometric');
    setStatus('Processing biometric...');

    try {
      const credData = await ZTIZEN_CLIENT.getCredential(credentialId);
      console.log("credential data:", credData);
      if (!credData.success) throw new Error('Credential not found');

      const credential = credData.credential;

      // Extract auth_commit from JSONB column
      // Backend stores: auth_commit = [...] (JSONB array of 256 Poseidon hashes)
      let storedAuthCommit;

      if (Array.isArray(credential.auth_commit)) {
        // Current format: JSONB array directly
        storedAuthCommit = credential.auth_commit;
      } else if (credential.auth_commit && typeof credential.auth_commit === 'object') {
        // Legacy format: JSONB object with nested arrays {gaussian: [...], quantization: [...]}
        storedAuthCommit = credential.auth_commit.gaussian || credential.auth_commit.quantization;
      }

      // Get enrolled binarization method from metadata (default to 'iom' for backward compatibility)
      const enrolledBinarizationMethod = credential.metadata?.algorithmConfig?.binarizationMethod || 'iom';

      // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
      // Each session computes its own mean/stdDev - no stats need to be loaded
      if (enrolledBinarizationMethod === 'sign-mag-rank' || enrolledBinarizationMethod === 'sign-mag-rank-16') {
        console.log('✅ SELF-NORMALIZING: Each session computes its own mean/stdDev');
      }

      console.log('📦 Credential data from ZTIZEN:', {
        credential_id: credential.credential_id,
        status: credential.status,
        has_auth_commit: !!credential.auth_commit,
        auth_commit_type: typeof credential.auth_commit,
        auth_commit_is_array: Array.isArray(credential.auth_commit),
        auth_commit_length: Array.isArray(storedAuthCommit) ? storedAuthCommit.length : 'not an array',
        nonce: credential.nonce,
        version: credential.version,
        algorithm: credential.metadata?.algorithmConfig?.selectedAlgorithm || 'unknown',
        binarizationMethod: enrolledBinarizationMethod,
      });

      if (!storedAuthCommit || !Array.isArray(storedAuthCommit)) {
        console.error('❌ Invalid auth_commit format:', {
          auth_commit: credential.auth_commit,
          type: typeof credential.auth_commit,
          isArray: Array.isArray(credential.auth_commit),
        });
        throw new Error(`No valid auth_commit found. Expected JSONB array of Poseidon hashes. Got: ${typeof credential.auth_commit}`);
      }

      const { nonce: storedNonce, version, product_id, service_name, service_type } = credential;

      const productKeyData = await PRODUCT_CLIENT.getCredentialKeys(credentialId);
      if (!productKeyData.success) throw new Error('Failed to get product key');
      const productKey = productKeyData.partial_key;

      const ztizenKeyData = await ZTIZEN_CLIENT.getEnrollment(credentialId);
      if (!ztizenKeyData.success) throw new Error('Failed to get ZTIZEN key');
      const ztizenKey = ztizenKeyData.credential.ztizen_partial_key;

      // Start template generation with loading status
      setStatus('Computing biometric template...');
      const faceDescriptor = biometricData; // Already Float32Array from BiometricCapture
      const cancelableBiometric = new CancelableBiometric({
        algorithm: algorithm, // Use selected algorithm
        inputDim: faceDescriptor.length, // Actual biometric dimension (128 from face-api.js)
        outputDim: 128, // Efficient ZK circuit dimension
        productKey,
        ztizenKey,
        userKey,
        version,
        params: {
          thresholdScale: 1.4, // ±0.70σ quantization (optimized for face-api.js 128D)
        },
      });

      // ═══════════════════════════════════════════════════════════════════
      // GENERATE TEMPLATE USING ENROLLED BINARIZATION METHOD
      // The method (iom, signmag3bit, or sign-mag-rank) is read from the credential metadata
      // For sign-mag-rank: uses stored enrollment stats for consistent mean-centered ranking
      // ═══════════════════════════════════════════════════════════════════

      // Use generateTemplateWithFullDebug with the enrolled binarization method
      // This ensures verification uses the same method as enrollment
      // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING (no stats passed)
      console.log(`🔧 Using enrolled binarization method: ${enrolledBinarizationMethod}`);
      const { template: templateResult, debug: debugData } = await cancelableBiometric.generateTemplateWithFullDebug(
        faceDescriptor,
        enrolledBinarizationMethod as 'iom' | 'signmag3bit' | 'sign-mag-rank' | 'sign-mag-rank-16',
        'verification',
        credentialId
      );

      // Also generate binary template for comparison/debug only
      const binaryTemplateResult = await cancelableBiometric.generateTemplateWithMethod(
        faceDescriptor,
        'binary'
      );

      // Use enrolled method's template for actual verification
      const verifyTemplate = templateResult.template;
      console.log(`📊 Generated ${enrolledBinarizationMethod} template: ${verifyTemplate.length} values`);

      // ═══════════════════════════════════════════════════════════════════
      // BINARIZATION COMPARISON LOGGING
      // ═══════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('╔═══════════════════════════════════════════════════════════════════════════════════════╗');
      console.log(`║              VERIFICATION - ${enrolledBinarizationMethod.toUpperCase()} BINARIZATION                                    ║`);
      console.log('╠═══════════════════════════════════════════════════════════════════════════════════════╣');

      const projections = templateResult.intermediate?.projections || [];
      const enrolledTemplate = templateResult.template;

      if (enrolledBinarizationMethod === 'iom') {
        console.log('║  IoM Template (First 16 groups):                                                        ║');
        console.log('├───────┬──────────────────────────────────────────────┬──────────────────────────────────┤');
        console.log('│ Group │ Projections (4 values per group)             │ Max Index                        │');
        console.log('├───────┼──────────────────────────────────────────────┼──────────────────────────────────┤');

        for (let g = 0; g < Math.min(16, enrolledTemplate.length); g++) {
          const groupStart = g * 4;
          const group = projections.slice(groupStart, groupStart + 4);
          const groupStr = group.map((p: number) => (p >= 0 ? '+' : '') + p.toFixed(3)).join(', ');
          const maxIdx = enrolledTemplate[g];
          console.log(`│  ${String(g).padStart(3, '0')}  │ [${groupStr.padEnd(40)}] │ max at index ${maxIdx}                    │`);
        }

        const iomIndexDist = [0, 0, 0, 0];
        enrolledTemplate.forEach((idx: number) => iomIndexDist[idx]++);
        console.log('├─────────────────────────────────────────────────────────────────────────────────────────┤');
        console.log(`│ IoM (primary):   ${enrolledTemplate.length} indices, distribution: [${iomIndexDist.join(', ')}] (idx 0,1,2,3)      │`);
      } else {
        console.log('║  SignMag3Bit Template (First 32 values):                                               ║');
        console.log('├───────┬────────────────┬──────────────────────────────────────────────────────────────┤');
        console.log('│ Index │ Value (0-7)    │ Decoded: [Sign][Magnitude]                                   │');
        console.log('├───────┼────────────────┼──────────────────────────────────────────────────────────────┤');

        for (let i = 0; i < Math.min(32, enrolledTemplate.length); i++) {
          const val = enrolledTemplate[i];
          const sign = (val >> 2) & 1;
          const mag = val & 0x03;
          const signStr = sign === 1 ? '+' : '-';
          console.log(`│  ${String(i).padStart(3, '0')}  │       ${val}        │ ${signStr}${mag} (sign=${sign}, magnitude=${mag})                              │`);
        }
        console.log('├─────────────────────────────────────────────────────────────────────────────────────────┤');
        console.log(`│ SignMag3Bit: ${enrolledTemplate.length} values (each 0-7)                                            │`);
      }

      // Statistics
      const binOnes = binaryTemplateResult.template.filter((v: number) => v === 1).length;
      const binZeros = binaryTemplateResult.template.filter((v: number) => v === 0).length;

      console.log(`│ BINARY (legacy): ${binOnes} ones, ${binZeros} zeros (${(binOnes/128*100).toFixed(1)}% positive)                          │`);
      console.log('╚═══════════════════════════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('📊 [VERIFICATION] Dimension debug:', {
        inputBiometric: faceDescriptor.length,  // 128D from face-api.js
        outputTemplate: verifyTemplate.length,
        binarizationMethod: enrolledBinarizationMethod,
        algorithm: algorithm,
        storedAuthCommitLength: storedAuthCommit.length,  // From DB
        storedNonce: storedNonce?.slice(0, 20) + '...',
        version,
      });

      // Template generated, now comparing
      setStatus('Comparing with stored template...');

      const productUsageDetails = {
        product_id,
        service_id: service_name,
        service_type: service_type || 'authentication',
      };

      const verifyCommit = createFullAuthCommit(
        verifyTemplate,
        productKey,
        ztizenKey,
        userKey,
        version,
        BigInt(storedNonce),
        productUsageDetails
      );

      console.log('🔍 VERIFICATION COMPARISON DEBUG:', {
        storedNonce: storedNonce,
        version: version,
        templateLength: verifyTemplate.length,
        storedAuthCommitLength: storedAuthCommit.length,
        verifyCommitLength: verifyCommit.length,
        firstStoredHash: storedAuthCommit[0],
        firstVerifyHash: verifyCommit[0].toString(),
        hashesMatch: BigInt(storedAuthCommit[0]) === verifyCommit[0],
      });

      const comparison: Array<{ index: number; match: boolean }> = [];
      let matchCount = 0;
      const totalBits = storedAuthCommit.length;

      for (let i = 0; i < totalBits; i++) {
        const match = BigInt(storedAuthCommit[i]) === verifyCommit[i];
        if (match) matchCount++;
        comparison.push({ index: i, match });
      }

      const matchRate = (matchCount / totalBits) * 100;
      // Threshold depends on binarization method:
      // - IoM: 81.25% (26/32 indices)
      // - SignMag3Bit: 79.7% (102/128 values)
      // - SignMagRank: 79.7% (102/128 values) - same as signmag3bit
      const threshold = enrolledBinarizationMethod === 'iom' ? 81.25 : 79.7;
      const verified = matchRate >= threshold;

      console.log(`🔍 COMPARISON RESULT (${enrolledBinarizationMethod.toUpperCase()} Binarization):`, {
        matchCount,
        totalBits,
        matchRate: matchRate.toFixed(2) + '%',
        verified,
        threshold: `${threshold}%`,
        binarizationMethod: enrolledBinarizationMethod,
      });

      // Store verification context for ZK proof generation
      setVerificationContext({
        verifyTemplate,
        productKey,
        ztizenKey,
        storedNonce,
        version,
        product_id,
        service_name,
        service_type: service_type || 'authentication',
        storedAuthCommit,
      });

      // Set traditional verification result first
      const traditionalResult = {
        verified,
        matchRate,
        matchCount,
        totalBits,
        comparison,
        binarizationMethod: enrolledBinarizationMethod,
        threshold,
        traditional: {
          matchCount,
          matchRate,
          verified
        }
      };
      setVerificationResult(traditionalResult);

      // Capture Poseidon input parameters for debugging hash mismatches
      const poseidonInputs = {
        productKey: {
          raw: productKey,
          fieldElement: stringToFieldElement(productKey).toString(),
        },
        ztizenKey: {
          raw: ztizenKey,
          fieldElement: stringToFieldElement(ztizenKey).toString(),
        },
        userKey: {
          hexBytes: Array.from(userKey).map(b => b.toString(16).padStart(2, '0')).join(''),
          fieldElement: bytesToFieldElement(userKey).toString(),
        },
        version,
        nonce: storedNonce,
        productUsageDetails: {
          product_id,
          service_id: service_name,
          service_type: service_type || 'authentication',
          hash: stringToFieldElement(`${product_id}:${service_name}:${service_type || 'authentication'}`).toString(),
        },
      };

      console.log('🔐 Poseidon input parameters captured for debugging');

      // Create verification export data with all stages + projections + all binarizations
      const exportData: VerificationExport = {
        verified,
        matchRate,
        matchCount,
        totalBits,
        threshold,  // Uses threshold based on binarization method
        credentialId,
        timestamp: new Date().toISOString(),
        algorithm,

        // Stage 1: Raw biometric from face-api.js
        rawBiometric: {
          source: 'face-api-128d',
          dimensions: faceDescriptor.length,
          data: Array.from(faceDescriptor),
          statistics: {
            min: Math.min(...Array.from(faceDescriptor)),
            max: Math.max(...Array.from(faceDescriptor)),
            mean: Array.from(faceDescriptor).reduce((a, b) => a + b, 0) / faceDescriptor.length,
            stdDev: Math.sqrt(Array.from(faceDescriptor).reduce((a, b) => a + Math.pow(b - Array.from(faceDescriptor).reduce((x, y) => x + y, 0) / faceDescriptor.length, 2), 0) / faceDescriptor.length),
          },
        },

        // Stage 2: After CancelableBiometric transformation
        cancelableBiometricTemplate: {
          dimensions: verifyTemplate.length,
          data: verifyTemplate,
          algorithm: `${algorithm} (${enrolledBinarizationMethod} binarization)`,
          binarizationMethod: enrolledBinarizationMethod,
          // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
          // No enrollment stats stored - each session computes its own mean/stdDev
        },

        // PROJECTIONS: raw_biometric × rand_matrix (before binarization)
        projections: {
          count: debugData.projections?.count || 0,
          values: debugData.projections?.values || [],
          matrixDimensions: '128x128',
          sparse: true,
          sparsity: '67% zeros (Achlioptas)',
        },

        // Binarization (executed method only)
        binarization: {
          method: debugData.binarization?.method,
          template: debugData.binarization?.template,
          histogram: debugData.binarization?.histogram,
        },

        // Stage 3: After Poseidon
        poseidonVerifyCommit: {
          count: verifyCommit.length,
          hashes: verifyCommit.map(c => c.toString()),
          nonce: storedNonce,
          version,
        },

        // Comparison results
        comparison: {
          storedCommit: storedAuthCommit,
          verifyCommit: verifyCommit.map(c => c.toString()),
          bitMatches: comparison.map(c => c.match),
        },

        // Poseidon input parameters for debugging
        poseidonInputs,
      };
      setVerificationExportData(exportData);

      // Track: Comparison complete, showing result
      markStepComplete('biometric');
      markStepComplete('compare');
      setSimulationStep('result');

      // Track: Demo navigation progress
      if (verified) {
        completeDemoStep('verify_complete');
      }

      // End metrics session with match result
      // Record as genuine test (same person) by default
      // For impostor tests, user can manually record via MetricsPanel
      useMetricsStore.getState().endSession({
        matchRate,
        matchCount,
        totalBits,
        isGenuine: true, // Assume genuine test by default
        threshold,
        passed: verified,
        credentialId,
      });

      setStage('result');

      // Close loading modal - traditional verification complete
      setLoadingModalVisible(false);
      console.log('✅ Traditional verification complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setStatus('');

      // End metrics session on error
      useMetricsStore.getState().endSession();
    }
  };

  // Manual Nonce Rolling Handler
  const handleRollNonce = async () => {
    if (!verificationContext) {
      setError('No verification context available');
      return;
    }

    setIsRollingNonce(true);
    setError('');

    try {
      const { verifyTemplate, productKey, ztizenKey, storedNonce, version, product_id, service_name, service_type } = verificationContext;

      // Increment nonce
      const nextNonce = BigInt(storedNonce) + 1n;

      // Generate NEW auth_commit with NEXT nonce
      const productUsageDetails = {
        product_id,
        service_id: service_name,
        service_type: service_type || 'authentication',
      };

      const nextAuthCommit = createFullAuthCommit(
        verifyTemplate,
        productKey,
        ztizenKey,
        userKey!,
        version,
        nextNonce,
        productUsageDetails
      );

      console.log('🔄 Rolling nonce:', {
        from: storedNonce,
        to: nextNonce.toString(),
        authCommitLength: nextAuthCommit.length,
      });

      await ZTIZEN_CLIENT.verifyRollNonce({
        credential_id: credentialId,
        nonce_current: storedNonce,
        nonce_next: nextNonce.toString(),
        auth_commit_gaussian_next: nextAuthCommit.map(c => c.toString()),
        auth_commit_quantization_next: nextAuthCommit.map(c => c.toString()),
      });

      console.log('✅ Nonce rolled successfully');
      setNonceRolled(true);
      setIsRollingNonce(false);
    } catch (err) {
      console.error('❌ Failed to roll nonce:', err);
      setError(err instanceof Error ? err.message : 'Failed to roll nonce');
      setIsRollingNonce(false);
    }
  };

  // Step 1: Generate ZK Proof (without verification)
  const handleGenerateZKProof = async () => {
    if (!verificationContext) {
      setError('No verification context available');
      return;
    }

    // Show loading modal for ZK proof generation ONLY
    setLoadingModalVisible(true);
    setLoadingModalStage('zkproof');
    setStatus('Generating ZK Proof... (This may take 30-60 seconds)');

    try {
      const { verifyTemplate, productKey, ztizenKey, storedNonce, version, product_id, service_name, service_type, storedAuthCommit } = verificationContext;

      console.log('🔬 Step 1: Generating ZK Proof (no verification yet)...');

      const productUsageHash = stringToFieldElement(
        `${product_id}:${service_name}:${service_type || 'authentication'}`
      );

      // Templates use enrolled binarization method (128 for sign-mag-rank, 32 for legacy iom)
      const templateValues = verifyTemplate;
      const storedCommits = storedAuthCommit;

      console.log('📦 Circuit inputs:', {
        templateLength: templateValues.length,
        authCommitLength: storedCommits.length,
      });

      const circuitInputs = {
        template: templateValues.map((v: number) => v.toString()),
        product_key: stringToFieldElement(productKey).toString(),
        ztizen_key: stringToFieldElement(ztizenKey).toString(),
        user_key: bytesToFieldElement(userKey!).toString(),
        version: version.toString(),
        nonce: storedNonce,
        product_usage_hash: productUsageHash.toString(),
        auth_commit_stored: storedCommits.map((v: string) => v.toString()),
      };

      console.log('⏳ Calling generateProof with Noir...');
      const proofStartTime = performance.now();

      // Generate proof ONLY (no verification)
      const proofResult = await generateProof(circuitInputs, { keccak: false });

      const proofDuration = ((performance.now() - proofStartTime) / 1000).toFixed(2);
      console.log(`✅ Proof generation completed in ${proofDuration}s`);

      // Store proof data (not yet verified)
      const zkProof = {
        matchCount: proofResult.matchCount || 0,
        verified: false, // Not verified yet
        proof: proofResult.proof,
        publicInputs: proofResult.publicInputs,
      };

      console.log('📊 ZK Proof Generated (unverified):', {
        matchCount: zkProof.matchCount,
        proofSize: zkProof.proof?.length || 0,
        publicInputsCount: zkProof.publicInputs?.length || 0,
      });

      // Update verification result with unverified proof
      setVerificationResult((prev: any) => ({
        ...prev!,
        zkProof,
      }));

      // Update export data
      setVerificationExportData((prev: any) => prev ? {
        ...prev,
        zkProof: {
          verified: false,
          matchCount: zkProof.matchCount,
          proofSize: zkProof.proof?.length || 0,
          proof: zkProof.proof ? Array.from(zkProof.proof).map((b: number) => b.toString(16).padStart(2, '0')).join('') : '',
          publicInputs: zkProof.publicInputs || [],
        }
      } : null);

      setStatus('');
      setLoadingModalVisible(false);
      console.log('✅ ZK Proof generation complete (ready for verification)');

    } catch (err) {
      console.error('❌ ZK Proof generation failed:', err);
      setError(err instanceof Error ? err.message : 'ZK Proof generation failed');
      setStatus('');
      setLoadingModalVisible(false);
    }
  };

  // Step 2: Verify ZK Proof (separate step)
  const handleVerifyZKProof = async () => {
    if (!verificationResult?.zkProof) {
      setError('No proof available to verify');
      return;
    }

    // Show loading modal for verification
    setLoadingModalVisible(true);
    setLoadingModalStage('zkproof');
    setStatus('Verifying ZK Proof... (This may take 5-10 seconds)');

    try {
      console.log('🔍 Step 2: Verifying ZK Proof...');

      const { proof, publicInputs } = verificationResult.zkProof;

      if (!proof || !publicInputs) {
        throw new Error('Invalid proof data');
      }

      const verifyStartTime = performance.now();

      // Verify using hook's verifyProof method
      const isValid = await verifyProof(proof, publicInputs);

      const verifyDuration = ((performance.now() - verifyStartTime) / 1000).toFixed(2);
      console.log(`✅ Proof verification completed in ${verifyDuration}s`);

      if (!isValid) {
        throw new Error('Proof verification failed - proof is invalid');
      }

      // Update verification result
      const verified = isValid && (verificationResult.zkProof.matchCount || 0) >= (verificationResult.totalBits * 0.85);

      setVerificationResult((prev: any) => ({
        ...prev!,
        zkProof: {
          ...prev!.zkProof!,
          verified,
        },
      }));

      // Update export data
      setVerificationExportData((prev: any) => prev ? {
        ...prev,
        zkProof: {
          ...prev.zkProof!,
          verified,
        }
      } : null);

      setStatus('');
      setLoadingModalVisible(false);
      console.log('✅ ZK Proof verification complete:', verified);

    } catch (err) {
      console.error('❌ ZK Proof verification failed:', err);
      setError(err instanceof Error ? err.message : 'ZK Proof verification failed');
      setStatus('');
      setLoadingModalVisible(false);
    }
  };

  const handleBack = () => {
    setError('');
    setStatus('');
    const stages: Stage[] = ['pin', 'password', 'signing', 'scan']; // No 'algorithm' stage
    const currentIndex = stages.indexOf(stage);
    if (currentIndex > 0) {
      setStage(stages[currentIndex - 1]);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Loading...</h1>
        </div>
      </div>
    );
  }

  if (!credentialInfo) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Error</h1>
          <p style={styles.error}>{error || 'Credential not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>

      <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Verification</h1>
        <p style={styles.subtitle}>ZTIZEN Biometric Authentication</p>
      </div>

      <div style={styles.card}>
        {/* Identity Card */}
        <div style={styles.identityCard}>
          <div style={styles.cardHeader}>
            <div style={styles.logo}>{getServiceIcon(serviceName || credentialInfo.service_name)}</div>
            <div>
              <h2 style={styles.productName}>{credentialInfo.product_name || 'Unknown'}</h2>
              <p style={styles.serviceName}>{serviceName || credentialInfo.service_name}</p>
            </div>
          </div>

          <div style={styles.cardInfo}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Credential ID:</span>
              <span style={styles.infoValue}>{credentialInfo.credential_id.slice(0, 12)}...</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Status:</span>
              <span style={styles.infoValue}>{credentialInfo.status}</span>
            </div>
          </div>
        </div>

        {/* Flow Breadcrumb - Overall Progress */}
        <FlowBreadcrumb
          flow="verification"
          currentPhase={
            stage === 'pin' || stage === 'password' || stage === 'signing' ? 'auth' :
            stage === 'scan' ? 'biometric' : 'result'
          }
          currentStep={
            stage === 'pin' ? 1 : stage === 'password' ? 2 : stage === 'signing' ? 3 :
            stage === 'scan' ? 1 : stage === 'result' ? 1 : 1
          }
          totalSteps={
            stage === 'pin' || stage === 'password' || stage === 'signing' ? 3 :
            stage === 'scan' ? 2 : 2
          }
          compact={false}
        />

        {/* Enhanced Step Indicator */}
        <div style={styles.stepIndicatorContainer}>
          <StepIndicator
            steps={[
              { id: 'pin', label: 'PIN', icon: '🔢' },
              { id: 'password', label: 'Password', icon: '🔐' },
              { id: 'signing', label: 'Sign', icon: '✍️' },
              { id: 'scan', label: 'Face', icon: '📷' },
              { id: 'result', label: 'Result', icon: '✓' },
            ]}
            currentStep={stage}
            orientation="horizontal"
          />
        </div>

        {/* Progress Bar - 5 steps: PIN, Password, Signing, Scan, Result */}
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: stage === 'pin' ? '20%' : stage === 'password' ? '40%' : stage === 'signing' ? '60%' : stage === 'scan' ? '80%' : '100%',
              }}
            />
          </div>
          <div style={styles.progressText}>
            Step {stage === 'pin' ? '1' : stage === 'password' ? '2' : stage === 'signing' ? '3' : stage === 'scan' ? '4' : '5'} of 5 — {
              stage === 'pin' ? 'Enter PIN' :
              stage === 'password' ? 'Enter password' :
              stage === 'signing' ? 'Sign with wallet' :
              stage === 'scan' ? 'Face scan' :
              'Verification result'
            }
          </div>
        </div>

        {/* Error/Status Messages */}
        {error && <div style={styles.errorCard}>{error}</div>}
        {status && <div style={styles.infoCard}>{status}</div>}

        {/* Stage 1: PIN */}
        {stage === 'pin' && (
          <div style={styles.stageContainer}>
            {/* Hardcoded algorithm banner */}
            <div style={styles.algorithmBanner}>
              <span style={{ fontSize: '0.9rem' }}>🔧 Using algorithm:</span>
              <strong style={{ color: '#6366f1', marginLeft: '0.5rem' }}>
                Sparse Gaussian (Chellappa)
              </strong>
            </div>

            <h3 style={styles.sectionTitle}>Enter PIN</h3>
            <p style={styles.sectionDesc}>Enter your PIN to verify</p>

            <PINInput value={pin} onChange={setPin} length={6} autoFocus={true} />

            <button onClick={handlePinContinue} disabled={pin.length < 4} style={{ ...styles.button, opacity: pin.length < 4 ? 0.5 : 1 }}>
              Continue
            </button>
          </div>
        )}

        {/* Stage 2: Password */}
        {stage === 'password' && (
          <div style={styles.stageContainer}>
            <h3 style={styles.sectionTitle}>Enter Password</h3>
            <p style={styles.sectionDesc}>Enter your master password</p>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              style={styles.input}
            />

            <button onClick={handlePasswordContinue} disabled={password.length < 8} style={{ ...styles.button, opacity: password.length < 8 ? 0.5 : 1 }}>
              Continue
            </button>

            <button onClick={handleBack} style={styles.backButton}>
              Back
            </button>
          </div>
        )}

        {/* Stage 3: Signing */}
        {stage === 'signing' && (
          <div style={styles.stageContainer}>
            <h3 style={styles.sectionTitle}>Sign Message</h3>
            <p style={styles.sectionDesc}>Sign with your wallet to verify</p>

            <div style={styles.summaryCard}>
              <div style={styles.summaryRow}>
                <span>PIN:</span>
                <span>{'*'.repeat(pin.length)} verified</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Password:</span>
                <span>{'*'.repeat(8)} entered</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Service:</span>
                <span>{serviceName || credentialInfo.service_name}</span>
              </div>
            </div>

            <button onClick={handleWalletSign} disabled={isSigningPassword} style={{ ...styles.button, opacity: isSigningPassword ? 0.5 : 1 }}>
              {isSigningPassword ? 'Signing...' : 'Sign with Wallet'}
            </button>

            <button onClick={handleBack} style={styles.backButton} disabled={isSigningPassword}>
              Back
            </button>
          </div>
        )}

        {/* Stage 4: Scan */}
        {stage === 'scan' && (
          <div style={styles.stageContainer}>
            <h3 style={styles.sectionTitle}>Scan Face</h3>
            <p style={styles.sectionDesc}>Position your face in the camera</p>

            <div style={styles.summaryCard}>
              <div style={styles.summaryRow}>
                <span>✅ PIN verified</span>
              </div>
              <div style={styles.summaryRow}>
                <span>✅ Password verified</span>
              </div>
              <div style={styles.summaryRow}>
                <span>✅ Signed: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </div>
            </div>

              <BiometricCapture
                stage="verify"
                onCaptureComplete={handleBiometricVerify}
                onError={(error: Error) => setError(error.message)}
              />

            {/* Loading Overlay during template generation */}
            {status && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  color: '#fff',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    border: '4px solid rgba(255, 255, 255, 0.3)',
                    borderTop: '4px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{status}</div>
              </div>
            )}

            <button onClick={handleBack} style={{ ...styles.backButton, marginTop: '1rem' }}>
              Back
            </button>
          </div>
        )}

        {/* Stage 5: Result */}
        {stage === 'result' && verificationResult && (
          <div style={styles.stageContainer}>
            <h3 style={styles.sectionTitle}>{verificationResult.verified ? '✅ Verification Successful' : '❌ Verification Failed'}</h3>

            {/* Traditional Comparison Section */}
            <div
              style={{
                ...styles.summaryCard,
                backgroundColor: verificationResult.verified ? '#d4edda' : '#f8d7da',
                borderColor: verificationResult.verified ? '#28a745' : '#dc3545',
                marginBottom: '1rem',
              }}
            >
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', fontWeight: 600 }}>✅ Traditional Comparison</h4>
              <div style={styles.summaryRow}>
                <span>Match Rate:</span>
                <span>{verificationResult.matchRate.toFixed(2)}%</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Matched:</span>
                <span>{verificationResult.matchCount}/{verificationResult.totalBits}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Threshold:</span>
                <span>{verificationResult.threshold?.toFixed(2) || '81.25'}% ({verificationResult.binarizationMethod || 'iom'})</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Method:</span>
                <span>{
                  verificationResult.binarizationMethod === 'iom' ? 'Index-of-Max (ranking)' :
                  verificationResult.binarizationMethod === 'sign-mag-rank' ? 'Sign+Rank Mean-Centered (0-8)' :
                  'Sign-Magnitude 3-bit (0-7)'
                }</span>
              </div>
            </div>

            {/* Dynamic Comparison Visualization */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                {verificationResult.binarizationMethod === 'iom'
                  ? `IoM Comparison (${verificationResult.comparison.length} indices):`
                  : `SignMag Comparison (${verificationResult.comparison.length} values):`}
              </h4>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(8px, 1fr))', 
                gap: '2px',
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {verificationResult.comparison.map((bit: any) => (
                  <div
                    key={bit.index}
                    style={{
                      height: '8px',
                      backgroundColor: bit.match ? '#28a745' : '#dc3545',
                      borderRadius: '1px',
                    }}
                    title={`Bit ${bit.index}: ${bit.match ? 'Match' : 'Mismatch'}`}
                  />
                ))}
              </div>
            </div>

            {/* ZK Proof Section */}
            {/* ZK Proof Section - Two Step Process */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 600, color: '#0c4a6e' }}>⚡ Zero-Knowledge Proof</h4>

              {!verificationResult.zkProof ? (
                // Step 1: Generate Proof Button
                <>
                  <p style={{ fontSize: '0.85rem', color: '#0369a1', margin: '0 0 0.75rem 0' }}>
                    Step 1: Generate a cryptographic proof (30-60 seconds)
                  </p>
                  <button
                    onClick={handleGenerateZKProof}
                    style={{
                      ...styles.button,
                      backgroundColor: '#0ea5e9',
                      borderColor: '#0ea5e9',
                      color: '#fff',
                    }}
                    disabled={loadingModalVisible || isGeneratingProof}
                  >
                    {loadingModalVisible ? '⏳ Generating Proof...' : '⚡ Generate ZK Proof'}
                  </button>
                </>
              ) : !verificationResult.zkProof.verified ? (
                // Step 2: Verify Proof Button (after generation)
                <>
                  <div style={{ padding: '0.75rem', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.5rem', marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.85rem', color: '#92400e', margin: 0 }}>
                      ⚠️ Proof generated but not verified yet
                    </p>
                  </div>
                  <details style={{ fontSize: '0.85rem', color: '#374151', cursor: 'pointer', marginBottom: '0.75rem' }}>
                    <summary style={{ cursor: 'pointer', userSelect: 'none' }}>View Generated Proof</summary>
                    <div style={{ marginTop: '0.5rem' }}>
                      <p style={{ margin: '0.25rem 0' }}><strong>Match Count:</strong> {verificationResult.zkProof.matchCount}/{verificationResult.totalBits} bits</p>
                      <p style={{ margin: '0.25rem 0' }}><strong>Size:</strong> {verificationResult.zkProof.proof?.length || 0} bytes</p>
                    </div>
                  </details>
                  <p style={{ fontSize: '0.85rem', color: '#0369a1', margin: '0 0 0.75rem 0' }}>
                    Step 2: Verify the proof cryptographically (5-10 seconds)
                  </p>
                  <button
                    onClick={handleVerifyZKProof}
                    style={{
                      ...styles.button,
                      backgroundColor: '#8b5cf6',
                      borderColor: '#8b5cf6',
                      color: '#fff',
                    }}
                    disabled={loadingModalVisible}
                  >
                    {loadingModalVisible ? '⏳ Verifying Proof...' : '🔍 Verify ZK Proof'}
                  </button>
                </>
              ) : (
                // Proof Verified - Show Results
                <>
                  <div style={{ padding: '0.75rem', backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '0.5rem', marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.85rem', color: '#065f46', margin: 0, fontWeight: 600 }}>
                      ✅ ZK Proof Verified Successfully
                    </p>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '0.75rem' }}>
                    <p style={{ margin: '0.25rem 0' }}><strong>Match Count:</strong> {verificationResult.zkProof.matchCount}/{verificationResult.totalBits}</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Match Rate:</strong> {((verificationResult.zkProof.matchCount / verificationResult.totalBits) * 100).toFixed(2)}%</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Proof Size:</strong> {verificationResult.zkProof.proof?.length || 0} bytes</p>
                  </div>
                  <details style={{ fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>
                    <summary style={{ cursor: 'pointer', userSelect: 'none' }}>🔬 View Proof Details</summary>
                    <div style={{ marginTop: '0.5rem' }}>
                      <p style={{ margin: '0.5rem 0 0.25rem 0' }}><strong>Public Inputs:</strong></p>
                      <pre style={{ backgroundColor: '#fff', padding: '0.5rem', borderRadius: '0.25rem', overflow: 'auto', maxHeight: '150px', fontSize: '0.7rem' }}>
                        {JSON.stringify(verificationResult.zkProof.publicInputs, null, 2)}
                      </pre>
                      <p style={{ margin: '0.5rem 0 0.25rem 0' }}><strong>Proof Data:</strong></p>
                      <pre style={{ backgroundColor: '#fff', padding: '0.5rem', borderRadius: '0.25rem', overflow: 'auto', maxHeight: '150px', fontSize: '0.7rem' }}>
                        {Array.from(verificationResult.zkProof.proof || []).slice(0, 64).map((b: any) => b.toString(16).padStart(2, '0')).join('')}...
                      </pre>
                    </div>
                  </details>
                </>
              )}
            </div>

            {/* Processing Stages Summary */}
            {verificationExportData && (
              <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'left' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1e3a8a' }}>📊 Processing Stages</h4>

                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                    <strong>1. Raw Biometric:</strong> {verificationExportData.rawBiometric.dimensions} dimensions
                  </span>
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                    <strong>2. Cancelable Template:</strong> {verificationExportData.cancelableBiometricTemplate.dimensions} bits
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                    <strong>3. Poseidon Commits:</strong> {verificationExportData.poseidonVerifyCommit.count} hashes
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Download Raw Biometric Button - ALWAYS available if we captured biometric */}
              {rawBiometricData && (
                <button
                  onClick={() => {
                    const rawData = {
                      timestamp: new Date().toISOString(),
                      credentialId,
                      source: 'face-api-128d',
                      dimensions: rawBiometricData.length,
                      rawValues: Array.from(rawBiometricData),
                      statistics: {
                        min: Math.min(...Array.from(rawBiometricData)),
                        max: Math.max(...Array.from(rawBiometricData)),
                        mean: Array.from(rawBiometricData).reduce((a, b) => a + b, 0) / rawBiometricData.length,
                        stdDev: Math.sqrt(
                          Array.from(rawBiometricData).reduce((acc, val) => {
                            const mean = Array.from(rawBiometricData).reduce((a, b) => a + b, 0) / rawBiometricData.length;
                            return acc + Math.pow(val - mean, 2);
                          }, 0) / rawBiometricData.length
                        ),
                      },
                      formatted: Array.from(rawBiometricData).map((v, i) => ({
                        index: i,
                        value: v,
                        formatted: v.toFixed(8),
                      })),
                    };
                    downloadResults(rawData, `raw_biometric_${credentialId.slice(0, 8)}_${Date.now()}.json`);
                  }}
                  style={{
                    ...styles.button,
                    backgroundColor: '#2563eb',
                    color: '#fff',
                  }}
                >
                  📥 Download Raw Biometric (128D)
                </button>
              )}

              {/* Download Full Verification Data */}
              {verificationExportData && (
                <button
                  onClick={() => downloadResults(verificationExportData, `verification_full_${credentialId.slice(0, 8)}_${Date.now()}.json`)}
                  style={{
                    ...styles.button,
                    backgroundColor: '#059669',
                    color: '#fff',
                  }}
                >
                  📥 Download Full Verification Data
                </button>
              )}

              {/* Manual Nonce Rolling Button - only if verified */}
              {verificationResult.verified && (
                <button
                  onClick={handleRollNonce}
                  style={{
                    ...styles.button,
                    backgroundColor: nonceRolled ? '#22c55e' : '#6366f1',
                    borderColor: nonceRolled ? '#22c55e' : '#6366f1',
                    color: '#fff',
                  }}
                  disabled={isRollingNonce || nonceRolled}
                >
                  {nonceRolled ? '✅ Nonce Rolled' : isRollingNonce ? '⏳ Rolling Nonce...' : '🔄 Roll Nonce (Replay Protection)'}
                </button>
              )}

              {nonceRolled && (
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: '#d1fae5',
                  border: '1px solid #22c55e',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  color: '#065f46',
                  textAlign: 'center',
                }}>
                  ✅ Nonce rolled successfully! Next verification will use the new nonce.
                </div>
              )}

              {/* Continue / Try Again Button */}
              <button
                onClick={() => {
                  if (verificationResult.verified) {
                    window.location.href = returnUrl;
                  } else {
                    setStage('pin');
                    setPin('');
                    setPassword('');
                    setUserKey(null);
                    setVerificationResult(null);
                    setVerificationExportData(null);
                    setError('');
                    setStatus('');
                    setNonceRolled(false);
                  }
                }}
                style={styles.button}
              >
                {verificationResult.verified ? 'Continue' : 'Try Again'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
    color: '#1a1a1a',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 600,
    margin: 0,
    marginBottom: '0.5rem',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: '0.95rem',
    color: '#666',
    margin: 0,
  },
  card: {
    maxWidth: '500px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  identityCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    border: '2px solid #e5e5e5',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1rem',
  },
  logo: {
    fontSize: '2.5rem',
  },
  productName: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: 0,
    color: '#1a1a1a',
  },
  serviceName: {
    fontSize: '0.9rem',
    color: '#666',
    margin: 0,
  },
  cardInfo: {
    borderTop: '1px solid #e5e5e5',
    paddingTop: '1rem',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    fontSize: '0.85rem',
  },
  infoLabel: {
    color: '#666',
  },
  infoValue: {
    color: '#1a1a1a',
    fontWeight: 500,
  },
  stepIndicatorContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1rem',
    padding: '0.75rem',
    backgroundColor: '#fafafa',
    borderRadius: '8px',
    overflowX: 'auto',
  },
  progressContainer: {
    marginBottom: '1.5rem',
  },
  progressBar: {
    width: '100%',
    height: '6px',
    backgroundColor: '#e5e5e5',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '0.5rem',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '0.85rem',
    color: '#666',
    textAlign: 'center' as const,
    margin: 0,
  },
  stageContainer: {
    marginTop: '1rem',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    color: '#1a1a1a',
  },
  sectionDesc: {
    fontSize: '0.85rem',
    color: '#666',
    margin: '0 0 1.5rem 0',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '1rem',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    marginBottom: '0.75rem',
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  button: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  backButton: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '0.9rem',
    fontWeight: 500,
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '0.5rem',
    transition: 'all 0.2s ease',
  },
  errorCard: {
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    padding: '1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: '#c33',
    textAlign: 'center' as const,
    marginBottom: '1rem',
  },
  infoCard: {
    backgroundColor: '#f0f4ff',
    border: '1px solid #d0e0ff',
    padding: '1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: '#667eea',
    textAlign: 'center' as const,
    marginBottom: '1rem',
  },
  algorithmBanner: {
    backgroundColor: '#eef2ff',
    border: '1px solid #c7d2fe',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    fontSize: '0.85rem',
    color: '#4338ca',
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
    gap: '0.25rem',
  },
  summaryCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
    border: '1px solid #e5e5e5',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    fontSize: '0.9rem',
  },
  error: {
    color: '#dc3545',
    textAlign: 'center' as const,
  },
};

// Helper: Hash PIN with SHA-256 (client-side hashing before sending to server)
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
