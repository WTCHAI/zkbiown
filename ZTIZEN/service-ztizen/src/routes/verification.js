/**
 * Credential Verification Routes
 * Handles biometric credential verification
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import {
  verifyCredentialPin,
  validateCommitments,
  byteArrayToCommitments,
  generateAuthToken,
} from '../utils/crypto.js';

const router = express.Router();

// In-memory session storage (replace with Redis in production)
const verificationSessions = new Map();

/**
 * POST /api/verify/initiate
 * Initiate verification flow
 *
 * Called by Product Service to start verification
 */
router.post('/initiate', async (req, res) => {
  try {
    const { credential_id, callback_url } = req.body;

    // Validate required fields
    if (!credential_id || !callback_url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: credential_id, callback_url',
      });
    }

    // Check if credential exists and is active
    const credentialResult = await query(
      `SELECT credential_id, user_id, service_name, service_type, status, nonce, version
       FROM credentials
       WHERE credential_id = $1`,
      [credential_id]
    );

    if (credentialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    const credential = credentialResult.rows[0];

    if (credential.status !== 'active' && credential.status !== 'enrolled') {
      return res.status(400).json({
        success: false,
        error: 'Credential is not active',
      });
    }

    // Create verification session
    const sessionId = uuidv4();
    verificationSessions.set(sessionId, {
      credential_id,
      user_id: credential.user_id,
      service_name: credential.service_name,
      service_type: credential.service_type,
      callback_url,
      nonce: credential.nonce,
      version: credential.version,
      created_at: Date.now(),
    });

    // Auto-expire session after 5 minutes
    setTimeout(() => {
      verificationSessions.delete(sessionId);
    }, 5 * 60 * 1000);

    res.json({
      success: true,
      session_id: sessionId,
      credential_id,
      service_name: credential.service_name,
      service_type: credential.service_type,
      nonce: credential.nonce,
      version: credential.version,
      message: 'Verification initiated. User should now capture biometric and generate proof.',
    });

  } catch (error) {
    console.error('Error initiating verification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate verification',
    });
  }
});

/**
 * POST /api/verify/complete
 * Complete verification with ZK proof
 *
 * Called by frontend after user captures face and generates proof
 */
router.post('/complete', async (req, res) => {
  try {
    const {
      session_id,
      credential_pin,
      verify_commit,
      zk_proof, // Will be used in Phase 5
    } = req.body;

    // Validate session
    const session = verificationSessions.get(session_id);
    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification session',
      });
    }

    // Validate required fields
    if (!credential_pin || !verify_commit) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: credential_pin, verify_commit',
      });
    }

    // Validate commitments format
    if (!validateCommitments(verify_commit)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verify_commit format. Must be array of 128 hex strings (64 chars each)',
      });
    }

    // Get stored credential
    const credentialResult = await query(
      `SELECT
        credential_id,
        user_id,
        pin_hash,
        auth_commit,
        nonce,
        version
       FROM credentials
       WHERE credential_id = $1 AND (status = 'enrolled' OR status = 'active')`,
      [session.credential_id]
    );

    if (credentialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found or not active',
      });
    }

    const credential = credentialResult.rows[0];

    // Verify PIN
    const pinValid = verifyCredentialPin(credential_pin, credential.pin_hash);
    if (!pinValid) {
      // Log failed attempt
      await query(
        `INSERT INTO verification_logs (credential_id, success, match_rate, nonce_used)
         VALUES ($1, $2, $3, $4)`,
        [session.credential_id, false, 0.0, credential.nonce]
      );

      return res.status(401).json({
        success: false,
        error: 'Invalid credential PIN',
      });
    }

    // Parse JSONB auth_commit - it's already a parsed object/array from PostgreSQL
    let storedCommitments;
    if (typeof credential.auth_commit === 'object' && !Array.isArray(credential.auth_commit)) {
      // New format: {gaussian: [...], quantization: [...]}
      storedCommitments = credential.auth_commit;
      console.log('📊 Retrieved dual auth_commit:', {
        has_gaussian: !!storedCommitments.gaussian,
        has_quantization: !!storedCommitments.quantization,
        gaussian_length: storedCommitments.gaussian?.length,
        quantization_length: storedCommitments.quantization?.length,
      });
    } else if (Array.isArray(credential.auth_commit)) {
      // Legacy format: single array
      storedCommitments = { gaussian: credential.auth_commit };
      console.log('📊 Retrieved legacy auth_commit array:', {
        length: credential.auth_commit.length,
      });
    } else {
      console.error('Invalid auth_commit format:', typeof credential.auth_commit);
      return res.status(500).json({
        success: false,
        error: 'Invalid stored auth_commit format',
      });
    }

    // For now, compare using Gaussian template (primary)
    const templateToCompare = storedCommitments.gaussian || storedCommitments.quantization;
    if (!templateToCompare || !Array.isArray(templateToCompare)) {
      return res.status(500).json({
        success: false,
        error: 'No valid template found in stored auth_commit',
      });
    }

    // Calculate match rate - now handles 956 elements
    const commitLength = Math.min(verify_commit.length, templateToCompare.length);
    let matches = 0;
    for (let i = 0; i < commitLength; i++) {
      // Direct string comparison since both are string arrays
      if (verify_commit[i] === templateToCompare[i]) {
        matches++;
      }
    }
    const matchRate = (matches / commitLength) * 100;

    console.log('🔍 Verification comparison:', {
      verify_commit_length: verify_commit.length,
      stored_template_length: templateToCompare.length,
      compared_elements: commitLength,
      matches,
      match_rate: matchRate.toFixed(2) + '%',
    });

    // Threshold for successful verification (e.g., 95%)
    const MATCH_THRESHOLD = 95.0;
    const success = matchRate >= MATCH_THRESHOLD;

    // Log verification attempt
    await query(
      `INSERT INTO verification_logs (credential_id, success, match_rate, nonce_used)
       VALUES ($1, $2, $3, $4)`,
      [session.credential_id, success, matchRate.toFixed(2), credential.nonce]
    );

    if (!success) {
      verificationSessions.delete(session_id);
      return res.status(401).json({
        success: false,
        error: 'Biometric verification failed',
        match_rate: matchRate.toFixed(2),
      });
    }

    // Generate auth token for callback
    const authToken = generateAuthToken();

    // Clean up session
    verificationSessions.delete(session_id);

    // In real app, call callback_url here
    console.log('Would call callback:', session.callback_url, {
      session_id,
      auth_token: authToken,
      credential_id: session.credential_id,
      success: true,
    });

    res.json({
      success: true,
      message: 'Verification successful',
      match_rate: matchRate.toFixed(2),
      credential_id: session.credential_id,
      auth_token: authToken,
      callback_url: session.callback_url,
    });

  } catch (error) {
    console.error('Error completing verification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete verification',
    });
  }
});

/**
 * GET /api/verify/session/:sessionId
 * Get verification session details
 */
router.get('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = verificationSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired',
      });
    }

    res.json({
      success: true,
      session: {
        credential_id: session.credential_id,
        service_name: session.service_name,
        purpose: session.purpose,
        nonce: session.nonce,
        version: session.version,
      },
    });

  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session',
    });
  }
});

/**
 * POST /api/verify/pin-only
 * Quick PIN-only verification (for low-security operations)
 * Does not require biometric, just PIN check
 */
router.post('/pin-only', async (req, res) => {
  try {
    const { credential_id, pin_hash } = req.body;

    if (!credential_id || !pin_hash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: credential_id, pin_hash',
      });
    }

    // Get credential
    const result = await query(
      `SELECT credential_id, pin_hash, status
       FROM credentials
       WHERE credential_id = $1`,
      [credential_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    const credential = result.rows[0];

    console.log('🔐 PIN Verification Debug:', {
      credential_id: credential_id.slice(0, 8) + '...',
      received_pin_hash: pin_hash,
      received_hash_length: pin_hash?.length,
      stored_hash_length: credential.pin_hash?.length,
      hash_match: pin_hash === credential.pin_hash,
    });

    if (credential.status !== 'enrolled' && credential.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Credential is not enrolled or active',
      });
    }

    // Verify PIN by comparing SHA-256 hashes directly
    const pinValid = pin_hash === credential.pin_hash;

    console.log('🔍 PIN Verification Result:', { pinValid });

    if (!pinValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid PIN',
      });
    }

    res.json({
      success: true,
      message: 'PIN verification successful',
      credential_id,
    });

  } catch (error) {
    console.error('Error in PIN-only verification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify PIN',
    });
  }
});

/**
 * POST /api/verify/roll-nonce
 * Atomic nonce rolling with auth_commit update for replay protection
 *
 * ✅ FIX: Now updates BOTH nonce AND auth_commit
 *
 * After successful verification, the auth_commit must be recomputed with the
 * NEXT nonce so that future verifications use matching nonce values:
 *   - Verification N: auth_commit computed with nonce=N ✓
 *   - After success: store auth_commit computed with nonce=N+1
 *   - Verification N+1: auth_commit computed with nonce=N+1 ✓
 *
 * This is the "Cancelable Biometric" rolling nonce protocol.
 */
router.post('/roll-nonce', async (req, res) => {
  try {
    const {
      credential_id,
      nonce_current,
      nonce_next,
      auth_commit_gaussian_next,
      auth_commit_quantization_next,
    } = req.body;

    // Validate required fields
    if (!credential_id || !nonce_current || !nonce_next) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: credential_id, nonce_current, nonce_next',
      });
    }

    // Check if auth_commit update is provided
    const hasAuthCommitUpdate =
      (Array.isArray(auth_commit_gaussian_next) && auth_commit_gaussian_next.length > 0) ||
      (Array.isArray(auth_commit_quantization_next) && auth_commit_quantization_next.length > 0);

    // Validate auth_commit array lengths if provided
    const validLengths = [128, 256, 956];
    if (Array.isArray(auth_commit_gaussian_next) && auth_commit_gaussian_next.length > 0) {
      if (!validLengths.includes(auth_commit_gaussian_next.length)) {
        return res.status(400).json({
          success: false,
          error: `auth_commit_gaussian_next must be 128, 256, or 956 elements, got ${auth_commit_gaussian_next.length}`,
        });
      }
    }
    if (Array.isArray(auth_commit_quantization_next) && auth_commit_quantization_next.length > 0) {
      if (!validLengths.includes(auth_commit_quantization_next.length)) {
        return res.status(400).json({
          success: false,
          error: `auth_commit_quantization_next must be 128, 256, or 956 elements, got ${auth_commit_quantization_next.length}`,
        });
      }
    }

    console.log('🔄 Rolling nonce:', {
      credential_id: credential_id.slice(0, 8) + '...',
      nonce_current: String(nonce_current).slice(0, 20) + (String(nonce_current).length > 20 ? '...' : ''),
      nonce_next: String(nonce_next).slice(0, 20) + (String(nonce_next).length > 20 ? '...' : ''),
      hasAuthCommitUpdate,
      gaussianLength: auth_commit_gaussian_next?.length || 0,
      quantizationLength: auth_commit_quantization_next?.length || 0,
    });

    let result;

    if (hasAuthCommitUpdate) {
      // Build new auth_commit JSONB object
      const newAuthCommit = {};
      if (Array.isArray(auth_commit_gaussian_next) && auth_commit_gaussian_next.length > 0) {
        newAuthCommit.gaussian = auth_commit_gaussian_next;
      }
      if (Array.isArray(auth_commit_quantization_next) && auth_commit_quantization_next.length > 0) {
        newAuthCommit.quantization = auth_commit_quantization_next;
      }

      console.log('📝 Updating auth_commit with new nonce:', {
        gaussianLength: newAuthCommit.gaussian?.length,
        quantizationLength: newAuthCommit.quantization?.length,
      });

      // Atomic update: nonce + auth_commit
      // WHERE nonce = current prevents race conditions
      result = await query(
        `UPDATE credentials SET
          nonce = $1,
          auth_commit = $4::jsonb,
          verification_count = verification_count + 1,
          last_verified_at = NOW(),
          updated_at = NOW()
        WHERE credential_id = $2
          AND nonce = $3
        RETURNING credential_id, verification_count, last_verified_at, nonce`,
        [nonce_next, credential_id, nonce_current, JSON.stringify(newAuthCommit)]
      );
    } else {
      // Legacy mode: only update nonce (for backwards compatibility)
      console.log('⚠️ No auth_commit provided - only rolling nonce (legacy mode)');

      result = await query(
        `UPDATE credentials SET
          nonce = $1,
          verification_count = verification_count + 1,
          last_verified_at = NOW(),
          updated_at = NOW()
        WHERE credential_id = $2
          AND nonce = $3
        RETURNING credential_id, verification_count, last_verified_at, nonce`,
        [nonce_next, credential_id, nonce_current]
      );
    }

    // If no rows updated, nonce mismatch (concurrent verification)
    if (result.rowCount === 0) {
      console.error('⚠️ Nonce mismatch - concurrent verification detected');
      return res.status(409).json({
        success: false,
        error: 'Nonce mismatch - concurrent verification detected',
      });
    }

    console.log('✅ Nonce rolled successfully:', {
      credential_id: result.rows[0].credential_id.slice(0, 8) + '...',
      verification_count: result.rows[0].verification_count,
      new_nonce: String(result.rows[0].nonce || '').slice(0, 20) + (String(result.rows[0].nonce || '').length > 20 ? '...' : ''),
      auth_commit_updated: hasAuthCommitUpdate,
    });

    res.json({
      success: true,
      credential: result.rows[0],
      message: hasAuthCommitUpdate
        ? 'Nonce rolled and auth_commit updated successfully'
        : 'Nonce rolled successfully (legacy mode)',
    });

  } catch (error) {
    console.error('Error rolling nonce:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to roll nonce: ' + error.message,
    });
  }
});

export default router;
