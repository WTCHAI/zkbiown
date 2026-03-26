/**
 * New Enrollment Flow Routes V2
 * Handles credential-based enrollment with 3-party key sharing
 * - Product generates product_partial_key
 * - ZTIZEN generates ztizen_partial_key
 * - User derives user_partial_key from wallet signature
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import pool from '../db/pool.js';
import { hashCredentialPin } from '../utils/crypto.js';
import { validateAndNormalizeUserId } from '../middleware/validateEthereumAddress.js';

const router = express.Router();

/**
 * POST /api/enrollment/create
 * Create credential from Product service
 *
 * Request body:
 * {
 *   user_id: "0x41649a1F8B2499e2F7884184D062639CEF9d0601",  // Privy user_id or wallet address
 *   product_id: "demo-bank",
 *   product_name: "Demo Bank",
 *   service_name: "Login",
 *   service_type: "authentication"
 * }
 *
 * Response:
 * {
 *   success: true,
 *   credential_id: "a7f3e8d9-..."
 * }
 */
router.post('/create', validateAndNormalizeUserId, async (req, res) => {
  try {
    console.log('📨 POST /create received:', req.body);

    const { user_id, product_id, product_name, service_name, service_type } = req.body;

    // Validate required fields
    if (!user_id || !product_id || !product_name || !service_name || !service_type) {
      console.error('❌ Missing fields:', { user_id, product_id, product_name, service_name, service_type });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, product_id, product_name, service_name, service_type',
      });
    }

    // Generate credential_id
    const credential_id = uuidv4();

    // Generate ZTIZEN partial key (32 bytes = 64 hex characters)
    const ztizen_partial_key = crypto.randomBytes(32).toString('hex');

    console.log('🔑 Generated ZTIZEN partial key:', ztizen_partial_key.substring(0, 16) + '...');

    // Insert credential (status = 'pending')
    const result = await pool.query(
      `INSERT INTO credentials (
        credential_id,
        user_id,
        product_id,
        product_name,
        service_name,
        service_type,
        ztizen_partial_key,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING credential_id, product_id, product_name, service_name, created_at`,
      [credential_id, user_id, product_id, product_name, service_name, service_type, ztizen_partial_key, 'pending']
    );

    const credential = result.rows[0];

    console.log('✅ Credential created:', {
      credential_id,
      user_id,
      product_name,
      service_name,
      status: 'pending',
    });

    res.json({
      success: true,
      credential_id: credential.credential_id,
      product_id: credential.product_id,
      product_name: credential.product_name,
      service_name: credential.service_name,
      created_at: credential.created_at,
    });

  } catch (error) {
    console.error('❌ Error creating credential:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create credential',
      details: error.message,
    });
  }
});

/**
 * GET /api/enrollment/:credentialId
 * Get credential info for display on registration page
 *
 * Response:
 * {
 *   success: true,
 *   credential: {
 *     credential_id: "a7f3e8d9-...",
 *     product_name: "Demo Bank",
 *     service_name: "Login",
 *     status: "pending",
 *     created_at: "2024-11-30T12:00:00Z"
 *   }
 * }
 */
router.get('/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;

    // Fetch credential (including metadata for algorithm auto-detection)
    const result = await pool.query(
      `SELECT
        credential_id,
        user_id,
        product_id,
        product_name,
        service_name,
        service_type,
        ztizen_partial_key,
        status,
        created_at,
        enrolled_at,
        version,
        metadata
      FROM credentials
      WHERE credential_id = $1`,
      [credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    const credential = result.rows[0];

    console.log('📋 Retrieved credential:', credentialId, {
      algorithm: credential.metadata?.algorithmConfig?.selectedAlgorithm || 'not-set',
    });

    res.json({
      success: true,
      credential: {
        credential_id: credential.credential_id,
        product_id: credential.product_id,
        product_name: credential.product_name,
        service_name: credential.service_name,
        service_type: credential.service_type,
        ztizen_partial_key: credential.ztizen_partial_key,
        status: credential.status,
        created_at: credential.created_at,
        enrolled_at: credential.enrolled_at,
        version: credential.version,
        metadata: credential.metadata,  // Contains algorithmConfig for verification
      },
    });

  } catch (error) {
    console.error('Error fetching credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch credential',
      details: error.message,
    });
  }
});

/**
 * POST /api/enrollment/complete
 * Complete enrollment by storing auth_commits
 *
 * Request body:
 * {
 *   credential_id: "a7f3e8d9-...",
 *   auth_commit_quantization: ["bigint1", "bigint2", ...],  // Array of BigInt strings
 *   auth_commit_gaussian: ["bigint1", "bigint2", ...],      // Array of BigInt strings
 *   nonce: "bigint_string",
 *   version: 1,
 *   pin_hash: "sha256_hash_of_pin"
 * }
 *
 * Response:
 * {
 *   success: true,
 *   message: "Enrollment completed successfully"
 * }
 */
router.post('/complete', async (req, res) => {
  try {
    const {
      credential_id,
      auth_commit_quantization,
      auth_commit_gaussian,
      nonce,
      version,
      pin_hash,  // SHA-256 hash from client
      algorithmConfig,  // Algorithm configuration from frontend
    } = req.body;

    // Validate required fields
    if (!credential_id || !auth_commit_gaussian || !pin_hash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: credential_id, auth_commit_gaussian, pin_hash',
      });
    }

    console.log('🔑 Received PIN hash from client:', {
      pin_hash_length: pin_hash?.length,
      pin_hash_format: pin_hash?.length === 64 ? 'SHA-256' : 'unknown',
    });

    // Log algorithm config (important for debugging verification mismatches)
    console.log('🔧 Algorithm config received:', {
      selectedAlgorithm: algorithmConfig?.selectedAlgorithm,
      templateSizes: algorithmConfig?.templateSizes,
    });

    // Use gaussian commits as the primary auth_commit
    // (quantization is optional/for backward compatibility)
    const authCommit = auth_commit_gaussian;

    console.log('📝 Completing enrollment:', {
      credential_id,
      auth_commit_length: authCommit.length,
      nonce,
    });

    // Build metadata object (stores algorithmConfig for verification auto-detection)
    const metadata = algorithmConfig ? { algorithmConfig } : null;

    // Update credential with auth_commit (JSONB array) and metadata
    const result = await pool.query(
      `UPDATE credentials
       SET
         auth_commit = $1,
         pin_hash = $2,
         nonce = $3,
         version = $4,
         metadata = $5,
         status = 'enrolled',
         enrolled_at = NOW(),
         updated_at = NOW()
       WHERE credential_id = $6 AND status = 'pending'
       RETURNING credential_id, user_id, product_name, service_name, enrolled_at`,
      [JSON.stringify(authCommit), pin_hash, nonce || '0', version || 1, metadata ? JSON.stringify(metadata) : null, credential_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found or already enrolled',
      });
    }

    const credential = result.rows[0];

    console.log('✅ Enrollment completed:', {
      credential_id,
      user_id: credential.user_id,
      product_name: credential.product_name,
      service_name: credential.service_name,
      enrolled_at: credential.enrolled_at,
    });

    res.json({
      success: true,
      message: 'Enrollment completed successfully',
      credential_id,
      enrolled_at: credential.enrolled_at,
    });

  } catch (error) {
    console.error('Error completing enrollment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete enrollment',
      details: error.message,
    });
  }
});

/**
 * POST /api/enrollment/store
 * Store auth_commit created with Poseidon hash
 *
 * Request body:
 * {
 *   credential_id: "uuid",
 *   auth_commit: ["bigint1", "bigint2", ...],  // Array of 128 Poseidon hashes
 *   template_type: "gaussian" | "quantization",
 *   nonce: "bigint_string",
 *   version: 1,
 *   pin_hash: "sha256_hex",
 *   metadata: {}
 * }
 */
router.post('/store', async (req, res) => {
  try {
    console.log('📨 Received /store request:', {
      bodyKeys: Object.keys(req.body),
      hasCredentialId: !!req.body.credential_id,
      hasAuthCommit: !!req.body.auth_commit,
      authCommitType: typeof req.body.auth_commit,
      authCommitLength: Array.isArray(req.body.auth_commit) ? req.body.auth_commit.length : 'not-array',
      hasTemplateType: !!req.body.template_type,
      hasNonce: !!req.body.nonce,
      hasPin: !!req.body.credential_pin,
    });

    const {
      credential_id,
      auth_commit,
      template_type,
      nonce,
      version = 1,
      credential_pin,
      metadata = {},
    } = req.body;

    // Validate required fields
    if (!credential_id || !auth_commit || !template_type || !nonce || !credential_pin) {
      console.error('❌ Missing required fields:', {
        credential_id: !!credential_id,
        auth_commit: !!auth_commit,
        template_type: !!template_type,
        nonce: !!nonce,
        credential_pin: !!credential_pin,
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: credential_id, auth_commit, template_type, nonce, credential_pin',
      });
    }

    // Validate auth_commit structure - now expects an object with gaussian and quantization arrays
    let authCommitToStore;
    if (typeof auth_commit === 'object' && !Array.isArray(auth_commit)) {
      // New dual format with both templates
      if (!auth_commit.gaussian || !auth_commit.quantization) {
        return res.status(400).json({
          success: false,
          error: 'auth_commit must contain both gaussian and quantization arrays',
        });
      }
      // Accept both 956 (original MediaPipe) and 256 (Gaussian projection) element arrays
      const validLengths = [256, 956];
      if (!Array.isArray(auth_commit.gaussian) || !validLengths.includes(auth_commit.gaussian.length)) {
        return res.status(400).json({
          success: false,
          error: `auth_commit.gaussian must be array of 256 or 956 elements, got ${auth_commit.gaussian?.length}`,
        });
      }
      if (!Array.isArray(auth_commit.quantization) || !validLengths.includes(auth_commit.quantization.length)) {
        return res.status(400).json({
          success: false,
          error: `auth_commit.quantization must be array of 256 or 956 elements, got ${auth_commit.quantization?.length}`,
        });
      }
      authCommitToStore = auth_commit; // Store the whole object
      console.log('📊 Received dual auth_commit object:', {
        gaussian_length: auth_commit.gaussian.length,
        quantization_length: auth_commit.quantization.length,
        type: 'Dual MediaPipe (956-dim each)',
      });
    } else if (Array.isArray(auth_commit)) {
      // Legacy format - single array
      const validLengths = [128, 256, 956];
      if (!validLengths.includes(auth_commit.length)) {
        return res.status(400).json({
          success: false,
          error: `auth_commit array must be 128 (legacy), 256 (Gaussian projection), or 956 (MediaPipe) elements, got ${auth_commit.length}`,
        });
      }
      // Convert to new format
      authCommitToStore = {
        [template_type || 'gaussian']: auth_commit
      };
      console.log('📊 Received legacy auth_commit array:', {
        length: auth_commit.length,
        type: auth_commit.length === 956 ? 'MediaPipe (956-dim)' :
              auth_commit.length === 256 ? 'Gaussian projection (256-dim)' :
              'Legacy (128-dim)',
        stored_as: template_type || 'gaussian',
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'auth_commit must be an object with gaussian/quantization arrays or a single array',
      });
    }

    // Validate template_type
    if (!['gaussian', 'quantization', 'dual'].includes(template_type)) {
      return res.status(400).json({
        success: false,
        error: 'template_type must be "gaussian", "quantization", or "dual"',
      });
    }

    console.log('🔐 Storing auth_commit with Poseidon:', {
      credential_id,
      template_type,
      nonce: nonce.substring(0, 20) + '...',
      version,
      has_gaussian: !!authCommitToStore.gaussian,
      has_quantization: !!authCommitToStore.quantization,
      gaussian_length: authCommitToStore.gaussian?.length,
      quantization_length: authCommitToStore.quantization?.length,
    });

    // Hash PIN with PBKDF2 using credential_id as salt
    const pin_hash = hashCredentialPin(credential_pin, credential_id);
    console.log('🔑 PIN hashed with PBKDF2:', {
      pin_hash_length: pin_hash.length,
      pin_hash_preview: pin_hash.substring(0, 50) + '...',
      credential_id_length: credential_id.length
    });

    // Convert auth_commit object to JSON string for storage
    const authCommitJson = JSON.stringify(authCommitToStore);

    // Update credential with auth_commit and mark as enrolled
    const result = await pool.query(
      `UPDATE credentials SET
        auth_commit = $1,
        template_type = $2,
        nonce = $3,
        version = $4,
        pin_hash = $5,
        metadata = $6,
        status = 'enrolled',
        enrolled_at = NOW()
      WHERE credential_id = $7
      RETURNING credential_id, user_id, product_id, service_name, status, enrolled_at`,
      [authCommitJson, template_type, nonce, version, pin_hash, JSON.stringify(metadata), credential_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    const credential = result.rows[0];

    console.log('✅ Auth commit stored successfully:', credential.credential_id);

    return res.json({
      success: true,
      credential: {
        credential_id: credential.credential_id,
        user_id: credential.user_id,
        product_id: credential.product_id,
        service_name: credential.service_name,
        status: credential.status,
        enrolled_at: credential.enrolled_at,
      },
    });

  } catch (error) {
    console.error('Store auth_commit error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/enrollment/verify
 * Verify biometric and atomically roll nonce forward
 *
 * Request body:
 * {
 *   credential_id: "uuid",
 *   nonce_current: "bigint_string",         // Must match stored nonce (proves client knows current state)
 *   auth_commit_next: ["bigint1", ...],     // New auth_commit for next verification
 *   nonce_next: "bigint_string"             // New nonce to store
 * }
 *
 * Response (success):
 * {
 *   success: true,
 *   verification_count: 5,
 *   verified_at: "2025-12-01T..."
 * }
 *
 * Response (race condition / stale nonce):
 * {
 *   success: false,
 *   error: "Nonce mismatch - verification already consumed or concurrent request"
 * }
 *
 * Security:
 * - Atomic UPDATE with WHERE nonce = $current prevents race conditions
 * - If two concurrent requests try to verify, only one succeeds
 * - Rolling nonce ensures replay attacks are impossible
 */
router.post('/verify', async (req, res) => {
  try {
    const {
      credential_id,
      nonce_current,
      auth_commit_next,
      nonce_next,
    } = req.body;

    // Validate required fields
    if (!credential_id || !nonce_current || !auth_commit_next || !nonce_next) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: credential_id, nonce_current, auth_commit_next, nonce_next',
      });
    }

    // Validate auth_commit_next is array of 128 strings
    if (!Array.isArray(auth_commit_next) || auth_commit_next.length !== 128) {
      return res.status(400).json({
        success: false,
        error: 'auth_commit_next must be array of 128 BigInt strings',
      });
    }

    console.log('🔐 Verification attempt:', {
      credential_id,
      nonce_current: nonce_current.substring(0, 20) + '...',
      nonce_next: nonce_next.substring(0, 20) + '...',
    });

    // Convert auth_commit_next array to JSON string for storage
    const authCommitNextJson = JSON.stringify(auth_commit_next);

    // ATOMIC UPDATE: Only succeeds if nonce matches (prevents race condition)
    // If two concurrent requests come in:
    //   - First one matches nonce → succeeds, updates nonce
    //   - Second one finds new nonce → fails WHERE clause → 0 rows updated
    const result = await pool.query(
      `UPDATE credentials SET
        auth_commit = $1,
        nonce = $2,
        verification_count = COALESCE(verification_count, 0) + 1,
        last_verified_at = NOW(),
        updated_at = NOW()
      WHERE credential_id = $3
        AND nonce = $4
        AND status = 'enrolled'
      RETURNING
        credential_id,
        user_id,
        product_id,
        service_name,
        verification_count,
        last_verified_at`,
      [authCommitNextJson, nonce_next, credential_id, nonce_current]
    );

    // No rows updated = nonce mismatch (stale, already consumed, or concurrent request won)
    if (result.rows.length === 0) {
      console.warn('⚠️ Verification failed - nonce mismatch:', {
        credential_id,
        nonce_current: nonce_current.substring(0, 20) + '...',
      });

      return res.status(409).json({
        success: false,
        error: 'Nonce mismatch - verification already consumed or concurrent request',
        code: 'NONCE_MISMATCH',
      });
    }

    const credential = result.rows[0];

    console.log('✅ Verification successful:', {
      credential_id: credential.credential_id,
      user_id: credential.user_id,
      verification_count: credential.verification_count,
      verified_at: credential.last_verified_at,
    });

    return res.json({
      success: true,
      credential_id: credential.credential_id,
      user_id: credential.user_id,
      product_id: credential.product_id,
      service_name: credential.service_name,
      verification_count: credential.verification_count,
      verified_at: credential.last_verified_at,
    });

  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/enrollment/:credentialId/nonce
 * Get current nonce for a credential (needed for verification flow)
 *
 * Response:
 * {
 *   success: true,
 *   nonce: "bigint_string",
 *   version: 1
 * }
 */
router.get('/:credentialId/nonce', async (req, res) => {
  try {
    const { credentialId } = req.params;

    const result = await pool.query(
      `SELECT nonce, version
       FROM credentials
       WHERE credential_id = $1 AND status = 'enrolled'`,
      [credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found or not enrolled',
      });
    }

    const { nonce, version } = result.rows[0];

    return res.json({
      success: true,
      nonce,
      version,
    });

  } catch (error) {
    console.error('Get nonce error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
