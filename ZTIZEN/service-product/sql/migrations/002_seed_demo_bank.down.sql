-- Rollback Demo Bank seed data

-- Delete Demo Bank services (will cascade to user_credentials)
DELETE FROM product_services
WHERE product_id = 'b8a7c5d9-4e2f-4a1b-9c3d-6f8e7a5b4c2d'::uuid;

-- Delete Demo Bank product
DELETE FROM products
WHERE product_id = 'demo-bank';

-- Note: We don't drop pgcrypto extension as other migrations might depend on it
