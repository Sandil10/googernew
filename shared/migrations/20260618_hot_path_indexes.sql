-- Hot-path indexes for higher concurrency.
-- Focused on wallet transaction reads, active subscription lookups,
-- and referral graph/payout reporting used by admin and finance flows.

DO $$
BEGIN
    IF to_regclass('public.wallet_transfers') IS NOT NULL THEN
        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_wallet_transfers_sender_status_created
            ON public.wallet_transfers(sender_id, status, created_at DESC)
        ';

        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_wallet_transfers_receiver_status_created
            ON public.wallet_transfers(receiver_id, status, created_at DESC)
        ';

        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_wallet_transfers_type_status_created
            ON public.wallet_transfers(type, status, created_at DESC)
        ';

        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_wallet_transfers_order_hold_pending_lookup
            ON public.wallet_transfers(sender_id, receiver_id, id DESC)
            WHERE type = ''order_hold'' AND status = ''pending''
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.user_plan_subscriptions') IS NOT NULL THEN
        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_user_plan_subscriptions_active_user_started
            ON public.user_plan_subscriptions(user_id, started_at DESC)
            WHERE status = ''active''
        ';

        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_user_plan_subscriptions_active_expires
            ON public.user_plan_subscriptions(expires_at ASC, user_id)
            WHERE status = ''active'' AND expires_at IS NOT NULL
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.referral_commission_payouts') IS NOT NULL THEN
        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_referral_commission_payouts_earner_created
            ON public.referral_commission_payouts(earner_id, created_at DESC)
        ';

        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_referral_commission_payouts_level_earner
            ON public.referral_commission_payouts(level, earner_id)
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.referral_relationships') IS NOT NULL THEN
        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_referral_relationships_referred_by
            ON public.referral_relationships(referred_by)
        ';
    END IF;
END $$;
