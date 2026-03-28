-- =====================================================
-- COMPLETE GOOGER DATABASE SCHEMA FOR SUPABASE
-- Generated: 2026-03-28T08:13:25.286Z
-- =====================================================

-- Enable necessary extensions
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: market
CREATE TABLE IF NOT EXISTS market (
    id SERIAL NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    category VARCHAR(50) NOT NULL,
    image_url TEXT,
    status VARCHAR(20) DEFAULT 'reviewing',
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    variants JSONB DEFAULT '[]',
    shipping_info JSONB DEFAULT '{}',
    payment_methods JSONB DEFAULT '[]',
    warranty_info JSONB DEFAULT '{}',
    return_policy JSONB DEFAULT '{}',
    delivery_info JSONB DEFAULT '{}',
    commission_info JSONB DEFAULT '{}',
    username VARCHAR(100),
    seller_id VARCHAR(10),
    owner_user_id VARCHAR(20),
    payment_data JSONB DEFAULT '[]',
    shipping_data JSONB DEFAULT '{}',
    commission_data JSONB DEFAULT '{}',
    delivery_data JSONB DEFAULT '{}',
    return_data JSONB DEFAULT '{}',
    variants_data JSONB DEFAULT '[]',
    warranty_data JSONB DEFAULT '{}',
    links_data JSONB DEFAULT '[]',
    order_status TEXT DEFAULT 'all',
    promo_price DECIMAL(12, 2),
    sub_category VARCHAR(100),
    level3_category VARCHAR(100),
    manual_category VARCHAR(100),
    stock INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_market_owner ON market(owner_user_id);

-- Table: market_comments
CREATE TABLE IF NOT EXISTS market_comments (
    id SERIAL NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    market_id INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: market_likes
CREATE TABLE IF NOT EXISTS market_likes (
    user_id INTEGER NOT NULL,
    market_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: market_shares
CREATE TABLE IF NOT EXISTS market_shares (
    id SERIAL NOT NULL PRIMARY KEY,
    market_id INTEGER,
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: market_views
CREATE TABLE IF NOT EXISTS market_views (
    id SERIAL NOT NULL PRIMARY KEY,
    market_id INTEGER,
    user_id INTEGER,
    last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL NOT NULL PRIMARY KEY,
    item_id INTEGER,
    buyer_id INTEGER,
    seller_id INTEGER,
    status TEXT DEFAULT 'processing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL NOT NULL PRIMARY KEY,
    user_id VARCHAR(6) NOT NULL,
    username VARCHAR(50) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    user_type VARCHAR(20) DEFAULT 'user',
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    profile_picture VARCHAR(255) DEFAULT NULL,
    bio TEXT,
    referral_code VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    wallet_balance DECIMAL(15, 2) DEFAULT 1000.00,
    status VARCHAR(20) DEFAULT 'Active',
    marked_for_deletion_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Table: wallet
CREATE TABLE IF NOT EXISTS wallet (
    id SERIAL NOT NULL PRIMARY KEY,
    referrer_id INTEGER NOT NULL,
    referred_user_id INTEGER NOT NULL,
    referred_username VARCHAR(50) NOT NULL,
    referral_link_used VARCHAR(100),
    amount DECIMAL(10, 2) DEFAULT 10.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: wallet_transfers
CREATE TABLE IF NOT EXISTS wallet_transfers (
    id SERIAL NOT NULL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    type VARCHAR(20) DEFAULT 'transfer',
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    commission DECIMAL(15, 2) DEFAULT 0,
    commission_percentage DECIMAL(15, 2) DEFAULT 0
);

