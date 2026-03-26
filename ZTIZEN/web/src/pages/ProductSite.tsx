/**
 * Product Site Demo - Gray Minimalist Theme
 * Avici Money style
 *
 * Supports multiple authentication methods:
 * - Privy (wallet-based)
 * - LINE OAuth (with required email for first login)
 */

import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PRODUCT_CLIENT } from '@/lib/api';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { useLineAuth } from '@/hooks/useLineAuth';
import { LineLoginButton } from '@/components/LineLoginButton';
import { EmailRequiredDialog } from '@/components/EmailRequiredDialog';

interface Product {
  id: string;
  product_id: string;
  product_name: string;
  services: Array<{
    id: string;
    service_name: string;
    service_type: string;
  }>;
}

interface Credential {
  credential_id: string;
  status: string;
  product_name: string;
  product_id: string;
  service_name: string;
  service_type: string;
  created_at: string;
  updated_at: string;
}

export function ProductSite() {
  // Privy wallet connection
  const { ready, authenticated: privyAuthenticated, login: privyLogin } = usePrivy();

  // LINE OAuth authentication
  const {
    isAuthenticated: lineAuthenticated,
    user: lineUser,
    requiresEmail: lineRequiresEmail,
    setEmail: setLineEmail,
    login: lineLogin
  } = useLineAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [userCredentials, setUserCredentials] = useState<Credential[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Use centralized wallet address hook - ensures consistency and lowercase normalization
  const walletAddress = useWalletAddress() || '';

  // Determine which authentication method is active
  const isAuthenticated = privyAuthenticated || lineAuthenticated;
  // Use wallet address for Privy, LINE user ID for LINE
  const userId = privyAuthenticated ? walletAddress : (lineAuthenticated ? lineUser?.id : '') || '';

  // Load Demo Bank on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const enrollSuccess = params.get('enroll_success');
    const verifySuccess = params.get('verify_success');
    const credential = params.get('credential_id');

    if (enrollSuccess === 'true' && credential) {
      setCredentialId(credential);
      setStatus('Enrollment complete');
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (verifySuccess === 'true') {
      setStatus('Verification successful');
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Load Demo Bank product
    loadDemoBank();
  }, []);

  const loadDemoBank = async () => {
    setLoading(true);
    setStatus('Loading Demo Bank...');

    try {
      // Fetch Demo Bank product by product_id
      const listData = await PRODUCT_CLIENT.getProducts();

      const demoProduct = listData.products?.find((p: Product) => p.product_id === 'demo-bank');

      if (demoProduct) {
        setProduct(demoProduct);
        setStatus('Ready');
      } else {
        setStatus('❌ Demo Bank not found. Please run: make migrate');
      }
    } catch (error) {
      console.error('Product load error:', error);
      setStatus('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  // Fetch user's existing credentials for this product
  const fetchUserCredentials = async () => {
    if (!isAuthenticated || !userId || !product) {
      return;
    }

    try {
      console.log(`📋 Fetching credentials for user ${userId} on product ${product.product_id}`);

      const data = await PRODUCT_CLIENT.getEnrollmentList(userId, product.product_id);

      if (data.success && data.enrollments && data.enrollments.length > 0) {
        console.log(`✅ Found ${data.enrollments.length} credentials`);
        setUserCredentials(data.enrollments);

        // Auto-select the first active/enrolled credential
        const activeCredential = data.enrollments.find(
          (c: Credential) => c.status === 'active' || c.status === 'enrolled'
        );

        if (activeCredential) {
          setCredentialId(activeCredential.credential_id);
          setStatus(`Credential loaded: ${activeCredential.service_name}`);
        } else {
          setCredentialId(data.enrollments[0].credential_id);
        }
      } else {
        console.log('📭 No credentials found');
        setUserCredentials([]);
        setCredentialId(null);
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
      setUserCredentials([]);
    }
  };

  // Fetch credentials when user authenticates and product is loaded
  useEffect(() => {
    if (isAuthenticated && userId && product) {
      fetchUserCredentials();
    }
  }, [isAuthenticated, userId, product]);


  const enrollWithZTIZEN = async (serviceId: string, serviceName: string) => {
    // Check authentication first
    if (!isAuthenticated || !userId) {
      // Default to Privy login, user can also use LINE
      await privyLogin();
      return;
    }

    setLoading(true);
    setStatus('Initiating enrollment...');

    try {
      // Call Product Service to initiate enrollment
      // Product Service will:
      // 1. Generate product partial key
      // 2. Call ZTIZEN API to create credential (ZTIZEN generates its partial key)
      // 3. Store credential info in Product DB
      // 4. Return redirect URL to ZTIZEN auto-add page
      const data = await PRODUCT_CLIENT.enrollmentInitiate({
        user_id: userId,
        product_id: product!.product_id,  // Use product_id string ("demo-bank"), not UUID
        service_id: serviceId,
        pin_hash: '',  // TODO: Add PIN hash if needed
      });

      if (!data.success) {
        throw new Error(data.message || 'Failed to initiate enrollment');
      }

      console.log('✅ Enrollment initiated:', data.credential_id);
      console.log('🔗 Redirecting to:', data.redirect_url);

      // Redirect to ZTIZEN auto-add page
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

  const verifyWithZTIZEN = async (serviceId: string, serviceName: string) => {
    setLoading(true);
    setStatus('Creating transaction request...');

    try {
      // Step 1: Get product partial key (product_share_key)
      const keyData = await PRODUCT_CLIENT.getPartialKeys(product!.id, serviceId);

      if (!keyData.success) {
        throw new Error('Failed to get product key');
      }

      console.log('📤 Product Partial Key:', keyData.partial_key?.slice(0, 16) + '...');

      // Step 2: Create transaction request (tx_req)
      // Generate random nonce for this transaction
      const nonce = Math.random().toString(36).substr(2, 16);
      const timestamp = Date.now();

      const txRequest = {
        tx_id: 'tx_' + Math.random().toString(36).substr(2, 12),
        product_id: product!.id,
        service_id: serviceId,
        credential_id: credentialId!,
        user_id: userId,
        nonce: nonce,
        timestamp: timestamp,
        action: serviceName,
        product_partial_key: keyData.partial_key
      };

      console.log('🔐 Transaction Request:', {
        tx_id: txRequest.tx_id,
        service: serviceName,
        credential_id: credentialId!.slice(0, 8) + '...',
        has_product_key: !!txRequest.product_partial_key
      });

      // Step 3: Redirect to ZTIZEN with tx_req parameters
      setStatus('Redirecting to ZTIZEN...');
      const returnUrl = encodeURIComponent(window.location.origin + window.location.pathname);
      const verifyUrl = new URL(`${window.location.origin}/ztizen/verify`);

      verifyUrl.searchParams.set('tx_id', txRequest.tx_id);
      verifyUrl.searchParams.set('credential_id', credentialId!);
      verifyUrl.searchParams.set('product_id', product!.id);
      verifyUrl.searchParams.set('service_id', serviceId);
      verifyUrl.searchParams.set('service_name', serviceName);
      verifyUrl.searchParams.set('user_id', userId);
      verifyUrl.searchParams.set('nonce', nonce);
      verifyUrl.searchParams.set('timestamp', timestamp.toString());
      verifyUrl.searchParams.set('action', serviceName);
      verifyUrl.searchParams.set('return_url', returnUrl);

      window.location.href = verifyUrl.toString();
    } catch (error) {
      console.error('Transaction request error:', error);
      setStatus('❌ Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setLoading(false);
    }
  };

  // Handle LINE email submission
  const handleEmailSubmit = async (email: string) => {
    await setLineEmail(email);
  };

  return (
    <div style={styles.container}>
      {/* Email Required Dialog for LINE users */}
      <EmailRequiredDialog
        isOpen={lineRequiresEmail}
        userId={lineUser?.id || ''}
        displayName={lineUser?.displayName}
        onSubmit={handleEmailSubmit}
      />

      <div style={styles.header}>
        <h1 style={styles.title}>Demo Bank</h1>
        <p style={styles.subtitle}>ZTIZEN Integration Test</p>
      </div>

      {/* Authentication Status */}
      {ready && (
        <div style={{
          ...styles.status,
          backgroundColor: isAuthenticated ? '#d4edda' : '#fff3cd',
          borderColor: isAuthenticated ? '#c3e6cb' : '#ffc107',
        }}>
          {isAuthenticated ? (
            <span>
              {privyAuthenticated ? (
                <>✅ Wallet Connected: {userId?.slice(0, 6)}...{userId?.slice(-4)}</>
              ) : lineAuthenticated ? (
                <>✅ LINE Connected: {lineUser?.displayName || lineUser?.email || 'User'}</>
              ) : null}
            </span>
          ) : (
            <div>
              <p style={{ margin: '0 0 0.75rem 0' }}>Sign in to continue</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={privyLogin} style={{
                  ...styles.button,
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  width: 'auto',
                }}>
                  Connect Wallet
                </button>
                <LineLoginButton />
              </div>
            </div>
          )}
        </div>
      )}

      {status && (
        <div style={styles.status}>
          {status}
        </div>
      )}

      {loading && !product && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Loading...</h2>
          <p style={styles.cardText}>Fetching Demo Bank configuration</p>
        </div>
      )}

      {product && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Available Services</h2>
          <p style={styles.cardText}>
            Select a service to register or verify your identity
          </p>
          <div style={styles.serviceList}>
            {product.services.map(service => (
              <a
                key={service.id}
                href={`/product/service/${service.service_name.toLowerCase()}`}
                style={{
                  ...styles.serviceButton,
                  textDecoration: 'none',
                }}
              >
                <span>{service.service_name}</span>
                <span style={{ opacity: 0.5 }}>→</span>
              </a>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// Clean professional design for product site
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8f9fa',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
    color: '#1a1a1a'
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 600,
    margin: 0,
    marginBottom: '0.5rem'
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#6c757d',
    margin: 0
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
    color: '#1a1a1a'
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    maxWidth: '480px',
    margin: '0 auto',
    border: '1px solid #e9ecef',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    color: '#1a1a1a'
  },
  cardText: {
    fontSize: '0.9rem',
    color: '#6c757d',
    margin: '0 0 1.5rem 0'
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
    transition: 'all 0.2s ease'
  },
  serviceList: {
    display: 'grid',
    gap: '0.75rem'
  },
  serviceButton: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    backgroundColor: '#f8f9fa',
    color: '#1a1a1a',
    border: '2px solid #e9ecef',
    borderRadius: '12px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 500,
    transition: 'all 0.2s ease'
  },
  credentialList: {
    display: 'grid',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  credentialButton: {
    width: '100%',
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    color: '#1a1a1a',
    border: '2px solid #e9ecef',
    borderRadius: '12px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.2s ease',
    textAlign: 'left' as const
  }
};
