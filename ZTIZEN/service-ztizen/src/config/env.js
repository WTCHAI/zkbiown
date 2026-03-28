/**
 * Centralized Environment Configuration
 * All environment variables should be accessed through this module
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local first (higher priority), then .env
dotenv.config({ path: join(__dirname, '../../.env.local') });
dotenv.config({ path: join(__dirname, '../../.env') });

export const ENV = {
  // Server
  PORT: process.env.PORT || 5502,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database
  DATABASE_URL: process.env.DATABASE_URL,

  // External Services
  PRODUCT_API_URL: process.env.PRODUCT_API_URL || 'http://localhost:5503',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5501',
};

// Log configuration on startup (only in development)
if (ENV.NODE_ENV === 'development') {
  console.log('📋 ZTIZEN Service ENV Configuration:');
  console.log(`   PORT: ${ENV.PORT}`);
  console.log(`   DATABASE_URL: ${ENV.DATABASE_URL ? '✓ Set' : '✗ Missing'}`);
  console.log(`   PRODUCT_API_URL: ${ENV.PRODUCT_API_URL}`);
  console.log(`   FRONTEND_URL: ${ENV.FRONTEND_URL}`);
}
