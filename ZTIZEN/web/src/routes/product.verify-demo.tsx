/**
 * Product Verification Request Demo
 *
 * Simulates a Product (e.g., Demo Bank) creating a verification request
 * and redirecting user to ZTIZEN for biometric verification.
 *
 * This demonstrates the complete challenge-response flow:
 * 1. Product creates verification request → generates tx_hash
 * 2. Product redirects user to ZTIZEN with tx_hash
 * 3. User completes verification on ZTIZEN
 * 4. Proof submitted on-chain with tx_hash
 * 5. Product queries tx_hash to check verification status
 */

import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';

export const Route = createFileRoute('/product/verify-demo')({
  component: ProductVerifyDemo,
});

function ProductVerifyDemo() {
  const [step, setStep] = useState<'select-user' | 'creating-request' | 'redirecting' | 'polling'>('select-user');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedCredential, setSelectedCredential] = useState('');
  const [verificationRequest, setVerificationRequest] = useState<any>(null);
  const [verificationStatus, setVerificationStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Simulated users (in real app, would come from database)
  const demoUsers = [
    {
      userId: '0x1234567890123456789012345678901234567890',
      name: 'Alice Demo',
      credentialId: 'demo-credential-alice-123',
      email: 'alice@demo.com',
    },
    {
      userId: '0xabcdefabcdefabcdefabcdefabcdefabcdef0000',
      name: 'Bob Demo',
      credentialId: 'demo-credential-bob-456',
      email: 'bob@demo.com',
    },
  ];

  // Step 1: Create verification request
  const handleCreateRequest = async () => {
    if (!selectedUser || !selectedCredential) {
      setError('Please select a user');
      return;
    }

    setStep('creating-request');
    setError('');

    try {
      console.log('═══════════════════════════════════════════════');
      console.log('🏦 PRODUCT: Creating Verification Request');
      console.log('═══════════════════════════════════════════════');
      console.log('📤 Product Service: Calling /api/verify/request');
      console.log('   User:', selectedUser);
      console.log('   Credential:', selectedCredential);

      const response = await fetch('http://localhost:8001/api/verify/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: 'demo-bank',
          service_id: 'demo-bank:balance-check',
          service_name: 'Balance Check',
          user_id: selectedUser,
          credential_id: selectedCredential,
          details: {
            service_type: 'financial',
            action: 'view_balance',
            timestamp: Math.floor(Date.now() / 1000),
          },
          callback_url: 'http://localhost:8001/api/verify/callback',
          return_url: `${window.location.origin}/product/verify-demo`,
          expires_in: 300, // 5 minutes
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create verification request');
      }

      console.log('✅ PRODUCT: Verification request created successfully!');
      console.log('═══════════════════════════════════════════════');
      console.log('📋 Challenge Parameters Generated:');
      console.log('   Request ID:', data.request_id);
      console.log('   ⭐ TX HASH (Challenge):', data.tx_hash);
      console.log('   Service ID (bytes32):', data.service_id_bytes32);
      console.log('   Expires in:', data.expires_in, 'seconds');
      console.log('═══════════════════════════════════════════════');
      console.log('🔗 Verification URL Generated:');
      console.log('   ', data.verification_url);
      console.log('   Includes: tx_hash, service_id, request_id in URL params');
      console.log('═══════════════════════════════════════════════');
      console.log('🚀 Redirecting user to ZTIZEN in 3 seconds...');
      console.log('   User will complete biometric verification');
      console.log('   Proof will be generated with tx_hash:', data.tx_hash);
      console.log('═══════════════════════════════════════════════\n');

      setVerificationRequest(data);
      setStep('redirecting');

      // Automatically redirect after 3 seconds
      setTimeout(() => {
        console.log('🌐 REDIRECTING to ZTIZEN...');
        console.log('   URL:', data.verification_url);
        window.location.href = data.verification_url;
      }, 3000);

    } catch (err: any) {
      console.error('❌ Error creating verification request:', err);
      setError(err.message || 'Failed to create verification request');
      setStep('select-user');
    }
  };

  // Step 2: Poll verification status by tx_hash
  const startPolling = () => {
    if (!verificationRequest?.tx_hash) return;

    console.log('═══════════════════════════════════════════════');
    console.log('🔍 PRODUCT: Starting Verification Status Polling');
    console.log('═══════════════════════════════════════════════');
    console.log('   Polling tx_hash:', verificationRequest.tx_hash);
    console.log('   Endpoint: GET /api/verify/lookup/{tx_hash}');
    console.log('   Interval: Every 3 seconds');
    console.log('═══════════════════════════════════════════════\n');

    setStep('polling');

    const interval = setInterval(async () => {
      try {
        console.log('🔍 PRODUCT: Polling verification status...');
        console.log('   tx_hash:', verificationRequest.tx_hash);

        const response = await fetch(
          `http://localhost:8001/api/verify/lookup/${verificationRequest.tx_hash}`
        );

        const data = await response.json();

        console.log('📊 PRODUCT: Verification status received:');
        console.log('   Status:', data.status);
        console.log('   Verified:', data.verified);
        console.log('   ZK Verified:', data.zk_verified);
        console.log('   On-chain TX:', data.onchain_tx_hash || 'pending');
        if (data.traditional_match_rate) {
          console.log('   Match Rate:', (data.traditional_match_rate * 100).toFixed(1) + '%');
        }

        setVerificationStatus(data);

        // Stop polling if completed
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'expired') {
          clearInterval(interval);
          setPollingInterval(null);
          console.log('═══════════════════════════════════════════════');
          console.log('✅ PRODUCT: Verification flow completed!');
          console.log('   Final status:', data.status.toUpperCase());
          console.log('   tx_hash:', verificationRequest.tx_hash);
          console.log('   User verified:', data.verified ? 'YES ✅' : 'NO ❌');
          console.log('═══════════════════════════════════════════════\n');
        }

      } catch (err: any) {
        console.error('❌ PRODUCT: Error polling status:', err);
      }
    }, 3000); // Poll every 3 seconds

    setPollingInterval(interval);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🏦 Demo Bank - Verification Request</h1>
        <p style={styles.subtitle}>
          Simulate Product creating verification request with challenge tx_hash
        </p>

        {/* Step 1: Select User */}
        {step === 'select-user' && (
          <div>
            <h2 style={styles.sectionTitle}>Step 1: Select User</h2>
            <p style={styles.infoText}>
              Choose a user to verify. In a real application, this would be the logged-in user.
            </p>

            <div style={styles.userList}>
              {demoUsers.map((user) => (
                <div
                  key={user.userId}
                  onClick={() => {
                    setSelectedUser(user.userId);
                    setSelectedCredential(user.credentialId);
                  }}
                  style={{
                    ...styles.userCard,
                    ...(selectedUser === user.userId ? styles.userCardSelected : {}),
                  }}
                >
                  <div style={styles.userName}>{user.name}</div>
                  <div style={styles.userEmail}>{user.email}</div>
                  <div style={styles.userId}>User ID: {user.userId.substring(0, 10)}...</div>
                  <div style={styles.credentialId}>
                    Credential: {user.credentialId}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div style={styles.error}>{error}</div>
            )}

            <button
              onClick={handleCreateRequest}
              style={{
                ...styles.button,
                ...(selectedUser ? {} : styles.buttonDisabled),
              }}
              disabled={!selectedUser}
            >
              Create Verification Request →
            </button>
          </div>
        )}

        {/* Step 2: Creating Request */}
        {step === 'creating-request' && (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner} />
            <h2 style={styles.loadingText}>Creating verification request...</h2>
            <p style={styles.infoText}>Generating challenge tx_hash</p>
          </div>
        )}

        {/* Step 3: Redirecting */}
        {step === 'redirecting' && verificationRequest && (
          <div>
            <h2 style={styles.sectionTitle}>✅ Request Created!</h2>

            <div style={styles.infoBox}>
              <div style={styles.infoRow}>
                <span style={styles.label}>Request ID:</span>
                <span style={styles.value}>{verificationRequest.request_id.substring(0, 20)}...</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Challenge tx_hash:</span>
                <span style={styles.value}>{verificationRequest.tx_hash.substring(0, 20)}...</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Service ID (bytes32):</span>
                <span style={styles.value}>{verificationRequest.service_id_bytes32.substring(0, 20)}...</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Expires in:</span>
                <span style={styles.value}>{verificationRequest.expires_in} seconds</span>
              </div>
            </div>

            <div style={styles.redirectMessage}>
              <h3 style={styles.redirectTitle}>🚀 Redirecting to ZTIZEN...</h3>
              <p style={styles.infoText}>
                You will be redirected to ZTIZEN to complete biometric verification.
              </p>
              <p style={styles.infoText}>
                After verification, click "Start Polling" to check status.
              </p>
            </div>

            <button
              onClick={() => startPolling()}
              style={{
                ...styles.button,
                backgroundColor: '#10b981',
              }}
            >
              Start Polling Verification Status
            </button>

            <button
              onClick={() => setStep('select-user')}
              style={{
                ...styles.button,
                ...styles.buttonSecondary,
              }}
            >
              Cancel & Start Over
            </button>
          </div>
        )}

        {/* Step 4: Polling Status */}
        {step === 'polling' && (
          <div>
            <h2 style={styles.sectionTitle}>🔍 Polling Verification Status</h2>
            <p style={styles.infoText}>
              Checking tx_hash: {verificationRequest?.tx_hash.substring(0, 20)}...
            </p>

            {verificationStatus ? (
              <div style={styles.infoBox}>
                <div style={styles.infoRow}>
                  <span style={styles.label}>Status:</span>
                  <span
                    style={{
                      ...styles.value,
                      color:
                        verificationStatus.status === 'completed'
                          ? '#10b981'
                          : verificationStatus.status === 'failed'
                          ? '#ef4444'
                          : '#f59e0b',
                    }}
                  >
                    {verificationStatus.status.toUpperCase()}
                  </span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.label}>Verified:</span>
                  <span style={styles.value}>
                    {verificationStatus.verified ? '✅ Yes' : '❌ No'}
                  </span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.label}>ZK Verified:</span>
                  <span style={styles.value}>
                    {verificationStatus.zk_verified ? '✅ Yes' : '⏳ Pending'}
                  </span>
                </div>
                {verificationStatus.onchain_tx_hash && (
                  <div style={styles.infoRow}>
                    <span style={styles.label}>On-Chain TX:</span>
                    <span style={styles.value}>
                      {verificationStatus.onchain_tx_hash.substring(0, 20)}...
                    </span>
                  </div>
                )}
                {verificationStatus.traditional_match_rate && (
                  <div style={styles.infoRow}>
                    <span style={styles.label}>Match Rate:</span>
                    <span style={styles.value}>
                      {(verificationStatus.traditional_match_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={styles.loadingContainer}>
                <div style={styles.spinner} />
                <p style={styles.infoText}>Waiting for verification...</p>
              </div>
            )}

            {verificationStatus?.status === 'completed' && (
              <div style={{
                ...styles.infoBox,
                backgroundColor: '#d4edda',
                border: '2px solid #10b981',
                marginTop: '1rem',
              }}>
                <h3 style={{ margin: 0, color: '#10b981', textAlign: 'center' }}>
                  ✅ Verification Successful!
                </h3>
                <p style={{ margin: '0.5rem 0 0 0', textAlign: 'center', fontSize: '0.9rem' }}>
                  User identity verified via ZTIZEN
                </p>
              </div>
            )}

            <button
              onClick={() => {
                setStep('select-user');
                setVerificationRequest(null);
                setVerificationStatus(null);
                if (pollingInterval) clearInterval(pollingInterval);
              }}
              style={styles.button}
            >
              Start New Verification
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
    backgroundColor: '#f3f4f6',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '2rem',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
    margin: '0 0 0.5rem 0',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: '0.95rem',
    color: '#666',
    textAlign: 'center' as const,
    margin: '0 0 2rem 0',
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 1rem 0',
  },
  infoText: {
    fontSize: '0.9rem',
    color: '#666',
    margin: '0 0 1rem 0',
  },
  userList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  userCard: {
    padding: '1rem',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  userCardSelected: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  userName: {
    fontSize: '1.1rem',
    fontWeight: 600,
    marginBottom: '0.25rem',
  },
  userEmail: {
    fontSize: '0.9rem',
    color: '#666',
    marginBottom: '0.5rem',
  },
  userId: {
    fontSize: '0.75rem',
    color: '#999',
    fontFamily: 'monospace',
  },
  credentialId: {
    fontSize: '0.75rem',
    color: '#999',
    fontFamily: 'monospace',
  },
  button: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '0.5rem',
  },
  buttonDisabled: {
    backgroundColor: '#d1d5db',
    cursor: 'not-allowed',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    color: '#666',
    border: '2px solid #e5e5e5',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '2rem 0',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e5e5',
    borderTop: '4px solid #7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem',
  },
  loadingText: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
  },
  infoBox: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderBottom: '1px solid #e5e5e5',
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#374151',
  },
  value: {
    fontSize: '0.9rem',
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  redirectMessage: {
    textAlign: 'center' as const,
    padding: '1.5rem 0',
  },
  redirectTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    color: '#7c3aed',
  },
};

export default ProductVerifyDemo;
