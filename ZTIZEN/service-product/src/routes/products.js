/**
 * Product management routes
 * Handles product registration, service configuration, and key management
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool.js';
import { generateProductPartialKey, bufferToHex } from '../utils/crypto.js';

const router = express.Router();

/**
 * POST /api/products/register
 * Register a new product with automatic partial key generation
 *
 * Body: {
 *   product_name: string,
 *   product_description?: string,
 *   api_endpoint?: string,
 *   contact_email?: string,
 *   services: Array<{
 *     service_name: string,
 *     service_description?: string,
 *     service_type?: string
 *   }>
 * }
 */
router.post('/register', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      product_name,
      product_description,
      api_endpoint,
      contact_email,
      services = []
    } = req.body;

    // Validate required fields
    if (!product_name) {
      return res.status(400).json({
        success: false,
        error: 'product_name is required'
      });
    }

    if (services.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one service must be provided'
      });
    }

    // Generate UUID
    const productId = uuidv4();
    // Generate product_id from name (kebab-case)
    const generatedProductId = product_name.toLowerCase().replace(/\s+/g, '-');

    // Generate product partial key (32 bytes = 64 hex chars)
    const productPartialKey = generateProductPartialKey();
    const partialKeyHex = bufferToHex(productPartialKey);

    await client.query('BEGIN');

    // Insert product with partial key
    const productResult = await client.query(
      `INSERT INTO products (
        id, product_id, product_name, product_description,
        product_partial_key, api_endpoint, contact_email
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [productId, generatedProductId, product_name, product_description, partialKeyHex, api_endpoint, contact_email]
    );

    const product = productResult.rows[0];

    // Insert services
    const createdServices = [];
    for (const service of services) {
      const serviceResult = await client.query(
        `INSERT INTO product_services (
          product_id, service_name, service_description, service_type
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [
          productId,
          service.service_name,
          service.service_description || null,
          service.service_type || 'authentication'
        ]
      );
      createdServices.push(serviceResult.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Product registered successfully',
      product: {
        id: product.id,
        product_id: product.product_id,
        product_name: product.product_name,
        product_description: product.product_description,
        api_endpoint: product.api_endpoint,
        contact_email: product.contact_email,
        is_active: product.is_active,
        created_at: product.created_at,
        services: createdServices.map(s => ({
          id: s.id,
          service_name: s.service_name,
          service_description: s.service_description,
          service_type: s.service_type,
          is_active: s.is_active
        }))
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Product registration error:', error);

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'Product with this name or key already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to register product'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/products/:productId
 * Get product details by ID
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const productResult = await pool.query(
      'SELECT * FROM products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const product = productResult.rows[0];

    // Get associated services
    const servicesResult = await pool.query(
      'SELECT * FROM product_services WHERE product_id = $1 ORDER BY created_at',
      [productId]
    );

    res.json({
      success: true,
      product: {
        ...product,
        services: servicesResult.rows
      }
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve product'
    });
  }
});

/**
 * GET /api/products
 * List all products with their services
 */
router.get('/', async (req, res) => {
  try {
    const productsResult = await pool.query(
      'SELECT * FROM products ORDER BY created_at DESC'
    );

    // Fetch services for each product
    const productsWithServices = await Promise.all(
      productsResult.rows.map(async (product) => {
        const servicesResult = await pool.query(
          'SELECT * FROM product_services WHERE product_id = $1 ORDER BY created_at',
          [product.id]
        );
        return {
          ...product,
          services: servicesResult.rows
        };
      })
    );

    res.json({
      success: true,
      products: productsWithServices
    });

  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list products'
    });
  }
});

/**
 * POST /api/products/:productId/services
 * Add a new service to an existing product
 */
router.post('/:productId/services', async (req, res) => {
  try {
    const { productId } = req.params;
    const { service_name, service_description, service_type } = req.body;

    if (!service_name) {
      return res.status(400).json({
        success: false,
        error: 'service_name is required'
      });
    }

    // Check if product exists
    const productCheck = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [productId]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const result = await pool.query(
      `INSERT INTO product_services (
        product_id, service_name, service_description, service_type
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [productId, service_name, service_description, service_type || 'authentication']
    );

    res.status(201).json({
      success: true,
      message: 'Service added successfully',
      service: result.rows[0]
    });

  } catch (error) {
    console.error('Add service error:', error);

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'Service with this name already exists for this product'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to add service'
    });
  }
});

/**
 * PATCH /api/products/:productId/deactivate
 * Deactivate a product
 */
router.patch('/:productId/deactivate', async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await pool.query(
      'UPDATE products SET is_active = false WHERE id = $1 RETURNING *',
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deactivated successfully',
      product: result.rows[0]
    });

  } catch (error) {
    console.error('Deactivate product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate product'
    });
  }
});

export default router;
