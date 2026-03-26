/**
 * Landing Page
 *
 * Ultra-minimal iOS-style entry point for the
 * ZTIZEN Zero-Knowledge Biometric Identity System
 *
 * For senior capstone demonstration
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { usePrivy } from '@privy-io/react-auth';
import { useWalletAddress } from '@/hooks/useWalletAddress';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  const { ready, authenticated, login, logout } = usePrivy();
  const walletAddress = useWalletAddress();

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Logo & Title */}
        <div style={styles.logoSection}>
          <div style={styles.logo}>🔐</div>
          <h1 style={styles.title}>ZTIZEN</h1>
          <p style={styles.subtitle}>Zero-Knowledge Biometric Identity</p>
        </div>

        {/* Main Actions */}
        <div style={styles.actions}>
          {ready && !authenticated ? (
            <button onClick={login} style={styles.primaryButton}>
              Connect Wallet
            </button>
          ) : ready && authenticated ? (
            <>
              <div style={styles.walletInfo}>
                <span style={styles.walletIcon}>✓</span>
                <span style={styles.walletAddress}>
                  {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                </span>
              </div>

              <Link to="/product" style={styles.primaryButton}>
                Product Demo
              </Link>

              <Link to="/ztizen/me" style={styles.secondaryButton}>
                My Credentials
              </Link>

              <button onClick={logout} style={styles.textButton}>
                Disconnect Wallet
              </button>
            </>
          ) : (
            <div style={styles.loading}>Loading...</div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <p style={styles.footerText}>Senior Project</p>
          <p style={styles.footerSchool}>Kasetsart University</p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#fff',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1.5rem',
    maxWidth: '400px',
    margin: '0 auto',
    width: '100%',
  },

  // Logo Section
  logoSection: {
    textAlign: 'center' as const,
    marginBottom: '3rem',
  },
  logo: {
    fontSize: '4rem',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#666',
    margin: '0.5rem 0 0 0',
    fontWeight: 400,
  },

  // Actions Section
  actions: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
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
    textAlign: 'center' as const,
    textDecoration: 'none',
    display: 'block',
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
    textAlign: 'center' as const,
    textDecoration: 'none',
    display: 'block',
  },
  textButton: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#666',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },

  // Wallet Info
  walletInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    backgroundColor: '#f0fdf4',
    borderRadius: '8px',
    marginBottom: '0.5rem',
  },
  walletIcon: {
    color: '#22c55e',
    fontWeight: 600,
  },
  walletAddress: {
    fontSize: '0.9rem',
    color: '#1a1a1a',
    fontFamily: 'monospace',
  },

  // Loading
  loading: {
    textAlign: 'center' as const,
    color: '#666',
    padding: '1rem',
  },

  // Footer
  footer: {
    marginTop: 'auto',
    paddingTop: '3rem',
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: '0.85rem',
    color: '#999',
    margin: 0,
  },
  footerSchool: {
    fontSize: '0.8rem',
    color: '#bbb',
    margin: '0.25rem 0 0 0',
  },
};
