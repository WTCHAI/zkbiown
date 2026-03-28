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
  PORT: process.env.PORT || 5503,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database
  DATABASE_URL: process.env.DATABASE_URL,

  // External Services
  ZTIZEN_API_URL: process.env.ZTIZEN_API_URL || 'http://localhost:5502',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5501',

  // LINE OAuth
  LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID || '',
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || '',
  LINE_CALLBACK_URL: process.env.LINE_CALLBACK_URL || 'http://localhost:5503/api/line/callback',

  // Security
  SESSION_SECRET: process.env.SESSION_SECRET,
};

// Log configuration on startup (only in development)
if (ENV.NODE_ENV === 'development') {
  console.log('📋 Product Service ENV Configuration:');
  console.log(`   PORT: ${ENV.PORT}`);
  console.log(`   ZTIZEN_API_URL: ${ENV.ZTIZEN_API_URL}`);
  console.log(`   FRONTEND_URL: ${ENV.FRONTEND_URL}`);
}
