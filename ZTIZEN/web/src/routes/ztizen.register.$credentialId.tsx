/**
 * ZTIZEN Registration - 4-Stage Enrollment Flow
 * Route: /ztizen/register/:credentialId
 *
 * Flow (4 stages):
 * 1. PIN Entry (mobile-style 6-digit input)
 * 2. PIN Confirmation (re-enter PIN)
 * 3. Password + Wallet Signature
 * 4. Biometric Capture (navigate to scan page)
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWalletSignature } from '@/hooks/useWalletSignature';
import { useEnrollmentStore } from '@/stores/useEnrollmentStore';
import { useSimulationStore } from '@/stores/useSimulationStore';
import { useDemoNavigationStore } from '@/stores/useDemoNavigationStore';
import { PINInput } from '@/components/PINInput';
import { ZTIZEN_CLIENT } from '@/lib/api';
import { API_CONFIG } from '@/config/api';
import { FlowBreadcrumb, StepIndicator } from '@/components/FlowBreadcrumb';

type EnrollmentStage = 'pin1' | 'pin2' | 'password' | 'signature';

export const Route = createFileRoute('/ztizen/register/$credentialId')({
  component: ZTIZENRegister,
});

// API returns partial data from getEnrollment()
interface CredentialInfo {
  credential_id: string;
  product_partial_key: string;
  ztizen_partial_key: string;
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

function ZTIZENRegister() {
  const { credentialId } = Route.useParams();
  const navigate = useNavigate();
  const [credentialInfo, setCredentialInfo] = useState<CredentialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Privy wallet connection
  const { ready, authenticated, login, logout } = usePrivy();
  const { signPassword, isLoading: isSigningPassword } = useWalletSignature();

  // Enrollment store (NEW)
  const {
    pin,
    password,
    signature,
    address,
    setCredentialInfo: setEnrollmentCredentialInfo,
    setPin,
    setPassword,
    setSignature,
    setUserKey,
    currentStep,
    reset: resetEnrollment,
  } = useEnrollmentStore();

  // Simulation flow tracking
  const { setFlowType, setCurrentStep: setSimulationStep } = useSimulationStore();

  // Demo navigation tracking
  const { setCurrentStep: setDemoStep, setLastCredential } = useDemoNavigationStore();

  // Reset enrollment data when starting a NEW enrollment
  // This ensures PIN and password must be entered manually every time
  useEffect(() => {
    console.log('🔄 Resetting enrollment store for new registration');
    resetEnrollment();
    // Set simulation flow type to enrollment
    setFlowType('enrollment');
    // Track demo navigation: started enrollment
    setDemoStep('enroll_start');
    setLastCredential(credentialId);
  }, [credentialId]); // Reset when credential ID changes (new enrollment)

  // Local state for PIN/password confirmation and stage management
  // Initialize stage based on what data is already in the store (for page refresh recovery)
  const getInitialStage = (): EnrollmentStage => {
    if (signature && password && pin) return 'signature'; // Ready to sign or already signed
    if (password && pin) return 'password'; // Have PIN, at password stage
    if (pin) return 'pin2'; // Have PIN, need confirmation
    return 'pin1'; // Starting fresh
  };

  const [currentStage, setCurrentStage] = useState<EnrollmentStage>(getInitialStage());
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Track current stage in simulation panel
  useEffect(() => {
    const stageMapping: Record<EnrollmentStage, 'pin' | 'pin_confirm' | 'password' | 'signature'> = {
      'pin1': 'pin',
      'pin2': 'pin_confirm',
      'password': 'password',
      'signature': 'signature',
    };
    setSimulationStep(stageMapping[currentStage]);
  }, [currentStage, setSimulationStep]);

  // Fetch credential info
  useEffect(() => {
    const fetchCredentialInfo = async () => {
      try {
        setError('');
        
        // First, fetch from ZTIZEN service (for partial keys)
        const data = await ZTIZEN_CLIENT.getEnrollment(credentialId);

        if (data.success) {
          setCredentialInfo(data.credential);
          
          // Then fetch from Product Service to get product_id and service_name
          try {
            const productResponse = await fetch(
              `${API_CONFIG.PRODUCT_API_URL}/api/enrollment/status/${credentialId}`
            );
            
            if (productResponse.ok) {
              const productData = await productResponse.json();
              
              if (productData.success) {
                console.log('✅ Fetched credential metadata from Product Service:', {
                  product_id: productData.product_id,
                  service_name: productData.service_name,
                  service_type: productData.service_type,
                });

                // Store complete credential metadata in enrollment store
                // IMPORTANT: serviceType must match what's stored in ZTIZEN DB for Poseidon hash
                setEnrollmentCredentialInfo({
                  credentialId: credentialId,
                  productId: productData.product_id || '',
                  serviceName: productData.service_name || '',
                  serviceType: productData.service_type || 'authentication',
                  userId: productData.user_id || '',
                });
              }
            } else {
              console.warn('Could not fetch product metadata, using defaults');
              // Fallback: set minimal data
              setEnrollmentCredentialInfo({
                credentialId: credentialId,
                productId: 'unknown-product',
                serviceName: 'unknown-service',
                serviceType: 'authentication',
                userId: '',
              });
            }
          } catch (productErr) {
            console.error('Error fetching product metadata:', productErr);
            // Fallback: set minimal data
            setEnrollmentCredentialInfo({
              credentialId: credentialId,
              productId: 'unknown-product',
              serviceName: 'unknown-service',
              serviceType: 'authentication',
              userId: '',
            });
          }
        } else {
          setError('Credential not found');
        }
      } catch (err) {
        console.error('Error fetching credential:', err);
        setError('Failed to load credential information');
      } finally {
        setLoading(false);
      }
    };

    fetchCredentialInfo();
  }, [credentialId, setEnrollmentCredentialInfo]);

  // Stage 1: PIN Entry
  const handlePinContinue = () => {
    if (!pin || pin.length < 4 || pin.length > 6) {
      setError('PIN must be 4-6 digits');
      return;
    }

    setError('');
    setCurrentStage('pin2');
  };

  // Stage 2: PIN Confirmation
  const handleConfirmPinContinue = () => {
    if (confirmPin !== pin) {
      setError('PINs do not match');
      return;
    }

    setError('');
    setCurrentStage('password');
  };

  // Stage 3: Password Entry
  const handlePasswordContinue = () => {
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!authenticated) {
      setError('Please connect wallet first');
      return;
    }

    setError('');
    setCurrentStage('signature');
  };

  // Stage 4: Wallet Signature
  const handleSign = async () => {
    if (!pin || !password) {
      setError('PIN and password are required');
      return;
    }

    try {
      setError('');
      const result = await signPassword(password, pin);

      console.log('✅ Password signed with wallet:', {
        address: result.address,
        signature: result.signature.slice(0, 20) + '...',
        userKey: '✅ Derived (' + result.userKey.length + ' bytes)',
      });

      // Store data in enrollment store
      setSignature(result.signature, result.address);
      setUserKey(result.userKey);

      console.log('✅ Enrollment data stored in useEnrollmentStore');

      // Navigate to scan page (enrollment store already has all data)
      navigate({
        to: '/ztizen/register-scan/$credentialId',
        params: { credentialId },
      });

    } catch (err) {
      console.error('❌ Signature error:', err);
      setError('Failed to sign with wallet: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // Back button handler
  const handleBack = () => {
    setError('');

    const stageOrder: EnrollmentStage[] = ['pin1', 'pin2', 'password', 'signature'];
    const currentIndex = stageOrder.indexOf(currentStage);

    if (currentIndex > 0) {
      setCurrentStage(stageOrder[currentIndex - 1]);
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
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Create Identity</h1>
        <p style={styles.subtitle}>ZTIZEN Biometric Authentication</p>
      </div>

      {/* Identity Card - Always visible */}
      <div style={styles.card}>
        <div style={styles.identityCard}>
          <div style={styles.cardHeader}>
            <div style={styles.logo}>{getServiceIcon('authentication')}</div>
            <div>
              <h2 style={styles.productName}>ZTIZEN Credential</h2>
              <p style={styles.serviceName}>Status: {credentialInfo.status}</p>
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
          flow="enrollment"
          currentPhase="keys"
          currentStep={currentStage === 'pin1' ? 1 : currentStage === 'pin2' ? 2 : currentStage === 'password' ? 3 : 4}
          totalSteps={4}
          compact={false}
        />

        {/* Enhanced Step Indicator */}
        <div style={styles.stepIndicatorContainer}>
          <StepIndicator
            steps={[
              { id: 'pin1', label: 'PIN', icon: '🔢' },
              { id: 'pin2', label: 'Confirm', icon: '✓' },
              { id: 'password', label: 'Password', icon: '🔐' },
              { id: 'signature', label: 'Sign', icon: '✍️' },
            ]}
            currentStep={currentStage}
            orientation="horizontal"
          />
        </div>

        {/* Progress Bar */}
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: currentStage === 'pin1' ? '25%' : currentStage === 'pin2' ? '50%' : currentStage === 'password' ? '75%' : '100%',
              }}
            />
          </div>
          <p style={styles.progressText}>
            Step {currentStage === 'pin1' ? '1' : currentStage === 'pin2' ? '2' : currentStage === 'password' ? '3' : '4'} of 4 — {
              currentStage === 'pin1' ? 'Enter your PIN' :
              currentStage === 'pin2' ? 'Confirm your PIN' :
              currentStage === 'password' ? 'Create password' :
              'Sign with wallet'
            }
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={styles.errorCard}>
            {error}
          </div>
        )}

        {/* Wallet Connection (prerequisite) */}
        {!authenticated && (
          <div style={styles.walletSection}>
            <h3 style={styles.sectionTitle}>Connect Wallet First</h3>
            <p style={styles.sectionDesc}>You'll use your wallet to sign a message that creates a secure key</p>

            {!ready && (
              <div style={styles.infoCard}>
                Loading Privy...
              </div>
            )}

            {ready && !authenticated && (
              <>
                <button onClick={login} style={styles.button}>
                  Connect Wallet
                </button>
                <div style={{...styles.infoCard, marginTop: '1rem'}}>
                  🔐 Privy manages your wallet securely
                </div>
              </>
            )}
          </div>
        )}

        {/* Stage 1: PIN Entry */}
        {authenticated && currentStage === 'pin1' && (
          <div style={styles.stageContainer}>
            <h3 style={styles.sectionTitle}>Enter PIN</h3>
            <p style={styles.sectionDesc}>Create a 4-6 digit PIN for this credential</p>

            <PINInput
              value={pin || ''}
              onChange={setPin}
              length={6}
              autoFocus={true}
            />

            <button
              onClick={handlePinContinue}
              disabled={!pin || pin.length < 4}
              style={{
                ...styles.button,
                opacity: (!pin || pin.length < 4) ? 0.5 : 1,
              }}
            >
              Continue
            </button>

            {authenticated && (
              <button onClick={logout} style={{...styles.backButton, marginTop: '1rem'}}>
                Disconnect Wallet
              </button>
            )}
          </div>
        )}

        {/* Stage 2: PIN Confirmation */}
        {authenticated && currentStage === 'pin2' && (
          <div style={styles.stageContainer}>
            <h3 style={styles.sectionTitle}>Confirm PIN</h3>
            <p style={styles.sectionDesc}>Re-enter your {pin?.length || 0}-digit PIN</p>

            <PINInput
              value={confirmPin}
              onChange={setConfirmPin}
              length={pin?.length || 6}
              autoFocus={true}
            />

            <button
              onClick={handleConfirmPinContinue}
              disabled={!pin || confirmPin.length < pin.length}
              style={{
                ...styles.button,
                opacity: (!pin || confirmPin.length < pin.length) ? 0.5 : 1,
              }}
            >
              Continue
            </button>

            <button onClick={handleBack} style={styles.backButton}>
              Back
            </button>
          </div>
        )}

        {/* Stage 3: Password Entry */}
        {authenticated && currentStage === 'password' && (
          <div style={styles.stageContainer}>
            <h3 style={styles.sectionTitle}>Create Master Password</h3>
            <p style={styles.sectionDesc}>This password is your master secret for ZTIZEN</p>

            <input
              type="password"
              value={password || ''}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password (min 8 characters)"
              autoFocus
              style={styles.input}
            />

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              style={styles.input}
            />

            <button
              onClick={handlePasswordContinue}
              disabled={!password || password.length < 8 || password !== confirmPassword}
              style={{
                ...styles.button,
                opacity: (!password || password.length < 8 || password !== confirmPassword) ? 0.5 : 1,
              }}
            >
              Continue
            </button>

            <button onClick={handleBack} style={styles.backButton}>
              Back
            </button>
          </div>
        )}

        {/* Stage 4: Wallet Signature */}
        {authenticated && currentStage === 'signature' && (
          <div style={styles.stageContainer}>
            <h3 style={styles.sectionTitle}>Sign Message</h3>
            <p style={styles.sectionDesc}>Sign with your wallet to create your unique user key</p>

            <div style={styles.summaryCard}>
              <div style={styles.summaryRow}>
                <span>PIN:</span>
                <span>{'*'.repeat(pin?.length || 0)} ({pin?.length || 0} digits)</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Password:</span>
                <span>{'*'.repeat(8)} (set)</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Status:</span>
                <span>{credentialInfo.status}</span>
              </div>
            </div>

            <button
              onClick={handleSign}
              disabled={isSigningPassword}
              style={{
                ...styles.button,
                opacity: isSigningPassword ? 0.5 : 1,
              }}
            >
              {isSigningPassword ? 'Signing...' : 'Sign with Wallet'}
            </button>

            <button onClick={handleBack} style={styles.backButton} disabled={isSigningPassword}>
              Back
            </button>

            <div style={{...styles.infoCard, marginTop: '1rem'}}>
              📝 This signature will be used to create your biometric template key
            </div>
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
  header: {
    textAlign: 'center',
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
    textAlign: 'center',
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
    boxSizing: 'border-box',
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
    textAlign: 'center',
    marginBottom: '1rem',
  },
  infoCard: {
    backgroundColor: '#f0f4ff',
    border: '1px solid #d0e0ff',
    padding: '1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: '#667eea',
    textAlign: 'center',
  },
  walletSection: {
    marginTop: '1rem',
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
    textAlign: 'center',
  },
};
