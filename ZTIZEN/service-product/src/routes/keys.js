/**
 * Key management routes for Product Service
 * Provides product partial key for seed generation
 */

import express from 'express';
import pool from '../db/pool.js';
import { bufferToHex, hexToBuffer } from '../utils/crypto.js';

const router = express.Router();

/**
 * GET /api/keys/partial/:productId
 * Returns SERVICE-SPECIFIC partial key (NEW SCHEMA V3 - Service Keys)
 *
 * Query params:
 * - serviceId: (optional) specific service ID
 * - serviceName: (optional) service name (alternative to serviceId)
 *
 * Returns service-specific key when serviceId/serviceName is provided.
 * Each service (Login, Transfer, Balance) has its own unique key.
 *
 * In production, this would:
 * - Require authentication
 * - Be rate-limited
 * - Log access for auditing
 */
router.get('/partial/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { serviceId, serviceName } = req.query;

    // Get product details
    const productResult = await pool.query(
      'SELECT * FROM products WHERE product_id = $1 AND is_active = true',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found or inactive'
      });
    }

    const product = productResult.rows[0];

    // If serviceId or serviceName provided, get service-specific key
    let service = null;
    let partialKey = null;

    if (serviceId) {
      const serviceResult = await pool.query(
        'SELECT * FROM product_services WHERE id = $1 AND product_id = $2 AND is_active = true',
        [serviceId, product.id]
      );

      if (serviceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Service not found or inactive'
        });
      }

      service = serviceResult.rows[0];
      partialKey = service.service_partial_key;  // SERVICE-SPECIFIC KEY
    } else if (serviceName) {
      const serviceResult = await pool.query(
        'SELECT * FROM product_services WHERE service_name = $1 AND product_id = $2 AND is_active = true',
        [serviceName, product.id]
      );

      if (serviceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Service not found or inactive'
        });
      }

      service = serviceResult.rows[0];
      partialKey = service.service_partial_key;  // SERVICE-SPECIFIC KEY
    } else {
      return res.status(400).json({
        success: false,
        error: 'serviceId or serviceName required'
      });
    }

    console.log('🔑 Retrieved SERVICE partial key for:', productId, '-', service.service_name);

    res.json({
      success: true,
      partialKey: partialKey,  // SERVICE-SPECIFIC KEY
      partial_key: partialKey,  // Alias for backward compatibility
      product: {
        id: product.id,
        product_id: product.product_id,
        product_name: product.product_name,
        product_description: product.product_description
      },
      service: {
        id: service.id,
        service_name: service.service_name,
        service_description: service.service_description,
        service_type: service.service_type
      },
      message: 'Service partial key retrieved'
    });

  } catch (error) {
    console.error('Key retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/keys/credential/:credentialId
 * Get USER-SERVICE-SPECIFIC partial key for a credential (SCHEMA V3 - Per-User Service Keys)
 *
 * This endpoint is called during enrollment to retrieve the unique partial key
 * needed for auth_commit generation.
 *
 * IMPORTANT: Each (user, service) pair has its own unique key for:
 * - User-level isolation (User A Login ≠ User B Login)
 * - Service-level isolation (User A Login ≠ User A Transfer)
 * - True 1 user : 1 key : 1 service model
 *
 * Response:
 * {
 *   success: true,
 *   partial_key: "abc123def456...",  // 64 hex - UNIQUE per (user, service)
 *   credential_id: "a7f3e8d9-...",
 *   service_name: "Login"
 * }
 */
router.get('/credential/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;

    // Fetch USER-SERVICE partial key for this credential
    // This key is unique per (user, service) credential
    // Use LEFT JOIN to handle credentials without service_id (NULL)
    const result = await pool.query(
      `SELECT
        uc.credential_id,
        uc.user_id,
        uc.service_id,
        uc.product_partial_key as partial_key,
        COALESCE(ps.service_name, 'Default Service') as service_name
      FROM user_credentials uc
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

    // Ensure partial_key exists (should always be set during enrollment)
    if (!credential.partial_key) {
      console.error('❌ Credential found but no partial_key:', credentialId);
      return res.status(500).json({
        success: false,
        error: 'Credential exists but partial_key not found',
      });
    }

    console.log('🔑 Retrieved USER-SERVICE partial key:', {
      credential: credentialId.substring(0, 8) + '...',
      user: credential.user_id.substring(0, 10) + '...',
      service: credential.service_name,
      key: credential.partial_key.substring(0, 16) + '...',
    });

    res.json({
      success: true,
      partial_key: credential.partial_key,  // UNIQUE per (user, service)
      credential_id: credential.credential_id,
      service_id: credential.service_id,
      service_name: credential.service_name,
      user_id: credential.user_id,
    });

  } catch (error) {
    console.error('Error fetching user-service partial key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user-service partial key',
      details: error.message,
    });
  }
});

/**
 * POST /api/keys/rotate
 * Rotate product partial key (admin only)
 *
 * This would trigger re-enrollment for all users
 */
router.post('/rotate', (req, res) => {
  // TODO: Implement key rotation
  // This is a sensitive operation that would:
  // 1. Generate new product_partial_key
  // 2. Notify all users to re-enroll
  // 3. Invalidate old credentials
  // 4. Update environment configuration

  res.status(501).json({
    success: false,
    error: 'Key rotation not yet implemented'
  });
});

export default router;
