-- Safe hardening migration for production.
-- This file is intentionally additive: it creates missing indexes/constraints
-- without changing feature behavior or deleting existing data.

CREATE INDEX IF NOT EXISTS idx_wallet_transfers_sender_created
    ON wallet_transfers(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transfers_receiver_created
    ON wallet_transfers(receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transfers_status_type
    ON wallet_transfers(status, type);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_status_created
    ON orders(buyer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_seller_status_created
    ON orders(seller_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_order_number
    ON orders(order_number);

CREATE INDEX IF NOT EXISTS idx_orders_wallet_transfer_id
    ON orders(wallet_transfer_id)
    WHERE wallet_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_seller_commission_transfer_id
    ON orders(seller_commission_transfer_id)
    WHERE seller_commission_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_seller_discount_transfer_id
    ON orders(seller_discount_transfer_id)
    WHERE seller_discount_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_status_created
    ON market(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_user_status
    ON market(user_id, status);

CREATE INDEX IF NOT EXISTS idx_market_likes_market_user
    ON market_likes(market_id, user_id);

CREATE INDEX IF NOT EXISTS idx_ad_likes_ad_user
    ON ad_likes(ad_id, user_id);

CREATE INDEX IF NOT EXISTS idx_ad_coin_collections_ad_type_user
    ON ad_coin_collections(ad_id, ad_type, user_id);

CREATE INDEX IF NOT EXISTS idx_ads_status_created
    ON ads(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ads_linked_product_id
    ON ads(linked_product_id)
    WHERE linked_product_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transfers_amount_nonnegative'
    ) THEN
        ALTER TABLE wallet_transfers
            ADD CONSTRAINT wallet_transfers_amount_nonnegative
            CHECK (amount >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_wallet_balance_nonnegative'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_wallet_balance_nonnegative
            CHECK (COALESCE(wallet_balance, 0) >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_hold_balance_nonnegative'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_hold_balance_nonnegative
            CHECK (COALESCE(hold_balance, 0) >= 0);
    END IF;
END $$;
