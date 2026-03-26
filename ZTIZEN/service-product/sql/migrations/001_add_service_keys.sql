-- Migration: Add service-specific partial keys
-- Date: 2025-12-01
-- Purpose: Each service gets its own unique partial key for template generation
--
-- This enables:
-- - Service-level key rotation (revoke Login without affecting Transfer)
-- - Better isolation (Login key ≠ Transfer key)
-- - Granular revocability (1 user : 1 key : 1 service)

-- Enable pgcrypto extension for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add service_partial_key column to product_services
ALTER TABLE product_services
ADD COLUMN IF NOT EXISTS service_partial_key VARCHAR(64) UNIQUE;

-- Add constraint to ensure valid hex format (drop if exists, then add)
DO $$
BEGIN
    ALTER TABLE product_services DROP CONSTRAINT IF EXISTS check_service_key_format;
    ALTER TABLE product_services ADD CONSTRAINT check_service_key_format CHECK (service_partial_key ~ '^[0-9a-fA-F]{64}$');
END $$;

-- Generate keys for existing services
UPDATE product_services
SET service_partial_key = encode(gen_random_bytes(32), 'hex')
WHERE service_partial_key IS NULL;

-- Make service_partial_key NOT NULL after populating
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product_services'
        AND column_name = 'service_partial_key'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE product_services ALTER COLUMN service_partial_key SET NOT NULL;
    END IF;
END $$;

-- Create index for faster key lookups
CREATE INDEX IF NOT EXISTS idx_product_services_key ON product_services(service_partial_key);

-- Comments
COMMENT ON COLUMN product_services.service_partial_key IS 'Service-specific partial key (32 bytes hex) used in template generation. Each service has unique key for isolation and revocability.';
