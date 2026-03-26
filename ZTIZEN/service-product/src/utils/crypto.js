/**
 * Cryptographic utilities for Product Service
 */

import crypto from 'crypto';

/**
 * Generate product partial key (32 bytes)
 * This key is used in multi-party seed generation
 */
export function generateProductPartialKey() {
  return crypto.randomBytes(32);
}

/**
 * Convert buffer to hex string
 */
export function bufferToHex(buffer) {
  return Buffer.from(buffer).toString('hex');
}

/**
 * Convert hex string to buffer
 */
export function hexToBuffer(hex) {
  return Buffer.from(hex, 'hex');
}

/**
 * Generate session ID
 */
export function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}
