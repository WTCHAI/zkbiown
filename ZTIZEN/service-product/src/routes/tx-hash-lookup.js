/**
 * Transaction Hash Lookup Routes
 * Allows Product to query verification status by tx_hash
 *
 * This endpoint is used for the challenge-response verification flow:
 * 1. Product creates verification request → generates tx_hash
 * 2. User completes verification → proof submitted on-chain with tx_hash
 * 3. Product queries by tx_hash to check verification status
 */

import express from 'express';
import pool from '../db/pool.js';
import { isValidTxHash } from '../utils/request-id.js';

const router = express.Router();

/**
 * GET /api/verify/lookup/:tx_hash
 * Lookup verification status by tx_hash
 *
 * Returns verification details if tx_hash exists, 404 if not found
 *
 * Response:
 * {
 *   success: true,
 *   tx_hash: "0x...",
 *   status: "pending|completed|failed|expired",
 *   verified: boolean,
 *   zk_verified: boolean,
 *   onchain_tx_hash: "0x...",
 *   ztizen_tx_id: "ztizen_tx_...",
 *   traditional_match_rate: 0.95,
 *   timestamp: 1234567890,
 *   completed_at: "2024-01-01T00:00:00Z"
 * }
 */
router.get('/lookup/:tx_hash', async (req, res) => {
  try {
    const { tx_hash } = req.params;

    // Validate tx_hash format (0x + 64 hex characters)
    if (!isValidTxHash(tx_hash)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tx_hash format (must be 0x + 64 hex characters)',
      });
    }

    console.log(`🔍 Looking up verification by tx_hash: ${tx_hash}`);

    // Query verification_requests by tx_hash
    const result = await pool.query(
      `SELECT
        vr.request_id,
        vr.tx_hash,
        vr.status,
        vr.verified,
        vr.ztizen_tx_id,
        vr.traditional_match_rate,
        vr.zk_verified,
        vr.onchain_tx_hash,
        vr.timestamp,
        vr.created_at,
        vr.completed_at,
        vr.expires_at,
        vr.credential_id,
        vr.user_id,
        vr.service_name,
        vr.service_id,
        p.product_name,
        p.product_id as product_id_string
       FROM verification_requests vr
       JOIN products p ON vr.product_id = p.id
       WHERE vr.tx_hash = $1`,
      [tx_hash]
    );

    if (result.rows.length === 0) {
      console.log(`❌ No verification found for tx_hash: ${tx_hash}`);
      return res.status(404).json({
        success: false,
        error: 'No verification found for this tx_hash',
        tx_hash,
      });
    }

    const request = result.rows[0];

    // Check if expired (only for pending requests)
    const now = new Date();
    if (request.status === 'pending' && new Date(request.expires_at) < now) {
      // Update status to expired
      await pool.query(
        'UPDATE verification_requests SET status = $1 WHERE tx_hash = $2',
        ['expired', tx_hash]
      );
      request.status = 'expired';
    }

    console.log(`✅ Verification found:`, {
      request_id: request.request_id,
      status: request.status,
      verified: request.verified,
      onchain_tx_hash: request.onchain_tx_hash,
    });

    // Return verification details
    res.json({
      success: true,
      tx_hash: request.tx_hash,
      request_id: request.request_id,
      status: request.status,
      verified: request.verified,
      zk_verified: request.zk_verified,
      onchain_tx_hash: request.onchain_tx_hash,
      ztizen_tx_id: request.ztizen_tx_id,
      traditional_match_rate: request.traditional_match_rate ? parseFloat(request.traditional_match_rate) : null,
      timestamp: request.timestamp,
      created_at: request.created_at,
      completed_at: request.completed_at,
      expires_at: request.expires_at,
      // Include context information
      credential_id: request.credential_id,
      user_id: request.user_id,
      service_name: request.service_name,
      service_id: request.service_id,
      product_name: request.product_name,
      product_id: request.product_id_string,
    });

  } catch (error) {
    console.error('Error looking up tx_hash:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup tx_hash',
      details: error.message,
    });
  }
});

/**
 * POST /api/verify/lookup/batch
 * Batch lookup multiple tx_hashes
 *
 * Useful for Product to check multiple pending verifications
 *
 * Request:
 * {
 *   tx_hashes: ["0x...", "0x..."]
 * }
 *
 * Response:
 * {
 *   success: true,
 *   results: [
 *     { tx_hash: "0x...", found: true, status: "completed", ... },
 *     { tx_hash: "0x...", found: false }
 *   ]
 * }
 */
router.post('/lookup/batch', async (req, res) => {
  try {
    const { tx_hashes } = req.body;

    if (!Array.isArray(tx_hashes) || tx_hashes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'tx_hashes must be a non-empty array',
      });
    }

    if (tx_hashes.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 tx_hashes per batch request',
      });
    }

    // Validate all tx_hashes
    for (const tx_hash of tx_hashes) {
      if (!isValidTxHash(tx_hash)) {
        return res.status(400).json({
          success: false,
          error: `Invalid tx_hash format: ${tx_hash}`,
        });
      }
    }

    console.log(`🔍 Batch lookup for ${tx_hashes.length} tx_hashes`);

    // Query all tx_hashes
    const result = await pool.query(
      `SELECT
        vr.request_id,
        vr.tx_hash,
        vr.status,
        vr.verified,
        vr.zk_verified,
        vr.onchain_tx_hash,
        vr.timestamp,
        vr.completed_at
       FROM verification_requests vr
       WHERE vr.tx_hash = ANY($1::text[])`,
      [tx_hashes]
    );

    // Create map of results
    const resultsMap = new Map();
    result.rows.forEach(row => {
      resultsMap.set(row.tx_hash, row);
    });

    // Build response array (preserving input order)
    const results = tx_hashes.map(tx_hash => {
      const request = resultsMap.get(tx_hash);

      if (!request) {
        return {
          tx_hash,
          found: false,
        };
      }

      return {
        tx_hash: request.tx_hash,
        found: true,
        request_id: request.request_id,
        status: request.status,
        verified: request.verified,
        zk_verified: request.zk_verified,
        onchain_tx_hash: request.onchain_tx_hash,
        timestamp: request.timestamp,
        completed_at: request.completed_at,
      };
    });

    console.log(`✅ Batch lookup complete: ${results.filter(r => r.found).length}/${tx_hashes.length} found`);

    res.json({
      success: true,
      total: tx_hashes.length,
      found: results.filter(r => r.found).length,
      results,
    });

  } catch (error) {
    console.error('Error in batch lookup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform batch lookup',
      details: error.message,
    });
  }
});

/**
 * GET /api/verify/lookup/onchain/:onchain_tx_hash
 * Lookup verification by on-chain transaction hash
 *
 * Useful for blockchain explorers or when you only have the Ethereum tx hash
 */
router.get('/lookup/onchain/:onchain_tx_hash', async (req, res) => {
  try {
    const { onchain_tx_hash } = req.params;

    if (!isValidTxHash(onchain_tx_hash)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid onchain_tx_hash format',
      });
    }

    console.log(`🔍 Looking up verification by onchain_tx_hash: ${onchain_tx_hash}`);

    const result = await pool.query(
      `SELECT
        vr.request_id,
        vr.tx_hash,
        vr.status,
        vr.verified,
        vr.zk_verified,
        vr.onchain_tx_hash,
        vr.ztizen_tx_id,
        vr.timestamp,
        vr.completed_at
       FROM verification_requests vr
       WHERE vr.onchain_tx_hash = $1`,
      [onchain_tx_hash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No verification found for this onchain_tx_hash',
        onchain_tx_hash,
      });
    }

    const request = result.rows[0];

    console.log(`✅ Verification found via onchain_tx_hash`);

    res.json({
      success: true,
      onchain_tx_hash: request.onchain_tx_hash,
      tx_hash: request.tx_hash,
      request_id: request.request_id,
      status: request.status,
      verified: request.verified,
      zk_verified: request.zk_verified,
      ztizen_tx_id: request.ztizen_tx_id,
      timestamp: request.timestamp,
      completed_at: request.completed_at,
    });

  } catch (error) {
    console.error('Error looking up onchain_tx_hash:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup onchain_tx_hash',
      details: error.message,
    });
  }
});

export default router;
