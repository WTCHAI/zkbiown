/**
 * Verification Request Tracking Routes
 * Handles verification request tracking and transaction history
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool.js';
import { ENV } from '../config/env.js';

const router = express.Router();

/**
 * GET /api/verification/request/:request_id
 * Get verification request details
 *
 * Called by frontend when user opens verification page with request_id
 * Shows user which service is requesting verification
 */
router.get('/request/:request_id', async (req, res) => {
  try {
    const { request_id } = req.params;

    if (!request_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing request_id parameter',
      });
    }

    // For now, return request_id as valid (product service will track requests)
    // This is a placeholder until we integrate with product service API
    res.json({
      success: true,
      request: {
        request_id,
        status: 'pending',
        message: 'Verification request is valid. Please complete verification flow.',
      },
    });

  } catch (error) {
    console.error('Error fetching verification request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch verification request',
    });
  }
});

/**
 * POST /api/verification/complete
 * Complete verification and create transaction record
 *
 * Called after user completes verification (PIN → Password → Signature → Biometric)
 * Stores verification transaction with traditional, ZK proof, and request_id link
 *
 * tx_hash and service_id are used for on-chain matching:
 * - Smart contract emits ZKVerificationCompleted(credentialId, txHash, serviceId, ...)
 * - Product can match these events to their original verification requests
 */
router.post('/complete', async (req, res) => {
  try {
    const {
      request_id,
      credential_id,
      service_id,
      service_name,
      product_id,
      tx_hash,           // Product's tx_hash for on-chain matching
      service_id_bytes32, // Service ID as bytes32 for smart contract
      verification,
      nonce_before,
      nonce_after,
    } = req.body;

    // Validate required fields
    if (!credential_id || !verification) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: credential_id, verification',
      });
    }

    // Extract verification results
    const traditional = verification.traditional || {};
    const zkProof = verification.zk_proof || null;

    // Generate unique transaction ID
    const txId = `ztizen_tx_${uuidv4().replace(/-/g, '')}`;
    const timestamp = Math.floor(Date.now() / 1000);

    // Insert verification transaction
    const result = await pool.query(
      `INSERT INTO verification_transactions (
        tx_id,
        request_id,
        credential_id,
        service_id,
        service_name,
        product_id,
        tx_hash,
        service_id_bytes32,
        traditional_verified,
        traditional_match_count,
        traditional_match_rate,
        zk_verified,
        zk_match_count,
        proof,
        public_inputs,
        nonce_before,
        nonce_after,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id, tx_id, timestamp, created_at`,
      [
        txId,
        request_id || null,
        credential_id,
        service_id || null,
        service_name || null,
        product_id || null,
        tx_hash || null,
        service_id_bytes32 || null,
        traditional.verified || false,
        traditional.match_count || 0,
        traditional.match_rate || 0,
        zkProof?.verified || null,
        zkProof?.matchCount || null,
        zkProof?.proof ? Buffer.from(zkProof.proof) : null,
        zkProof?.publicInputs ? JSON.stringify(zkProof.publicInputs) : null,
        nonce_before || null,
        nonce_after || null,
        timestamp,
      ]
    );

    const transaction = result.rows[0];

    console.log(`✅ Verification transaction created: ${txId}`);
    if (request_id) {
      console.log(`   Linked to request: ${request_id}`);
    }
    if (tx_hash) {
      console.log(`   tx_hash for on-chain: ${tx_hash.slice(0, 20)}...`);
    }
    console.log(`   Traditional: ${traditional.verified ? 'PASS' : 'FAIL'} (${traditional.match_rate}%)`);
    if (zkProof) {
      console.log(`   ZK Proof: ${zkProof.verified ? 'PASS' : 'FAIL'} (${zkProof.matchCount}/128)`);
    }

    // ===== CALLBACK TO PRODUCT SERVICE =====
    // If request_id is provided, call back to product service to update verification_requests
    if (request_id) {
      try {
        const callbackResponse = await fetch('${ENV.PRODUCT_API_URL}/api/verify/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id,
            ztizen_tx_id: txId,
            verified: traditional.verified && (zkProof?.verified ?? true), // Both must pass
            traditional_match_rate: traditional.match_rate,
            zk_verified: zkProof?.verified ?? null,
            onchain_tx_hash: null, // Will be updated later when submitted on-chain
          }),
        });

        if (callbackResponse.ok) {
          console.log(`✅ Product service callback successful for request: ${request_id}`);
        } else {
          console.error(`⚠️ Product service callback failed: ${callbackResponse.statusText}`);
        }
      } catch (callbackError) {
        console.error(`⚠️ Failed to call product service callback:`, callbackError.message);
        // Don't fail the request - transaction is still recorded
      }
    }

    res.json({
      success: true,
      tx_id: txId,
      request_id: request_id || null,
      tx_hash: tx_hash || null,
      service_id_bytes32: service_id_bytes32 || null,
      timestamp,
      traditional_verified: traditional.verified,
      zk_verified: zkProof?.verified || null,
      message: 'Verification transaction recorded',
    });

  } catch (error) {
    console.error('Error completing verification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete verification transaction',
      details: error.message,
    });
  }
});

/**
 * GET /api/verification/history/:credential_id
 * Get user's verification history
 *
 * Called by /ztizen/me page to show user's past verifications
 */
router.get('/history/:credential_id', async (req, res) => {
  try {
    const { credential_id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    if (!credential_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing credential_id parameter',
      });
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM verification_transactions WHERE credential_id = $1`,
      [credential_id]
    );
    const total = parseInt(countResult.rows[0].count);

    // Get verification history
    const result = await pool.query(
      `SELECT
        tx_id,
        request_id,
        service_id,
        service_name,
        product_id,
        traditional_verified,
        traditional_match_count,
        traditional_match_rate,
        zk_verified,
        zk_match_count,
        onchain_tx_hash,
        onchain_verified,
        onchain_timestamp,
        timestamp,
        created_at
       FROM verification_transactions
       WHERE credential_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [credential_id, limit, offset]
    );

    const verifications = result.rows.map(row => ({
      tx_id: row.tx_id,
      request_id: row.request_id,
      service_id: row.service_id,
      service_name: row.service_name || 'Unknown Service',
      product_id: row.product_id,
      verified: row.traditional_verified,
      traditional_match_rate: parseFloat(row.traditional_match_rate),
      traditional_match_count: row.traditional_match_count,
      zk_verified: row.zk_verified,
      zk_match_count: row.zk_match_count,
      onchain_tx_hash: row.onchain_tx_hash,
      onchain_verified: row.onchain_verified,
      onchain_timestamp: row.onchain_timestamp,
      timestamp: row.timestamp,
      created_at: row.created_at,
    }));

    res.json({
      success: true,
      verifications,
      total,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
    });

  } catch (error) {
    console.error('Error fetching verification history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch verification history',
    });
  }
});

/**
 * POST /api/verification/update-proof
 * Update verification transaction with ZK proof data
 *
 * Called after ZK proof is generated client-side
 */
router.post('/update-proof', async (req, res) => {
  try {
    const {
      tx_id,
      zk_verified,
      zk_match_count,
      proof,
      public_inputs,
    } = req.body;

    if (!tx_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: tx_id',
      });
    }

    // Update verification transaction with ZK proof
    const result = await pool.query(
      `UPDATE verification_transactions
       SET
         zk_verified = $1,
         zk_match_count = $2,
         proof = $3,
         public_inputs = $4
       WHERE tx_id = $5
       RETURNING tx_id, zk_verified, zk_match_count`,
      [
        zk_verified,
        zk_match_count,
        proof ? Buffer.from(proof) : null,
        public_inputs ? JSON.stringify(public_inputs) : null,
        tx_id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
    }

    console.log(`✅ ZK proof added to transaction: ${tx_id}`);
    console.log(`   ZK Verified: ${zk_verified ? 'PASS' : 'FAIL'}`);
    console.log(`   Match Count: ${zk_match_count}/128`);

    // Get request_id to update product service
    const txData = await pool.query(
      `SELECT request_id FROM verification_transactions WHERE tx_id = $1`,
      [tx_id]
    );

    if (txData.rows.length > 0 && txData.rows[0].request_id) {
      const request_id = txData.rows[0].request_id;
      try {
        await fetch('${ENV.PRODUCT_API_URL}/api/verify/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id,
            ztizen_tx_id: tx_id,
            zk_verified,
          }),
        });
        console.log(`✅ Updated product service with ZK proof status for request: ${request_id}`);
      } catch (error) {
        console.error(`⚠️ Failed to update product service:`, error.message);
      }
    }

    res.json({
      success: true,
      tx_id: result.rows[0].tx_id,
      zk_verified: result.rows[0].zk_verified,
      zk_match_count: result.rows[0].zk_match_count,
      message: 'ZK proof data recorded',
    });

  } catch (error) {
    console.error('Error updating ZK proof:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update ZK proof data',
      details: error.message,
    });
  }
});

/**
 * POST /api/verification/submit-onchain
 * Update verification transaction with on-chain data
 *
 * Called after ZK proof is submitted to blockchain
 */
router.post('/submit-onchain', async (req, res) => {
  try {
    const {
      tx_id,
      onchain_tx_hash,
      onchain_verified,
      onchain_timestamp,
      onchain_block_number,
    } = req.body;

    if (!tx_id || !onchain_tx_hash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tx_id, onchain_tx_hash',
      });
    }

    // Update verification transaction with on-chain data
    const result = await pool.query(
      `UPDATE verification_transactions
       SET
         onchain_tx_hash = $1,
         onchain_verified = $2,
         onchain_timestamp = $3,
         onchain_block_number = $4
       WHERE tx_id = $5
       RETURNING tx_id, onchain_tx_hash, onchain_verified`,
      [
        onchain_tx_hash,
        onchain_verified !== undefined ? onchain_verified : true,
        onchain_timestamp || Math.floor(Date.now() / 1000),
        onchain_block_number || null,
        tx_id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
    }

    console.log(`✅ On-chain data added to transaction: ${tx_id}`);
    console.log(`   Tx Hash: ${onchain_tx_hash}`);

    // Get request_id from this transaction to callback product service
    const txData = await pool.query(
      `SELECT request_id FROM verification_transactions WHERE tx_id = $1`,
      [tx_id]
    );

    // If this transaction has a request_id, update product service with on-chain hash
    if (txData.rows.length > 0 && txData.rows[0].request_id) {
      const request_id = txData.rows[0].request_id;
      try {
        const callbackResponse = await fetch('${ENV.PRODUCT_API_URL}/api/verify/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id,
            ztizen_tx_id: tx_id,
            onchain_tx_hash,
          }),
        });

        if (callbackResponse.ok) {
          console.log(`✅ Updated product service with on-chain hash for request: ${request_id}`);
        }
      } catch (error) {
        console.error(`⚠️ Failed to update product service with on-chain hash:`, error.message);
      }
    }

    res.json({
      success: true,
      tx_id: result.rows[0].tx_id,
      onchain_tx_hash: result.rows[0].onchain_tx_hash,
      onchain_verified: result.rows[0].onchain_verified,
      message: 'On-chain verification data recorded',
    });

  } catch (error) {
    console.error('Error submitting on-chain data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit on-chain verification data',
    });
  }
});

/**
 * GET /api/verification/transaction/:tx_id
 * Get specific verification transaction details
 */
router.get('/transaction/:tx_id', async (req, res) => {
  try {
    const { tx_id } = req.params;

    const result = await pool.query(
      `SELECT
        vt.*,
        c.user_id,
        c.product_id as credential_product_id,
        c.service_name as credential_service_name
       FROM verification_transactions vt
       LEFT JOIN credentials c ON vt.credential_id = c.credential_id
       WHERE vt.tx_id = $1`,
      [tx_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
    }

    const tx = result.rows[0];

    res.json({
      success: true,
      transaction: {
        tx_id: tx.tx_id,
        request_id: tx.request_id,
        credential_id: tx.credential_id,
        user_id: tx.user_id,
        service_id: tx.service_id,
        service_name: tx.service_name,
        product_id: tx.product_id,
        traditional: {
          verified: tx.traditional_verified,
          match_count: tx.traditional_match_count,
          match_rate: parseFloat(tx.traditional_match_rate),
        },
        zk_proof: tx.zk_verified !== null ? {
          verified: tx.zk_verified,
          match_count: tx.zk_match_count,
          proof_size: tx.proof ? tx.proof.length : 0,
          public_inputs: tx.public_inputs,
        } : null,
        onchain: tx.onchain_tx_hash ? {
          tx_hash: tx.onchain_tx_hash,
          verified: tx.onchain_verified,
          timestamp: tx.onchain_timestamp,
          block_number: tx.onchain_block_number,
        } : null,
        nonce_before: tx.nonce_before,
        nonce_after: tx.nonce_after,
        timestamp: tx.timestamp,
        created_at: tx.created_at,
      },
    });

  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction details',
    });
  }
});

export default router;
