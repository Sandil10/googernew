CREATE TABLE IF NOT EXISTS ad_publish_operations (
    user_id BIGINT NOT NULL, operation_key TEXT NOT NULL,
    request_hash TEXT NOT NULL, ad_id TEXT NOT NULL, response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, operation_key)
);
CREATE TABLE IF NOT EXISTS ad_budget_refunds (
    id BIGSERIAL PRIMARY KEY, ad_id TEXT NOT NULL, user_id BIGINT NOT NULL,
    previous_version TEXT NOT NULL, old_budget NUMERIC(18,2) NOT NULL,
    new_budget NUMERIC(18,2) NOT NULL, amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    transfer_id BIGINT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ad_id, previous_version)
);
CREATE INDEX IF NOT EXISTS ad_budget_refunds_owner_ad_idx ON ad_budget_refunds(user_id, ad_id, id DESC);
CREATE TABLE IF NOT EXISTS ad_funding (
    transfer_id BIGINT PRIMARY KEY, ad_id TEXT NOT NULL, user_id BIGINT NOT NULL,
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ad_funding_ad_idx ON ad_funding(ad_id,user_id);
