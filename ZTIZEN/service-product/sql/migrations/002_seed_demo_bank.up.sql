-- Seed Data for Product Service
-- Demo Bank product with services

-- Check if Demo Bank already exists, if not insert it
-- Using fixed UUID for demo-bank for consistency across environments
INSERT INTO products (
    id,
    product_id,
    product_name,
    product_description,
    api_endpoint,
    contact_email,
    is_active
)
VALUES (
    'b8a7c5d9-4e2f-4a1b-9c3d-6f8e7a5b4c2d'::uuid,  -- Fixed UUID for demo-bank
    'demo-bank',                                      -- Human-readable identifier
    'Demo Bank',
    'Biometric banking demonstration with ZTIZEN',
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

-- Display created product and services
SELECT
    p.product_name,
    ps.service_name,
    ps.service_type
FROM products p
LEFT JOIN product_services ps ON p.id = ps.product_id
WHERE p.product_id = 'demo-bank'
ORDER BY ps.service_name;
