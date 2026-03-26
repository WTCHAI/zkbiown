/**
 * Product Service - Main Server
 * Simulates a business provider using ZTIZEN for authentication
 */

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import keysRoutes from './routes/keys.js';
import productsRoutes from './routes/products.js';
import enrollmentRoutes from './routes/enrollment.js';
import verificationRequestsRoutes from './routes/verification-requests.js';
import txHashLookupRoutes from './routes/tx-hash-lookup.js';
import lineAuthRoutes from './routes/line-auth.js';
import pool from './db/pool.js';
import { generateProductPartialKey, bufferToHex } from './utils/crypto.js';
import { ENV } from './config/env.js';

// Initialize Express app
const app = express();
const PORT = ENV.PORT;

// Middleware
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');

    res.json({
      status: 'ok',
      service: 'ZTIZEN Product Service',
      version: '1.0.0',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'ZTIZEN Product Service',
      version: '1.0.0',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/verify', verificationRequestsRoutes);
app.use('/api/verify', txHashLookupRoutes); // tx_hash lookup routes
app.use('/api/line', lineAuthRoutes); // LINE OAuth routes

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Initialize server
async function startServer() {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection verified');

    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 Product Service Started');
      console.log('='.repeat(60));
      console.log(`   Port: ${PORT}`);
      console.log(`   Environment: ${ENV.NODE_ENV}`);
      console.log(`   Database: ${ENV.DATABASE_URL ? 'configured' : 'NOT CONFIGURED'}`);
      console.log(`   ZTIZEN API: ${ENV.ZTIZEN_API_URL}`);
      console.log('='.repeat(60));
      console.log('\nAvailable endpoints:');
      console.log(`   GET    http://localhost:${PORT}/health`);
      console.log('');
      console.log('   Enrollment (NEW):');
      console.log(`   POST   http://localhost:${PORT}/api/enrollment/initiate`);
      console.log(`   GET    http://localhost:${PORT}/api/enrollment/status/:credentialId`);
      console.log(`   POST   http://localhost:${PORT}/api/enrollment/activate/:credentialId`);
      console.log('');
      console.log('   Keys:');
      console.log(`   GET    http://localhost:${PORT}/api/keys/partial/:productId`);
      console.log(`   GET    http://localhost:${PORT}/api/keys/credential/:credentialId (NEW)`);
      console.log('');
      console.log('   Products:');
      console.log(`   POST   http://localhost:${PORT}/api/products/register`);
      console.log(`   GET    http://localhost:${PORT}/api/products`);
      console.log(`   GET    http://localhost:${PORT}/api/products/:productId`);
      console.log(`   POST   http://localhost:${PORT}/api/products/:productId/services`);
      console.log(`   PATCH  http://localhost:${PORT}/api/products/:productId/deactivate`);
      console.log('');
      console.log('   Auth:');
      console.log(`   POST   http://localhost:${PORT}/api/auth/register`);
      console.log(`   POST   http://localhost:${PORT}/api/auth/login-request`);
      console.log(`   POST   http://localhost:${PORT}/api/auth/callback`);
      console.log('');
      console.log('   Verification Requests (NEW):');
      console.log(`   POST   http://localhost:${PORT}/api/verify/request`);
      console.log(`   GET    http://localhost:${PORT}/api/verify/status/:requestId`);
      console.log(`   POST   http://localhost:${PORT}/api/verify/callback`);
      console.log(`   GET    http://localhost:${PORT}/api/verify/requests`);
      console.log('');
      console.log('   Transaction Hash Lookup (NEW):');
      console.log(`   GET    http://localhost:${PORT}/api/verify/lookup/:txHash`);
      console.log(`   POST   http://localhost:${PORT}/api/verify/lookup/batch`);
      console.log(`   GET    http://localhost:${PORT}/api/verify/lookup/onchain/:onchainTxHash`);
      console.log('');
      console.log('   LINE OAuth:');
      console.log(`   GET    http://localhost:${PORT}/api/line/login`);
      console.log(`   GET    http://localhost:${PORT}/api/line/callback`);
      console.log(`   POST   http://localhost:${PORT}/api/line/set-email`);
      console.log(`   GET    http://localhost:${PORT}/api/line/me`);
      console.log(`   POST   http://localhost:${PORT}/api/line/check-credential`);
      console.log('='.repeat(60) + '\n');
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
