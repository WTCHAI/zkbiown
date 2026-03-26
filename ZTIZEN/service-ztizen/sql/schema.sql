-- ZTIZEN Database Schema (CORRECTED)
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

    -- Template Type (Algorithm used for biometric template generation)
    -- Expanded to VARCHAR(50) to support longer algorithm names
    template_type VARCHAR(50),

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

-- Verification Transactions Table
-- Tracks all verification transactions with traditional, ZK proof, and on-chain data
-- Links verification requests from products to ZTIZEN verification results
CREATE TABLE IF NOT EXISTS verification_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Transaction identifier (unique for each verification)
    tx_id VARCHAR(64) UNIQUE NOT NULL,

    -- Link to product's verification request (nullable for backward compatibility)
    request_id VARCHAR(66),  -- keccak256 hash (0x + 64 hex chars)

    -- Credential reference
    credential_id UUID NOT NULL REFERENCES credentials(credential_id) ON DELETE CASCADE,

    -- Service information (from product request)
    service_id VARCHAR(255),
    service_name VARCHAR(255),
    product_id VARCHAR(255),

    -- Product's tx_hash for on-chain matching
    -- tx_hash = keccak256(service_id + timestamp + details)
    -- Used to match ZKVerificationCompleted events on-chain
    tx_hash VARCHAR(66),  -- keccak256 hash (0x + 64 hex chars)

    -- Service ID as bytes32 for smart contract
    service_id_bytes32 VARCHAR(66),  -- bytes32 (0x + 64 hex chars)

    -- Traditional verification results
    traditional_verified BOOLEAN NOT NULL,
    traditional_match_count INTEGER NOT NULL,
    traditional_match_rate NUMERIC(5,2) NOT NULL,

    -- ZK Proof data (nullable if ZK proof generation fails)
    zk_verified BOOLEAN,
    zk_match_count INTEGER,
    proof BYTEA,  -- ZK proof bytes
    public_inputs JSONB,  -- Public inputs as JSON array

    -- On-chain data (populated after blockchain submission)
    onchain_tx_hash VARCHAR(66),  -- Ethereum tx hash (0x + 64 hex chars)
    onchain_verified BOOLEAN,
    onchain_timestamp BIGINT,
    onchain_block_number BIGINT,

    -- Nonce tracking for replay protection
    nonce_before TEXT,
    nonce_after TEXT,

    -- Metadata
    timestamp BIGINT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT check_traditional_match_rate CHECK (traditional_match_rate >= 0 AND traditional_match_rate <= 100),
    CONSTRAINT check_traditional_match_count CHECK (traditional_match_count >= 0 AND traditional_match_count <= 128),
    CONSTRAINT check_zk_match_count CHECK (zk_match_count IS NULL OR (zk_match_count >= 0 AND zk_match_count <= 128))
);

-- Indexes for verification_transactions
CREATE INDEX IF NOT EXISTS idx_verification_tx_request ON verification_transactions(request_id);
CREATE INDEX IF NOT EXISTS idx_verification_tx_credential ON verification_transactions(credential_id);
CREATE INDEX IF NOT EXISTS idx_verification_tx_service ON verification_transactions(service_id);
CREATE INDEX IF NOT EXISTS idx_verification_tx_product ON verification_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_verification_tx_onchain ON verification_transactions(onchain_tx_hash);
CREATE INDEX IF NOT EXISTS idx_verification_tx_txhash ON verification_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_verification_tx_timestamp ON verification_transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_verification_tx_created ON verification_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_tx_credential_timestamp ON verification_transactions(credential_id, timestamp DESC);

-- Comments for verification_transactions
COMMENT ON TABLE verification_transactions IS 'Tracks all verification transactions with traditional, ZK proof, and on-chain data';
COMMENT ON COLUMN verification_transactions.tx_id IS 'Unique transaction ID generated by ZTIZEN';
COMMENT ON COLUMN verification_transactions.request_id IS 'Links to product verification request (keccak256 hash)';
COMMENT ON COLUMN verification_transactions.tx_hash IS 'Product tx_hash for on-chain matching: keccak256(service_id + timestamp + details)';
COMMENT ON COLUMN verification_transactions.service_id_bytes32 IS 'Service ID as bytes32 for smart contract ZKVerificationCompleted event';
COMMENT ON COLUMN verification_transactions.traditional_verified IS 'Whether traditional off-chain verification passed (89.8% threshold)';
COMMENT ON COLUMN verification_transactions.zk_verified IS 'Whether ZK proof verification passed (85.2% threshold, 109/128 bits)';
COMMENT ON COLUMN verification_transactions.proof IS 'ZK proof bytes (UltraHonk proof)';
COMMENT ON COLUMN verification_transactions.public_inputs IS 'ZK proof public inputs (match count, etc.)';
COMMENT ON COLUMN verification_transactions.onchain_tx_hash IS 'Ethereum transaction hash after on-chain submission';
COMMENT ON COLUMN verification_transactions.nonce_before IS 'Nonce value before verification (for audit trail)';
COMMENT ON COLUMN verification_transactions.nonce_after IS 'Nonce value after successful verification (rolled nonce)';
