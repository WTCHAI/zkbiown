-- Rollback Product Service Schema V2

-- Drop triggers
DROP TRIGGER IF EXISTS update_user_sessions_updated_at ON user_sessions;
DROP TRIGGER IF EXISTS update_user_credentials_updated_at ON user_credentials;
DROP TRIGGER IF EXISTS update_product_services_updated_at ON product_services;
DROP TRIGGER IF EXISTS update_products_updated_at ON products;

-- Drop functions
DROP FUNCTION IF EXISTS generate_product_partial_key();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables (cascade will drop all foreign key constraints)
DROP TABLE IF EXISTS auth_logs CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS user_credentials CASCADE;
DROP TABLE IF EXISTS product_services CASCADE;
DROP TABLE IF EXISTS products CASCADE;
