/**
 * Enrollment Routes for Product Service
 * Handles user enrollment with ZTIZEN platform
 */

import express from 'express';
import crypto from 'crypto';
import pool from '../db/pool.js';
import { ENV } from '../config/env.js';
import { validateAndNormalizeUserId } from '../middleware/validateEthereumAddress.js';

const router = express.Router();

/**
 * POST /api/enrollment/initiate
 * Initiate enrollment process for a user
 *
 * This endpoint:
 * 1. Generates product_partial_key for this credential
 * 2. Calls ZTIZEN API to create credential
 * 3. Stores credential_id and product_partial_key in Product DB
 * 4. Returns credential_id for redirect to ZTIZEN
 *
 * Request body:
 * {
 *   user_id: "0x41649a1F8B2499e2F7884184D062639CEF9d0601",  // Privy user_id or wallet address
 *   product_id: "demo-bank",
 *   service_id: "uuid-of-service"  // Optional: specific service ID
 * }
 *
 * Response:
 * {
 *   success: true,
 *   credential_id: "a7f3e8d9-...",
 *   redirect_url: "http://localhost:5501/ztizen/me-add/a7f3e8d9-..."
 * }
 */
router.post('/initiate', validateAndNormalizeUserId, async (req, res) => {
  try {
    console.log('📨 POST /enrollment/initiate received:', req.body);

    const { user_id, product_id, service_id } = req.body;

    // Validate required fields
    if (!user_id || !product_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, product_id',
      });
    }

    // Get product details
    const productResult = await pool.query(
      `SELECT * FROM products WHERE product_id = $1 AND is_active = true`,
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found or inactive',
      });
    }

    const product = productResult.rows[0];

    // Get service details (if service_id provided)
    let service = null;
    if (service_id) {
      const serviceResult = await pool.query(
        `SELECT * FROM product_services WHERE id = $1 AND product_id = $2 AND is_active = true`,
        [service_id, product.id]
      );

      if (serviceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Service not found or inactive',
        });
      }

      service = serviceResult.rows[0];
    }

    // Generate product partial key (32 bytes = 64 hex characters)
    const product_partial_key = crypto.randomBytes(32).toString('hex');

    console.log('🔑 Generated product partial key:', product_partial_key.substring(0, 16) + '...');

    // Call ZTIZEN API to create credential
    console.log('📡 Calling ZTIZEN API:', {
      url: `${ENV.ZTIZEN_API_URL}/api/enrollment/create`,
      body: {
        user_id,
        product_id: product.product_id,
        product_name: product.product_name,
        service_name: service ? service.service_name : 'Default Service',
        service_type: service ? service.service_type : 'authentication',
      }
    });

    const ztizenResponse = await fetch(`${ENV.ZTIZEN_API_URL}/api/enrollment/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id,
        product_id: product.product_id,
        product_name: product.product_name,
        service_name: service ? service.service_name : 'Default Service',
        service_type: service ? service.service_type : 'authentication',
      }),
    });

    console.log('📡 ZTIZEN Response status:', ztizenResponse.status);
    console.log('📡 ZTIZEN Response headers:', Object.fromEntries(ztizenResponse.headers));

    if (!ztizenResponse.ok) {
      const responseText = await ztizenResponse.text();
      console.error('❌ ZTIZEN API error response:', responseText);

      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`ZTIZEN API error (${ztizenResponse.status}): ${responseText}`);
      }

      throw new Error(`ZTIZEN API error: ${errorData.error || 'Unknown error'}`);
    }

    const ztizenData = await ztizenResponse.json();
    const credential_id = ztizenData.credential_id;

    console.log('✅ ZTIZEN credential created:', credential_id);

    // Store in Product database
    await pool.query(
      `INSERT INTO user_credentials (
        user_id,
        product_id,
        service_id,
        credential_id,
        product_partial_key,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [user_id, product.id, service?.id || null, credential_id, product_partial_key, 'pending']
    );

    console.log('✅ Credential stored in Product DB');

    // Generate redirect URL
    const redirect_url = `${ENV.FRONTEND_URL}/ztizen/me-add/${credential_id}`;

    res.json({
      success: true,
      credential_id,
      redirect_url,
      message: 'Enrollment initiated successfully. Redirect user to ZTIZEN platform.',
    });

  } catch (error) {
    console.error('❌ Error initiating enrollment:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to initiate enrollment',
      details: error.message,
    });
  }
});

/**
 * GET /api/enrollment/status/:credentialId
 * Check enrollment status for a credential
 *
 * Response:
 * {
 *   success: true,
 *   credential_id: "...",
 *   product_id: "...",
 *   service_id: "...",
 *   service_name: "...",
 *   status: "pending" | "active" | "revoked"
 * }
 */
router.get('/status/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;

    // IMPORTANT: Join with products table to get the human-readable product_id (VARCHAR)
    // not the UUID foreign key stored in user_credentials.product_id
    const result = await pool.query(
      `SELECT
        uc.credential_id,
        uc.user_id,
        p.product_id,
        p.product_name,
        uc.service_id,
        ps.service_name,
        ps.service_type,
        uc.status,
        uc.created_at,
        uc.updated_at
      FROM user_credentials uc
      JOIN products p ON uc.product_id = p.id
      LEFT JOIN product_services ps ON uc.service_id = ps.id
      WHERE uc.credential_id = $1`,
      [credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found',
      });
    }

    const credential = result.rows[0];

    res.json({
      success: true,
      credential_id: credential.credential_id,
      user_id: credential.user_id,
      product_id: credential.product_id,  // Now returns 'demo-bank' instead of UUID
      product_name: credential.product_name,
      service_id: credential.service_id,
      service_name: credential.service_name,
      service_type: credential.service_type,
      status: credential.status,
      created_at: credential.created_at,
      updated_at: credential.updated_at,
    });

  } catch (error) {
    console.error('Error checking enrollment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check enrollment status',
      details: error.message,
    });
  }
});

/**
 * POST /api/enrollment/sync/:credentialId
 * Notify Product Service that enrollment has been completed on ZTIZEN side
 * This synchronizes the credential status from 'pending' to 'active'
 *
 * URL parameter:
 * - credentialId: The credential ID to sync
 *
 * Request body:
 * {
 *   user_id: "0x41649a1F8B2499e2F7884184D062639CEF9d0601"  // Verify ownership
 * }
 *
 * Response:
 * {
 *   success: true,
 *   credential_id: "a7f3e8d9-...",
 *   status: "active"
 * }
 */
router.post('/sync/:credentialId', validateAndNormalizeUserId, async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: user_id',
      });
    }

    // Get credential from Product DB
    const credResult = await pool.query(
      `SELECT * FROM user_credentials WHERE credential_id = $1 AND user_id = $2`,
      [credentialId, user_id]
    );

    if (credResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found or does not belong to this user',
      });
    }

    const credential = credResult.rows[0];

    // If already active, no need to sync
    if (credential.status === 'active') {
      return res.json({
        success: true,
        credential_id: credentialId,
        status: 'active',
        message: 'Already synced',
      });
    }

    // Check ZTIZEN status
    try {
      const ztizenResponse = await fetch(`${ENV.ZTIZEN_API_URL}/api/enrollment/${credentialId}`);
      
      if (!ztizenResponse.ok) {
        throw new Error(`ZTIZEN API returned ${ztizenResponse.status}`);
      }

      const ztizenData = await ztizenResponse.json();

      // Update status based on ZTIZEN status
      let newStatus = credential.status;
      if (ztizenData.status === 'enrolled') {
        newStatus = 'active';
      }

      // Update in Product DB
      await pool.query(
        `UPDATE user_credentials 
         SET status = $1, updated_at = NOW()
         WHERE credential_id = $2`,
        [newStatus, credentialId]
      );

      return res.json({
        success: true,
        credential_id: credentialId,
        status: newStatus,
        message: 'Status synchronized from ZTIZEN',
      });

    } catch (ztizenError) {
      console.error('Error fetching from ZTIZEN:', ztizenError);
      return res.status(502).json({
        success: false,
        error: 'Failed to sync with ZTIZEN service',
        details: ztizenError.message,
      });
    }

  } catch (error) {
    console.error('Error syncing enrollment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync enrollment',
      details: error.message,
    });
  }
});

/**
 * GET /api/enrollment/list
 * List all credentials for a user and product
 *
 * Query parameters:
 * - user_id: User ID (wallet address)
 * - product_id: Product ID (e.g., "demo-bank")
 * - service_name: (Optional) Filter by specific service (e.g., "Login")
 *
 * Response:
 * {
 *   success: true,
 *   credentials: [
 *     {
 *       credential_id: "uuid",
 *       status: "active",
 *       service_name: "Login",
 *       service_type: "authentication",
 *       created_at: "2025-12-01T12:00:00Z"
 *     }
 *   ]
 * }
 */
router.get('/list', async (req, res) => {
  try {
    const { user_id, product_id, service_name } = req.query;

    console.log('📋 [Product Service] /list endpoint called:', { user_id, product_id, service_name });

    // Validate required query parameters
    if (!user_id || !product_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: user_id, product_id',
      });
    }

    // Get product details first
    const productResult = await pool.query(
      `SELECT id FROM products WHERE product_id = $1 AND is_active = true`,
      [product_id]
    );

    console.log('🔍 Product lookup result:', productResult.rows);

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found or inactive',
      });
    }

    const productDbId = productResult.rows[0].id;

    // Build query with optional service_name filter
    let query = `
      SELECT
        uc.credential_id,
        uc.status,
        uc.created_at,
        uc.updated_at,
        p.product_name,
        p.product_id,
        ps.service_name,
        ps.service_type,
        ps.id as service_id
      FROM user_credentials uc
      JOIN products p ON uc.product_id = p.id
      LEFT JOIN product_services ps ON uc.service_id = ps.id
      WHERE uc.user_id = $1
        AND uc.product_id = $2
        AND uc.status IN ('active', 'enrolled', 'pending')
    `;

    const queryParams = [user_id, productDbId];

    // Add service_name filter if provided
    if (service_name) {
      query += ` AND ps.service_name = $3`;
      queryParams.push(service_name);
    }

    query += ` ORDER BY uc.created_at DESC`;

    console.log('🔍 Executing query:', query);
    console.log('🔍 Query params:', queryParams);

    const result = await pool.query(query, queryParams);

    console.log(`📦 Found ${result.rows.length} credentials in Product DB`);
    if (result.rows.length > 0) {
      console.log('📋 First result:', result.rows[0]);
    }

    // Check credential status from ZTIZEN service for each credential
    const credentials = await Promise.all(
      result.rows.map(async (row) => {
        let actualStatus = row.status;

        // Check ZTIZEN service to see if credential is truly active/enrolled
        try {
          const ztizenResponse = await fetch(`${ENV.ZTIZEN_API_URL}/api/credentials/${row.credential_id}`);
          if (ztizenResponse.ok) {
            const ztizenData = await ztizenResponse.json();
            // If ZTIZEN says 'enrolled' but Product DB says 'pending', update to 'active'
            if (ztizenData.credential && ztizenData.credential.status === 'enrolled' && row.status === 'pending') {
              actualStatus = 'active';

              // Update Product DB status
              await pool.query(
                `UPDATE user_credentials SET status = 'active', updated_at = NOW() WHERE credential_id = $1`,
                [row.credential_id]
              );

              console.log(`✅ Auto-activated credential ${row.credential_id}`);
            } else if (ztizenData.credential && ztizenData.credential.status) {
              actualStatus = ztizenData.credential.status === 'enrolled' ? 'active' : ztizenData.credential.status;
            }
          }
        } catch (error) {
          console.warn(`⚠️ Could not check ZTIZEN status for ${row.credential_id}:`, error.message);
          // Continue with Product DB status if ZTIZEN check fails
        }

        return {
          credential_id: row.credential_id,
          status: actualStatus,
          product_name: row.product_name,
          product_id: row.product_id,
          service_name: row.service_name || 'Default Service',
          service_type: row.service_type || 'authentication',
          service_id: row.service_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      })
    );

    console.log(`📋 Found ${credentials.length} credentials for user ${user_id} on product ${product_id}${service_name ? ` (service: ${service_name})` : ''}`);

    res.json({
      success: true,
      credentials,
      count: credentials.length,
    });

  } catch (error) {
    console.error('Error listing credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list credentials',
      details: error.message,
    });
  }
});

/**
 * POST /api/enrollment/activate/:credentialId
 * Activate a credential after successful enrollment in ZTIZEN
 *
 * This is called by a webhook or manually after user completes enrollment
 */
router.post('/activate/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;

    const result = await pool.query(
      `UPDATE user_credentials
       SET status = 'active', updated_at = NOW()
       WHERE credential_id = $1 AND status = 'pending'
       RETURNING credential_id, user_id, status`,
      [credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found or already activated',
      });
    }

    const credential = result.rows[0];

    console.log('✅ Credential activated:', credential_id);

    res.json({
      success: true,
      credential_id: credential.credential_id,
      status: credential.status,
      message: 'Credential activated successfully',
    });

  } catch (error) {
    console.error('Error activating credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate credential',
      details: error.message,
    });
  }
});

export default router;
