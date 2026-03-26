-- Rollback: Remove user_id normalization constraints
-- This allows reverting to the previous state if needed

-- Remove Ethereum address format constraint
ALTER TABLE credentials DROP CONSTRAINT IF EXISTS check_user_id_ethereum_format;

-- Remove lowercase enforcement constraint
ALTER TABLE credentials DROP CONSTRAINT IF EXISTS check_user_id_lowercase;

-- Note: We don't revert the lowercase normalization of existing data
-- because it's a safe operation and maintains consistency
-- If you need to restore original case, you would need a backup

-- The index is kept as it improves performance regardless
-- DROP INDEX IF EXISTS idx_credentials_user_id;
