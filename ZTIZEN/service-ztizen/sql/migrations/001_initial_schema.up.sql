-- ZTIZEN Database Schema
-- Aligned with enrollment-new.js API implementation
-- Rolling Nonce Protocol with Poseidon Hash Commitments

-- Drop existing tables
DROP TABLE IF EXISTS verification_logs CASCADE;
DROP TABLE IF EXISTS credentials CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Credentials Table
-- Each credential represents user's biometric enrollment for a product/service
CREATE TABLE IF NOT EXISTS credentials (
    -- Primary identifier
    credential_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User identification (Privy user_id or wallet address)
    user_id VARCHAR(255) NOT NULL,

    -- Product/Service information
    product_id VARCHAR(255) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    service_type VARCHAR(50) NOT NULL,  -- 'authentication', 'payment', 'access'

    -- ZTIZEN Partial Key (one of three keys in 3-party trust model)
    -- 32 bytes = 64 hex characters
    ztizen_partial_key VARCHAR(64) NOT NULL,

    -- Auth Commit (Array of 128 Poseidon hashes)
    -- Each element is a BigInt field element (BN254) stored as string
    -- Example: ["12345678901234567890...", "98765432109876543210...", ...]
    auth_commit JSONB,

    -- Template Type (Gaussian or Quantization)
    template_type VARCHAR(20),

    -- Rolling Nonce Protocol
    -- Nonce stored as TEXT (can be hash or BigInt string)
    -- Will eventually be stored on-chain as hashed value for replay protection
    nonce TEXT,

    -- Version for template revocation
    -- Increment version = invalidate all previous auth_commits
    version INTEGER DEFAULT 1,

    -- PIN hash (PBKDF2: salt:hash format, ~161 chars)
    pin_hash VARCHAR(200),

    -- Metadata (extensible JSON field)
    metadata JSONB,

    -- Verification tracking
    verification_count INTEGER DEFAULT 0,
    last_verified_at TIMESTAMP,

    -- Status workflow: pending → enrolled → active (or revoked)
    status VARCHAR(20) DEFAULT 'pending',

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    enrolled_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT check_status CHECK (status IN ('pending', 'enrolled', 'active', 'revoked')),
    CONSTRAINT check_template_type CHECK (template_type IN ('gaussian', 'quantization')),
    CONSTRAINT check_version_positive CHECK (version > 0),
    CONSTRAINT check_ztizen_key_format CHECK (ztizen_partial_key ~ '^[0-9a-fA-F]{64}$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_product_id ON credentials(product_id);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON credentials(status);
CREATE INDEX IF NOT EXISTS idx_credentials_user_status ON credentials(user_id, status);
CREATE INDEX IF NOT EXISTS idx_credentials_nonce ON credentials(nonce);
CREATE INDEX IF NOT EXISTS idx_credentials_created_at ON credentials(created_at);

-- Verification Logs (Audit Trail)
CREATE TABLE IF NOT EXISTS verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id UUID NOT NULL REFERENCES credentials(credential_id) ON DELETE CASCADE,

    -- Verification result
    success BOOLEAN NOT NULL,
    match_rate DECIMAL(5,2),  -- Percentage (0-100)

    -- Protocol data (nonce and version used for this verification)
    nonce_used TEXT NOT NULL,
    version_used INTEGER NOT NULL,

    -- Request metadata
    ip_address VARCHAR(45),
    user_agent TEXT,

    -- Timestamp
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_logs_credential_id ON verification_logs(credential_id);
CREATE INDEX IF NOT EXISTS idx_verification_logs_timestamp ON verification_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_verification_logs_success ON verification_logs(success);

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for credentials updated_at
CREATE TRIGGER update_credentials_updated_at
BEFORE UPDATE ON credentials
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE credentials IS 'Stores biometric credentials with cancelable templates and rolling nonce protocol';
COMMENT ON COLUMN credentials.auth_commit IS 'Array of 128 Poseidon hashes (one per template bit), stored as JSONB array of BigInt strings';
COMMENT ON COLUMN credentials.nonce IS 'Rolling nonce for one-time-use auth commits. Will be stored on-chain as hash for replay protection';
COMMENT ON COLUMN credentials.template_type IS 'Biometric template algorithm used: gaussian (BioHashing) or quantization';
COMMENT ON COLUMN credentials.version IS 'Template version for revocation. Increment to invalidate all previous commitments';
COMMENT ON COLUMN credentials.verification_count IS 'Number of successful verifications (audit trail)';
COMMENT ON COLUMN credentials.ztizen_partial_key IS 'ZTIZEN partial key (1 of 3 keys in 3-party trust model)';

COMMENT ON TABLE verification_logs IS 'Audit trail of all verification attempts (success and failure)';
COMMENT ON COLUMN verification_logs.nonce_used IS 'Nonce value used for this verification attempt';
