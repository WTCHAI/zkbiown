/**
 * Cryptographic Utilities for ZTIZEN Service
 * Handles key generation, hashing, and token creation
 */

import crypto from 'crypto';

/**
 * Generate ZTIZEN partial key (32 bytes)
 * This is one of three components in multi-party seed generation
 * @returns {Buffer} 32-byte random key
 */
export function generateZTIZENPartialKey() {
  return crypto.randomBytes(32);
}

/**
 * Generate session ID for enrollment/verification flows
 * @returns {string} Hex-encoded session ID
 */
export function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate authentication token
 * @returns {string} Hex-encoded auth token
 */
export function generateAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash credential PIN using PBKDF2
 * @param {string} pin - Credential PIN
 * @param {string} salt - Optional salt (defaults to credential_id)
 * @returns {string} Hashed PIN (hex-encoded)
 */
export function hashCredentialPin(pin, salt = null) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(
    pin,
    actualSalt,
    100000,  // iterations
    64,      // keylen
    'sha256' // digest
  );
  return `${actualSalt}:${hash.toString('hex')}`;
}

/**
 * Verify credential PIN against hash
 * @param {string} pin - Credential PIN to verify
 * @param {string} storedHash - Stored hash (salt:hash format)
 * @returns {boolean} True if PIN matches
 */
export function verifyCredentialPin(pin, storedHash) {
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(
    pin,
    salt,
    100000,
    64,
    'sha256'
  );
  return hash.toString('hex') === originalHash;
}

/**
 * Convert Buffer to hex string
 * @param {Buffer} buffer - Buffer to convert
 * @returns {string} Hex string
 */
export function bufferToHex(buffer) {
  return buffer.toString('hex');
}

/**
 * Convert hex string to Buffer
 * @param {string} hex - Hex string
 * @returns {Buffer} Buffer
 */
export function hexToBuffer(hex) {
  return Buffer.from(hex, 'hex');
}

/**
 * Generate last 4 digits for credential display
 * @param {string} credentialId - Credential UUID
 * @returns {string} Last 4 digits (e.g., "1234")
 */
export function generateLast4Digits(credentialId) {
  // Use first 4 hex chars of credential ID hash
  const hash = crypto.createHash('sha256').update(credentialId).digest('hex');
  return hash.substring(0, 4);
}

/**
 * Validate commitment array format
 * @param {Array} commitments - Array of Poseidon commitments
 * @returns {boolean} True if valid format
 */
export function validateCommitments(commitments) {
  if (!Array.isArray(commitments)) {
    return false;
  }

  if (commitments.length !== 128) {
    return false;
  }

  // Check if all elements are valid hex strings or Buffers
  return commitments.every(c => {
    if (Buffer.isBuffer(c)) {
      return c.length === 32;
    }
    if (typeof c === 'string') {
      return /^[0-9a-fA-F]{64}$/.test(c);
    }
    return false;
  });
}

/**
 * Convert commitment array to database format (BYTEA array)
 * @param {Array<string|Buffer>} commitments - Array of commitments
 * @returns {Array<Buffer>} Array of Buffers for PostgreSQL
 */
export function commitmentsToByteArray(commitments) {
  return commitments.map(c => {
    if (Buffer.isBuffer(c)) {
      return c;
    }
    return hexToBuffer(c);
  });
}

/**
 * Convert database BYTEA array to hex strings
 * @param {Array<Buffer>} byteArray - Array of Buffers from database
 * @returns {Array<string>} Array of hex strings
 */
export function byteArrayToCommitments(byteArray) {
  return byteArray.map(b => bufferToHex(b));
}

/**
 * Calculate match rate between two binary templates
 * @param {Array<number>} template1 - First binary template (128 bits)
 * @param {Array<number>} template2 - Second binary template (128 bits)
 * @returns {number} Match percentage (0-100)
 */
export function calculateMatchRate(template1, template2) {
  if (template1.length !== template2.length) {
    throw new Error('Templates must have same length');
  }

  let matches = 0;
  for (let i = 0; i < template1.length; i++) {
    if (template1[i] === template2[i]) {
      matches++;
    }
  }

  return (matches / template1.length) * 100;
}

export default {
  generateZTIZENPartialKey,
  generateSessionId,
  generateAuthToken,
  hashCredentialPin,
  verifyCredentialPin,
  bufferToHex,
  hexToBuffer,
  generateLast4Digits,
  validateCommitments,
  commitmentsToByteArray,
  byteArrayToCommitments,
  calculateMatchRate,
};
