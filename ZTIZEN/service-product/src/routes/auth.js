/**
 * Authentication routes for Product Service
 * Handles registration, login initiation, and ZTIZEN callbacks
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateSessionId } from '../utils/crypto.js';
import { ENV } from '../config/env.js';

const router = express.Router();

// In-memory storage (replace with database in production)
const users = new Map();
const sessions = new Map();

/**
 * POST /api/auth/register
 * Register new user and initiate ZTIZEN enrollment
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, service_name, purpose } = req.body;

    // Validate input
    if (!username || !email || !service_name || !purpose) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: username, email, service_name, purpose'
      });
    }

    // Check if user already exists
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Create user
    const userId = uuidv4();
    const user = {
      id: userId,
      username,
      email,
      created_at: new Date().toISOString()
    };

    users.set(userId, user);

    // Create session for ZTIZEN enrollment
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      user_id: userId,
      type: 'enrollment',
      service_name,
      purpose,
      created_at: Date.now()
    });

    // Build ZTIZEN enrollment URL
    const redirectUrl = `${ENV.FRONTEND_URL}?` + new URLSearchParams({
      action: 'enroll',
      session_id: sessionId,
      user_id: userId,
      service_name,
      purpose,
      callback_url: `http://localhost:${ENV.PORT}/api/auth/callback`
    }).toString();

    res.json({
      success: true,
      user_id: userId,
      redirect_url: redirectUrl,
      session_id: sessionId,
      message: 'User registered. Please complete biometric enrollment.'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/login-request
 * Initiate login by redirecting to ZTIZEN verification
 */
router.post('/login-request', async (req, res) => {
  try {
    const { email, credential_id } = req.body;

    if (!email || !credential_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, credential_id'
      });
    }

    // Find user
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Create session for verification
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      user_id: user.id,
      credential_id,
      type: 'verification',
      created_at: Date.now()
    });

    // Build ZTIZEN verification URL
    const redirectUrl = `${ENV.FRONTEND_URL}?` + new URLSearchParams({
      action: 'verify',
      session_id: sessionId,
      user_id: user.id,
      credential_id,
      callback_url: `http://localhost:${ENV.PORT}/api/auth/callback`
    }).toString();

    res.json({
      success: true,
      redirect_url: redirectUrl,
      session_id: sessionId,
      message: 'Please complete biometric verification.'
    });

  } catch (error) {
    console.error('Login request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/callback
 * Handle callback from ZTIZEN after enrollment or verification
 */
router.post('/callback', async (req, res) => {
  try {
    const { session_id, auth_token, credential_id } = req.body;

    if (!session_id || !auth_token) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: session_id, auth_token'
      });
    }

    // Validate session
    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired session'
      });
    }

    // Check session expiry (30 minutes)
    const sessionAge = Date.now() - session.created_at;
    if (sessionAge > 30 * 60 * 1000) {
      sessions.delete(session_id);
      return res.status(401).json({
        success: false,
        error: 'Session expired'
      });
    }

    // TODO: Verify auth_token with ZTIZEN service
    // For now, we trust it in demo

    const user = users.get(session.user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Clean up session
    sessions.delete(session_id);

    // Generate product access token (simplified - use JWT in production)
    const accessToken = generateSessionId();

    if (session.type === 'enrollment') {
      res.json({
        success: true,
        message: 'Enrollment successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        credential_id,
        access_token: accessToken
      });
    } else {
      res.json({
        success: true,
        message: 'Verification successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        access_token: accessToken
      });
    }

  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/auth/session/:sessionId
 * Check session status (for frontend polling)
 */
router.get('/session/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  res.json({
    success: true,
    session: {
      type: session.type,
      created_at: session.created_at
    }
  });
});

export default router;
