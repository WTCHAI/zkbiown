-- Rollback: Remove user_id normalization constraints
-- This allows reverting to the previous state if needed

-- Remove constraints from verification_requests table
ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS check_verification_requests_user_id_ethereum_format;
ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS check_verification_requests_user_id_lowercase;

-- Remove constraints from user_credentials table
ALTER TABLE user_credentials DROP CONSTRAINT IF EXISTS check_user_credentials_user_id_ethereum_format;
ALTER TABLE user_credentials DROP CONSTRAINT IF EXISTS check_user_credentials_user_id_lowercase;

-- Note: We don't revert the lowercase normalization of existing data
-- because it's a safe operation and maintains consistency
-- If you need to restore original case, you would need a backup

-- The indexes are kept as they improve performance regardless
-- DROP INDEX IF EXISTS idx_user_credentials_user_id;
-- DROP INDEX IF EXISTS idx_verification_requests_user_id;
