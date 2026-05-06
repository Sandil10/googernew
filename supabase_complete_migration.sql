-- =====================================================
-- COMPLETE DATABASE SCHEMA FOR SUPABASE
-- Run this SQL in Supabase SQL Editor
-- =====================================================

-- 1. CREATE USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(6) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    user_type VARCHAR(20) DEFAULT 'user',
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    profile_picture VARCHAR(255) DEFAULT NULL,
    bio TEXT,
    referral_code VARCHAR(50) UNIQUE,
    wallet_balance DECIMAL(15, 2) DEFAULT 1000.00,
    hold_balance DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_referral_code ON users(referral_code);

-- 2. CREATE WALLET TABLE (for referral tracking)
CREATE TABLE IF NOT EXISTS wallet (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_username VARCHAR(50) NOT NULL,
    referral_link_used VARCHAR(100),
    amount DECIMAL(10, 2) DEFAULT 10.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(referrer_id, referred_user_id)
);

-- Create indexes for wallet table
CREATE INDEX IF NOT EXISTS idx_wallet_referrer ON wallet(referrer_id);
CREATE INDEX IF NOT EXISTS idx_wallet_referred ON wallet(referred_user_id);

-- 3. CREATE WALLET_TRANSFERS TABLE (for direct transfers and money requests)
CREATE TABLE IF NOT EXISTS wallet_transfers (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    type VARCHAR(20) DEFAULT 'transfer',
    note TEXT,
    commission DECIMAL(15, 2) DEFAULT 0.00,
    commission_percentage DECIMAL(5, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for wallet_transfers table
CREATE INDEX IF NOT EXISTS idx_transfers_sender ON wallet_transfers(sender_id);
CREATE INDEX IF NOT EXISTS idx_transfers_receiver ON wallet_transfers(receiver_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON wallet_transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_type ON wallet_transfers(type);

-- =====================================================
-- ADD MISSING COLUMNS TO EXISTING TABLES (if tables already exist)
-- =====================================================

-- Add wallet_balance to users if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'wallet_balance'
    ) THEN
        ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(15, 2) DEFAULT 1000.00;
    END IF;
END $$;

-- Add user_type to users if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'user_type'
    ) THEN
        ALTER TABLE users ADD COLUMN user_type VARCHAR(20) DEFAULT 'user';
    END IF;
END $$;

-- Add referral_code to users if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'referral_code'
    ) THEN
        ALTER TABLE users ADD COLUMN referral_code VARCHAR(50) UNIQUE;
    END IF;
END $$;

-- Add bio to users if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'bio'
    ) THEN
        ALTER TABLE users ADD COLUMN bio TEXT;
    END IF;
END $$;

-- Add profile_picture to users if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_picture'
    ) THEN
        ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL;
    END IF;
END $$;

-- Add hold_balance to users if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'hold_balance'
    ) THEN
        ALTER TABLE users ADD COLUMN hold_balance DECIMAL(15, 2) DEFAULT 0.00;
    END IF;
END $$;

-- Add commission to wallet_transfers if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'wallet_transfers' AND COLUMN_NAME = 'commission'
    ) THEN
        ALTER TABLE wallet_transfers ADD COLUMN commission DECIMAL(15, 2) DEFAULT 0.00;
    END IF;
END $$;

-- Add commission_percentage to wallet_transfers if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'wallet_transfers' AND COLUMN_NAME = 'commission_percentage'
    ) THEN
        ALTER TABLE wallet_transfers ADD COLUMN commission_percentage DECIMAL(5, 2) DEFAULT 0.00;
    END IF;
END $$;

-- Add referred_username to wallet if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'wallet' AND COLUMN_NAME = 'referred_username'
    ) THEN
        ALTER TABLE wallet ADD COLUMN referred_username VARCHAR(50);
    END IF;
END $$;

-- Add referral_link_used to wallet if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'wallet' AND COLUMN_NAME = 'referral_link_used'
    ) THEN
        ALTER TABLE wallet ADD COLUMN referral_link_used VARCHAR(100);
    END IF;
END $$;

-- =====================================================
-- VERIFICATION QUERY
-- Run this to verify all tables and columns exist
-- =====================================================

-- Check users table structure
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Check wallet table structure
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'wallet' 
ORDER BY ordinal_position;

-- Check wallet_transfers table structure
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'wallet_transfers' 
ORDER BY ordinal_position;
