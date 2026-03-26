/**
 * ZTIZEN Verification with Traditional + ZK Proof Comparison
 * Shows both off-chain traditional comparison and ZK proof results
 */

import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import BiometricCapture from '@/components/BiometricCapture';
import { PINInput } from '@/components/PINInput';
import type { BiometricVector } from '@/lib/biohashing-mediapipe';
import { CancelableBiometric } from '@/lib/CancelableBiometric';
import { createFullAuthCommit, generateNonce, stringToFieldElement, bytesToFieldElement } from '@/lib/poseidon';
import { useWalletSignature } from '@/hooks/useWalletSignature';
import { useZKProof } from '@/hooks/useZKProof';
import { ZTIZEN_CLIENT, PRODUCT_CLIENT } from '@/lib/api';

type Stage = 'pin' | 'password' | 'signing' | 'scan' | 'result';

interface VerificationResult {
  // Traditional off-chain results
  traditional: {
    verified: boolean;
    matchRate: number;
    matchCount: number;
    comparison: Array<{ index: number; match: boolean }>;
  };
  // ZK proof results
  zkProof: {
    matchCount: number;
    verified: boolean; // From circuit assertion
    proof: Uint8Array;
    publicInputs: string[];
  } | null;
}

export function ZTIZENVerifyWithComparisonZK({
  credentialId,
  serviceName,
  returnUrl,
}: {
  credentialId: string;
  serviceName?: string;
  returnUrl?: string;
}) {
  const navigate = useNavigate();
  const { signPassword, isLoading: isSigningPassword } = useWalletSignature();
  const { generateProof, isGenerating: isGeneratingProof } = useZKProof();

  const [stage, setStage] = useState<Stage>('pin');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [userKey, setUserKey] = useState<Uint8Array | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [credentialInfo, setCredentialInfo] = useState<any>(null);

  // Load credential info
  useEffect(() => {
    const loadCredential = async () => {
      try {
        setLoading(true);
        const data = await ZTIZEN_CLIENT.getCredential(credentialId);
        if (data.success) {
          setCredentialInfo(data.credential);
        }
      } catch (err) {
        console.error('Failed to load credential:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCredential();
  }, [credentialId]);

  const handlePinContinue = async () => {
    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Verifying PIN...');

    try {
      const data = await ZTIZEN_CLIENT.verifyPinOnly({
        credential_id: credentialId,
        pin_hash: pin,
      });

      if (!data.success) throw new Error(data.message || 'Invalid PIN');

      setStatus('');
      setStage('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PIN');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordContinue = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
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
      setStage('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signature failed');
      setStatus('');
    }
  };

  const handleBiometricVerify = async (biometricData: Float32Array) => {
    if (!userKey) {
      setError('User key not available');
      return;
    }

    setStatus('Verifying...');

    try {
      // Fetch credential
      const credData = await ZTIZEN_CLIENT.getCredential(credentialId);
      if (!credData.success) throw new Error('Credential not found');

      const credential = credData.credential;
      if (!credential.auth_commit) throw new Error('No auth_commit found');

      const { auth_commit: storedAuthCommit, nonce: storedNonce, version, product_id, service_name, service_type } = credential;

      // Get keys
      setStatus('Retrieving keys...');
      const productKeyData = await PRODUCT_CLIENT.getCredentialKeys(credentialId);
      if (!productKeyData.success) throw new Error('Failed to get product key');
      const productKey = productKeyData.partial_key;

      const ztizenKeyData = await ZTIZEN_CLIENT.getEnrollment(credentialId);
      if (!ztizenKeyData.success) throw new Error('Failed to get ZTIZEN key');
      const ztizenKey = ztizenKeyData.credential.ztizen_partial_key;

      // Generate template
      setStatus('Generating template...');
      const faceDescriptor = biometricData; // Already Float32Array from BiometricCapture
      const cancelableBiometric = new CancelableBiometric({
        algorithm: 'gaussian-sparse',
        inputDim: faceDescriptor.length,
        productKey,
        ztizenKey,
        userKey,
        version,
        params: {
          thresholdScale: 1.4, // ±0.70σ quantization (optimized for face-api.js 128D)
        },
      });
      const { template: verifyTemplate } = await cancelableBiometric.generateTemplate(faceDescriptor);

      const productUsageDetails = {
        product_id,
        service_id: service_name,
        service_type: service_type || 'authentication',
      };

      // Create auth_commit for traditional comparison
      setStatus('Creating commitment...');
      const verifyCommit = createFullAuthCommit(
        verifyTemplate,
        productKey,
        ztizenKey,
        userKey,
        version,
        BigInt(storedNonce),
        productUsageDetails
      );

      // ===== TRADITIONAL OFF-CHAIN COMPARISON =====
      setStatus('Comparing (Traditional)...');
      const comparison: Array<{ index: number; match: boolean }> = [];
      let traditionalMatchCount = 0;

      for (let i = 0; i < 128; i++) {
        const match = BigInt(storedAuthCommit[i]) === verifyCommit[i];
        if (match) traditionalMatchCount++;
        comparison.push({ index: i, match });
      }

      const traditionalMatchRate = (traditionalMatchCount / 128) * 100;
      const traditionalVerified = traditionalMatchRate >= 89.8;

      // ===== ZK PROOF GENERATION =====
      setStatus('Generating ZK Proof...');
      let zkResult = null;

      try {
        // Prepare inputs for circuit
        const productUsageHash = stringToFieldElement(
          `${product_id}:${service_name}:${service_type || 'authentication'}`
        );

        const circuitInputs = {
          template: verifyTemplate.map((v: number) => v.toString()),
          product_key: stringToFieldElement(productKey).toString(),
          ztizen_key: stringToFieldElement(ztizenKey).toString(),
          user_key: bytesToFieldElement(userKey).toString(),
          version: version.toString(),
          nonce: storedNonce, // Now generated within field modulus
          product_usage_hash: productUsageHash.toString(),
          auth_commit_stored: storedAuthCommit.map((v: string) => v.toString()),
        };

        console.log('🔍 Circuit inputs prepared:', {
          nonce: storedNonce,
          templateLength: verifyTemplate.length,
          authCommitLength: storedAuthCommit.length,
        });

        const proofResult = await generateProof(circuitInputs);

        zkResult = {
          matchCount: proofResult.matchCount || 0,
          verified: (proofResult.matchCount || 0) >= 109, // Circuit threshold
          proof: proofResult.proof,
          publicInputs: proofResult.publicInputs,
        };

        console.log('✅ ZK Proof generated:', {
          matchCount: zkResult.matchCount,
          verified: zkResult.verified,
        });
      } catch (zkError) {
        console.error('❌ ZK Proof generation failed:', zkError);
        setError('ZK Proof generation failed (continuing with traditional verification)');
        // Continue with traditional verification even if ZK fails
      }

      // ===== NONCE ROLLING (if verified) =====
      if (traditionalVerified) {
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

      // Set combined results
      setVerificationResult({
        traditional: {
          verified: traditionalVerified,
          matchRate: traditionalMatchRate,
          matchCount: traditionalMatchCount,
          comparison,
        },
        zkProof: zkResult,
      });

      setStatus('');
      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setStatus('');
    }
  };

  const handleBack = () => {
    setError('');
    setStatus('');
    const stages: Stage[] = ['pin', 'password', 'signing', 'scan'];
    const currentIndex = stages.indexOf(stage);
    if (currentIndex > 0) {
      setStage(stages[currentIndex - 1]);
    }
  };

  const getServiceIcon = (serviceName: string) => {
    const name = serviceName.toLowerCase();
    if (name.includes('login') || name.includes('auth')) return '🚪';
    if (name.includes('balance') || name.includes('account')) return '💰';
    if (name.includes('transfer') || name.includes('send')) return '💸';
    if (name.includes('payment') || name.includes('pay')) return '💳';
    if (name.includes('profile') || name.includes('user')) return '👤';
    return '👆';
  };

  if (loading && !credentialInfo) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Identity Card */}
      {credentialInfo && (
        <div style={styles.identityCard}>
          <div style={styles.logo}>{getServiceIcon(credentialInfo.service_name || serviceName || '')}</div>
          <div style={styles.identityInfo}>
            <div style={styles.identityName}>{credentialInfo.product_name || 'ZTIZEN Credential'}</div>
            <div style={styles.identitySubtext}>{credentialInfo.service_name || serviceName || 'Verification'}</div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div style={styles.progressBar}>
        <div
          style={{
            ...styles.progressFill,
            width:
              stage === 'pin'
                ? '20%'
                : stage === 'password'
                  ? '40%'
                  : stage === 'signing'
                    ? '60%'
                    : stage === 'scan'
                      ? '80%'
                      : '100%',
          }}
        />
      </div>

      {/* Status Messages */}
      {status && !error && (
        <div style={styles.statusCard}>
          {isGeneratingProof ? '🔄 Generating ZK Proof...' : status}
        </div>
      )}
      {error && (
        <div style={{ ...styles.statusCard, backgroundColor: '#f8d7da', borderColor: '#dc3545', color: '#721c24' }}>
          ❌ {error}
        </div>
      )}

      {/* Main Card */}
      <div style={styles.card}>
        {/* PIN Stage */}
        {stage === 'pin' && (
          <div>
            <h2 style={styles.stepTitle}>Enter PIN</h2>
            <p style={styles.stepText}>Step 1/4: Enter your 6-digit PIN</p>
            <PINInput value={pin} onChange={setPin} length={6} />
            <button
              onClick={handlePinContinue}
              style={styles.button}
              disabled={loading || pin.length !== 6}
            >
              {loading ? 'Verifying...' : 'Continue'}
            </button>
          </div>
        )}

        {/* Password Stage */}
        {stage === 'password' && (
          <div>
            <h2 style={styles.stepTitle}>Enter Password</h2>
            <p style={styles.stepText}>Step 2/4: Enter your password</p>
            <div style={{ ...styles.summaryCard, backgroundColor: '#d4edda', marginBottom: '1rem' }}>
              <p style={styles.summaryText}>✅ PIN verified</p>
            </div>
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
            <button onClick={handlePasswordContinue} style={styles.button} disabled={password.length < 8}>
              Continue
            </button>
            <button onClick={handleBack} style={{ ...styles.button, ...styles.secondaryButton }}>
              Back
            </button>
          </div>
        )}

        {/* Signing Stage */}
        {stage === 'signing' && (
          <div>
            <h2 style={styles.stepTitle}>Sign Message</h2>
            <p style={styles.stepText}>Step 3/4: Sign with your wallet</p>
            <div style={{ ...styles.summaryCard, backgroundColor: '#d4edda', marginBottom: '1rem' }}>
              <p style={styles.summaryText}>
                ✅ PIN verified
                <br />✅ Password accepted
              </p>
            </div>
            <button
              onClick={handleWalletSign}
              style={styles.button}
              disabled={isSigningPassword}
            >
              {isSigningPassword ? 'Signing...' : 'Sign with Wallet'}
            </button>
            <button onClick={handleBack} style={{ ...styles.button, ...styles.secondaryButton }} disabled={isSigningPassword}>
              Back
            </button>
          </div>
        )}

        {/* Scan Stage */}
        {stage === 'scan' && (
          <div>
            <h2 style={styles.stepTitle}>Scan Face</h2>
            <p style={styles.stepText}>Step 4/4: Position your face in the camera</p>
            <div style={{ ...styles.summaryCard, backgroundColor: '#d4edda', marginBottom: '1rem' }}>
              <p style={styles.summaryText}>
                ✅ PIN verified
                <br />✅ Password accepted
                <br />✅ Signed ({address?.slice(0, 6)}...{address?.slice(-4)})
              </p>
            </div>
            <BiometricCapture
              stage="verify"
              onCaptureComplete={handleBiometricVerify}
              onError={(err: Error) => setError(err.message)}
            />
            <button onClick={handleBack} style={{ ...styles.button, ...styles.secondaryButton, marginTop: '1rem' }}>
              Back
            </button>
          </div>
        )}

        {/* Results Stage */}
        {stage === 'result' && verificationResult && (
          <div>
            <h2 style={styles.stepTitle}>
              {verificationResult.traditional.verified ? '✅ Verified' : '❌ Failed'}
            </h2>

            {/* Traditional Comparison Results */}
            <div style={styles.resultSection}>
              <h3 style={styles.resultTitle}>🔍 Traditional Comparison (Off-Chain)</h3>
              <div
                style={{
                  ...styles.summaryCard,
                  backgroundColor: verificationResult.traditional.verified ? '#d4edda' : '#f8d7da',
                  marginBottom: '1rem',
                }}
              >
                <p style={styles.summaryText}>
                  <strong>Match Rate:</strong> {verificationResult.traditional.matchRate.toFixed(2)}%
                  <br />
                  <strong>Matched:</strong> {verificationResult.traditional.matchCount}/128
                  <br />
                  <strong>Threshold:</strong> 89.8%
                  <br />
                  <strong>Status:</strong> {verificationResult.traditional.verified ? '✅ PASS' : '❌ FAIL'}
                </p>
              </div>

              {/* 128-bit Visualization */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>128-bit Comparison:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: '2px' }}>
                  {verificationResult.traditional.comparison.map((bit) => (
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
            </div>

            {/* ZK Proof Results */}
            {verificationResult.zkProof && (
              <div style={styles.resultSection}>
                <h3 style={styles.resultTitle}>🔐 ZK Proof Results (Circuit)</h3>
                <div
                  style={{
                    ...styles.summaryCard,
                    backgroundColor: verificationResult.zkProof.verified ? '#d4edda' : '#f8d7da',
                    marginBottom: '1rem',
                  }}
                >
                  <p style={styles.summaryText}>
                    <strong>Match Count:</strong> {verificationResult.zkProof.matchCount}/128
                    <br />
                    <strong>Match Rate:</strong> {((verificationResult.zkProof.matchCount / 128) * 100).toFixed(2)}%
                    <br />
                    <strong>Circuit Threshold:</strong> 109/128 (85.2%)
                    <br />
                    <strong>Status:</strong> {verificationResult.zkProof.verified ? '✅ PASS' : '❌ FAIL'}
                    <br />
                    <strong>Proof Size:</strong> {verificationResult.zkProof.proof.length} bytes
                  </p>
                </div>

                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#666' }}>
                    Show Proof Details
                  </summary>
                  <div style={{ ...styles.summaryCard, marginTop: '0.5rem', maxHeight: '200px', overflow: 'auto' }}>
                    <p style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      <strong>Public Inputs ({verificationResult.zkProof.publicInputs.length}):</strong>
                      <br />
                      {verificationResult.zkProof.publicInputs.slice(0, 3).map((input, i) => (
                        <span key={i}>
                          {i === 0 ? `[Match Count] ${input}` : `[Commit ${i}] ${input.slice(0, 20)}...`}
                          <br />
                        </span>
                      ))}
                      {verificationResult.zkProof.publicInputs.length > 3 && (
                        <span>... and {verificationResult.zkProof.publicInputs.length - 3} more</span>
                      )}
                    </p>
                  </div>
                </details>
              </div>
            )}

            {/* Comparison Summary */}
            <div style={{...styles.summaryCard, backgroundColor: '#e7f3ff', marginTop: '1.5rem'}}>
              <h4 style={{margin: '0 0 0.5rem 0', fontSize: '0.9rem'}}>📊 Comparison</h4>
              <p style={{fontSize: '0.85rem', margin: 0}}>
                <strong>Traditional:</strong> {verificationResult.traditional.matchCount}/128 ({verificationResult.traditional.matchRate.toFixed(2)}%)
                <br />
                {verificationResult.zkProof && (
                  <>
                    <strong>ZK Proof:</strong> {verificationResult.zkProof.matchCount}/128 ({((verificationResult.zkProof.matchCount / 128) * 100).toFixed(2)}%)
                    <br />
                    <strong>Difference:</strong> {Math.abs(verificationResult.traditional.matchCount - verificationResult.zkProof.matchCount)} bits
                  </>
                )}
              </p>
            </div>

            {/* Action Button */}
            <button
              onClick={() => {
                if (verificationResult.traditional.verified) {
                  navigate({ to: returnUrl || '/ztizen/me' });
                } else {
                  // Reset
                  setStage('pin');
                  setPin('');
                  setPassword('');
                  setUserKey(null);
                  setAddress(null);
                  setVerificationResult(null);
                }
              }}
              style={{ ...styles.button, marginTop: '1rem' }}
            >
              {verificationResult.traditional.verified ? 'Continue' : 'Try Again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  identityCard: {
    maxWidth: '500px',
    margin: '0 auto 1.5rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    border: '2px solid #e5e5e5',
  },
  logo: {
    fontSize: '3rem',
  },
  identityInfo: {
    flex: 1,
  },
  identityName: {
    fontSize: '1.25rem',
    fontWeight: 600,
    marginBottom: '0.25rem',
  },
  identitySubtext: {
    fontSize: '0.9rem',
    color: '#666',
  },
  progressBar: {
    maxWidth: '500px',
    margin: '0 auto 1.5rem',
    height: '6px',
    backgroundColor: '#e5e5e5',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    transition: 'width 0.3s ease',
  },
  statusCard: {
    maxWidth: '500px',
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
    maxWidth: '500px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  },
  stepTitle: {
    fontSize: '1.5rem',
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
  summaryCard: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #e5e5e5',
    padding: '1rem',
    borderRadius: '8px',
  },
  summaryText: {
    margin: 0,
    fontSize: '0.85rem',
    lineHeight: '1.6',
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
  resultSection: {
    marginBottom: '2rem',
    paddingBottom: '2rem',
    borderBottom: '2px solid #e5e5e5',
  },
  resultTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    marginBottom: '1rem',
  },
};

export default ZTIZENVerifyWithComparisonZK;
