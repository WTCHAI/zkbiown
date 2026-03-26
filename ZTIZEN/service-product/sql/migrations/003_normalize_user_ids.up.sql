-- Migration: Normalize user_id values to lowercase and add validation constraints
-- This ensures consistency with frontend wallet address handling

-- Step 1: Normalize user_credentials table
UPDATE user_credentials
SET user_id = LOWER(user_id)
WHERE user_id != LOWER(user_id);

-- Step 2: Normalize verification_requests table
UPDATE verification_requests
SET user_id = LOWER(user_id)
WHERE user_id != LOWER(user_id);

-- Step 3: Add constraints to user_credentials table
ALTER TABLE user_credentials
ADD CONSTRAINT check_user_credentials_user_id_lowercase
CHECK (user_id = LOWER(user_id));

ALTER TABLE user_credentials
ADD CONSTRAINT check_user_credentials_user_id_ethereum_format
CHECK (user_id ~ '^0x[0-9a-f]{40}$');

-- Step 4: Add constraints to verification_requests table
ALTER TABLE verification_requests
ADD CONSTRAINT check_verification_requests_user_id_lowercase
CHECK (user_id = LOWER(user_id));

ALTER TABLE verification_requests
ADD CONSTRAINT check_verification_requests_user_id_ethereum_format
CHECK (user_id ~ '^0x[0-9a-f]{40}$');

-- Step 5: Create indexes for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_user_id ON verification_requests(user_id);

-- Add documentation
COMMENT ON CONSTRAINT check_user_credentials_user_id_lowercase ON user_credentials IS
  'Ensures user_id (Ethereum address) is stored in lowercase for consistent lookups';

COMMENT ON CONSTRAINT check_user_credentials_user_id_ethereum_format ON user_credentials IS
  'Validates user_id is a valid Ethereum address format (0x + 40 hex chars)';

COMMENT ON CONSTRAINT check_verification_requests_user_id_lowercase ON verification_requests IS
  'Ensures user_id (Ethereum address) is stored in lowercase for consistent lookups';

COMMENT ON CONSTRAINT check_verification_requests_user_id_ethereum_format ON verification_requests IS
  'Validates user_id is a valid Ethereum address format (0x + 40 hex chars)';
