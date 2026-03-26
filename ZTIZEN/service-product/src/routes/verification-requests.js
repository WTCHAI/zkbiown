/**
 * Verification Request Routes (Product Side)
 * Manages verification requests sent to ZTIZEN
 */

import express from 'express';
import pool from '../db/pool.js';
import { generateRequestId, generateTxHash, serviceIdToBytes32, isValidRequestId, isValidTxHash } from '../utils/request-id.js';
import { ENV } from '../config/env.js';
import { validateAndNormalizeUserId, validateAndNormalizeUserIdOptional } from '../middleware/validateEthereumAddress.js';

const router = express.Router();

/**
 * POST /api/verify/request
 * Create new verification request
 *
 * Used when product wants user to verify their biometric credential
 *
 * Flow:
 * 1. Product creates request with service_id, timestamp, details
 * 2. System generates tx_hash = keccak256(service_id + timestamp + details)
 * 3. tx_hash is sent to ZTIZEN for proof generation
 * 4. After on-chain verification, product can match ZKVerificationCompleted event by tx_hash
 */
router.post('/request', validateAndNormalizeUserId, async (req, res) => {
  try {
    const {
      product_id,
      service_id,
      service_name,
      user_id,
      credential_id,
      details = {},
      callback_url,
      return_url,
      expires_in = 300, // Default 5 minutes
    } = req.body;

    // Validate required fields
    if (!product_id || !service_name || !user_id || !credential_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: product_id, service_name, user_id, credential_id',
      });
    }

    // Get product UUID from product_id string
    const productResult = await pool.query(
      'SELECT id FROM products WHERE product_id = $1',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    const productUuid = productResult.rows[0].id;

    // Generate unique request_id
    const timestamp = Math.floor(Date.now() / 1000);
    const request_id = generateRequestId(service_name, timestamp);

    // Generate tx_hash for on-chain tracking
    // This will be used to match ZKVerificationCompleted events
    const tx_hash = generateTxHash(service_id || service_name, timestamp, details);

    // Convert service_id to bytes32 for smart contract
    const service_id_bytes32 = serviceIdToBytes32(service_id);

    // Calculate expiration time
    const now = new Date();
    const expires_at = new Date(now.getTime() + expires_in * 1000);

    // Insert verification request
    const result = await pool.query(
      `INSERT INTO verification_requests (
        request_id,
        product_id,
        service_id,
        service_name,
        user_id,
        credential_id,
        tx_hash,
        details,
        callback_url,
        return_url,
        status,
        expires_at,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, request_id, tx_hash, expires_at, created_at`,
      [
        request_id,
        productUuid,
        service_id || null,
        service_name,
        user_id,
        credential_id,
        tx_hash,
        JSON.stringify(details),
        callback_url || null,
        return_url || null,
        'pending',
        expires_at,
        timestamp,
      ]
    );

    const request = result.rows[0];

    // Generate verification URL with tx_hash
    const verification_url = `${ENV.FRONTEND_URL}/ztizen/verify/${credential_id}?request_id=${request_id}&tx_hash=${tx_hash}&service_id=${service_id_bytes32}&service_name=${encodeURIComponent(service_name)}${return_url ? `&return_url=${encodeURIComponent(return_url)}` : ''}`;

    console.log(`✅ Verification request created: ${request_id}`);
    console.log(`   tx_hash: ${tx_hash}`);
    console.log(`   Service: ${service_name}`);
    console.log(`   User: ${user_id}`);
    console.log(`   Expires: ${expires_at.toISOString()}`);

    res.json({
      success: true,
      request_id,
      tx_hash,
      service_id_bytes32,
      verification_url,
      expires_at: expires_at.toISOString(),
      expires_in,
    });

  } catch (error) {
    console.error('Error creating verification request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create verification request',
      details: error.message,
    });
  }
});

/**
 * GET /api/verify/status/:request_id
 * Query verification request status
 *
 * Check if verification has been completed and get results
 */
router.get('/status/:request_id', async (req, res) => {
  try {
    const { request_id } = req.params;

    if (!isValidRequestId(request_id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request_id format',
      });
    }

    // Get request from database
    const result = await pool.query(
      `SELECT
        vr.*,
        p.product_name,
        ps.service_type
       FROM verification_requests vr
       JOIN products p ON vr.product_id = p.id
       LEFT JOIN product_services ps ON vr.service_id = ps.id
       WHERE vr.request_id = $1`,
      [request_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Verification request not found',
      });
    }

    const request = result.rows[0];

    // Check if expired
    const now = new Date();
    if (request.status === 'pending' && new Date(request.expires_at) < now) {
      // Update status to expired
      await pool.query(
        'UPDATE verification_requests SET status = $1 WHERE request_id = $2',
        ['expired', request_id]
      );
      request.status = 'expired';
    }

    res.json({
      success: true,
      request_id: request.request_id,
      tx_hash: request.tx_hash,
      status: request.status,
      credential_id: request.credential_id,
      service_name: request.service_name,
      product_name: request.product_name,
      verified: request.verified,
      verification: request.status === 'completed' ? {
        ztizen_tx_id: request.ztizen_tx_id,
        traditional_match_rate: parseFloat(request.traditional_match_rate),
        zk_verified: request.zk_verified,
        onchain_tx_hash: request.onchain_tx_hash,
      } : null,
      timestamp: request.timestamp,
      created_at: request.created_at,
      completed_at: request.completed_at,
      expires_at: request.expires_at,
    });

  } catch (error) {
    console.error('Error fetching verification status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch verification status',
    });
  }
});

/**
 * POST /api/verify/callback
 * Webhook/callback from ZTIZEN after verification completes
 *
 * Updates request status with verification results
 */
router.post('/callback', async (req, res) => {
  try {
    const {
      request_id,
      ztizen_tx_id,
      verified,
      traditional_match_rate,
      zk_verified,
      onchain_tx_hash,
    } = req.body;

    if (!request_id || !ztizen_tx_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: request_id, ztizen_tx_id',
      });
    }

    // Update verification request with results
    const result = await pool.query(
      `UPDATE verification_requests
       SET
         status = $1,
         verified = $2,
         ztizen_tx_id = $3,
         traditional_match_rate = $4,
         zk_verified = $5,
         onchain_tx_hash = $6,
         completed_at = NOW()
       WHERE request_id = $7
       RETURNING id, request_id, status, verified`,
      [
        verified ? 'completed' : 'failed',
        verified,
        ztizen_tx_id,
        traditional_match_rate,
        zk_verified,
        onchain_tx_hash || null,
        request_id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Verification request not found',
      });
    }

    console.log(`✅ Verification request updated: ${request_id}`);
    console.log(`   Status: ${verified ? 'completed' : 'failed'}`);
    console.log(`   ZTIZEN TX: ${ztizen_tx_id}`);

    res.json({
      success: true,
      request_id: result.rows[0].request_id,
      status: result.rows[0].status,
      verified: result.rows[0].verified,
    });

  } catch (error) {
    console.error('Error updating verification callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update verification callback',
    });
  }
});

/**
 * GET /api/verify/requests
 * List verification requests
 *
 * Query params:
 * - user_id: Filter by user
 * - status: Filter by status
 * - product_id: Filter by product
 * - limit: Results limit (default 50)
 * - offset: Results offset (default 0)
 */
router.get('/requests', validateAndNormalizeUserIdOptional, async (req, res) => {
  try {
    const {
      user_id,
      status,
      product_id,
      limit = 50,
      offset = 0,
    } = req.query;

    // Build query
    let query = `
      SELECT
        vr.*,
        p.product_name,
        p.product_id as product_id_string,
        ps.service_type
      FROM verification_requests vr
      JOIN products p ON vr.product_id = p.id
      LEFT JOIN product_services ps ON vr.service_id = ps.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (user_id) {
      query += ` AND vr.user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND vr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (product_id) {
      query += ` AND p.product_id = $${paramIndex}`;
      params.push(product_id);
      paramIndex++;
    }

    query += ` ORDER BY vr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    // Get count
    let countQuery = `SELECT COUNT(*) FROM verification_requests vr JOIN products p ON vr.product_id = p.id WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;

    if (user_id) {
      countQuery += ` AND vr.user_id = $${countParamIndex}`;
      countParams.push(user_id);
      countParamIndex++;
    }

    if (status) {
      countQuery += ` AND vr.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (product_id) {
      countQuery += ` AND p.product_id = $${countParamIndex}`;
      countParams.push(product_id);
    }

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const requests = result.rows.map(row => ({
      request_id: row.request_id,
      product_name: row.product_name,
      service_name: row.service_name,
      status: row.status,
      verified: row.verified,
      credential_id: row.credential_id,
      timestamp: row.timestamp,
      created_at: row.created_at,
      completed_at: row.completed_at,
      expires_at: row.expires_at,
    }));

    res.json({
      success: true,
      requests,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
      page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
    });

  } catch (error) {
    console.error('Error listing verification requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list verification requests',
    });
  }
});

export default router;
