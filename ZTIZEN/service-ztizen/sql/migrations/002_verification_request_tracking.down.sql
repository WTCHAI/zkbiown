-- Rollback Verification Request Tracking System

-- Drop indexes
DROP INDEX IF EXISTS idx_verification_tx_credential_timestamp;
DROP INDEX IF EXISTS idx_verification_tx_created;
DROP INDEX IF EXISTS idx_verification_tx_timestamp;
DROP INDEX IF EXISTS idx_verification_tx_onchain;
DROP INDEX IF EXISTS idx_verification_tx_product;
DROP INDEX IF EXISTS idx_verification_tx_service;
DROP INDEX IF EXISTS idx_verification_tx_credential;
DROP INDEX IF EXISTS idx_verification_tx_request;

-- Drop table
DROP TABLE IF EXISTS verification_transactions CASCADE;
