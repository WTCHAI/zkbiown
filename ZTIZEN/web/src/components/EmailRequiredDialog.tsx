/**
 * Email Required Dialog
 *
 * Modal dialog that forces users to enter their email
 * before they can proceed with credential creation.
 *
 * Used when:
 * - First time LINE login (no email yet)
 * - User.email is empty/null
 */

import React, { useState } from 'react';

interface EmailRequiredDialogProps {
  isOpen: boolean;
  userId: string;
  displayName?: string;
  onSubmit: (email: string) => Promise<void>;
  onClose?: () => void;  // Optional - dialog may be non-dismissable
}

export function EmailRequiredDialog({
  isOpen,
  userId,
  displayName,
  onSubmit,
  onClose
}: EmailRequiredDialogProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      await onSubmit(email.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <div style={styles.header}>
          <h2 style={styles.title}>Email Required</h2>
          <p style={styles.subtitle}>
            {displayName ? `Welcome, ${displayName}!` : 'Welcome!'} Please enter your email to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={styles.input}
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            style={{
              ...styles.button,
              opacity: loading || !email.trim() ? 0.6 : 1
            }}
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>

        <p style={styles.hint}>
          Your email is required for account recovery and notifications.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)'
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)'
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '1.5rem'
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: 0,
    marginBottom: '0.5rem',
    color: '#1a1a1a'
  },
  subtitle: {
    fontSize: '0.95rem',
    color: '#6c757d',
    margin: 0
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem'
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#1a1a1a'
  },
  input: {
    padding: '0.875rem 1rem',
    fontSize: '1rem',
    border: '2px solid #e9ecef',
    borderRadius: '12px',
    outline: 'none',
    transition: 'border-color 0.2s',
    width: '100%',
    boxSizing: 'border-box' as const
  },
  error: {
    padding: '0.75rem 1rem',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '8px',
    fontSize: '0.9rem'
  },
  button: {
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#06C755',  // LINE green
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: '0.5rem'
  },
  hint: {
    marginTop: '1.5rem',
    fontSize: '0.8rem',
    color: '#9ca3af',
    textAlign: 'center' as const
  }
};

export default EmailRequiredDialog;
