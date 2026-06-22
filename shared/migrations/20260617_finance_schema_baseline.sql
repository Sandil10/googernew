-- Finance schema baseline
-- Moves finance-critical runtime DDL into an explicit migration.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS hold_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS withdrawal_settings (
    id SERIAL PRIMARY KEY,
    min_amount NUMERIC(12,2) NOT NULL DEFAULT 50,
    max_amount NUMERIC(12,2) NOT NULL DEFAULT 10000,
    coin_rate NUMERIC(10,6) NOT NULL DEFAULT 0.0056,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE withdrawal_settings
    ADD COLUMN IF NOT EXISTS coin_rate NUMERIC(10,6) NOT NULL DEFAULT 0.0056;

INSERT INTO withdrawal_settings (min_amount, max_amount, coin_rate)
SELECT 50, 10000, 0.0056
WHERE NOT EXISTS (SELECT 1 FROM withdrawal_settings);

CREATE TABLE IF NOT EXISTS withdrawal_payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(60) NOT NULL DEFAULT 'cash-outline',
    fields JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topup_payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(60) NOT NULL DEFAULT 'cash-outline',
    fields JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    category VARCHAR(50) NOT NULL DEFAULT 'Other',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE topup_payment_methods
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'Other';

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_method_id INTEGER REFERENCES withdrawal_payment_methods(id) ON DELETE SET NULL,
    payment_method_name VARCHAR(100),
    amount NUMERIC(12,2) NOT NULL,
    payment_details JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    rejection_reason TEXT,
    wallet_transfer_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE withdrawal_requests
    ADD COLUMN IF NOT EXISTS wallet_transfer_id INTEGER;

CREATE TABLE IF NOT EXISTS coin_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_method_id INTEGER REFERENCES topup_payment_methods(id) ON DELETE SET NULL,
    payment_method_name VARCHAR(100),
    method_category TEXT,
    method_name TEXT,
    bank_name TEXT,
    amount NUMERIC(12,2) NOT NULL,
    payment_details JSONB NOT NULL DEFAULT '{}',
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE coin_requests
    ADD COLUMN IF NOT EXISTS payment_method_id INTEGER REFERENCES topup_payment_methods(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_method_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS method_category TEXT,
    ADD COLUMN IF NOT EXISTS method_name TEXT,
    ADD COLUMN IF NOT EXISTS bank_name TEXT,
    ADD COLUMN IF NOT EXISTS payment_details JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS finance_idempotency_keys (
    id SERIAL PRIMARY KEY,
    scope VARCHAR(120) NOT NULL,
    idempotency_key VARCHAR(200) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing',
    created_by_user_id INTEGER,
    target_user_id INTEGER,
    amount NUMERIC(12,2),
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_status_created
    ON withdrawal_requests(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status_created
    ON withdrawal_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coin_requests_user_status_created
    ON coin_requests(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coin_requests_status_created
    ON coin_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_idempotency_created
    ON finance_idempotency_keys(created_at DESC);
