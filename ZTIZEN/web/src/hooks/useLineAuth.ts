/**
 * LINE Authentication Hook
 *
 * Manages LINE OAuth state, handles callback parameters,
 * and provides methods for email submission.
 *
 * Flow:
 * 1. User clicks LINE login → redirects to LINE
 * 2. LINE redirects back with URL params
 * 3. This hook parses params and manages state
 * 4. If requiresEmail=true, parent shows email dialog
 * 5. User submits email via setEmail()
 * 6. Authentication complete
 */

import { useState, useEffect, useCallback } from 'react';
import { API_CONFIG } from '@/config/api';

const PRODUCT_API_URL = API_CONFIG.PRODUCT_API_URL;

interface LineUser {
  id: string;
  lineId?: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  hasEmail: boolean;
}

interface UseLineAuthReturn {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  user: LineUser | null;
  requiresEmail: boolean;
  error: string | null;
  sessionToken: string | null;

  // Actions
  login: (returnUrl?: string) => void;
  logout: () => void;
  setEmail: (email: string) => Promise<void>;
  checkCredential: (productId: string) => Promise<{
    hasCredential: boolean;
    credentialId?: string;
  }>;
}

export function useLineAuth(): UseLineAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<LineUser | null>(null);
  const [requiresEmail, setRequiresEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Parse LINE auth callback from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lineAuth = params.get('line_auth');

    if (lineAuth === 'success') {
      const userId = params.get('user_id');
      const needsEmail = params.get('requires_email') === 'true';
      const token = params.get('session_token');
      const displayName = params.get('display_name');

      if (userId && token) {
        setUser({
          id: userId,
          displayName: displayName || undefined,
          hasEmail: !needsEmail
        });
        setRequiresEmail(needsEmail);
        setSessionToken(token);

        // Store in sessionStorage for persistence
        sessionStorage.setItem('line_user_id', userId);
        sessionStorage.setItem('line_session_token', token);
        if (displayName) {
          sessionStorage.setItem('line_display_name', displayName);
        }
        sessionStorage.setItem('line_requires_email', needsEmail.toString());

        // Clean up URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    } else if (params.get('error')) {
      setError(params.get('error') || 'Login failed');
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Check for existing session in sessionStorage
    const storedUserId = sessionStorage.getItem('line_user_id');
    const storedToken = sessionStorage.getItem('line_session_token');
    const storedDisplayName = sessionStorage.getItem('line_display_name');
    const storedRequiresEmail = sessionStorage.getItem('line_requires_email') === 'true';

    if (storedUserId && storedToken && !user) {
      setUser({
        id: storedUserId,
        displayName: storedDisplayName || undefined,
        hasEmail: !storedRequiresEmail
      });
      setSessionToken(storedToken);
      setRequiresEmail(storedRequiresEmail);
    }
  }, []);

  // Login - redirect to LINE OAuth
  const login = useCallback((returnUrl?: string) => {
    const loginUrl = new URL(`${PRODUCT_API_URL}/api/line/login`);
    const returnPath = returnUrl || window.location.pathname + window.location.search;
    loginUrl.searchParams.set('return_url', returnPath);
    window.location.href = loginUrl.toString();
  }, []);

  // Logout - clear session
  const logout = useCallback(() => {
    setUser(null);
    setSessionToken(null);
    setRequiresEmail(false);
    sessionStorage.removeItem('line_user_id');
    sessionStorage.removeItem('line_session_token');
    sessionStorage.removeItem('line_display_name');
    sessionStorage.removeItem('line_requires_email');
  }, []);

  // Set email for first-time users
  const setEmail = useCallback(async (email: string) => {
    if (!user || !sessionToken) {
      throw new Error('Not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${PRODUCT_API_URL}/api/line/set-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          email,
          session_token: sessionToken
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to set email');
      }

      // Update user state
      setUser(prev => prev ? { ...prev, email, hasEmail: true } : null);
      setRequiresEmail(false);
      sessionStorage.setItem('line_requires_email', 'false');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to set email';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user, sessionToken]);

  // Check if user has credential for a product
  const checkCredential = useCallback(async (productId: string) => {
    if (!user || !sessionToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${PRODUCT_API_URL}/api/line/check-credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        product_id: productId
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to check credential');
    }

    return {
      hasCredential: data.has_credential,
      credentialId: data.credential?.credential_id,
      requiresEmail: data.requires_email
    };
  }, [user, sessionToken]);

  return {
    isAuthenticated: !!user && !requiresEmail,
    isLoading,
    user,
    requiresEmail,
    error,
    sessionToken,
    login,
    logout,
    setEmail,
    checkCredential
  };
}

export default useLineAuth;
