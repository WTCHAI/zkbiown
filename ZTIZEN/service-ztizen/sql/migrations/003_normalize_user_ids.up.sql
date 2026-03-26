-- Migration: Normalize user_id values to lowercase and add validation constraints
-- This ensures consistency with frontend wallet address handling

-- Step 1: Normalize all existing user_id values to lowercase
UPDATE credentials
SET user_id = LOWER(user_id)
WHERE user_id != LOWER(user_id);

-- Step 2: Add check constraint to enforce lowercase user_id
-- This prevents future inserts with uppercase characters
ALTER TABLE credentials
ADD CONSTRAINT check_user_id_lowercase
CHECK (user_id = LOWER(user_id));

-- Step 3: Add check constraint to enforce Ethereum address format
-- Format: 0x followed by exactly 40 hexadecimal characters (lowercase only)
ALTER TABLE credentials
ADD CONSTRAINT check_user_id_ethereum_format
CHECK (user_id ~ '^0x[0-9a-f]{40}$');

-- Step 4: Create index on user_id for faster lookups (if not exists)
-- This improves performance for credential queries by wallet address
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);

-- Log the migration
-- Note: This assumes you have a migrations table for tracking
-- If not, this comment serves as documentation
COMMENT ON CONSTRAINT check_user_id_lowercase ON credentials IS
  'Ensures user_id (Ethereum address) is stored in lowercase for consistent lookups';

COMMENT ON CONSTRAINT check_user_id_ethereum_format ON credentials IS
  'Validates user_id is a valid Ethereum address format (0x + 40 hex chars)';
