-- Migration: Expand algorithm column to support longer algorithm names
-- Date: 2026-01-15
-- Author: System

-- Expand template_type column from VARCHAR(20) to VARCHAR(50)
-- This allows storing longer algorithm names like:
-- - gaussian-zero-leakage-hybrid (28 chars)
-- - quantization-zero-leakage (24 chars)
-- - gaussian-projection-line (23 chars)

ALTER TABLE credentials 
ALTER COLUMN template_type TYPE VARCHAR(50);

-- Update comment to reflect new algorithms
COMMENT ON COLUMN credentials.template_type IS 'Biometric template algorithm: gaussian-basic, gaussian-sparse, gaussian-zero-leakage, gaussian-projection-line, quantization-threshold, quantization-kmeans, quantization-zero-leakage, gaussian-zero-leakage-hybrid';
