-- Migration: Add users table for social login (LINE, Telegram, etc.)
-- Run with: psql -d ztizen_product -f sql/migrations/001_add_users_table.sql

-- Users table (for social login providers like LINE)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Social login identifiers
    line_id VARCHAR(255) UNIQUE,         -- LINE user ID
    telegram_id VARCHAR(255) UNIQUE,      -- Telegram user ID (future)

    -- Required user info
    email VARCHAR(255),                   -- Email (required for first login)

    -- Optional profile
    display_name VARCHAR(255),
    avatar_url VARCHAR(500),

    -- Status
    email_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_line_id ON users(line_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add user_id foreign key to user_credentials if not exists
-- This links LINE users to their ZTIZEN credentials
ALTER TABLE user_credentials
    ADD COLUMN IF NOT EXISTS social_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_credentials_social_user_id ON user_credentials(social_user_id);

COMMENT ON TABLE users IS 'Users authenticated via social login (LINE, Telegram, etc.)';
COMMENT ON COLUMN users.line_id IS 'LINE user ID from LINE OAuth';
COMMENT ON COLUMN users.email IS 'Email address - required for first-time login';
COMMENT ON COLUMN users.social_user_id IS 'Link to social login user record (optional)';
