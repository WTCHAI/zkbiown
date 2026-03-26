/**
 * Product Service Page - Service-Specific Credential Management
 * Each service (Login, Transfer, Balance) has its own credential
 */

import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useParams, useNavigate } from '@tanstack/react-router';
import { PRODUCT_CLIENT } from '@/lib/api';
import { useWalletAddress } from '@/hooks/useWalletAddress';

interface Credential {
  credential_id: string;
  status: string;
  product_name: string;
  product_id: string;
  service_name: string;
  service_type: string;
  service_id: string;
  created_at: string;
  updated_at: string;
}

interface Service {
  id: string;
  service_name: string;
  service_type: string;
  description?: string;
}

interface Props {
  productId: string;
  serviceName: string;
}

export function ProductServicePage({ productId, serviceName }: Props) {
  const { ready, authenticated, login } = usePrivy();
  const navigate = useNavigate();

  const [service, setService] = useState<Service | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Use centralized wallet address hook - ensures consistency and lowercase normalization
  const userId = useWalletAddress() || '';

  // Handle enrollment/verification success callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const enrollSuccess = params.get('enroll_success');
    const verifySuccess = params.get('verify_success');
    const credentialId = params.get('credential_id');

    if (enrollSuccess === 'true' && credentialId) {
      setStatus('✅ Registration complete! Ready to use service.');
      window.history.replaceState({}, '', window.location.pathname);
      // Reload credential
      fetchCredential();
    }

    if (verifySuccess === 'true') {
      setStatus('✅ Verification successful! Access granted.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Load service info and check for existing credential
  useEffect(() => {
    if (authenticated && userId) {
      loadService();
      fetchCredential();
    }
  }, [authenticated, userId, productId, serviceName]);

  const loadService = async () => {
    setLoading(true);
    try {
      // Get all services for this product
      const data = await PRODUCT_CLIENT.getProducts();

      const product = data.products?.find((p: any) => p.product_id === productId);
      if (product) {
        const foundService = product.services?.find(
          (s: Service) => s.service_name === serviceName
        );
        if (foundService) {
          setService(foundService);
        } else {
          setStatus(`❌ Service "${serviceName}" not found`);
        }
      } else {
        setStatus(`❌ Product "${productId}" not found`);
      }
    } catch (error) {
      console.error('Error loading service:', error);
      setStatus('❌ Failed to load service');
    } finally {
      setLoading(false);
    }
  };

  const fetchCredential = async () => {
    if (!authenticated || !userId || !serviceName) {
      return;
    }

    try {
      console.log(`📋 Checking credential for service: ${serviceName}`);
      console.log('🔍 Query parameters:', { userId, productId, serviceName });

      const data = await PRODUCT_CLIENT.getEnrollmentList(userId, productId, serviceName);

      console.log('📦 API Response:', data);

      if (data.success && data.credentials && data.credentials.length > 0) {
        const cred = data.credentials[0];
        setCredential(cred);
        console.log(`✅ Found credential: ${cred.credential_id} (${cred.status})`);

        if (cred.status === 'active') {
          setStatus(`✅ Ready to use ${serviceName} service`);
        } else if (cred.status === 'pending') {
          setStatus(`⏳ Registration pending - Complete enrollment to activate`);
        }
      } else {
        console.log('📭 No credential found for this service');
        console.log('🔍 Possible issues: wallet address mismatch, service_name mismatch, or status not active');
        setCredential(null);
        setStatus(`🔒 Register to use ${serviceName} service`);
      }
    } catch (error) {
      console.error('Error fetching credential:', error);
      setCredential(null);
    }
  };

  const handleEnroll = async () => {
    if (!authenticated || !userId) {
      await login();
      return;
    }

    if (!service) {
      setStatus('❌ Service not loaded');
      return;
    }

    setLoading(true);
    setStatus('Initiating enrollment...');

    try {
      const data = await PRODUCT_CLIENT.enrollmentInitiate({
        user_id: userId,
        product_id: productId,
        service_id: service.id,
        pin_hash: '',  // TODO: Add PIN hash if needed
      });

      if (!data.success) {
        throw new Error(data.message || 'Failed to initiate enrollment');
      }

      console.log('✅ Enrollment initiated:', data.credential_id);
      setStatus('Redirecting to ZTIZEN...');

      setTimeout(() => {
        window.location.href = data.redirect_url;
      }, 500);
    } catch (error) {
      console.error('Enrollment error:', error);
      setStatus('❌ Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!credential) {
      setStatus('❌ No credential found');
      return;
    }

    if (!service) {
      setStatus('❌ Service not loaded');
      return;
    }

    setLoading(true);
    setStatus('Creating verification request...');

    try {
      // Create verification request via Product API
      const data = await PRODUCT_CLIENT.verifyRequest({
        product_id: productId,
        service_id: service.id,
        service_name: serviceName,  // Move to root level
        user_id: userId,
        credential_id: credential.credential_id,  // Move to root level
        return_url: window.location.href,  // Move to root level
        expires_in: 300,  // Move to root level (5 minutes)
        details: {
          action: 'verify',
          service_type: service.service_type,
        },
      });

      if (!data.success) {
        throw new Error(data.message || 'Failed to create verification request');
      }

      console.log('✅ Verification request created:', data.request_id);
      console.log('   Verification URL:', data.verification_url);
      console.log('   Expires at:', data.expires_at);

      setStatus('Redirecting to ZTIZEN...');

      // Redirect to ZTIZEN with request_id
      setTimeout(() => {
        window.location.href = data.verification_url;
      }, 500);

    } catch (error) {
      console.error('Verification error:', error);
      setStatus('❌ Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button
          onClick={() => navigate({ to: '/product' })}
          style={styles.backButton}
        >
          ← Back
        </button>
        <h1 style={styles.title}>{serviceName}</h1>
        <p style={styles.subtitle}>Demo Bank • {service?.service_type || 'Service'}</p>
      </div>

      {/* Wallet Connection */}
      {ready && (
        <div
          style={{
            ...styles.status,
            backgroundColor: authenticated ? '#d4edda' : '#fff3cd',
            borderColor: authenticated ? '#c3e6cb' : '#ffc107',
          }}
        >
          {authenticated ? (
            <span>
              ✅ Wallet: {userId?.slice(0, 6)}...{userId?.slice(-4)}
            </span>
          ) : (
            <div>
              <p style={{ margin: '0 0 0.75rem 0' }}>⚠️ Wallet not connected</p>
              <button
                onClick={login}
                style={{
                  ...styles.button,
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  width: 'auto',
                }}
              >
                Connect Wallet
              </button>
            </div>
          )}
        </div>
      )}

      {status && (
        <div style={styles.status}>
          {status}
        </div>
      )}

      {loading && !service && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Loading...</h2>
        </div>
      )}

      {/* No Credential - Show Register */}
      {service && !credential && authenticated && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>🔒 Register for {serviceName}</h2>
          <p style={styles.cardText}>
            You need to register with ZTIZEN to use this service.
            <br />
            This will create a secure biometric credential.
          </p>
          <button
            onClick={handleEnroll}
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.5 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Register with ZTIZEN
          </button>
        </div>
      )}

      {/* Has Credential - Show Status */}
      {service && credential && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            {credential.status === 'active' ? '✅' : '⏳'} {serviceName} Service
          </h2>
          <p style={styles.cardText}>
            Credential: {credential.credential_id.slice(0, 8)}...
            <br />
            Status: <strong>{credential.status}</strong>
          </p>

          {credential.status === 'active' && (
            <button
              onClick={handleVerify}
              disabled={loading}
              style={{
                ...styles.button,
                opacity: loading ? 0.5 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              🔐 Verify Identity & Use Service
            </button>
          )}

          {credential.status === 'pending' && (
            <button
              onClick={() => {
                navigate({ to: '/ztizen/me' });
              }}
              style={{
                ...styles.button,
                backgroundColor: '#ffc107',
              }}
            >
              Complete Registration
            </button>
          )}

          <button
            onClick={() => fetchCredential()}
            style={{
              ...styles.button,
              backgroundColor: '#6c757d',
              marginTop: '0.75rem',
            }}
          >
            Refresh Status
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8f9fa',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
    color: '#1a1a1a',
    position: 'relative' as const,
  },
  backButton: {
    position: 'absolute' as const,
    left: '0',
    top: '0',
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    backgroundColor: '#f8f9fa',
    color: '#1a1a1a',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 600,
    margin: 0,
    marginBottom: '0.5rem',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#6c757d',
    margin: 0,
  },
  status: {
    padding: '1rem',
    marginBottom: '1.5rem',
    borderRadius: '12px',
    backgroundColor: '#fff',
    border: '1px solid #e9ecef',
    textAlign: 'center' as const,
    fontSize: '0.95rem',
    maxWidth: '480px',
    margin: '0 auto 1.5rem',
    color: '#1a1a1a',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    maxWidth: '480px',
    margin: '0 auto',
    border: '1px solid #e9ecef',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    color: '#1a1a1a',
  },
  cardText: {
    fontSize: '0.9rem',
    color: '#6c757d',
    margin: '0 0 1.5rem 0',
  },
  button: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};
