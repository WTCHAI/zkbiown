-- Product Service Database Schema V2
-- Revised with per-credential partial keys and Privy integration
--
-- Key Changes:
-- - user_credentials table stores product partial keys per credential
-- - Each credential has its own unique product_partial_key
-- - Integrated with ZTIZEN credential_id

-- Drop old tables if upgrading
DROP TABLE IF EXISTS auth_logs CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS user_credentials CASCADE;
DROP TABLE IF EXISTS product_services CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- Products table (registered business providers)
-- One product can have multiple services
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id VARCHAR(100) NOT NULL UNIQUE,  -- e.g., 'demo-bank', 'demo-store'
    product_name VARCHAR(255) NOT NULL,
    product_description TEXT,

    -- Product metadata
    api_endpoint VARCHAR(500),
    contact_email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT product_name_not_empty CHECK (length(product_name) > 0)
);

-- Product Services table (specific services within a product)
-- Example: Product "Demo Bank" can have services "Login", "Transfer Money", "View Balance"
CREATE TABLE product_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Service details
    service_name VARCHAR(255) NOT NULL,
    service_description TEXT,
    service_type VARCHAR(100), -- 'authentication', 'transaction', 'authorization', etc.

    -- Service-specific settings
    requires_2fa BOOLEAN DEFAULT FALSE,
    max_attempts INTEGER DEFAULT 3,
    session_timeout_minutes INTEGER DEFAULT 30,

    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT service_name_not_empty CHECK (length(service_name) > 0),
    CONSTRAINT unique_product_service UNIQUE (product_id, service_name)
);

-- User Credentials table
-- Stores user enrollment credentials with product partial keys
-- Each credential represents one user's enrollment for one service
-- IMPORTANT: product_partial_key is generated PER USER when they enroll
-- This makes keys unique per (user_id, service_id) combination
CREATE TABLE user_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User identification (Privy user ID or wallet address)
    user_id VARCHAR(255) NOT NULL,

    -- Product/Service reference
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    service_id UUID REFERENCES product_services(id) ON DELETE SET NULL,

    -- ZTIZEN credential reference
    credential_id UUID NOT NULL UNIQUE,  -- References credentials.credential_id in ZTIZEN DB

    -- Product Partial Key (32 bytes hex-encoded = 64 chars)
    -- This is unique per credential and used in auth_commit generation
    product_partial_key VARCHAR(64) NOT NULL UNIQUE,

    -- Status
    -- pending: Created but not yet enrolled in ZTIZEN
    -- active: Fully enrolled and can be used
    -- revoked: Deactivated/cancelled
    status VARCHAR(20) DEFAULT 'pending',

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT check_status CHECK (status IN ('pending', 'active', 'revoked')),
    CONSTRAINT check_product_key_format CHECK (product_partial_key ~ '^[0-9a-fA-F]{64}$')
);

-- Indexes
CREATE INDEX idx_user_credentials_user ON user_credentials(user_id);
CREATE INDEX idx_user_credentials_product ON user_credentials(product_id);
CREATE INDEX idx_user_credentials_credential ON user_credentials(credential_id);
CREATE INDEX idx_user_credentials_status ON user_credentials(status);
CREATE INDEX idx_user_credentials_user_status ON user_credentials(user_id, status);

-- User sessions (track active authentication sessions)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    service_id UUID REFERENCES product_services(id) ON DELETE SET NULL,

    -- User identification
    user_id VARCHAR(255) NOT NULL,
    credential_id UUID REFERENCES user_credentials(credential_id) ON DELETE SET NULL,

    -- Session details
    session_token VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP NOT NULL,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_product ON user_sessions(product_id);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_credential ON user_sessions(credential_id);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Authentication logs (audit trail)
CREATE TABLE auth_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    service_id UUID REFERENCES product_services(id) ON DELETE SET NULL,

    -- Authentication details
    user_id VARCHAR(255),
    credential_id UUID,
    action VARCHAR(50) NOT NULL, -- 'enroll', 'verify', 'revoke', 'login_success', 'login_failed', etc.
    success BOOLEAN NOT NULL,

    -- Context
    ip_address INET,
    user_agent TEXT,
    error_message TEXT,

    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_auth_logs_product ON auth_logs(product_id);
CREATE INDEX idx_auth_logs_user ON auth_logs(user_id);
CREATE INDEX idx_auth_logs_credential ON auth_logs(credential_id);
CREATE INDEX idx_auth_logs_timestamp ON auth_logs(timestamp);
CREATE INDEX idx_auth_logs_action ON auth_logs(action);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_services_updated_at BEFORE UPDATE ON product_services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_credentials_updated_at BEFORE UPDATE ON user_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper function to generate product partial key
CREATE OR REPLACE FUNCTION generate_product_partial_key()
RETURNS VARCHAR(64) AS $$
DECLARE
    random_bytes BYTEA;
BEGIN
    -- Generate 32 random bytes
    random_bytes := gen_random_bytes(32);
    -- Convert to hex string (64 characters)
    RETURN encode(random_bytes, 'hex');
END;
$$ LANGUAGE plpgsql;

-- Verification Requests table (Product side)
-- Tracks verification requests sent to ZTIZEN
CREATE TABLE IF NOT EXISTS verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Request identifier (keccak256 hash)
    request_id VARCHAR(66) UNIQUE NOT NULL,  -- 0x + 64 hex chars

    -- Product/Service information
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    service_id UUID REFERENCES product_services(id) ON DELETE SET NULL,
    service_name VARCHAR(255) NOT NULL,

    -- User and credential
    user_id VARCHAR(255) NOT NULL,
    credential_id UUID NOT NULL,

    -- Request details
    details JSONB,  -- Additional context (action type, transaction amount, etc.)
    callback_url VARCHAR(500),  -- Where to redirect after verification
    return_url VARCHAR(500),  -- Where user came from

    -- Request lifecycle
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'completed', 'failed', 'expired'
    expires_at TIMESTAMP NOT NULL,

    -- Verification result (populated when completed)
    verified BOOLEAN,
    ztizen_tx_id VARCHAR(64),  -- Links to ZTIZEN's verification_transactions.tx_id
    traditional_match_rate NUMERIC(5,2),
    zk_verified BOOLEAN,
    onchain_tx_hash VARCHAR(66),

    -- Timestamps
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    -- Constraints
    CONSTRAINT check_request_status CHECK (status IN ('pending', 'completed', 'failed', 'expired'))
);

-- Indexes for verification_requests
CREATE INDEX IF NOT EXISTS idx_verification_req_product ON verification_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_verification_req_service ON verification_requests(service_id);
CREATE INDEX IF NOT EXISTS idx_verification_req_user ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_req_credential ON verification_requests(credential_id);
CREATE INDEX IF NOT EXISTS idx_verification_req_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_req_timestamp ON verification_requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_verification_req_created ON verification_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_req_expires ON verification_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_req_user_status ON verification_requests(user_id, status);

-- Comments for verification_requests
COMMENT ON TABLE verification_requests IS 'Product-side verification requests that link to ZTIZEN verification transactions';
COMMENT ON COLUMN verification_requests.request_id IS 'Unique request ID (keccak256 hash) sent to ZTIZEN for tracking';
COMMENT ON COLUMN verification_requests.ztizen_tx_id IS 'Links to ZTIZEN verification_transactions.tx_id after completion';

-- Trigger for verification_requests updated_at
CREATE TRIGGER update_verification_requests_updated_at BEFORE UPDATE ON verification_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing (optional - uncomment to use)
-- INSERT INTO products (product_id, product_name, product_description, api_endpoint, contact_email)
-- VALUES
--     ('demo-bank', 'Demo Bank', 'A demonstration banking application', 'http://localhost:3001', 'contact@demobank.com'),
--     ('demo-store', 'Demo Store', 'A demonstration e-commerce store', 'http://localhost:3002', 'contact@demostore.com');
--
-- INSERT INTO product_services (product_id, service_name, service_description, service_type)
-- SELECT id, 'Login', 'User authentication', 'authentication' FROM products WHERE product_id = 'demo-bank'
-- UNION ALL
-- SELECT id, 'Transfer Money', 'Money transfer service', 'transaction' FROM products WHERE product_id = 'demo-bank'
-- UNION ALL
-- SELECT id, 'View Balance', 'Account balance viewing', 'authorization' FROM products WHERE product_id = 'demo-bank';

-- Query examples:
--
-- Get all credentials for a user:
-- SELECT uc.*, p.product_name, ps.service_name
-- FROM user_credentials uc
-- JOIN products p ON uc.product_id = p.id
-- LEFT JOIN product_services ps ON uc.service_id = ps.id
-- WHERE uc.user_id = '0x41649a1F8B2499e2F7884184D062639CEF9d0601';
--
-- Get product partial key for a credential:
-- SELECT product_partial_key FROM user_credentials WHERE credential_id = 'xxx';
--
-- Create new credential:
-- INSERT INTO user_credentials (user_id, product_id, service_id, credential_id, product_partial_key, status)
-- VALUES ('0x...', 'product-uuid', 'service-uuid', 'ztizen-credential-id', generate_product_partial_key(), 'pending');
