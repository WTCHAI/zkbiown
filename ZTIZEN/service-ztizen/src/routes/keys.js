/**
 * ZTIZEN Partial Key Routes
 * Provides per-credential ZTIZEN partial keys from database
 */

import express from 'express';
import { bufferToHex } from '../utils/crypto.js';
import pool from '../db/pool.js';

const router = express.Router();

/**
 * GET /api/keys/credential/:credentialId
 * Get ZTIZEN partial key for a specific credential
 *
 * This endpoint is called during enrollment to retrieve the ZTIZEN partial key
 * needed for auth_commit generation.
 *
 * Response:
 * {
 *   success: true,
 *   partial_key: "abc123def456...",  // 64 hex characters (32 bytes)
 *   credential_id: "a7f3e8d9-..."
 * }
 */
router.get('/credential/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;

    // Fetch ZTIZEN partial key for this credential
    const result = await pool.query(
      `SELECT
        credential_id,
        ztizen_partial_key
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

    console.log('🔑 Retrieved ZTIZEN partial key for credential:', credentialId.substring(0, 8) + '...');

    res.json({
      success: true,
      partial_key: credential.ztizen_partial_key,
      credential_id: credential.credential_id,
    });

  } catch (error) {
    console.error('Error fetching ZTIZEN partial key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ZTIZEN partial key',
      details: error.message,
    });
  }
});

export default router;
