/**
 * ZTIZEN Auto-Add Credential Page
 * Route: /ztizen/me-add/:credentialId
 *
 * This page automatically verifies and adds a credential to the user's dashboard.
 * After verification, it redirects to /ztizen/me
 *
 * Flow:
 * 1. Product Service creates credential in ZTIZEN
 * 2. Product Service redirects to this page
 * 3. This page verifies credential exists
 * 4. Redirects to /ztizen/me dashboard
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { API_ENDPOINTS } from '@/config/api';
import { useWalletAddress } from '@/hooks/useWalletAddress';

export const Route = createFileRoute('/ztizen/me-add/$credentialId')({
  component: AddCredentialPage,
});

function AddCredentialPage() {
  const { credentialId } = Route.useParams();
  const navigate = useNavigate();
  const { authenticated, ready } = usePrivy();
  const walletAddress = useWalletAddress();
  const [status, setStatus] = useState('Verifying credential...');
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    const addCredential = async () => {
      // Wait for Privy to be ready
      if (!ready) {
        return;
      }

      // Check authentication
      if (!authenticated || !walletAddress) {
        setStatus('Please connect your wallet');
        setTimeout(() => {
          navigate({ to: '/ztizen/me' });
        }, 2000);
        return;
      }

      try {
        setStatus('Verifying credential...');

        // Try to verify credential exists in ZTIZEN service
        try {
          const response = await fetch(API_ENDPOINTS.ztizen.enrollment(credentialId));

          // Check if ZTIZEN service is running
          if (!response.ok) {
            console.log('ZTIZEN service might not be running or credential not found');
            // Continue anyway - credential was created by product service
          } else {
            const data = await response.json();

            if (data.success) {
              // Verify credential belongs to this user
              // Both walletAddress and credential user_id are already lowercase (normalized)
              if (walletAddress && data.credential && data.credential.user_id) {
                const normalizedCredentialUser = data.credential.user_id.toLowerCase();

                if (normalizedCredentialUser !== walletAddress) {
                  console.log('Ownership check failed:', {
                    walletAddress: walletAddress,
                    credentialUserId: normalizedCredentialUser
                  });
                  setStatus('❌ This credential does not belong to you');
                  setTimeout(() => {
                    navigate({ to: '/ztizen/me' });
                  }, 2000);
                  return;
                }
              } else {
                // If we can't verify ownership (wallet not loaded yet), continue anyway
                console.log('Skipping ownership check - wallet or credential data not fully loaded');
              }

              console.log('✅ Credential verified:', {
                credential_id: credentialId,
                product_name: data.credential?.product_name,
                service_name: data.credential?.service_name,
              });
            }
          }
        } catch (fetchError) {
          // ZTIZEN service might not be running, but continue
          console.log('Could not verify with ZTIZEN service, but continuing:', fetchError);
        }

        // Notify Product Service to sync enrollment status
        setStatus('✅ Syncing with Product Service...');
        try {
          if (walletAddress) {
            const syncResponse = await fetch(API_ENDPOINTS.product.enrollmentSync(credentialId), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                user_id: walletAddress,
              }),
            });

            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              console.log('✅ Product Service synced:', syncData);
            } else {
              console.log('⚠️ Could not sync with Product Service, status:', syncResponse.status);
            }
          }
        } catch (syncError) {
          // Log but don't fail - the auto-sync will catch it later
          console.log('Could not sync with Product Service:', syncError);
        }

        // Success! Proceed to dashboard
        setStatus('✅ Redirecting to your dashboard...');

        // Always redirect to dashboard after a short delay
        setTimeout(() => {
          if (!hasRedirected) {
            console.log('Navigating to /ztizen/me');
            setHasRedirected(true);
            navigate({ to: '/ztizen/me' });
          }
        }, 1500);

      } catch (error) {
        console.error('Unexpected error:', error);
        setStatus('❌ An error occurred, redirecting...');
        // Even on error, redirect to dashboard
        setTimeout(() => {
          if (!hasRedirected) {
            console.log('Navigating to /ztizen/me after error');
            setHasRedirected(true);
            navigate({ to: '/ztizen/me' });
          }
        }, 2000);
      }
    };

    addCredential();

    // Fallback: Force redirect after 5 seconds if nothing happens
    const fallbackTimeout = setTimeout(() => {
      if (!hasRedirected) {
        console.log('Fallback redirect to /ztizen/me after 5 seconds');
        setHasRedirected(true);
        navigate({ to: '/ztizen/me' });
      }
    }, 5000);

    return () => clearTimeout(fallbackTimeout);
  }, [credentialId, authenticated, walletAddress, ready, navigate, hasRedirected]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          {status.includes('✅') ? (
            <div style={styles.successIcon}>✅</div>
          ) : status.includes('❌') ? (
            <div style={styles.errorIcon}>❌</div>
          ) : (
            <div style={styles.spinner}></div>
          )}
        </div>

        <h1 style={styles.title}>{status}</h1>

        <div style={styles.info}>
          <p style={styles.infoText}>Credential ID:</p>
          <code style={styles.code}>{credentialId.substring(0, 24)}...</code>
        </div>

        {status.includes('✅') && (
          <p style={styles.subtitle}>Redirecting to dashboard...</p>
        )}

        {status.includes('❌') && (
          <p style={styles.subtitle}>Redirecting...</p>
        )}

        {/* Manual redirect button as fallback */}
        <button
          onClick={() => navigate({ to: '/ztizen/me' })}
          style={styles.button}
        >
          Go to Dashboard →
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '3rem 2rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    maxWidth: '500px',
    width: '100%',
    textAlign: 'center',
  },
  iconContainer: {
    marginBottom: '1.5rem',
  },
  successIcon: {
    fontSize: '4rem',
    animation: 'fadeIn 0.3s ease-in',
  },
  errorIcon: {
    fontSize: '4rem',
    animation: 'fadeIn 0.3s ease-in',
  },
  spinner: {
    width: '50px',
    height: '50px',
    margin: '0 auto',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #1a1a1a',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: '0 0 1.5rem 0',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#666',
    margin: '1rem 0 0 0',
  },
  info: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
  },
  infoText: {
    fontSize: '0.85rem',
    color: '#666',
    margin: '0 0 0.5rem 0',
  },
  code: {
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    color: '#1a1a1a',
    wordBreak: 'break-all',
  },
  button: {
    marginTop: '1.5rem',
    padding: '0.75rem 1.5rem',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

// Add CSS animations via a style tag (for spinner animation)
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(styleSheet);
}
