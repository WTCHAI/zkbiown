-- Add tx_hash column to verification_requests table
-- tx_hash is used for on-chain tracking and matching ZKVerificationCompleted events

ALTER TABLE verification_requests
ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(66);

-- Add index for tx_hash for efficient lookups
CREATE INDEX IF NOT EXISTS idx_verification_req_tx_hash ON verification_requests(tx_hash);

-- Add comment
COMMENT ON COLUMN verification_requests.tx_hash IS 'Transaction hash (keccak256) for on-chain tracking and event matching';