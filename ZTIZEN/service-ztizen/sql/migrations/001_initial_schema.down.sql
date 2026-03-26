-- Rollback ZTIZEN Service Schema

-- Drop triggers
DROP TRIGGER IF EXISTS update_credentials_updated_at ON credentials;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables
DROP TABLE IF EXISTS verification_logs CASCADE;
DROP TABLE IF EXISTS credentials CASCADE;
DROP TABLE IF EXISTS users CASCADE;
