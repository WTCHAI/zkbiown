/**
 * ZTIZEN Dashboard - User Credentials List
 * Route: /ztizen/me
 *
 * Displays all user's credentials with wallet connection
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Fingerprint } from 'lucide-react';
import { ZTIZEN_CLIENT, PRODUCT_CLIENT } from '@/lib/api';
import { useWalletAddressDebug } from '@/hooks/useWalletAddress';

export const Route = createFileRoute('/ztizen/me')({
  component: ZTIZENDashboard,
});

// Add hover styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    .credential-card:hover {
      box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
      transform: translateY(-2px);
    }

    .credential-card:hover .card-icon-container {
      background-color: #e9ecef !important;
    }

    .credential-card:hover .fingerprint-icon {
      color: #333 !important;
    }
  `;
  document.head.appendChild(styleSheet);
}

interface Credential {
  credential_id: string;
  product_id: string;
  product_name: string;
  service_name: string;
  service_type: string;
  status: 'pending' | 'enrolled' | 'active' | 'revoked';
  version?: number;
  nonce?: string;
  created_at: string;
  enrolled_at?: string;
}

// Revocation reason options for the dialog
type RevocationReason = 'lost_device' | 'compromised' | 'rotation' | 'manual_revocation';

interface VerificationHistory {
  tx_id: string;
  request_id: string | null;
  tx_hash: string | null;
  service_id: string;
  service_id_bytes32: string | null;
  service_name: string;
  verified: boolean;
  traditional_match_rate: number;
  zk_verified: boolean | null;
  zk_match_count: number | null;
  onchain_tx_hash: string | null;
  timestamp: number;
  created_at: string;
}

interface PendingRequest {
  request_id: string;
  tx_hash: string;
  service_id_bytes32: string;
  service_name: string;
  product_name: string;
  status: 'pending' | 'completed' | 'expired' | 'failed';
  expires_at: string;
  created_at: string;
}

function ZTIZENDashboard() {
  const navigate = useNavigate();
  const { ready, authenticated, login, logout } = usePrivy();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [verificationHistory, setVerificationHistory] = useState<VerificationHistory[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [error, setError] = useState('');

  // Credential action states
  const [actionCredentialId, setActionCredentialId] = useState<string | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [revokeReason, setRevokeReason] = useState<RevocationReason>('manual_revocation');
  const [isRevoking, setIsRevoking] = useState(false);

  // Use centralized wallet address hook - ensures consistency and lowercase normalization
  const { address: walletAddress, debug: walletDebug } = useWalletAddressDebug();

  // Debug: Log wallet address information
  useEffect(() => {
    console.log('🔍 Wallet Address Debug:', {
      'Primary (user.wallet)': walletDebug.primaryWallet,
      'Fallback (wallets[0])': walletDebug.fallbackWallet,
      'Selected (normalized)': walletAddress,
      'Wallets count': walletDebug.walletsCount,
      'Mismatch detected': walletDebug.mismatch,
    });

    if (walletDebug.mismatch) {
      console.warn('⚠️ WALLET ADDRESS MISMATCH DETECTED - Using primary wallet');
    }
  }, [walletAddress, walletDebug]);

  // Handler for completing registration
  const handleCompleteRegistration = (credentialId: string) => {
    navigate({
      to: '/ztizen/register/$credentialId',
      params: { credentialId },
    });
  };

  // Handler to open revoke dialog
  const handleOpenRevokeDialog = (credentialId: string) => {
    setActionCredentialId(credentialId);
    setRevokeReason('manual_revocation');
    setShowRevokeDialog(true);
  };

  // Handler to revoke and upgrade version
  const handleRevokeCredential = async () => {
    if (!actionCredentialId) return;

    setIsRevoking(true);
    setError('');

    try {
      const result = await ZTIZEN_CLIENT.upgradeVersion(actionCredentialId, revokeReason);

      if (result.success) {
        console.log('✅ Credential revoked:', {
          credentialId: actionCredentialId,
          newVersion: result.credential?.version,
          reason: revokeReason,
        });

        // Refresh credentials list
        await handleRefresh();

        // Close dialog
        setShowRevokeDialog(false);
        setActionCredentialId(null);
      } else {
        setError(result.message || 'Failed to revoke credential');
      }
    } catch (err) {
      console.error('❌ Error revoking credential:', err);
      setError(err instanceof Error ? err.message : 'Failed to revoke credential');
    } finally {
      setIsRevoking(false);
    }
  };

  // Handler for verification navigation
  const handleVerify = (credentialId: string, serviceName: string) => {
    navigate({
      to: '/ztizen/verify/$credentialId',
      params: { credentialId },
      search: { service_name: serviceName },
    });
  };

  // Handler for manual refresh
  const handleRefresh = async () => {
    if (!authenticated || !walletAddress) return;

    console.log('🔄 Manual refresh triggered');
    setLoading(true);
    setError('');

    try {
      const data = await ZTIZEN_CLIENT.getUserCredentials(walletAddress);

      if (data.success) {
        setCredentials(data.credentials);
        console.log(`✅ Refreshed: Loaded ${data.credentials.length} credentials`);
      } else {
        console.warn('⚠️ API returned success=false:', data.message);
        setError(data.message || 'Failed to load credentials');
      }
    } catch (err) {
      console.error('❌ Error refreshing credentials:', err);
      setError('Failed to connect to ZTIZEN service');
    } finally {
      setLoading(false);
    }
  };

  // Fetch credentials when wallet is ready and authenticated
  useEffect(() => {
    const loadCredentials = async () => {
      if (!authenticated || !walletAddress) {
        console.log('⏸️ Waiting for authentication and wallet...', { authenticated, hasWallet: !!walletAddress });
        return;
      }

      console.log('🔄 Fetching credentials for:', walletAddress);
      setLoading(true);
      setError('');

      try {
        // Use new v2 API endpoint
        const data = await ZTIZEN_CLIENT.getUserCredentials(walletAddress);

        if (data.success) {
          setCredentials(data.credentials);
          console.log(`✅ Loaded ${data.credentials.length} credentials`);
        } else {
          console.warn('⚠️ API returned success=false:', data.message);
          setError(data.message || 'Failed to load credentials');
        }
      } catch (err) {
        console.error('❌ Error fetching credentials:', err);
        setError('Failed to connect to ZTIZEN service');
      } finally {
        setLoading(false);
      }
    };

    loadCredentials();
  }, [authenticated, walletAddress]); // Dependencies are correct now

  // Fetch verification history for all credentials
  useEffect(() => {
    if (credentials.length > 0) {
      fetchVerificationHistory();
      fetchPendingRequests();
    }
  }, [credentials.length]); // Use credentials.length instead of credentials to avoid infinite loop

  const fetchVerificationHistory = async () => {
    setLoadingHistory(true);

    try {
      // Fetch verification history for all credentials
      const historyPromises = credentials.map(async (cred) => {
        try {
          const data = await ZTIZEN_CLIENT.getVerificationHistory(cred.credential_id, 10);
          return data.success ? data.verifications : [];
        } catch {
          return [];
        }
      });

      const allHistories = await Promise.all(historyPromises);
      const flatHistory = allHistories.flat();

      // Sort by timestamp descending
      flatHistory.sort((a, b) => b.timestamp - a.timestamp);

      setVerificationHistory(flatHistory);
      console.log(`📜 Loaded ${flatHistory.length} verification transactions`);
    } catch (err) {
      console.error('Error fetching verification history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchPendingRequests = async () => {
    if (!walletAddress) return;

    setLoadingPending(true);

    try {
      // Fetch pending verification requests from product service
      const data = await PRODUCT_CLIENT.getVerifyRequests(walletAddress, 'pending', 10);

      if (data.success) {
        setPendingRequests(data.requests);
        console.log(`⏳ Loaded ${data.requests.length} pending requests`);
      }
    } catch (err) {
      console.error('Error fetching pending requests:', err);
    } finally {
      setLoadingPending(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Not ready yet
  if (!ready) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner}></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show connect wallet
  if (!authenticated) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>ZTIZEN Dashboard</h1>
          <p style={styles.subtitle}>Your Biometric Identity Credentials</p>
        </div>

        <div style={styles.connectCard}>
          <div style={styles.icon}>🔐</div>
          <h2 style={styles.connectTitle}>Connect Your Wallet</h2>
          <p style={styles.connectText}>
            Connect your wallet to view and manage your biometric credentials
          </p>
          <button onClick={login} style={styles.connectButton}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>ZTIZEN Dashboard</h1>
          <p style={styles.subtitle}>Your Biometric Identity Credentials</p>
        </div>
        <div style={styles.walletInfo}>
          <button 
            onClick={handleRefresh} 
            style={styles.refreshButton}
            disabled={loading}
          >
            {loading ? '⏳' : '🔄'} Refresh
          </button>
          <div style={styles.walletAddress}>
            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </div>
          <button onClick={logout} style={styles.logoutButton}>
            Disconnect
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={styles.loadingCard}>
          <div style={styles.spinner}></div>
          <p>Loading your credentials...</p>
        </div>
      )}

      {/* Error State with Retry */}
      {error && (
        <div style={styles.errorCard}>
          <div>❌ {error}</div>
          <button onClick={handleRefresh} style={styles.retryButton}>
            🔄 Retry
          </button>
        </div>
      )}

      {/* Credentials List */}
      {!loading && !error && credentials.length === 0 && (
        <div style={styles.emptyCard}>
          <div style={styles.emptyIcon}>📭</div>
          <h2 style={styles.emptyTitle}>No Credentials Yet</h2>
          <p style={styles.emptyText}>
            You haven't enrolled any biometric credentials yet.
            <br />
            Visit a partner product to create your first credential.
          </p>
        </div>
      )}

      {!loading && !error && credentials.length > 0 && (
        <div style={styles.credentialsList}>
          {credentials.map((credential) => (
            <div key={credential.credential_id} style={styles.credentialCard} className="credential-card">
              {/* Left: Fingerprint Icon */}
              <div style={styles.cardIconContainer} className="card-icon-container">
                <Fingerprint size={32} strokeWidth={1.5} color="#666" className="fingerprint-icon" />
              </div>

              {/* Middle: Credential Info */}
              <div style={styles.cardContent}>
                <h3 style={styles.cardTitle}>{credential.product_name}</h3>
                <p style={styles.cardService}>{credential.service_name}</p>
                {credential.version && (
                  <span style={styles.versionBadge}>v{credential.version}</span>
                )}
              </div>

              {/* Right: Status Badge + Action Buttons */}
              <div style={styles.cardAction}>
                {credential.status === 'pending' ? (
                  <>
                    <div style={{
                      ...styles.cardBadge,
                      backgroundColor: '#fff3cd',
                      color: '#856404',
                    }}>
                      ⏳ Pending
                    </div>
                    <button
                      onClick={() => handleCompleteRegistration(credential.credential_id)}
                      style={styles.completeButton}
                    >
                      Complete Registration
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{
                      ...styles.cardBadge,
                      backgroundColor: credential.status === 'active' ? '#d4edda' :
                                       credential.status === 'enrolled' ? '#cce5ff' : '#f8d7da',
                      color: credential.status === 'active' ? '#155724' :
                             credential.status === 'enrolled' ? '#004085' : '#721c24',
                    }}>
                      {credential.status === 'active' && '✅ Active'}
                      {credential.status === 'enrolled' && '✓ Enrolled'}
                      {credential.status === 'revoked' && '❌ Revoked'}
                    </div>

                    {/* Action buttons for enrolled/active credentials */}
                    {(credential.status === 'active' || credential.status === 'enrolled') && (
                      <div style={styles.actionButtons}>
                        <button
                          onClick={() => handleVerify(credential.credential_id, credential.service_name)}
                          style={styles.verifyActionButton}
                          title="Test verification"
                        >
                          🔐 Verify
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenRevokeDialog(credential.credential_id);
                          }}
                          style={styles.revokeButton}
                          title="Revoke & Re-enroll"
                        >
                          🔄 Revoke
                        </button>
                      </div>
                    )}

                    {/* Re-enroll button for revoked credentials */}
                    {credential.status === 'revoked' && (
                      <button
                        onClick={() => handleCompleteRegistration(credential.credential_id)}
                        style={styles.reenrollButton}
                      >
                        Re-enroll
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revoke Confirmation Dialog */}
      {showRevokeDialog && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialog}>
            <h3 style={styles.dialogTitle}>🔄 Revoke Credential</h3>
            <p style={styles.dialogText}>
              This will revoke your current biometric enrollment. You'll need to re-enroll
              your biometric to use this credential again.
            </p>

            <div style={styles.reasonSelect}>
              <label style={styles.reasonLabel}>Reason for revocation:</label>
              <select
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value as RevocationReason)}
                style={styles.select}
              >
                <option value="manual_revocation">Manual Revocation</option>
                <option value="lost_device">Lost Device</option>
                <option value="compromised">Credentials Compromised</option>
                <option value="rotation">Security Rotation</option>
              </select>
            </div>

            <div style={styles.dialogActions}>
              <button
                onClick={() => {
                  setShowRevokeDialog(false);
                  setActionCredentialId(null);
                }}
                style={styles.cancelButton}
                disabled={isRevoking}
              >
                Cancel
              </button>
              <button
                onClick={handleRevokeCredential}
                style={styles.confirmRevokeButton}
                disabled={isRevoking}
              >
                {isRevoking ? '⏳ Revoking...' : '🔄 Revoke & Re-enroll'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Verification Requests */}
      {!loading && credentials.length > 0 && pendingRequests.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>⏳ Pending Verification Requests</h2>
          <div style={styles.pendingList}>
            {pendingRequests.map((req) => (
              <div key={req.request_id} style={styles.pendingCard}>
                <div style={styles.pendingHeader}>
                  <div>
                    <h3 style={styles.pendingService}>{req.service_name}</h3>
                    <p style={styles.pendingProduct}>{req.product_name}</p>
                  </div>
                  <button
                    onClick={() => navigate({
                      to: '/ztizen/verify/$credentialId',
                      params: { credentialId: credentials[0]?.credential_id || '' },
                      search: {
                        request_id: req.request_id,
                        tx_hash: req.tx_hash,
                        service_id: req.service_id_bytes32,
                        service_name: req.service_name,
                      },
                    })}
                    style={styles.verifyButton}
                  >
                    Complete Verification
                  </button>
                </div>
                <div style={styles.pendingMeta}>
                  <span style={styles.pendingTxHash}>
                    tx_hash: {req.tx_hash?.slice(0, 10)}...{req.tx_hash?.slice(-8)}
                  </span>
                  <span style={styles.pendingExpires}>
                    Expires: {new Date(req.expires_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification History */}
      {!loading && credentials.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent Verifications</h2>
          {loadingHistory ? (
            <div style={styles.loadingCard}>
              <div style={styles.spinner}></div>
              <p>Loading verification history...</p>
            </div>
          ) : verificationHistory.length === 0 ? (
            <div style={styles.emptyHistoryCard}>
              <p style={styles.emptyHistoryText}>No verification history yet</p>
            </div>
          ) : (
            <div style={styles.historyList}>
              {verificationHistory.slice(0, 10).map((tx) => (
                <div key={tx.tx_id} style={styles.historyCard}>
                  <div style={styles.historyHeader}>
                    <div>
                      <h3 style={styles.historyService}>{tx.service_name}</h3>
                      <p style={styles.historyTimestamp}>{formatTimestamp(tx.timestamp)}</p>
                    </div>
                    <div style={styles.historyStatus}>
                      {tx.verified ? (
                        <span style={{...styles.statusBadge, backgroundColor: '#d4edda', color: '#155724'}}>
                          ✅ Verified
                        </span>
                      ) : (
                        <span style={{...styles.statusBadge, backgroundColor: '#f8d7da', color: '#721c24'}}>
                          ❌ Failed
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={styles.historyDetails}>
                    <div style={styles.historyDetail}>
                      <span style={styles.historyLabel}>Traditional:</span>
                      <span style={styles.historyValue}>{tx.traditional_match_rate.toFixed(2)}%</span>
                    </div>
                    {tx.zk_verified !== null && (
                      <div style={styles.historyDetail}>
                        <span style={styles.historyLabel}>ZK Proof:</span>
                        <span style={styles.historyValue}>
                          {tx.zk_verified ? `✅ ${tx.zk_match_count}/128` : '❌'}
                        </span>
                      </div>
                    )}
                    {tx.tx_hash && (
                      <div style={styles.historyDetail}>
                        <span style={styles.historyLabel}>tx_hash:</span>
                        <span style={styles.txHashValue}>
                          {tx.tx_hash.slice(0, 10)}...{tx.tx_hash.slice(-8)}
                        </span>
                      </div>
                    )}
                    {tx.onchain_tx_hash && (
                      <div style={styles.historyDetail}>
                        <span style={styles.historyLabel}>On-chain:</span>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${tx.onchain_tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={styles.etherscanLink}
                        >
                          View on Etherscan →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats Summary */}
      {!loading && !error && credentials.length > 0 && (
        <div style={styles.statsCard}>
          <div style={styles.stat}>
            <div style={styles.statValue}>{credentials.length}</div>
            <div style={styles.statLabel}>Total Credentials</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>
              {credentials.filter((c) => c.status === 'active' || c.status === 'enrolled').length}
            </div>
            <div style={styles.statLabel}>Active</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>
              {new Set(credentials.map((c) => c.product_name)).size}
            </div>
            <div style={styles.statLabel}>Products</div>
          </div>
        </div>
      )}
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
  header: {
    maxWidth: '1200px',
    margin: '0 auto 2rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
    gap: '1rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 600,
    margin: 0,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#666',
    margin: '0.5rem 0 0 0',
  },
  walletInfo: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  walletAddress: {
    padding: '0.5rem 1rem',
    backgroundColor: '#fff',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
  },
  refreshButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 500,
    backgroundColor: '#fff',
    color: '#1a1a1a',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginRight: '0.75rem',
  },
  logoutButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 500,
    backgroundColor: '#fff',
    color: '#1a1a1a',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  retryButton: {
    marginTop: '1rem',
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#fff',
    color: '#333',
    border: '2px solid #333',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  connectCard: {
    maxWidth: '500px',
    margin: '4rem auto',
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '3rem 2rem',
    textAlign: 'center' as const,
    border: '1px solid #e5e5e5',
  },
  icon: {
    fontSize: '4rem',
    marginBottom: '1rem',
  },
  connectTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    color: '#1a1a1a',
  },
  connectText: {
    fontSize: '1rem',
    color: '#666',
    margin: '0 0 2rem 0',
    lineHeight: '1.6',
  },
  connectButton: {
    padding: '1rem 2rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  loadingCard: {
    maxWidth: '500px',
    margin: '4rem auto',
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '3rem 2rem',
    textAlign: 'center' as const,
    border: '1px solid #e5e5e5',
  },
  spinner: {
    width: '40px',
    height: '40px',
    margin: '0 auto 1rem',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #1a1a1a',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorCard: {
    maxWidth: '800px',
    margin: '0 auto 1.5rem',
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    padding: '1rem',
    borderRadius: '8px',
    color: '#c00',
    textAlign: 'center' as const,
  },
  emptyCard: {
    maxWidth: '500px',
    margin: '4rem auto',
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '3rem 2rem',
    textAlign: 'center' as const,
    border: '1px solid #e5e5e5',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  emptyIcon: {
    fontSize: '4rem',
    marginBottom: '1rem',
  },
  emptyTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    color: '#1a1a1a',
  },
  emptyText: {
    fontSize: '1rem',
    color: '#666',
    lineHeight: '1.6',
  },
  credentialsList: {
    maxWidth: '800px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  credentialCard: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '1.25rem',
    border: '1px solid #e5e5e5',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    transition: 'all 0.3s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    cursor: 'pointer',
  },
  cardIconContainer: {
    flexShrink: 0,
    width: '60px',
    height: '60px',
    borderRadius: '12px',
    backgroundColor: '#f8f9fa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardBadge: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    borderRadius: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: 0,
    marginBottom: '0.25rem',
    color: '#1a1a1a',
  },
  cardService: {
    fontSize: '0.9rem',
    color: '#888',
    margin: '0.25rem 0 0 0',
  },
  cardAction: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
  },
  cardArrow: {
    fontSize: '1.5rem',
    color: '#ccc',
    fontWeight: 300,
  },
  statsCard: {
    maxWidth: '800px',
    margin: '2rem auto 0',
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '1.5rem',
    border: '1px solid #e5e5e5',
    display: 'flex',
    justifyContent: 'space-around',
    gap: '2rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  stat: {
    textAlign: 'center' as const,
    flex: 1,
  },
  statValue: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: '#1a1a1a',
    marginBottom: '0.25rem',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    fontWeight: 500,
  },
  completeButton: {
    padding: '0.6rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap' as const,
  },
  section: {
    maxWidth: '800px',
    margin: '2rem auto 0',
  },
  sectionTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    color: '#1a1a1a',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '1px solid #e5e5e5',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
  },
  historyService: {
    fontSize: '1rem',
    fontWeight: 600,
    margin: 0,
    color: '#1a1a1a',
  },
  historyTimestamp: {
    fontSize: '0.8rem',
    color: '#888',
    margin: '0.25rem 0 0 0',
  },
  historyStatus: {
    display: 'flex',
    alignItems: 'center',
  },
  statusBadge: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    borderRadius: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  historyDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  historyDetail: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.875rem',
  },
  historyLabel: {
    color: '#666',
    fontWeight: 500,
  },
  historyValue: {
    color: '#1a1a1a',
    fontWeight: 600,
  },
  etherscanLink: {
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
    transition: 'color 0.2s ease',
  },
  emptyHistoryCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '2rem',
    border: '1px solid #e5e5e5',
    textAlign: 'center' as const,
  },
  emptyHistoryText: {
    color: '#888',
    margin: 0,
  },
  pendingList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  pendingCard: {
    backgroundColor: '#fff8e6',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '2px solid #ffc107',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  pendingHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.75rem',
  },
  pendingService: {
    fontSize: '1rem',
    fontWeight: 600,
    margin: 0,
    color: '#1a1a1a',
  },
  pendingProduct: {
    fontSize: '0.85rem',
    color: '#666',
    margin: '0.25rem 0 0 0',
  },
  pendingMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.8rem',
    color: '#888',
  },
  pendingTxHash: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
  },
  pendingExpires: {
    fontSize: '0.75rem',
  },
  verifyButton: {
    padding: '0.6rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    backgroundColor: '#ffc107',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap' as const,
  },
  txHashValue: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#666',
  },
  versionBadge: {
    display: 'inline-block',
    padding: '0.15rem 0.4rem',
    fontSize: '0.65rem',
    fontWeight: 600,
    backgroundColor: '#e9ecef',
    color: '#666',
    borderRadius: '4px',
    marginLeft: '0.5rem',
    verticalAlign: 'middle',
  },
  actionButtons: {
    display: 'flex',
    gap: '0.5rem',
    marginLeft: '0.5rem',
  },
  verifyActionButton: {
    padding: '0.4rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    backgroundColor: '#e7f3ff',
    color: '#2563eb',
    border: '1px solid #2563eb',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap' as const,
  },
  revokeButton: {
    padding: '0.4rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    backgroundColor: '#fff5f5',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap' as const,
  },
  reenrollButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    backgroundColor: '#fef3c7',
    color: '#92400e',
    border: '1px solid #f59e0b',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginLeft: '0.5rem',
  },
  dialogOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
  },
  dialogTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    color: '#1a1a1a',
  },
  dialogText: {
    fontSize: '0.9rem',
    color: '#666',
    lineHeight: 1.6,
    margin: '0 0 1.5rem 0',
  },
  reasonSelect: {
    marginBottom: '1.5rem',
  },
  reasonLabel: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#333',
    marginBottom: '0.5rem',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '0.9rem',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  dialogActions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.75rem 1.25rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    backgroundColor: '#f5f5f5',
    color: '#666',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  confirmRevokeButton: {
    padding: '0.75rem 1.25rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};
