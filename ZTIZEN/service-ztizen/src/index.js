/**
 * ZTIZEN Service - Main Server
 * Cancelable Biometric Authentication Platform
 */

import express from 'express';
import cors from 'cors';
import enrollmentRoutes from './routes/enrollment.js';
import verificationRoutes from './routes/verification.js';
import verificationTrackingRoutes from './routes/verification-tracking.js';
import credentialsRoutes from './routes/credentials.js';
import keysRoutes from './routes/keys.js';
import { generateZTIZENPartialKey, bufferToHex } from './utils/crypto.js';
import pool from './db/pool.js';
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

// Increase body size limit to handle 956-dimensional biometrics
// 956 Poseidon commitments can create ~200KB payloads
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
      service: 'ZTIZEN Platform',
      version: '1.0.0',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'ZTIZEN Platform',
      version: '1.0.0',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Mount routes
app.use('/api/enroll', enrollmentRoutes);
app.use('/api/enrollment', enrollmentRoutes);  // Same routes for both paths
app.use('/api/verify', verificationRoutes);
app.use('/api/verification', verificationTrackingRoutes);  // Verification tracking
app.use('/api/credentials', credentialsRoutes);
app.use('/api/keys', keysRoutes);

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
      console.log('🚀 ZTIZEN Platform Started');
      console.log('='.repeat(60));
      console.log(`   Port: ${PORT}`);
      console.log(`   Environment: ${ENV.NODE_ENV}`);
      console.log(`   Database: ${ENV.DATABASE_URL ? 'configured' : 'NOT CONFIGURED'}`);
      console.log(`   Product API: ${ENV.PRODUCT_API_URL}`);
      console.log('='.repeat(60));
      console.log('\nAvailable endpoints:');
      console.log(`   GET    http://localhost:${PORT}/health`);
      console.log('');
      console.log('   Enrollment:');
      console.log(`   POST   http://localhost:${PORT}/api/enroll/initiate`);
      console.log(`   POST   http://localhost:${PORT}/api/enroll/complete`);
      console.log(`   GET    http://localhost:${PORT}/api/enroll/session/:sessionId`);
      console.log('');
      console.log('   Verification:');
      console.log(`   POST   http://localhost:${PORT}/api/verify/initiate`);
      console.log(`   POST   http://localhost:${PORT}/api/verify/complete`);
      console.log(`   POST   http://localhost:${PORT}/api/verify/pin-only`);
      console.log(`   GET    http://localhost:${PORT}/api/verify/session/:sessionId`);
      console.log('');
      console.log('   Credentials:');
      console.log(`   GET    http://localhost:${PORT}/api/credentials/:userId`);
      console.log(`   GET    http://localhost:${PORT}/api/credentials/detail/:credentialId`);
      console.log(`   PATCH  http://localhost:${PORT}/api/credentials/:credentialId`);
      console.log(`   PATCH  http://localhost:${PORT}/api/credentials/:credentialId/deactivate`);
      console.log(`   PATCH  http://localhost:${PORT}/api/credentials/:credentialId/reactivate`);
      console.log(`   DELETE http://localhost:${PORT}/api/credentials/:credentialId`);
      console.log(`   GET    http://localhost:${PORT}/api/credentials/:credentialId/logs`);
      console.log('');
      console.log('   Keys:');
      console.log(`   GET    http://localhost:${PORT}/api/keys/partial`);
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
