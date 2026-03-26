/**
 * LINE Authentication Routes
 *
 * Flow:
 * 1. User clicks "Login with LINE" → redirects to LINE OAuth
 * 2. LINE redirects back with auth code → exchange for access token
 * 3. Get LINE user profile → check if user exists in DB
 * 4. If NO user exists:
 *    - Create user record with line_id
 *    - Return requires_email: true → Frontend shows email dialog
 * 5. User submits email → update user record
 * 6. Return JWT session token
 */

import express from 'express';
import crypto from 'crypto';
import pool from '../db/pool.js';
import { ENV } from '../config/env.js';

const router = express.Router();

// In-memory state storage (use Redis in production)
const pendingStates = new Map();

// JWT-like session tokens (simplified - use proper JWT in production)
const generateToken = () => crypto.randomBytes(32).toString('hex');

/**
 * GET /api/line/login
 * Initiate LINE OAuth flow - redirects to LINE authorization page
 */
router.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const { return_url } = req.query;

  // Store state for CSRF protection
  pendingStates.set(state, {
    return_url: return_url || '/',
    created_at: Date.now()
  });

  // Clean up old states (older than 10 minutes)
  for (const [key, value] of pendingStates.entries()) {
    if (Date.now() - value.created_at > 10 * 60 * 1000) {
      pendingStates.delete(key);
    }
  }

  const lineAuthUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  lineAuthUrl.searchParams.set('response_type', 'code');
  lineAuthUrl.searchParams.set('client_id', ENV.LINE_CHANNEL_ID);
  lineAuthUrl.searchParams.set('redirect_uri', ENV.LINE_CALLBACK_URL);
  lineAuthUrl.searchParams.set('state', state);
  lineAuthUrl.searchParams.set('scope', 'profile openid email');

  console.log('🔗 Redirecting to LINE OAuth:', lineAuthUrl.toString());

  res.redirect(lineAuthUrl.toString());
});

/**
 * GET /api/line/callback
 * Handle LINE OAuth callback - exchange code for tokens
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for LINE errors
    if (error) {
      console.error('LINE OAuth error:', error, error_description);
      return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
    }

    // Validate state for CSRF protection
    const pendingState = pendingStates.get(state);
    if (!pendingState) {
      console.error('Invalid or expired state');
      return res.redirect('/?error=invalid_state');
    }
    pendingStates.delete(state);

    console.log('📨 LINE callback received with code:', code?.slice(0, 10) + '...');

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: ENV.LINE_CALLBACK_URL,
        client_id: ENV.LINE_CHANNEL_ID,
        client_secret: ENV.LINE_CHANNEL_SECRET
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('LINE token error:', errorText);
      return res.redirect('/?error=token_exchange_failed');
    }

    const tokens = await tokenResponse.json();
    console.log('✅ Got LINE tokens');

    // Get user profile
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    if (!profileResponse.ok) {
      console.error('LINE profile error');
      return res.redirect('/?error=profile_fetch_failed');
    }

    const profile = await profileResponse.json();
    console.log('👤 LINE profile:', {
      userId: profile.userId,
      displayName: profile.displayName
    });

    // Check if user exists in our database
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE line_id = $1',
      [profile.userId]
    );

    let user;
    let requiresEmail = false;

    if (existingUser.rows.length > 0) {
      // User exists - check if email is set
      user = existingUser.rows[0];
      requiresEmail = !user.email || user.email === '';
      console.log('👤 Existing user found:', user.id, 'requiresEmail:', requiresEmail);
    } else {
      // Create new user (without email - will be required)
      const newUserResult = await pool.query(
        `INSERT INTO users (line_id, display_name, avatar_url)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [profile.userId, profile.displayName, profile.pictureUrl]
      );
      user = newUserResult.rows[0];
      requiresEmail = true;
      console.log('✨ New user created:', user.id, '- email required');
    }

    // Generate session token
    const sessionToken = generateToken();

    // Store session (in production, use Redis)
    // For now, redirect with token in URL (not ideal for production)
    const returnUrl = new URL(pendingState.return_url || '/', ENV.FRONTEND_URL);
    returnUrl.searchParams.set('line_auth', 'success');
    returnUrl.searchParams.set('user_id', user.id);
    returnUrl.searchParams.set('requires_email', requiresEmail.toString());
    returnUrl.searchParams.set('session_token', sessionToken);

    if (user.display_name) {
      returnUrl.searchParams.set('display_name', user.display_name);
    }

    console.log('🔗 Redirecting to:', returnUrl.toString());
    res.redirect(returnUrl.toString());

  } catch (error) {
    console.error('LINE callback error:', error);
    res.redirect('/?error=callback_failed');
  }
});

/**
 * POST /api/line/set-email
 * Set email for LINE user (required for first login)
 *
 * Request body:
 * {
 *   user_id: "uuid",
 *   email: "user@example.com",
 *   session_token: "..."  // From callback
 * }
 */
router.post('/set-email', async (req, res) => {
  try {
    const { user_id, email, session_token } = req.body;

    // Validate required fields
    if (!user_id || !email || !session_token) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, email, session_token'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // TODO: Validate session_token against stored tokens (Redis in production)

    // Check if email is already taken
    const existingEmail = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, user_id]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email is already registered'
      });
    }

    // Update user with email
    const result = await pool.query(
      `UPDATE users
       SET email = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, line_id, email, display_name, created_at`,
      [email, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    console.log('✅ Email set for user:', user.id, '→', email);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name
      },
      message: 'Email registered successfully'
    });

  } catch (error) {
    console.error('Set email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set email',
      details: error.message
    });
  }
});

/**
 * GET /api/line/me
 * Get current LINE user profile
 *
 * Query params:
 * - user_id: User UUID
 * - session_token: Session token from login
 */
router.get('/me', async (req, res) => {
  try {
    const { user_id, session_token } = req.query;

    if (!user_id || !session_token) {
      return res.status(400).json({
        success: false,
        error: 'Missing user_id or session_token'
      });
    }

    // TODO: Validate session_token

    const result = await pool.query(
      `SELECT id, line_id, email, display_name, avatar_url, created_at
       FROM users WHERE id = $1 AND is_active = true`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        line_id: user.line_id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        has_email: !!user.email,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user',
      details: error.message
    });
  }
});

/**
 * POST /api/line/check-credential
 * Check if LINE user has an existing credential for a product
 *
 * Request body:
 * {
 *   user_id: "uuid",  // LINE user UUID
 *   product_id: "demo-bank"
 * }
 */
router.post('/check-credential', async (req, res) => {
  try {
    const { user_id, product_id } = req.body;

    if (!user_id || !product_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing user_id or product_id'
      });
    }

    // Get LINE user
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Check if user has email (required before credential creation)
    if (!user.email) {
      return res.json({
        success: true,
        has_credential: false,
        requires_email: true,
        message: 'Email required before credential creation'
      });
    }

    // Check for existing credential linked to this LINE user
    const credentialResult = await pool.query(
      `SELECT uc.credential_id, uc.status, p.product_id, p.product_name
       FROM user_credentials uc
       JOIN products p ON uc.product_id = p.id
       WHERE uc.social_user_id = $1
         AND p.product_id = $2
         AND uc.status IN ('active', 'enrolled', 'pending')
       ORDER BY uc.created_at DESC
       LIMIT 1`,
      [user_id, product_id]
    );

    if (credentialResult.rows.length > 0) {
      const credential = credentialResult.rows[0];
      return res.json({
        success: true,
        has_credential: true,
        credential: {
          credential_id: credential.credential_id,
          status: credential.status,
          product_id: credential.product_id,
          product_name: credential.product_name
        }
      });
    }

    // No credential found
    res.json({
      success: true,
      has_credential: false,
      requires_email: false,
      message: 'No credential found - enrollment required'
    });

  } catch (error) {
    console.error('Check credential error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check credential',
      details: error.message
    });
  }
});

export default router;
