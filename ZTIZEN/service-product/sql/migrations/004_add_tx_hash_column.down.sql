-- Rollback: Remove tx_hash column from verification_requests table

-- Drop index first
DROP INDEX IF EXISTS idx_verification_req_tx_hash;

-- Drop column
ALTER TABLE verification_requests
DROP COLUMN IF EXISTS tx_hash;