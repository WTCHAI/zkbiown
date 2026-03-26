/**
 * Credential Management Routes
 * Handles CRUD operations for user identity credentials
 */

import express from 'express';
import { query } from '../db/pool.js';
import pool from '../db/pool.js';
import { byteArrayToCommitments } from '../utils/crypto.js';
import { validateAndNormalizeUserId } from '../middleware/validateEthereumAddress.js';

const router = express.Router();

/**
 * GET /api/credentials/me
 * List all credentials for the current user (wallet-based)
 * Query params: userId (wallet address)
 */
router.get('/me', validateAndNormalizeUserId, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter (wallet address)',
      });
    }

    const result = await query(
      `SELECT
        credential_id,
        product_name,
        service_name,
        status,
        template_type,
        version,
        nonce,
        created_at,
        enrolled_at,
        updated_at
      FROM credentials
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      credentials: result.rows,
      count: result.rows.length,
    });

  } catch (error) {
    console.error('Error listing credentials for user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list credentials',
    });
  }
});

/**
 * GET /api/credentials/user/:userId
 * Get all credentials for a specific user (NEW SCHEMA V2)
 * Used by /ztizen/me dashboard
 *
 * Response:
 * {
 *   success: true,
 *   credentials: [{
 *     credential_id: "...",
 *     product_name: "Demo Bank",
 *     service_name: "Login",
 *     status: "pending" | "enrolled" | "active" | "revoked",
 *     created_at: "...",
 *     enrolled_at: "..." | null
 *   }]
 * }
 */
router.get('/user/:userId', validateAndNormalizeUserId, async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch all credentials for this user
    const result = await pool.query(
      `SELECT
        credential_id,
        product_id,
        product_name,
        service_name,
        service_type,
        status,
        version,
        nonce,
        created_at,
        enrolled_at
      FROM credentials
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [userId]
    );

    console.log(`📋 Retrieved ${result.rows.length} credentials for user:`, userId.substring(0, 10) + '...');

    res.json({
      success: true,
      credentials: result.rows,
      count: result.rows.length,
    });

  } catch (error) {
    console.error('Error fetching user credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch credentials',
      details: error.message,
    });
  }
});

/**
 * GET /api/credentials/:credentialId
 * Get a single credential by ID (used by frontend during enrollment)
 * This route must come BEFORE the userId route to match UUIDs
 */
router.get('/:credentialId([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', async (req, res) => {
  try {
    const { credentialId } = req.params;

    const result = await query(
      `SELECT
        credential_id,
        user_id,
        product_id,
        product_name,
        service_name,
        service_type,
        ztizen_partial_key,
        status,
        template_type,
        version,
        nonce,
        auth_commit,
        pin_hash,
        metadata,
        created_at,
        enrolled_at,
        updated_at
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

    res.json({
      success: true,
      credential: result.rows[0],
    });

  } catch (error) {
    console.error('Error getting credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get credential',
    });
  }
});

/**
 * GET /api/credentials/detail/:credentialId
 * Get detailed information about a specific credential including auth_commit
 */
router.get('/detail/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;

    const result = await query(
      `SELECT
        credential_id,
        user_id,
        product_id,
        product_name,
        service_name,
        service_type,
        ztizen_partial_key,
        status,
        template_type,
        version,
        nonce,
        pin_hash,
        metadata,
        verification_count,
        last_verified_at,
        created_at,
        enrolled_at,
        updated_at,
        auth_commit
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

    // auth_commit is already JSONB, no need to convert

    res.json({
      success: true,
      credential,
    });

  } catch (error) {
    console.error('Error getting credential details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get credential details',
    });
  }
});

/**
 * PATCH /api/credentials/:credentialId/deactivate
 * Deactivate a credential (sets status to 'revoked')
 */
router.patch('/:credentialId/deactivate', async (req, res) => {
  try {
    const { credentialId } = req.params;

    const result = await query(
      `UPDATE credentials
       SET status = 'revoked',
           updated_at = NOW()
       WHERE credential_id = $1
       RETURNING credential_id, service_name, status`,
      [credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    res.json({
      success: true,
      message: 'Credential deactivated successfully',
      credential: result.rows[0],
    });

  } catch (error) {
    console.error('Error deactivating credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate credential',
    });
  }
});

/**
 * PATCH /api/credentials/:credentialId/reactivate
 * Reactivate a deactivated credential (sets status to 'active')
 */
router.patch('/:credentialId/reactivate', async (req, res) => {
  try {
    const { credentialId } = req.params;

    const result = await query(
      `UPDATE credentials
       SET status = 'active',
           updated_at = NOW()
       WHERE credential_id = $1
       RETURNING credential_id, service_name, status`,
      [credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    res.json({
      success: true,
      message: 'Credential reactivated successfully',
      credential: result.rows[0],
    });

  } catch (error) {
    console.error('Error reactivating credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reactivate credential',
    });
  }
});

/**
 * DELETE /api/credentials/:credentialId
 * Permanently delete a credential
 */
router.delete('/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;

    const result = await query(
      `DELETE FROM credentials
       WHERE credential_id = $1
       RETURNING credential_id, service_name`,
      [credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    res.json({
      success: true,
      message: 'Credential permanently deleted',
      credential: result.rows[0],
    });

  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete credential',
    });
  }
});

/**
 * PATCH /api/credentials/:credentialId
 * Update credential metadata
 */
router.patch('/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { service_name, product_name, metadata } = req.body;

    // Build dynamic UPDATE query
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (service_name !== undefined) {
      updates.push(`service_name = $${paramCount++}`);
      params.push(service_name);
    }

    if (product_name !== undefined) {
      updates.push(`product_name = $${paramCount++}`);
      params.push(product_name);
    }

    if (metadata !== undefined) {
      updates.push(`metadata = $${paramCount++}`);
      params.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
    }

    updates.push(`updated_at = NOW()`);
    params.push(credentialId);

    const sql = `
      UPDATE credentials
      SET ${updates.join(', ')}
      WHERE credential_id = $${paramCount}
      RETURNING credential_id, service_name, product_name, metadata, updated_at
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    res.json({
      success: true,
      message: 'Credential updated successfully',
      credential: result.rows[0],
    });

  } catch (error) {
    console.error('Error updating credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update credential',
    });
  }
});

/**
 * PATCH /api/credentials/:credentialId/upgrade-version
 * Revoke credential by incrementing version (Cancelable Biometric)
 *
 * This is the core revocation mechanism in the Cancelable Biometric protocol:
 *   1. Increment version number
 *   2. Reset nonce to 0
 *   3. Clear auth_commit (requires re-enrollment)
 *   4. Set status to 'pending'
 *
 * After calling this endpoint, the user must re-enroll their biometric
 * with the new version number. Old proofs become invalid because:
 *   auth_commit = Poseidon(template, nonce, VERSION, ...)
 *
 * Use cases:
 *   - Lost/stolen device
 *   - Compromised credentials
 *   - Periodic security rotation
 *   - User-initiated revocation
 */
router.patch('/:credentialId/upgrade-version', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { reason } = req.body;  // Optional: "lost_device", "compromised", "rotation", etc.

    // First, get the current version to include in metadata
    const currentResult = await query(
      `SELECT version, status FROM credentials WHERE credential_id = $1`,
      [credentialId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    const currentVersion = currentResult.rows[0].version;
    const currentStatus = currentResult.rows[0].status;

    // Prevent upgrading already revoked credentials
    if (currentStatus === 'revoked') {
      return res.status(400).json({
        success: false,
        error: 'Cannot upgrade version of a revoked credential',
      });
    }

    console.log('🔄 Upgrading credential version:', {
      credential_id: credentialId.slice(0, 8) + '...',
      current_version: currentVersion,
      new_version: currentVersion + 1,
      reason: reason || 'manual_revocation',
    });

    // Atomic version upgrade
    const result = await query(
      `UPDATE credentials SET
        version = version + 1,
        nonce = '0',
        auth_commit = NULL,
        status = 'pending',
        metadata = jsonb_set(
          COALESCE(metadata, '{}'),
          '{revocation_history}',
          COALESCE(metadata->'revocation_history', '[]'::jsonb) || $2::jsonb
        ),
        updated_at = NOW()
      WHERE credential_id = $1
      RETURNING credential_id, version, status, nonce, updated_at`,
      [
        credentialId,
        JSON.stringify({
          previous_version: currentVersion,
          reason: reason || 'manual_revocation',
          revoked_at: new Date().toISOString(),
        })
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    const updated = result.rows[0];

    console.log('✅ Version upgraded successfully:', {
      credential_id: updated.credential_id.slice(0, 8) + '...',
      new_version: updated.version,
      status: updated.status,
    });

    res.json({
      success: true,
      message: 'Version upgraded - re-enrollment required',
      credential: {
        credential_id: updated.credential_id,
        version: updated.version,
        status: updated.status,
        nonce: updated.nonce,
      },
      previous_version: currentVersion,
      revocation_reason: reason || 'manual_revocation',
    });

  } catch (error) {
    console.error('Error upgrading version:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upgrade version: ' + error.message,
    });
  }
});

/**
 * GET /api/credentials/:credentialId/logs
 * Get verification logs for a credential
 */
router.get('/:credentialId/logs', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT
        id,
        success,
        match_rate,
        nonce_used,
        timestamp
      FROM verification_logs
      WHERE credential_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3`,
      [credentialId, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM verification_logs WHERE credential_id = $1`,
      [credentialId]
    );

    res.json({
      success: true,
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

  } catch (error) {
    console.error('Error getting verification logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get verification logs',
    });
  }
});

export default router;
