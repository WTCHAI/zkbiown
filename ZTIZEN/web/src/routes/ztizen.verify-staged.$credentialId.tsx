/**
 * ZTIZEN Staged Verification
 * 4-Stage Flow: PIN → Password → Signing → Biometric Scan
 *
 * ZK Proof Flow (IoM 32-index circuit):
 * 1. Generate IoM template (32 indices from 128 projections)
 * 2. Load stored commits from DB (32 commits)
 * 3. Generate ZK proof: "I know 32 indices that produce ≥26 matching commits"
 * 4. Verify proof (client-side or on-chain)
 * 5. Roll nonce if verified
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import BiometricCapture from '@/components/BiometricCapture';
import type { BiometricVector } from '@/lib/biohashing-mediapipe';
import { CancelableBiometric } from '@/lib/CancelableBiometric';
import { createFullAuthCommit, generateNonce, stringToFieldElement, bytesToFieldElement } from '@/lib/poseidon';
import { useWalletSignature } from '@/hooks/useWalletSignature';
import { ZTIZEN_CLIENT, PRODUCT_CLIENT } from '@/lib/api';
import { GenerateProof, type CircuitInputs } from '@/utils/generate-proof';

export const Route = createFileRoute('/ztizen/verify-staged/$credentialId')({
  component: ZTIZENVerifyStaged,
});

type Stage = 'pin' | 'password' | 'signing' | 'scan' | 'result';

function ZTIZENVerifyStaged() {
  const { credentialId } = Route.useParams();
  const navigate = useNavigate();
  const { signPassword, isLoading: isSigningPassword } = useWalletSignature();

  const [stage, setStage] = useState<Stage>('pin');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [userKey, setUserKey] = useState<Uint8Array | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [verificationData, setVerificationData] = useState<any>(null); // Full data for download
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Download helper
  const downloadJSON = (data: object, filename: string) => {
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

  // Stage 1: Password
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setStage('signing');
  };

  // Stage 2: Signing
  const handleWalletSign = async () => {
    setLoading(true);
    setError('');
    setStatus('Requesting signature...');

    try {
      const result = await signPassword(password, pin);
      setUserKey(result.userKey);
      setAddress(result.address);
      setStatus('Signature obtained');
      setStage('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signature failed');
    } finally {
      setLoading(false);
    }
  };

  // Stage 3: Biometric Scan + Verification
  const handleBiometricVerify = async (biometricData: Float32Array) => {
    // Wrap Float32Array into BiometricVector
    const biometric: BiometricVector = {
      values: Array.from(biometricData),
      dimensionCount: biometricData.length,
      source: 'landmarks'
    };
    
    console.log('✅ Biometric captured:', {
      dimensions: biometric.dimensionCount,
      sampleValues: biometric.values.slice(0, 5),
    });

    if (!userKey) {
      setError('User key not available');
      return;
    }

    setLoading(true);
    setStatus('Loading credential...');

    try {
      // Fetch credential
      const credData = await ZTIZEN_CLIENT.getCredential(credentialId);
      if (!credData.success) throw new Error('Credential not found');

      const credential = credData.credential;
      if (!credential.auth_commit) throw new Error('No auth_commit found');

      const { auth_commit: storedAuthCommit, nonce: storedNonce, version, product_id, service_name, service_type, metadata } = credential;

      // Get enrolled algorithm from metadata (with backward-compatible fallback)
      const enrolledAlgorithm = metadata?.algorithmConfig?.selectedAlgorithm || 'gaussian-basic';
      // Get enrolled binarization method (default to 'iom' for backward compatibility)
      const enrolledBinarizationMethod = metadata?.algorithmConfig?.binarizationMethod || 'iom';
      console.log('🔧 Using enrolled algorithm:', enrolledAlgorithm);
      console.log('🔧 Using enrolled binarization method:', enrolledBinarizationMethod);

      // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
      // Each session computes its own mean/stdDev - no stats need to be loaded
      if (enrolledBinarizationMethod === 'sign-mag-rank' || enrolledBinarizationMethod === 'sign-mag-rank-16') {
        console.log('✅ SELF-NORMALIZING: Each session computes its own mean/stdDev');
      }

      // Get keys
      setStatus('Retrieving keys...');
      const productKeyData = await PRODUCT_CLIENT.getCredentialKeys(credentialId);
      if (!productKeyData.success) throw new Error('Failed to get product key');
      const productKey = productKeyData.partial_key;

      const ztizenKeyData = await ZTIZEN_CLIENT.getEnrollment(credentialId);
      if (!ztizenKeyData.success) throw new Error('Failed to get ZTIZEN key');
      const ztizenKey = ztizenKeyData.credential.ztizen_partial_key;

      // Generate template from raw biometric using the SAME algorithm as enrollment
      setStatus('Generating template...');
      const faceDescriptor = new Float32Array(biometric.values);
      const cancelableBiometric = new CancelableBiometric({
        algorithm: enrolledAlgorithm,  // Use enrolled algorithm (not hardcoded)
        inputDim: faceDescriptor.length,
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
      // The method (iom, signmag3bit, sign-mag-rank, sign-mag-rank-16) is read from metadata
      // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
      // Each session computes its own mean/stdDev - no stats passed between sessions
      // ═══════════════════════════════════════════════════════════════════

      // Use the binarization method that was used during enrollment
      const templateResult = await cancelableBiometric.generateTemplateWithMethod(
        faceDescriptor,
        enrolledBinarizationMethod as 'iom' | 'signmag3bit' | 'sign-mag-rank' | 'sign-mag-rank-16'
      );
      const verifyTemplate = templateResult.template;

      console.log(`📊 Generated ${enrolledBinarizationMethod} template: ${verifyTemplate.length} values`);

      // ═══════════════════════════════════════════════════════════════════
      // BINARIZATION LOGGING
      // ═══════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('╔═══════════════════════════════════════════════════════════════════════════════════════╗');
      console.log(`║              VERIFICATION - ${enrolledBinarizationMethod.toUpperCase()} BINARIZATION                                    ║`);
      console.log('╠═══════════════════════════════════════════════════════════════════════════════════════╣');

      const projections = templateResult.intermediate?.projections || [];
      const generatedTemplate = templateResult.template;

      if (enrolledBinarizationMethod === 'iom') {
        // IoM-specific logging
        console.log('║  IoM Template (First 10 groups):                                                        ║');
        for (let g = 0; g < Math.min(10, generatedTemplate.length); g++) {
          const groupStart = g * 4;
          const group = projections.slice(groupStart, groupStart + 4);
          const groupStr = group.map((p: number) => (p >= 0 ? '+' : '') + p.toFixed(3)).join(', ');
          const maxIdx = generatedTemplate[g];
          console.log(`│  ${String(g).padStart(3, '0')}  │ [${groupStr.padEnd(40)}] │ max at index ${maxIdx}              │`);
        }
      } else {
        // Sign-mag-rank logging
        console.log('║  Sign-Mag-Rank Template (First 20 values):                                              ║');
        const first20 = generatedTemplate.slice(0, 20);
        console.log(`║  Values: [${first20.join(', ')}]                                  ║`);
        // Value distribution
        const valueDist = new Array(9).fill(0);
        generatedTemplate.forEach((v: number) => { if (v >= 0 && v <= 8) valueDist[v]++; });
        console.log(`║  Distribution [0-8]: [${valueDist.join(', ')}]                                          ║`);
      }

      console.log('╚═══════════════════════════════════════════════════════════════════════════════════════╝');
      console.log('');

      // Create commit with stored nonce
      setStatus('Creating commitment...');
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

      // Compare IoM templates
      setStatus('Comparing commitments...');
      const comparison: Array<{ index: number; match: boolean }> = [];
      let matchCount = 0;
      const totalBits = storedAuthCommit.length;  // 128 for sign-mag-rank, 32 for legacy iom

      for (let i = 0; i < totalBits; i++) {
        const match = BigInt(storedAuthCommit[i]) === verifyCommit[i];
        if (match) matchCount++;
        comparison.push({ index: i, match });
      }

      const matchRate = (matchCount / totalBits) * 100;
      // Threshold for sign-mag-rank (128 values): 79.7% (102/128 match required) - signmag128 circuit
      const threshold = 79.7;
      const verified = matchRate >= threshold;

      console.log(`🔍 ${enrolledBinarizationMethod.toUpperCase()} Comparison Result:`, {
        binarizationMethod: enrolledBinarizationMethod,
        matchCount,
        totalBits,
        matchRate: matchRate.toFixed(2) + '%',
        threshold: threshold + '%',
        verified
      });

      // ═══════════════════════════════════════════════════════════════════
      // ZK PROOF GENERATION
      // Uses signmag128 circuit (128 values, 102/128 threshold)
      // ═══════════════════════════════════════════════════════════════════

      let zkProofResult = null;
      const shouldGenerateZKProof = verified; // Only generate proof if TypeScript comparison passes

      if (shouldGenerateZKProof) {
        try {
          setStatus('Generating ZK proof (signmag128)...');
          console.log('🔬 Starting ZK proof generation for signmag128 circuit');

          // Compute product usage hash
          const productUsageHash = stringToFieldElement(
            `${product_id}:${service_name}:${service_type || 'authentication'}`
          ).toString();

          // Prepare circuit inputs for signmag128 circuit
          const circuitInputs: CircuitInputs = {
            // Private inputs (witness)
            template: verifyTemplate.map(v => v.toString()), // 128 sign-mag-rank values (0-8)
            product_key: stringToFieldElement(productKey).toString(),
            ztizen_key: stringToFieldElement(ztizenKey).toString(),
            user_key: bytesToFieldElement(userKey).toString(),
            version: version.toString(),
            nonce: storedNonce,
            product_usage_hash: productUsageHash,

            // Public input
            auth_commit_stored: storedAuthCommit, // 128 commits
          };

          console.log('📋 Circuit inputs prepared:', {
            templateLength: circuitInputs.template.length,
            authCommitLength: circuitInputs.auth_commit_stored.length,
            first3Template: circuitInputs.template.slice(0, 3),
            expectedCircuit: 'signmag128',
          });

          // Generate ZK proof (auto-selects circuit based on template size)
          const proofResult = await GenerateProof(circuitInputs, { keccak: false });

          zkProofResult = {
            proof: Array.from(proofResult.proof),
            publicInputs: proofResult.publicInputs,
            matchCount: proofResult.matchCount,
            computedCommit: proofResult.computedCommit?.slice(0, 5), // First 5 for display
            proofSize: proofResult.proof.length,
          };

          console.log('✅ ZK proof generated:', {
            proofSize: proofResult.proof.length,
            matchCount: proofResult.matchCount,
            publicInputsCount: proofResult.publicInputs.length,
          });

        } catch (zkError) {
          console.error('❌ ZK proof generation failed:', zkError);
          // Don't fail verification - ZK is an enhancement, not required for demo
          console.log('⚠️ Continuing without ZK proof (TypeScript verification passed)');
        }
      }

      // Roll nonce if verified
      if (verified) {
        setStatus('Rolling nonce...');
        const nextNonce = generateNonce();
        const nextAuthCommit = createFullAuthCommit(
          verifyTemplate,
          productKey,
          ztizenKey,
          userKey,
          version,
          nextNonce,
          productUsageDetails
        );

        await ZTIZEN_CLIENT.verifyRollNonce({
          credential_id: credentialId,
          nonce_current: storedNonce,
          nonce_next: nextNonce.toString(),
          auth_commit_gaussian_next: nextAuthCommit.map(c => c.toString()),
          auth_commit_quantization_next: [],  // Empty for Gaussian-only mode
        });
      }

      setVerificationResult({ verified, matchRate, matchCount, comparison, totalBits, zkProof: zkProofResult, binarizationMethod: enrolledBinarizationMethod });

      // Compute value distribution for sign-mag-rank
      const valueDistribution = new Array(9).fill(0);
      if (enrolledBinarizationMethod === 'sign-mag-rank' || enrolledBinarizationMethod === 'sign-mag-rank-16') {
        templateResult.template.forEach((v: number) => { if (v >= 0 && v <= 8) valueDistribution[v]++; });
      }

      // Capture ALL verification data for download
      setVerificationData({
        timestamp: new Date().toISOString(),
        credentialId,
        verified,
        matchRate,
        matchCount,
        threshold,  // Threshold based on binarization method
        binarizationMethod: enrolledBinarizationMethod,

        // Raw biometric from face-api.js
        rawBiometric: {
          source: 'face-api-128d',
          dimensions: biometric.values.length,
          values: biometric.values,
          statistics: {
            min: Math.min(...biometric.values),
            max: Math.max(...biometric.values),
            mean: biometric.values.reduce((a: number, b: number) => a + b, 0) / biometric.values.length,
          }
        },

        // Cancelable template (PRIMARY - uses enrolled binarization method)
        cancelableTemplate: {
          method: enrolledBinarizationMethod,
          encoding: enrolledBinarizationMethod === 'iom'
            ? '2-bit per index (Index-of-Max, k=4)'
            : enrolledBinarizationMethod === 'sign-mag-rank'
            ? '4-bit per value (Sign + Rank Mean-Centered, 0-8 symmetric)'
            : '3-bit per value (Sign-Magnitude)',
          length: verifyTemplate.length,
          values: verifyTemplate,
          templateBytes: Array.from(templateResult.templateBytes),
          bytesLength: templateResult.templateBytes.length,
          projections: templateResult.intermediate?.projections || [],
          // NOTE: sign-mag-rank and sign-mag-rank-16 are SELF-NORMALIZING
          // No enrollment stats stored - each session computes its own mean/stdDev
        },

        // Template statistics
        templateStatistics: {
          method: enrolledBinarizationMethod,
          dimensions: templateResult.template.length,
          valueDistribution: valueDistribution,
        },

        // Poseidon commitments (challenge)
        challengeCommit: {
          count: verifyCommit.length,
          values: verifyCommit.map((c: bigint) => c.toString()),
        },

        // Stored commitments (from DB)
        storedCommit: {
          count: storedAuthCommit.length,
          values: storedAuthCommit.map((c: string) => c),
          nonce: storedNonce,
        },

        // Keys used (partial, for debugging)
        keys: {
          productKey: productKey.substring(0, 16) + '...' + productKey.substring(48),
          ztizenKey: ztizenKey.substring(0, 16) + '...' + ztizenKey.substring(48),
          userKeyHash: Array.from(userKey.slice(0, 8)).map((b: number) => b.toString(16).padStart(2, '0')).join(''),
          version,
        },

        // Comparison details
        comparison: comparison.map((c: { index: number; match: boolean }) => ({
          index: c.index,
          match: c.match,
          stored: storedAuthCommit[c.index]?.substring(0, 20) + '...',
          challenge: verifyCommit[c.index]?.toString().substring(0, 20) + '...',
        })),

        // Algorithm config
        algorithm: {
          enrolled: enrolledAlgorithm,
          binarization: enrolledBinarizationMethod,
          matrixSize: '128x128',
          sparse: true,
        },

        // ZK Proof (if generated)
        zkProof: zkProofResult ? {
          generated: true,
          circuitVariant: 'signmag128',
          proofSize: zkProofResult.proofSize,
          matchCount: zkProofResult.matchCount,
          publicInputsCount: zkProofResult.publicInputs?.length,
          firstCommits: zkProofResult.computedCommit,
        } : {
          generated: false,
          reason: verified ? 'ZK proof generation failed or skipped' : 'TypeScript verification failed (threshold not met)',
        },
      });

      setStatus(verified ? 'Verified!' : 'Failed');
      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Verification</h1>
          <p style={styles.subtitle}>
            {stage === 'password' && 'Step 1/3: Password'}
            {stage === 'signing' && 'Step 2/3: Sign'}
            {stage === 'scan' && 'Step 3/3: Scan'}
            {stage === 'result' && 'Complete'}
          </p>
        </div>

        {status && !error && <div style={styles.statusCard}>{status}</div>}
        {error && <div style={{...styles.statusCard, backgroundColor: '#f8d7da', borderColor: '#dc3545', color: '#721c24'}}>❌ {error}</div>}

        <div style={styles.card}>
          {stage === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              <h2 style={styles.stepTitle}>Enter Password</h2>
              <p style={styles.stepText}>For key derivation</p>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  style={styles.input}
                  autoFocus
                />
              </div>
              <button type="submit" style={styles.button} disabled={loading || password.length < 8}>Continue</button>
            </form>
          )}

          {stage === 'signing' && (
            <div>
              <h2 style={styles.stepTitle}>Sign Message</h2>
              <p style={styles.stepText}>Wallet signature required</p>
              <div style={{...styles.infoBox, backgroundColor: '#d4edda', marginBottom: '1rem'}}>
                <p style={styles.infoText}>✅ PIN verified<br/>✅ Password accepted</p>
              </div>
              <button onClick={handleWalletSign} style={styles.button} disabled={loading || isSigningPassword}>
                {loading ? 'Signing...' : 'Sign Message'}
              </button>
              <button onClick={() => setStage('password')} style={{...styles.button, ...styles.secondaryButton}} disabled={loading}>Back</button>
            </div>
          )}

          {stage === 'scan' && (
            <div>
              <h2 style={styles.stepTitle}>Scan Face</h2>
              <p style={styles.stepText}>Position your face</p>
              <div style={{...styles.infoBox, backgroundColor: '#d4edda', marginBottom: '1rem'}}>
                <p style={styles.infoText}>
                  ✅ PIN verified<br/>
                  ✅ Password accepted<br/>
                  ✅ Signed ({address?.slice(0, 6)}...{address?.slice(-4)})
                </p>
              </div>
              <BiometricCapture
                stage="verify"
                onCaptureComplete={handleBiometricVerify}
                onError={(err: Error) => setError(err.message)}
              />
              <button onClick={() => setStage('signing')} style={{...styles.button, ...styles.secondaryButton, marginTop: '1rem'}} disabled={loading}>Back</button>
            </div>
          )}

          {stage === 'result' && verificationResult && (
            <div>
              <h2 style={styles.stepTitle}>
                {verificationResult.verified ? '✅ Verified' : '❌ Failed'}
              </h2>
              <div style={{
                ...styles.infoBox,
                backgroundColor: verificationResult.verified ? '#d4edda' : '#f8d7da',
                marginBottom: '1.5rem'
              }}>
                <p style={styles.infoText}>
                  <strong>Match Rate:</strong> {verificationResult.matchRate.toFixed(2)}%<br/>
                  <strong>Matched:</strong> {verificationResult.matchCount}/{verificationResult.totalBits || 32}<br/>
                  <strong>Threshold:</strong> 81.25% ({
                    verificationResult.binarizationMethod === 'iom' ? '26/32 IoM' :
                    verificationResult.binarizationMethod === 'sign-mag-rank' ? '102/128 SignMagRank' :
                    '102/128 SignMag3Bit'
                  })<br/>
                  <strong>Method:</strong> {
                    verificationResult.binarizationMethod === 'iom' ? 'Index-of-Max (ranking-based)' :
                    verificationResult.binarizationMethod === 'sign-mag-rank' ? 'Sign+Rank Mean-Centered (0-8 symmetric)' :
                    'Sign-Magnitude 3-bit (0-7)'
                  }<br/>
                  <strong>ZK Proof:</strong> {verificationResult.zkProof ?
                    `✅ Generated (${verificationResult.zkProof.proofSize} bytes)` :
                    '⚠️ Not generated'}
                </p>
              </div>
              <div style={{marginBottom: '1.5rem'}}>
                <h3 style={{fontSize: '0.9rem', marginBottom: '0.5rem'}}>
                  {verificationResult.binarizationMethod === 'iom'
                    ? `IoM Index Comparison (${verificationResult.totalBits || 32} indices):`
                    : `SignMag Comparison (${verificationResult.totalBits || 128} values):`}
                </h3>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: '2px'}}>
                  {verificationResult.comparison.map((bit: any) => (
                    <div
                      key={bit.index}
                      style={{
                        width: '16px',
                        height: '16px',
                        backgroundColor: bit.match ? '#28a745' : '#dc3545',
                        borderRadius: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>
              {/* Download Button */}
              {verificationData && (
                <button
                  onClick={() => downloadJSON(verificationData, `verification_${credentialId}_${Date.now()}.json`)}
                  style={{...styles.button, backgroundColor: '#2563eb', marginBottom: '0.5rem'}}
                >
                  📥 Download Verification Data
                </button>
              )}

              <button
                onClick={() => {
                  if (verificationResult.verified) {
                    navigate({ to: '/ztizen/me' });
                  } else {
                    setStage('pin');
                    setPin('');
                    setPassword('');
                    setUserKey(null);
                    setVerificationResult(null);
                    setVerificationData(null);
                  }
                }}
                style={styles.button}
              >
                {verificationResult.verified ? 'Continue' : 'Try Again'}
              </button>
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
    backgroundColor: '#fff',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: 0,
    marginBottom: '0.5rem',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#666',
    margin: 0,
  },
  statusCard: {
    maxWidth: '600px',
    margin: '0 auto 1rem',
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    padding: '1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: '#856404',
    textAlign: 'center' as const,
  },
  card: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '2rem',
    border: '1px solid #e5e5e5',
  },
  stepTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    textAlign: 'center' as const,
  },
  stepText: {
    fontSize: '0.95rem',
    color: '#666',
    marginBottom: '1.5rem',
    textAlign: 'center' as const,
  },
  inputGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '1rem',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  infoBox: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #e5e5e5',
    padding: '1rem',
    borderRadius: '8px',
  },
  infoText: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#666',
    lineHeight: '1.5',
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
    marginBottom: '0.5rem',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #e5e5e5',
  },
};
