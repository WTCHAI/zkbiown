/**
 * Request ID Generation Utilities
 * Generates unique verification request IDs using keccak256
 */

import { keccak256, toBytes, toHex, encodeAbiParameters, parseAbiParameters } from 'viem';

/**
 * Generate unique verification request ID
 * Uses keccak256(service_id + timestamp + nonce)
 *
 * @param {string} serviceId - Service identifier
 * @param {number} timestamp - Unix timestamp (seconds)
 * @param {string} [nonce] - Optional nonce (random string)
 * @returns {string} Request ID as 0x-prefixed hex string (66 chars)
 */
export function generateRequestId(serviceId, timestamp, nonce = null) {
  // Generate nonce if not provided
  const nonceValue = nonce || Math.random().toString(36).substring(2, 15);

  // Combine service_id + timestamp + nonce
  const data = `${serviceId}:${timestamp}:${nonceValue}`;

  // Hash with keccak256
  const hash = keccak256(toBytes(data));

  return hash; // Returns 0x-prefixed 64-char hex string
}

/**
 * Generate tx_hash for on-chain verification tracking
 * This hash is used to match on-chain ZKVerificationCompleted events
 * to product's original verification requests
 *
 * tx_hash = keccak256(abi.encode(service_id, timestamp, details_hash))
 *
 * @param {string} serviceId - Service UUID as bytes32
 * @param {number} timestamp - Unix timestamp
 * @param {object} details - Request details (will be stringified and hashed)
 * @returns {string} tx_hash as 0x-prefixed hex string
 */
export function generateTxHash(serviceId, timestamp, details = {}) {
  // Hash the details object
  const detailsString = JSON.stringify(details);
  const detailsHash = keccak256(toBytes(detailsString));

  // Combine: service_id + timestamp + details_hash
  // This matches the format expected by the smart contract
  const data = `${serviceId}:${timestamp}:${detailsHash}`;

  // Final hash
  const txHash = keccak256(toBytes(data));

  return txHash;
}

/**
 * Convert service UUID to bytes32 for smart contract
 *
 * @param {string} serviceId - Service UUID (with dashes)
 * @returns {string} bytes32 hex string
 */
export function serviceIdToBytes32(serviceId) {
  if (!serviceId) return '0x' + '0'.repeat(64);

  // Remove dashes and pad to 32 bytes
  const cleanId = serviceId.replace(/-/g, '');
  return '0x' + cleanId.padEnd(64, '0');
}

/**
 * Validate request ID format
 *
 * @param {string} requestId - Request ID to validate
 * @returns {boolean} True if valid format
 */
export function isValidRequestId(requestId) {
  // Must be 0x-prefixed 64-char hex string (66 total chars)
  return /^0x[0-9a-fA-F]{64}$/.test(requestId);
}

/**
 * Validate tx_hash format (same as request_id)
 *
 * @param {string} txHash - tx_hash to validate
 * @returns {boolean} True if valid format
 */
export function isValidTxHash(txHash) {
  return isValidRequestId(txHash);
}

/**
 * Generate short request ID for display
 *
 * @param {string} requestId - Full request ID
 * @returns {string} Shortened version (first 10 + last 8 chars)
 */
export function shortenRequestId(requestId) {
  if (!requestId || requestId.length < 18) return requestId;
  return `${requestId.substring(0, 10)}...${requestId.substring(requestId.length - 8)}`;
}
