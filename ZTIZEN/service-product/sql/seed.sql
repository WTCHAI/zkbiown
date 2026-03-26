-- Seed Data for Product Service
-- Demo Bank product with services

-- Check if Demo Bank already exists, if not insert it
-- Using fixed UUID for demo-bank for consistency across environments
INSERT INTO products (
    id,
    product_id,
    product_name,
    product_description,
    product_partial_key,
    api_endpoint,
    contact_email,
    is_active
)
VALUES (
    'b8a7c5d9-4e2f-4a1b-9c3d-6f8e7a5b4c2d'::uuid,  -- Fixed UUID for demo-bank
    'demo-bank',                                      -- Human-readable identifier
    'Demo Bank',
    'Biometric banking demonstration with ZTIZEN',
    'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',  -- Demo partial key (64 hex chars)
    'http://localhost:3001',
    'demo@demobank.local',
    true
)
ON CONFLICT (product_id) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    product_description = EXCLUDED.product_description,
    updated_at = NOW();

-- Insert services for Demo Bank
-- Note: Service keys (product_partial_key) are generated PER USER during enrollment
-- in the user_credentials table, not here at service definition time
INSERT INTO product_services (product_id, service_name, service_description, service_type, is_active)
VALUES
    ('b8a7c5d9-4e2f-4a1b-9c3d-6f8e7a5b4c2d'::uuid, 'Login', 'User authentication', 'authentication', true),
    ('b8a7c5d9-4e2f-4a1b-9c3d-6f8e7a5b4c2d'::uuid, 'Transfer', 'Transfer money', 'authorization', true),
    ('b8a7c5d9-4e2f-4a1b-9c3d-6f8e7a5b4c2d'::uuid, 'Balance', 'View account balance', 'authentication', true)
ON CONFLICT (product_id, service_name) DO NOTHING;

-- Display created product
SELECT
    p.id,
    p.product_id,
    p.product_name,
    COUNT(ps.id) as service_count
FROM products p
LEFT JOIN product_services ps ON p.id = ps.product_id
WHERE p.product_id = 'demo-bank'
GROUP BY p.id, p.product_id, p.product_name;
