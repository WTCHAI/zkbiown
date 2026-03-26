/**
 * Ethereum Address Validation Middleware
 *
 * Validates and normalizes Ethereum addresses in request parameters.
 * Ensures all user_id values are valid Ethereum addresses and lowercase.
 */

/**
 * Check if a string is a valid Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean} - True if valid Ethereum address format
 */
function isValidEthereumAddress(address) {
  if (typeof address !== 'string') {
    return false;
  }

  // Must start with 0x and have exactly 40 hexadecimal characters
  const ethAddressRegex = /^0x[0-9a-fA-F]{40}$/;
  return ethAddressRegex.test(address);
}

/**
 * Middleware to validate and normalize user_id (Ethereum address)
 *
 * Checks user_id in:
 * - req.body.user_id
 * - req.params.userId
 * - req.query.user_id
 *
 * Normalizes addresses to lowercase for consistent database lookups.
 */
function validateAndNormalizeUserId(req, res, next) {
  // Extract user_id from various sources
  const userId = req.body.user_id || req.params.userId || req.query.user_id;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'user_id is required',
      code: 'MISSING_USER_ID'
    });
  }

  if (!isValidEthereumAddress(userId)) {
    return res.status(400).json({
      success: false,
      error: 'user_id must be a valid Ethereum address (0x followed by 40 hexadecimal characters)',
      code: 'INVALID_ADDRESS_FORMAT',
      received: userId
    });
  }

  // Normalize to lowercase for consistency
  const normalizedUserId = userId.toLowerCase();

  // Update all possible locations
  if (req.body.user_id) {
    req.body.user_id = normalizedUserId;
  }
  if (req.params.userId) {
    req.params.userId = normalizedUserId;
  }
  if (req.query.user_id) {
    req.query.user_id = normalizedUserId;
  }

  next();
}

/**
 * Middleware to validate credential_id format
 * Ensures credential_id is a valid UUID v4
 */
function validateCredentialId(req, res, next) {
  const credentialId = req.body.credential_id || req.params.credentialId || req.query.credential_id;

  if (!credentialId) {
    return res.status(400).json({
      success: false,
      error: 'credential_id is required',
      code: 'MISSING_CREDENTIAL_ID'
    });
  }

  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(credentialId)) {
    return res.status(400).json({
      success: false,
      error: 'credential_id must be a valid UUID v4',
      code: 'INVALID_CREDENTIAL_ID',
      received: credentialId
    });
  }

  next();
}

/**
 * Optional middleware - only validates if user_id is present
 * Use for routes where user_id is an optional parameter
 */
function validateAndNormalizeUserIdOptional(req, res, next) {
  const userId = req.body.user_id || req.params.userId || req.query.user_id;

  // If no user_id provided, skip validation
  if (!userId) {
    return next();
  }

  // If user_id is provided, validate it
  if (!isValidEthereumAddress(userId)) {
    return res.status(400).json({
      success: false,
      error: 'user_id must be a valid Ethereum address (0x followed by 40 hexadecimal characters)',
      code: 'INVALID_ADDRESS_FORMAT',
      received: userId
    });
  }

  // Normalize to lowercase
  const normalizedUserId = userId.toLowerCase();

  if (req.body.user_id) {
    req.body.user_id = normalizedUserId;
  }
  if (req.params.userId) {
    req.params.userId = normalizedUserId;
  }
  if (req.query.user_id) {
    req.query.user_id = normalizedUserId;
  }

  next();
}

export {
  isValidEthereumAddress,
  validateAndNormalizeUserId,
  validateAndNormalizeUserIdOptional,
  validateCredentialId
};
