/**
 * ZTIZEN Biometric Scan (MIGRATED TO face-api.js 128D)
 * Route: /ztizen/register-scan/:credentialId
 *
 * Flow:
 * 1. Load enrollment data (PIN, password, signature) from store
 * 2. Capture face with face-api.js (128D face descriptor)
 * 3. Generate template using CancelableBiometric class (128 → 128 dimensions)
 * 4. Create Poseidon commitments automatically (128 hashes)
 * 5. Store in database
 * 6. Navigate to success page
 *
 * MIGRATION NOTE:
 * - Previously used MediaPipe landmarks (956D) with Gaussian projection (956 → 256)
 * - Now uses face-api.js 128D embeddings with 128×128 projection matrix
 * - MediaPipe is still used for face mesh visualization (UI only)
 * - The 128-dimension output is more efficient (smaller ZK circuit)
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { CancelableBiometric, type BiometricConfig, type BiometricTemplate, type FullDebugData } from '@/lib/CancelableBiometric';
import BiometricCapture from '@/components/BiometricCapture';

// Hardcoded algorithm - BioHashing (Teoh et al. IEEE TPAMI 2006)
// Gaussian random projection with Gram-Schmidt orthogonalization
// This ensures enrollment and verification always use the same algorithm
const HARDCODED_ALGORITHM = 'biohashing' as const;

// Hardcoded binarization method - Sign + Magnitude Rank (self-normalizing)
// This is the only supported method for new enrollments
const HARDCODED_BINARIZATION = 'sign-mag-rank' as const;

import { useEnrollmentStore } from '@/stores/useEnrollmentStore';
import { useSimulationStore, type EnrollmentStep } from '@/stores/useSimulationStore';
import { useDemoNavigationStore } from '@/stores/useDemoNavigationStore';
import { useMetricsStore, METRIC_OPERATIONS } from '@/stores/useMetricsStore';
import { createFullAuthCommit, generateNonce, stringToFieldElement, bytesToFieldElement } from '@/lib/poseidon';
import { API_ENDPOINTS } from '@/config/api';
import { ZTIZEN_CLIENT, PRODUCT_CLIENT } from '@/lib/api';
import { FlowBreadcrumb } from '@/components/FlowBreadcrumb';

export const Route = createFileRoute('/ztizen/register-scan/$credentialId')({
  component: ZTIZENScan,
});

// Interface for enrollment result with all 3 processing stages (comprehensive)
interface EnrollmentResult {
  success: boolean;
  credentialId: string;
  algorithm: string;
  binarizationMethod: string;
  enrolledAt: string;

  // Stage 1: Raw biometric (face descriptor)
  rawBiometric: {
    source: string;
    dimensions: number;
    data: number[];
    statistics: {
      min: number;
      max: number;
      mean: number;
      stdDev: number;
    };
  };

  // Stage 2: After CancelableBiometric transformation (PRIMARY - used for storage)
  cancelableBiometricTemplate: {
    method: string;
    encoding: string;
    dimensions: number;
    data: number[];
    templateBytes: number[];
    bytesLength: number;
    algorithm: string;
    statistics: {
      min: number;
      max: number;
      uniqueValues: number;
      indexDistribution?: number[];  // IoM: [count_0, count_1, count_2, count_3]
      totalIndices?: number;  // IoM: 32
      signPositive?: number;  // Legacy: compact-sign-mag
      signNegative?: number;  // Legacy: compact-sign-mag
    };
  };

  // BINARIZATION COMPARISON: Both methods for analysis
  binarizationComparison: {
    binary: {
      method: string;
      encoding: string;
      dimensions: number;
      data: number[];
      templateBytes: number[];
      bytesLength: number;
      statistics: {
        ones: number;
        zeros: number;
        balance: string;
      };
    };
    compactSignMag: {
      method: string;
      encoding: string;
      dimensions: number;
      data: number[];
      templateBytes: number[];
      bytesLength: number;
      statistics: {
        positiveCount: number;
        negativeCount: number;
        uniqueValues: number;
        magnitudeDistribution: number[];
      };
    };
  };

  // Intermediate: Projection values (raw_biometric × rand_matrix)
  projections: {
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

  // Stage 3: After Poseidon hashing
  poseidonAuthCommit: {
    count: number;
    hashes: string[];
    nonce: string;
    version: number;
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

  // Keys used (partial, for debugging)
  keysUsed: {
    productKey: string;
    ztizenKey: string;
    userKeyFirstBytes: string;
    version: number;
  };
}

function ZTIZENScan() {
  const { credentialId } = Route.useParams();
  const navigate = useNavigate();

  // Get enrollment data from store
  const {
    pin,
    password,
    signature,
    address,
    userKey,
    productId,
    serviceName,
    serviceType,  // IMPORTANT: Must match ZTIZEN DB for Poseidon hash
    userId,
    currentStep,
    setStep,
    isReady,
    reset: resetEnrollment,
  } = useEnrollmentStore();

  // Simulation flow tracking
  const { setFlowType, setCurrentStep: setSimulationStep, markStepComplete } = useSimulationStore();

  // Demo navigation tracking
  const { completeStep: completeDemoStep, setLastCredential } = useDemoNavigationStore();

  // Initialize flow on mount
  useEffect(() => {
    setFlowType('enrollment');
    // Mark credential creation as complete (keys were created on previous page)
    setSimulationStep('credential_create');
    markStepComplete('pin');
    markStepComplete('pin_confirm');
    markStepComplete('password');
    markStepComplete('signature');
  }, []);

  // Fetch partial keys from API (NOT from store)
  const [productPartialKey, setProductPartialKey] = useState<string | null>(null);
  const [ztizenPartialKey, setZtizenPartialKey] = useState<string | null>(null);

  // Use hardcoded algorithm - no more selection needed
  const algorithm = HARDCODED_ALGORITHM;

  // Fetch version from credential (tied to specific credential in DB)
  const [credentialVersion, setCredentialVersion] = useState<number>(1);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const credResponse = await fetch(API_ENDPOINTS.ztizen.enrollment(credentialId));
        const credData = await credResponse.json();
        if (credData.success && credData.credential) {
          const version = credData.credential.version || 1;
          setCredentialVersion(version);
          console.log('✅ Fetched credential version from DB:', version);
        }
      } catch (error) {
        console.warn('⚠️ Failed to fetch version, using default (1):', error);
        setCredentialVersion(1);
      }
    };
    if (credentialId) {
      fetchVersion();
    }
  }, [credentialId]);

  // Fetch partial keys from BOTH Product API and ZTIZEN API
  useEffect(() => {
    const fetchKeys = async () => {
      try {
        console.log('📡 Fetching partial keys from APIs for credential:', credentialId);

        // Fetch Product Key from Product Service
        const productKeyData = await PRODUCT_CLIENT.getCredentialKeys(credentialId);
        if (!productKeyData.success || !productKeyData.partial_key) {
          console.error('❌ Failed to get product key:', productKeyData);
          throw new Error('Failed to get product key');
        }
        const productKey = productKeyData.partial_key;
        console.log('✅ Product key loaded:', productKey.substring(0, 16) + '...');

        // Fetch ZTIZEN Key from ZTIZEN Service
        const ztizenData = await ZTIZEN_CLIENT.getEnrollment(credentialId);
        if (!ztizenData.success || !ztizenData.credential?.ztizen_partial_key) {
          console.error('❌ Failed to get ZTIZEN key:', ztizenData);
          throw new Error('Failed to get ZTIZEN key');
        }
        const ztizenKey = ztizenData.credential.ztizen_partial_key;
        console.log('✅ ZTIZEN key loaded:', ztizenKey.substring(0, 16) + '...');

        // Store keys in local state
        setProductPartialKey(productKey);
        setZtizenPartialKey(ztizenKey);

        console.log('🔑 Both keys loaded successfully:', {
          productKey: productKey.substring(0, 16) + '...',
          ztizenKey: ztizenKey.substring(0, 16) + '...',
        });

      } catch (error) {
        console.error('❌ Error fetching keys:', error);
      }
    };

    if (credentialId) {
      fetchKeys();
    }
  }, [credentialId]);

  // Comprehensive logging on page load
  useEffect(() => {
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 REGISTER-SCAN PAGE LOADED');
    console.log('═══════════════════════════════════════════════');
    console.log('📋 Credential ID:', credentialId);
    console.log('📋 Current Step:', currentStep);
    console.log('📋 Algorithm:', algorithm);

    console.log('\n🔑 KEY STATUS:');
    console.log('  Product Partial Key:', productPartialKey ?
      `✅ LOADED (${productPartialKey.substring(0, 16)}...${productPartialKey.substring(48, 64)})` :
      '❌ NOT LOADED (undefined/null)'
    );
    console.log('  ZTIZEN Partial Key:', ztizenPartialKey ?
      `✅ LOADED (${ztizenPartialKey.substring(0, 16)}...${ztizenPartialKey.substring(48, 64)})` :
      '❌ NOT LOADED (undefined/null)'
    );
    console.log('  User Key:', userKey ?
      `✅ LOADED (${userKey.length} bytes)` :
      '❌ NOT LOADED'
    );

    console.log('\n📦 OTHER ENROLLMENT DATA:');
    console.log('  Product ID:', productId || '❌ NOT SET');
    console.log('  Service Name:', serviceName || '❌ NOT SET');
    console.log('  Service Type:', serviceType || '❌ NOT SET');  // IMPORTANT for Poseidon hash
    console.log('  User ID:', userId || '❌ NOT SET');
    console.log('  PIN:', pin ? '✅ SET' : '❌ NOT SET');
    console.log('  Password:', password ? '✅ SET' : '❌ NOT SET');
    console.log('  Signature:', signature ? '✅ SET' : '❌ NOT SET');
    console.log('  Address:', address || '❌ NOT SET');

    console.log('\n✅ Is Ready:', isReady());
    console.log('═══════════════════════════════════════════════\n');
  }, [credentialId, productPartialKey, ztizenPartialKey, userKey, productId, serviceName, serviceType, userId, pin, password, signature, address, currentStep, algorithm]);

  const [status, setStatus] = useState('Loading enrollment data...');
  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState<BiometricTemplate | null>(null);
  const [authCommits, setAuthCommits] = useState<string[] | null>(null);
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentResult | null>(null);
  const [fullDebugData, setFullDebugData] = useState<FullDebugData | null>(null);

  // Binarization method is hardcoded to 'sign-mag-rank' (self-normalizing)
  // This method computes its own mean/stdDev per session - no stats stored
  const binarizationMethod = HARDCODED_BINARIZATION;

  // Download results as JSON file
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

  // Check if enrollment data is ready
  useEffect(() => {
    if (!isReady()) {
      setStatus('❌ Missing enrollment data. Please complete registration first.');
      console.error('Missing enrollment data:', {
        hasPin: !!pin,
        hasPassword: !!password,
        hasSignature: !!signature,
        hasUserKey: !!userKey,
        hasCredentialId: !!credentialId,
        hasProductId: !!productId,
      });
      return;
    }

    // Algorithm is hardcoded to BioHashing (Gaussian + Gram-Schmidt)
    if (currentStep === 'biometric') {
      setStatus(`✅ Ready to capture biometric (using BioHashing: Gaussian + Gram-Schmidt)`);
    }
  }, [pin, password, signature, userKey, credentialId, productId, currentStep, setStep, algorithm]);

  // Handle biometric capture complete
  const handleBiometricCaptured = async (biometricFloat32: Float32Array) => {
    console.log('🎯 handleBiometricCaptured called with biometric data:', biometricFloat32.length);

    // Start metrics session for enrollment
    const sessionId = useMetricsStore.getState().startSession('enrollment', credentialId);
    console.log(`📊 [Metrics] Started enrollment session: ${sessionId}`);

    // ═══════════════════════════════════════════════════════════════════
    // RAW BIOMETRIC RECEIVED IN REGISTRATION ROUTE
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('📥 RAW BIOMETRIC RECEIVED IN ztizen.register-scan.$credentialId.tsx');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('Type:', biometricFloat32.constructor.name);
    console.log('Length:', biometricFloat32.length, 'dimensions');
    console.log('');
    console.log('🔢 FULL RAW DATA (JSON):');
    console.log(JSON.stringify(Array.from(biometricFloat32)));
    console.log('');
    console.log('📋 FIRST 20 VALUES:');
    Array.from(biometricFloat32.slice(0, 20)).forEach((v, i) => {
      console.log(`  [${String(i).padStart(3, '0')}]: ${v.toFixed(8)}`);
    });
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('\n');

    if (!userKey || !productId) {
      setStatus('❌ Missing user key or product ID');
      console.error('❌ Missing userKey or productId:', { userKey: !!userKey, productId });
      useMetricsStore.getState().endSession();
      return;
    }

    console.log('✅ Setting loading to true');
    setLoading(true);

    // Track: Biometric captured
    markStepComplete('credential_create');
    setSimulationStep('biometric');

    // Capture raw biometric for export (Stage 1)
    const rawBiometricData = Array.from(biometricFloat32);

    try {
      console.log('🔐 Step 1: Starting template generation');
      setStatus('🔐 Generating template with CancelableBiometric...');

      // Track: Template generation started
      markStepComplete('biometric');
      setSimulationStep('template');

      // LOG: Show key status before validation
      console.log('\n🔐 STARTING TEMPLATE GENERATION');
      console.log('═══════════════════════════════════════════════');
      console.log('📋 Keys at template generation time:');
      console.log('  Product Key:', productPartialKey || '❌ MISSING');
      if (productPartialKey) {
        console.log('    - Length:', productPartialKey.length);
        console.log('    - First 16 chars:', productPartialKey.substring(0, 16));
        console.log('    - Last 16 chars:', productPartialKey.substring(48, 64));
        console.log('    - Full value:', productPartialKey);
      }
      console.log('  ZTIZEN Key:', ztizenPartialKey || '❌ MISSING');
      if (ztizenPartialKey) {
        console.log('    - Length:', ztizenPartialKey.length);
        console.log('    - First 16 chars:', ztizenPartialKey.substring(0, 16));
        console.log('    - Last 16 chars:', ztizenPartialKey.substring(48, 64));
        console.log('    - Full value:', ztizenPartialKey);
      }
      console.log('  User Key:', userKey || '❌ MISSING');
      if (userKey) {
        console.log('    - Length:', userKey.length, 'bytes');
        console.log('    - Type:', userKey.constructor.name);
      }
      console.log('═══════════════════════════════════════════════\n');

      // Validate keys before proceeding
      if (!productPartialKey) {
        console.error('═══════════════════════════════════════════════');
        console.error('❌ PRODUCT PARTIAL KEY MISSING');
        console.error('═══════════════════════════════════════════════');
        console.error('Enrollment Store State:', {
          productPartialKey,
          ztizenPartialKey,
          userKey: userKey ? `${userKey.length} bytes` : null,
          productId,
          serviceName,
          userId,
          hasPin: !!pin,
          hasPassword: !!password,
          hasSignature: !!signature,
        });
        console.error('═══════════════════════════════════════════════\n');
        throw new Error('Product partial key not loaded. Please restart enrollment from step 1. Check console for details.');
      }
      if (!ztizenPartialKey) {
        console.error('═══════════════════════════════════════════════');
        console.error('❌ ZTIZEN PARTIAL KEY MISSING');
        console.error('═══════════════════════════════════════════════');
        console.error('Enrollment Store State:', {
          productPartialKey: productPartialKey ? `${productPartialKey.substring(0, 16)}...` : null,
          ztizenPartialKey,
          userKey: userKey ? `${userKey.length} bytes` : null,
          productId,
          serviceName,
          userId,
        });
        console.error('═══════════════════════════════════════════════\n');
        throw new Error('ZTIZEN partial key not loaded. Please restart enrollment from step 1. Check console for details.');
      }

      // Create CancelableBiometric instance with selected algorithm
      // NOTE: inputDim = actual biometric size (128 from face-api.js descriptor)
      //       outputDim = 128 for efficient ZK circuit (128×128 projection matrix)
      // Migration: Previously 956D→256D, now 128D→128D (same dimension, more efficient)
      console.log('📊 Biometric captured:', {
        source: 'face-api-128d',
        dimensions: biometricFloat32.length,
        sample: Array.from(biometricFloat32.slice(0, 5)).map(v => v.toFixed(4)),
      });

      const config: BiometricConfig = {
        algorithm: algorithm,
        inputDim: biometricFloat32.length, // Actual biometric dimension (128 from face-api.js)
        outputDim: 128, // ZK circuit dimension (128×128 is more efficient than 128→256)
        productKey: productPartialKey,
        ztizenKey: ztizenPartialKey,
        userKey: userKey,
        version: credentialVersion, // Fetch from credential DB (not hardcoded)
        params: {
          thresholdScale: 1.4, // ±0.70σ quantization (optimized for face-api.js 128D)
        },
      };

      const cb = new CancelableBiometric(config);

      // ═══════════════════════════════════════════════════════════════════
      // GENERATE TEMPLATE WITH FULL DEBUG DATA
      // This captures the entire pipeline for analysis:
      // raw_biometric → rand_matrix → projections → binarization
      // ═══════════════════════════════════════════════════════════════════

      // Use generateTemplateWithFullDebug for comprehensive export
      // Binarization method is now user-selectable:
      // - 'iom': Index-of-Max (32 indices) - More robust, 100% match rate in tests
      // - 'signmag3bit': 3-bit Sign-Magnitude (128 values) - More granular matching
      const { template: compactTemplate, debug: debugData } = await cb.generateTemplateWithFullDebug(
        Array.from(biometricFloat32),
        binarizationMethod,  // Use selected binarization method
        'enrollment',
        credentialId
      );

      // Store debug data for export
      setFullDebugData(debugData);

      // Also generate binary template for comparison (debug purposes)
      const binaryTemplate = await cb.generateTemplateWithMethod(
        Array.from(biometricFloat32),
        'binary'
      );

      // Use IoM as the primary template for storage (32 indices for Poseidon)
      const capturedTemplate = compactTemplate;

      setTemplate(capturedTemplate);
      console.log(`✅ Templates generated using sign-mag-rank binarization`);
      console.log(`📊 SignMagRank template: ${capturedTemplate.template.length} values (each 0-8, self-normalizing)`);
      console.log(`✅ SELF-NORMALIZING: No stats stored - each session computes its own mean/stdDev`);
      console.log(`📊 Full debug data captured for export`);

      // ═══════════════════════════════════════════════════════════════════
      // BINARIZATION COMPARISON: BINARY vs COMPACT-SIGN-MAG
      // ═══════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('╔═══════════════════════════════════════════════════════════════════════════════════════╗');
      console.log('║              BINARIZATION METHOD COMPARISON                                            ║');
      console.log('╠═══════════════════════════════════════════════════════════════════════════════════════╣');
      console.log('║                                                                                        ║');
      console.log('║  Method 1: BINARY (1-bit)           Method 2: COMPACT-SIGN-MAG (4-bit)                ║');
      console.log('║  ─────────────────────────           ─────────────────────────────────                ║');
      console.log('║  • template[i] = p > 0 ? 1 : 0      • Sign: + = 1, - = 0 (1 bit)                      ║');
      console.log('║  • Output: 0 or 1                   • Magnitude: 0-7 (3 bits)                         ║');
      console.log('║  • Size: 128 bits = 16 bytes        • Format: [S][M2][M1][M0]                         ║');
      console.log('║                                     • Output: 0-15                                     ║');
      console.log('║                                     • Size: 512 bits = 64 bytes                       ║');
      console.log('║                                                                                        ║');
      console.log('╚═══════════════════════════════════════════════════════════════════════════════════════╝');
      console.log('');

      // Get projections (same for both methods)
      const projections = capturedTemplate.intermediate?.projections || [];

      console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
      console.log('│ SIDE-BY-SIDE COMPARISON (First 30 values)                                               │');
      console.log('├───────┬────────────────┬─────────┬──────────────────────────────────────────────────────┤');
      console.log('│ Index │ Projection     │ Binary  │ Compact-Sign-Mag                                     │');
      console.log('│       │ (raw value)    │ (1-bit) │ (4-bit: [Sign][Mag])                                 │');
      console.log('├───────┼────────────────┼─────────┼──────────────────────────────────────────────────────┤');

      for (let i = 0; i < Math.min(30, projections.length); i++) {
        const proj = projections[i];
        const binVal = binaryTemplate.template[i];
        const compactVal = compactTemplate.template[i];

        // Decode compact value
        const sign = (compactVal >> 3) & 1;
        const mag = compactVal & 0x07;
        const signChar = sign === 1 ? '+' : '-';

        // Format strings
        const projStr = (proj >= 0 ? '+' : '') + proj.toFixed(4);
        const binStr = binVal.toString();
        const compactBin = compactVal.toString(2).padStart(4, '0');
        const compactDec = compactVal.toString().padStart(2, ' ');

        console.log(`│  ${String(i).padStart(3, '0')}  │ ${projStr.padStart(14)} │    ${binStr}    │ ${compactDec} = ${compactBin} (sign=${signChar}, mag=${mag})                    │`);
      }

      console.log('└───────┴────────────────┴─────────┴──────────────────────────────────────────────────────┘');
      console.log('');

      // Statistics comparison
      console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
      console.log('│ STATISTICS COMPARISON                                                                   │');
      console.log('├─────────────────────────────────────────┬───────────────────────────────────────────────┤');
      console.log('│ BINARY (1-bit)                          │ COMPACT-SIGN-MAG (4-bit)                      │');
      console.log('├─────────────────────────────────────────┼───────────────────────────────────────────────┤');

      const binOnes = binaryTemplate.template.filter((v: number) => v === 1).length;
      const binZeros = binaryTemplate.template.filter((v: number) => v === 0).length;
      const compactPositive = compactTemplate.template.filter((v: number) => (v >> 3) === 1).length;
      const compactNegative = compactTemplate.template.filter((v: number) => (v >> 3) === 0).length;
      const compactUnique = new Set(compactTemplate.template).size;

      // Magnitude distribution for compact
      const magHist = new Array(8).fill(0);
      compactTemplate.template.forEach((v: number) => {
        magHist[v & 0x07]++;
      });

      console.log(`│ Total values: ${binaryTemplate.template.length.toString().padEnd(23)} │ Total values: ${compactTemplate.template.length.toString().padEnd(30)} │`);
      console.log(`│ Ones (positive): ${binOnes.toString().padEnd(20)} │ Positive (sign=1): ${compactPositive.toString().padEnd(26)} │`);
      console.log(`│ Zeros (negative): ${binZeros.toString().padEnd(19)} │ Negative (sign=0): ${compactNegative.toString().padEnd(26)} │`);
      console.log(`│ Balance: ${(binOnes / 128 * 100).toFixed(1)}% ones`.padEnd(42) + `│ Balance: ${(compactPositive / 128 * 100).toFixed(1)}% positive`.padEnd(48) + `│`);
      console.log(`│ Unique values: 2 (0, 1)`.padEnd(42) + `│ Unique values: ${compactUnique} / 16 possible`.padEnd(48) + `│`);
      console.log(`│ Bytes: ${binaryTemplate.templateBytes.length}`.padEnd(42) + `│ Bytes: ${compactTemplate.templateBytes.length}`.padEnd(48) + `│`);
      console.log('├─────────────────────────────────────────┴───────────────────────────────────────────────┤');
      console.log('│ MAGNITUDE DISTRIBUTION (Compact-Sign-Mag)                                               │');
      console.log('├─────────────────────────────────────────────────────────────────────────────────────────┤');
      console.log(`│ Mag 0 (|p|<0.1): ${magHist[0].toString().padStart(3)}  │ Mag 4 (0.4≤|p|<0.5): ${magHist[4].toString().padStart(3)}                                   │`);
      console.log(`│ Mag 1 (0.1≤|p|<0.2): ${magHist[1].toString().padStart(3)}  │ Mag 5 (0.5≤|p|<0.6): ${magHist[5].toString().padStart(3)}                                   │`);
      console.log(`│ Mag 2 (0.2≤|p|<0.3): ${magHist[2].toString().padStart(3)}  │ Mag 6 (0.6≤|p|<0.7): ${magHist[6].toString().padStart(3)}                                   │`);
      console.log(`│ Mag 3 (0.3≤|p|<0.4): ${magHist[3].toString().padStart(3)}  │ Mag 7 (|p|≥0.7):     ${magHist[7].toString().padStart(3)}                                   │`);
      console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');
      console.log('');

      // Show what information is LOST in binary vs preserved in compact
      console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
      console.log('│ INFORMATION LOSS ANALYSIS                                                               │');
      console.log('├─────────────────────────────────────────────────────────────────────────────────────────┤');

      let infoLossExamples = [];
      for (let i = 0; i < projections.length && infoLossExamples.length < 5; i++) {
        const proj = projections[i];
        const binVal = binaryTemplate.template[i];
        const compactVal = compactTemplate.template[i];
        const mag = compactVal & 0x07;

        // Find cases where magnitude provides extra info
        if (mag >= 3) { // Significant magnitude
          infoLossExamples.push({
            index: i,
            projection: proj,
            binary: binVal,
            compact: compactVal,
            magnitude: mag,
          });
        }
      }

      console.log('│ Examples where compact-sign-mag preserves more information than binary:                 │');
      console.log('│                                                                                         │');
      infoLossExamples.forEach(ex => {
        const sign = (ex.compact >> 3) === 1 ? '+' : '-';
        console.log(`│   Projection ${(ex.projection >= 0 ? '+' : '') + ex.projection.toFixed(4)}: Binary=${ex.binary}, Compact=${ex.compact} (${sign}0.${ex.magnitude}x)         │`);
        console.log(`│   → Binary only knows: ${ex.binary === 1 ? 'positive' : 'negative'}                                                      │`);
        console.log(`│   → Compact knows: ${sign}0.${ex.magnitude}x (magnitude preserved!)                                         │`);
        console.log('│                                                                                         │');
      });
      console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');
      console.log('');

      // Full template arrays for copy-paste
      console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
      console.log('│ FULL TEMPLATE DATA (JSON - Copy-Paste Friendly)                                         │');
      console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');
      console.log('');
      console.log('📋 BINARY TEMPLATE (128 × 1-bit):');
      console.log(JSON.stringify(binaryTemplate.template));
      console.log('');
      console.log('📋 COMPACT-SIGN-MAG TEMPLATE (128 × 4-bit):');
      console.log(JSON.stringify(compactTemplate.template));
      console.log('');
      console.log('📋 RAW PROJECTIONS (128 floats):');
      console.log(JSON.stringify(projections.map((p: number) => parseFloat(p.toFixed(6)))));
      console.log('');

      setStatus('🔐 Creating Poseidon commitments...');

      // Track: Commitment generation started
      markStepComplete('template');
      setSimulationStep('commit');

      // Create Poseidon commitments from the binary template
      const nonce = generateNonce();

      // IMPORTANT: productUsageDetails MUST match exactly what's stored in ZTIZEN DB
      // These values are used in Poseidon hash - any mismatch causes verification failure
      const productUsageDetails = {
        product_id: productId,
        service_id: serviceName || 'default',
        service_type: serviceType || 'authentication',  // Use from store, not hardcoded!
      };

      console.log('📋 Poseidon productUsageDetails:', productUsageDetails);

      const commits = createFullAuthCommit(
        capturedTemplate.template, // IoM array (32 indices from 128 projections, k=4)
        productPartialKey, // Product key (no fallback)
        ztizenPartialKey, // ZTIZEN key (no fallback)
        userKey, // User key (32 bytes)
        credentialVersion, // Fetch from credential DB (not hardcoded)
        nonce,
        productUsageDetails
      );

      setAuthCommits(commits.map(c => c.toString()));
      console.log(`✅ Created ${commits.length} Poseidon commitments`);

      // Capture Poseidon input parameters for debugging hash mismatches
      const poseidonInputs = {
        productKey: {
          raw: productPartialKey,
          fieldElement: stringToFieldElement(productPartialKey).toString(),
        },
        ztizenKey: {
          raw: ztizenPartialKey,
          fieldElement: stringToFieldElement(ztizenPartialKey).toString(),
        },
        userKey: {
          hexBytes: Array.from(userKey).map(b => b.toString(16).padStart(2, '0')).join(''),
          fieldElement: bytesToFieldElement(userKey).toString(),
        },
        version: credentialVersion, // Fetch from credential DB (matches verification)
        nonce: nonce.toString(),
        productUsageDetails: {
          ...productUsageDetails,
          hash: stringToFieldElement(`${productUsageDetails.product_id}:${productUsageDetails.service_id}:${productUsageDetails.service_type}`).toString(),
        },
      };

      console.log('🔐 Poseidon input parameters captured for debugging');

      // Update fullDebugData with Poseidon inputs
      // This adds the Poseidon parameters to the debug export for complete pipeline analysis
      // NOTE: Use local debugData variable, not state (React state updates are async)
      const fullDebugWithPoseidon = {
        ...debugData,
        poseidonInputs: poseidonInputs,
      };
      setFullDebugData(fullDebugWithPoseidon);
      console.log('📊 Full debug data updated with Poseidon inputs');
      console.log('📊 Debug data projections count:', fullDebugWithPoseidon.projections?.count);
      console.log('📊 Debug data projections values (first 5):', fullDebugWithPoseidon.projections?.values?.slice(0, 5));

      // Store enrollment result for download (all 3 stages) - COMPREHENSIVE
      const rawStats = {
        min: Math.min(...rawBiometricData),
        max: Math.max(...rawBiometricData),
        mean: rawBiometricData.reduce((a, b) => a + b, 0) / rawBiometricData.length,
        stdDev: Math.sqrt(rawBiometricData.reduce((a, b) => a + Math.pow(b - rawBiometricData.reduce((x, y) => x + y, 0) / rawBiometricData.length, 2), 0) / rawBiometricData.length),
      };

      // Binary template stats (128 bits, each 0 or 1)
      const templateStats = {
        min: Math.min(...capturedTemplate.template),
        max: Math.max(...capturedTemplate.template),
        uniqueValues: new Set(capturedTemplate.template).size,
        ones: capturedTemplate.template.filter((v: number) => v === 1).length,
        zeros: capturedTemplate.template.filter((v: number) => v === 0).length,
        totalBits: capturedTemplate.template.length,  // 128 for binary
      };

      // Compute comparison statistics for both methods
      const binaryOnes = binaryTemplate.template.filter((v: number) => v === 1).length;
      const binaryZeros = binaryTemplate.template.filter((v: number) => v === 0).length;
      const compactPositiveCount = compactTemplate.template.filter((v: number) => (v >> 3) === 1).length;
      const compactNegativeCount = compactTemplate.template.filter((v: number) => (v >> 3) === 0).length;
      const compactUniqueValues = new Set(compactTemplate.template).size;

      // Magnitude distribution for compact method
      const magnitudeDistribution = new Array(8).fill(0);
      compactTemplate.template.forEach((v: number) => {
        magnitudeDistribution[v & 0x07]++;
      });

      setEnrollmentResult({
        success: true,
        credentialId: credentialId,
        algorithm: algorithm,
        binarizationMethod: binarizationMethod,  // User-selected method (iom or signmag3bit)
        enrolledAt: new Date().toISOString(),

        // Stage 1: Raw biometric from face-api.js
        rawBiometric: {
          source: 'face-api-128d',
          dimensions: rawBiometricData.length,
          data: rawBiometricData,
          statistics: rawStats,
        },

        // Stage 2: After CancelableBiometric transformation (PRIMARY - used for storage)
        cancelableBiometricTemplate: {
          method: 'sign-mag-rank',
          encoding: '4-bit per value (Sign + Rank Mean-Centered, 0-8 symmetric, self-normalizing)',
          dimensions: capturedTemplate.template.length,
          data: Array.from(capturedTemplate.template),
          templateBytes: Array.from(capturedTemplate.templateBytes),
          bytesLength: capturedTemplate.templateBytes.length,
          algorithm: capturedTemplate.algorithm,
          statistics: templateStats,
          // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
          // No enrollment stats stored - each session computes its own mean/stdDev
        },

        // BINARIZATION COMPARISON: Both methods for analysis
        binarizationComparison: {
          binary: {
            method: 'binary',
            encoding: '1-bit (sign only)',
            dimensions: binaryTemplate.template.length,
            data: Array.from(binaryTemplate.template),
            templateBytes: Array.from(binaryTemplate.templateBytes),
            bytesLength: binaryTemplate.templateBytes.length,
            statistics: {
              ones: binaryOnes,
              zeros: binaryZeros,
              balance: `${(binaryOnes / 128 * 100).toFixed(1)}% ones`,
            },
          },
          compactSignMag: {
            method: 'compact-sign-mag',
            encoding: '4-bit (1 sign + 3 magnitude)',
            dimensions: compactTemplate.template.length,
            data: Array.from(compactTemplate.template),
            templateBytes: Array.from(compactTemplate.templateBytes),
            bytesLength: compactTemplate.templateBytes.length,
            statistics: {
              positiveCount: compactPositiveCount,
              negativeCount: compactNegativeCount,
              uniqueValues: compactUniqueValues,
              magnitudeDistribution: magnitudeDistribution,
            },
          },
        },

        // Intermediate: Projection values (raw_biometric × rand_matrix)
        projections: {
          count: debugData.projections?.count || capturedTemplate.intermediate?.projections?.length || 0,
          values: debugData.projections?.values || capturedTemplate.intermediate?.projections || [],
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

        // Stage 3: After Poseidon hashing
        poseidonAuthCommit: {
          count: commits.length,
          hashes: commits.map(c => c.toString()),
          nonce: nonce.toString(),
          version: credentialVersion,
        },

        // All Poseidon input parameters for debugging
        poseidonInputs,

        // Keys used (partial, for debugging - not full keys)
        keysUsed: {
          productKey: productPartialKey.substring(0, 16) + '...' + productPartialKey.substring(48),
          ztizenKey: ztizenPartialKey.substring(0, 16) + '...' + ztizenPartialKey.substring(48),
          userKeyFirstBytes: Array.from(userKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''),
          version: credentialVersion,
        },
      });

      console.log('💾 Step 3: Storing in database');
      setStatus('💾 Storing in database...');

      // Prepare enrollment data in the format the backend expects
      const enrollmentData = {
        credential_id: credentialId,  // Use snake_case to match backend
        auth_commit_quantization: commits.map(c => c.toString()),  // Array of BigInt strings
        auth_commit_gaussian: commits.map(c => c.toString()),  // Array of BigInt strings
        pin_hash: await hashPin(pin!), // SHA256 hash
        nonce: nonce.toString(),  // Convert BigInt to string
        version: credentialVersion, // Fetch from credential DB (matches verification)

        // Algorithm configuration for verification auto-detection
        algorithmConfig: {
          selectedAlgorithm: algorithm, // gaussian-sparse (Achlioptas/Chellappa)
          binarizationMethod: binarizationMethod, // User-selected: 'iom', 'signmag3bit', or 'sign-mag-rank'
          biometricSource: 'face-api-128d', // Track migration to face-api.js
          enrolledAt: new Date().toISOString(),
          templateSizes: {
            raw: biometricFloat32.length, // 128-dimensional vector (face-api.js descriptor)
            cancelable: capturedTemplate.template.length, // Cancelable template size
          },
          // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
          // No enrollment stats stored - each session computes its own mean/stdDev
          // This makes the system truly trustless (only Poseidon hashes stored)
          params: {},
        },
      };

      console.log('📤 Sending enrollment data:', {
        credential_id: enrollmentData.credential_id,
        commits_count: commits.length,
        nonce: enrollmentData.nonce,
      });

      // Track: Store started
      markStepComplete('commit');
      setSimulationStep('store');

      // Call enrollment API using the correct ZTIZEN service URL
      console.log('📡 Calling API:', API_ENDPOINTS.ztizen.enrollmentComplete());
      const response = await fetch(API_ENDPOINTS.ztizen.enrollmentComplete(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrollmentData),
      });

      console.log('📡 API response status:', response.status);

      if (!response.ok) {
        let errorMessage = 'Enrollment failed';
        try {
          const error = await response.json();
          console.error('❌ API error response:', error);
          errorMessage = error.error || errorMessage;
        } catch (e) {
          // Response is not JSON, use status text
          errorMessage = `${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ Enrollment successful:', result);

      // Track: Complete (simulation flow)
      markStepComplete('store');
      setSimulationStep('complete');

      // Track: Demo navigation progress
      setLastCredential(credentialId);
      completeDemoStep('enroll_complete');

      console.log('✅ Step 4: Setting status to complete');
      setStatus('✅ Enrollment complete!');
      setStep('complete');
      console.log('✅ currentStep should now be: complete');

      // NOTE: Don't reset enrollment here - keep data available for download
      // resetEnrollment() will be called when user clicks "Continue"

      // End metrics session on success
      useMetricsStore.getState().endSession();

    } catch (error) {
      console.error('❌ ═══════════════════════════════════════════════');
      console.error('❌ ENROLLMENT ERROR CAUGHT');
      console.error('❌ ═══════════════════════════════════════════════');
      console.error('Error object:', error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('❌ ═══════════════════════════════════════════════');
      setStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // End metrics session on error
      useMetricsStore.getState().endSession();
    } finally {
      console.log('🔄 Finally block: Setting loading to false');
      setLoading(false);
    }
  };

  // Helper: Hash PIN with SHA-256
  async function hashPin(pin: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Helper: Get template field name based on algorithm
  function getTemplateField(algo: string): string {
    if (algo === 'gaussian-basic') return 'gaussian';
    if (algo.includes('hybrid')) return 'hybrid';
    if (algo.includes('quantization')) return 'quantization';
    return 'gaussian';
  }

  console.log('🔍 Register-Scan Debug:', {
    currentStep,
    algorithm,
    hasUserKey: !!userKey,
    hasProductId: !!productId,
    isReady: isReady(),
    credentialId,
  });

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Flow Breadcrumb - Overall Progress */}
        <FlowBreadcrumb
          flow="enrollment"
          currentPhase={currentStep === 'complete' ? 'complete' : 'biometric'}
          currentStep={currentStep === 'complete' ? 1 : 1}
          totalSteps={currentStep === 'complete' ? 1 : 3}
          showStepLabel={currentStep !== 'complete'}
        />

        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>
            {currentStep === 'complete' ? 'Enrollment Complete' : 'Face Scan'}
          </h1>
          <p style={styles.subtitle}>
            {currentStep === 'complete'
              ? 'Your biometric identity has been securely registered'
              : 'Position your face in the frame for biometric capture'}
          </p>
        </div>

        {/* Processing Steps Info */}
        {currentStep === 'biometric' && !loading && (
          <div style={styles.processingInfoCard}>
            <h4 style={styles.processingInfoTitle}>What happens next:</h4>
            <ol style={styles.processingInfoList}>
              <li>Face capture using face-api.js (128D facial embedding)</li>
              <li>Key derivation (three-party: User + Service + Platform keys)</li>
              <li>Gaussian matrix generation with Gram-Schmidt orthogonalization</li>
              <li>Random projection and binarization (128-bit template)</li>
              <li>Poseidon hash commitments (128 individual hashes)</li>
              <li>Secure storage (only commitments stored, never raw biometric)</li>
            </ol>
          </div>
        )}

        {/* Status Display */}
        {status && currentStep !== 'complete' && (
          <div style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: status.includes('❌') ? '#fee' : '#f0f9ff',
            border: `1px solid ${status.includes('❌') ? '#fcc' : '#bae6fd'}`,
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: status.includes('❌') ? '#dc2626' : '#0369a1',
          }}>
            {status}
          </div>
        )}

        {/* Binarization Method Info (hardcoded to sign-mag-rank) */}
        {currentStep === 'biometric' && userKey && (
          <div style={styles.methodSelectorContainer}>
            <p style={styles.methodSelectorHint}>
              Using Sign + Magnitude-Rank binarization (128 bits, 0-8 symmetric quantization).
              Self-normalizing: session-specific statistics ensure consistency across captures.
              <br />
              <span style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem', display: 'block' }}>
                Paper: Teoh et al. IEEE TPAMI 2006 - Section 3.2 (Binarization Strategies)
              </span>
            </p>
          </div>
        )}

        {/* Biometric Capture */}
        {currentStep === 'biometric' && userKey && (
          <BiometricCapture
            stage="enrollment"
            onCaptureComplete={handleBiometricCaptured}
            onError={(error) => {
              setStatus(`Error: ${error.message}`);
              console.error('Biometric capture error:', error);
            }}
          />
        )}

        {/* Success State */}
        {currentStep === 'complete' && template && authCommits && enrollmentResult && (
          <div style={styles.successCard}>
            <div style={styles.successIcon}>✓</div>
            <h2 style={styles.successTitle}>Enrollment Complete</h2>
            <p style={styles.successText}>
              Your biometric has been securely registered.
            </p>

            {/* Full Debug Export Button - for analyzing projection pipeline */}
            {fullDebugData && (
              <button
                onClick={() => downloadResults(fullDebugData, `enrollment_debug_${credentialId}_${Date.now()}.json`)}
                style={{...styles.primaryButton, backgroundColor: '#059669', marginBottom: '0.75rem'}}
              >
                🔬 Download Full Debug Export
              </button>
            )}

            {/* Legacy Download Button */}
            <button
              onClick={() => downloadResults(enrollmentResult, `enrollment_${credentialId}_${Date.now()}.json`)}
              style={{...styles.primaryButton, backgroundColor: '#2563eb', marginBottom: '0.75rem'}}
            >
              📥 Download Enrollment Data
            </button>

            <button
              onClick={() => {
                resetEnrollment();
                navigate({ to: '/ztizen/me' });
              }}
              style={styles.primaryButton}
            >
              Continue
            </button>
          </div>
        )}

        {/* Error State */}
        {!isReady() && (
          <div style={styles.errorCard}>
            <p style={styles.errorText}>Please complete registration first.</p>
            <button
              onClick={() => navigate({ to: '/ztizen/register/$credentialId', params: { credentialId } })}
              style={styles.secondaryButton}
            >
              Back to Registration
            </button>
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div style={styles.loadingOverlay}>
            <div style={styles.loadingCard}>
              <div style={styles.spinner} />
              <p style={styles.loadingText}>Processing...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// iOS-style minimal styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  content: {
    maxWidth: '400px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#1a1a1a',
    margin: 0,
  },
  subtitle: {
    fontSize: '1rem',
    color: '#666',
    margin: '0.5rem 0 0 0',
  },
  processingInfoCard: {
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '1.5rem',
  },
  processingInfoTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#0369a1',
    margin: '0 0 0.5rem 0',
  },
  processingInfoList: {
    margin: 0,
    paddingLeft: '1.25rem',
    fontSize: '0.85rem',
    color: '#0c4a6e',
    lineHeight: 1.6,
  },
  // Binarization method selector styles
  methodSelectorContainer: {
    marginBottom: '1.5rem',
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    border: '1px solid #e5e5e5',
  },
  methodSelectorLabel: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#1a1a1a',
    marginBottom: '0.5rem',
  },
  methodSelector: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '0.95rem',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    outline: 'none',
  },
  methodSelectorHint: {
    fontSize: '0.8rem',
    color: '#666',
    margin: '0.5rem 0 0 0',
    lineHeight: 1.4,
  },
  successCard: {
    textAlign: 'center' as const,
    padding: '2rem 0',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#22c55e',
    color: '#fff',
    fontSize: '2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1.5rem',
  },
  successTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#1a1a1a',
    margin: '0 0 0.5rem 0',
  },
  successText: {
    fontSize: '1rem',
    color: '#666',
    margin: '0 0 2rem 0',
  },
  primaryButton: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#1a1a1a',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
  },
  secondaryButton: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#1a1a1a',
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
  },
  errorCard: {
    textAlign: 'center' as const,
    padding: '2rem',
  },
  errorText: {
    fontSize: '1rem',
    color: '#666',
    margin: '0 0 1.5rem 0',
  },
  loadingOverlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    textAlign: 'center' as const,
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #f0f0f0',
    borderTopColor: '#1a1a1a',
    borderRadius: '50%',
    margin: '0 auto 1rem',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '1rem',
    color: '#1a1a1a',
    margin: 0,
  },
};
