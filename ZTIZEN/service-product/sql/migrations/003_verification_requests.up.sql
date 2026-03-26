-- Verification Request Tracking (Product Side)
-- Tracks verification requests created by product services
-- Links to ZTIZEN verification transactions via request_id

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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_req_product ON verification_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_verification_req_service ON verification_requests(service_id);
CREATE INDEX IF NOT EXISTS idx_verification_req_user ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_req_credential ON verification_requests(credential_id);
CREATE INDEX IF NOT EXISTS idx_verification_req_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_req_timestamp ON verification_requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_verification_req_created ON verification_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_req_expires ON verification_requests(expires_at);

-- Composite index for querying user's requests
CREATE INDEX IF NOT EXISTS idx_verification_req_user_status ON verification_requests(user_id, status);

-- Comments
COMMENT ON TABLE verification_requests IS 'Product-side verification requests that link to ZTIZEN verification transactions';
COMMENT ON COLUMN verification_requests.request_id IS 'Unique request ID (keccak256 hash) sent to ZTIZEN for tracking';
COMMENT ON COLUMN verification_requests.ztizen_tx_id IS 'Links to ZTIZEN verification_transactions.tx_id after completion';
COMMENT ON COLUMN verification_requests.status IS 'Request lifecycle: pending → completed/failed/expired';
COMMENT ON COLUMN verification_requests.details IS 'Additional context like action type, transaction amount, etc.';

-- Trigger for updated_at
CREATE TRIGGER update_verification_requests_updated_at
BEFORE UPDATE ON verification_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
