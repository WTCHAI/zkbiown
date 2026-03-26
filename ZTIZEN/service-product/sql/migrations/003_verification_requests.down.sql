-- Rollback Verification Requests Tracking

-- Drop trigger
DROP TRIGGER IF EXISTS update_verification_requests_updated_at ON verification_requests;

-- Drop indexes
DROP INDEX IF EXISTS idx_verification_req_user_status;
DROP INDEX IF EXISTS idx_verification_req_expires;
DROP INDEX IF EXISTS idx_verification_req_created;
DROP INDEX IF EXISTS idx_verification_req_timestamp;
DROP INDEX IF EXISTS idx_verification_req_status;
DROP INDEX IF EXISTS idx_verification_req_credential;
DROP INDEX IF EXISTS idx_verification_req_user;
DROP INDEX IF EXISTS idx_verification_req_service;
DROP INDEX IF EXISTS idx_verification_req_product;

-- Drop table
DROP TABLE IF EXISTS verification_requests CASCADE;
