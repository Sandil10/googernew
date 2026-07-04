const pool = require('../../config/database');

let adsTableReady = false;
let adsTableReadyPromise = null;

const PHOTO_VIDEO_CAMPAIGN_SQL = `LOWER(TRIM(COALESCE(campaign_type, ''))) IN ('photo and video', 'photo & video', 'photo promote', 'video promote', 'photo_video_ad', 'photo video')`;
const PRODUCT_PROMOTE_CAMPAIGN_SQL = `LOWER(TRIM(COALESCE(campaign_type, ''))) IN ('product promote', 'product_promote')`;
const PROFILE_PROMOTE_CAMPAIGN_SQL = `LOWER(TRIM(COALESCE(campaign_type, ''))) IN ('profile promote', 'profile_promote')`;

const campaignTypeSqlForReachTier = (adType) => {
    if (adType === 'product_promote_ad') return PRODUCT_PROMOTE_CAMPAIGN_SQL;
    if (adType === 'profile_promote_ad') return PROFILE_PROMOTE_CAMPAIGN_SQL;
    return PHOTO_VIDEO_CAMPAIGN_SQL;
};

const syncAdsReachCaps = async (adId = null) => {
    const { rows: tiers } = await pool.query(`
        SELECT id, ad_type, budget_from, budget_to, max_reach_multiplier
        FROM reach_tiers
        ORDER BY ad_type ASC, budget_from ASC
    `).catch(() => ({ rows: [] }));

    for (const tier of tiers) {
        const adTypeCondition = campaignTypeSqlForReachTier(tier.ad_type);
        const params = [Number(tier.budget_from), Number(tier.budget_to)];
        const adFilter = adId ? ` AND a.ad_id = $${params.push(adId)}` : '';

        if (tier.max_reach_multiplier === null || tier.max_reach_multiplier === undefined || tier.max_reach_multiplier === '') {
            await pool.query(
                `UPDATE ads a
                 SET max_reach_cap = NULL,
                     current_reach = GREATEST(COALESCE(a.current_reach, 0), COALESCE(a.impressions, 0)),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE ${adTypeCondition}
                   AND COALESCE(a.budget, 0) >= $1
                   AND COALESCE(a.budget, 0) <= $2${adFilter}`,
                params
            );
            continue;
        }

        params.push(Number(tier.max_reach_multiplier));
        await pool.query(
            `UPDATE ads a
             SET max_reach_cap = GREATEST(1, ROUND(COALESCE(a.budget, 0)::numeric * $3::numeric))::integer,
                 current_reach = GREATEST(COALESCE(a.current_reach, 0), COALESCE(a.impressions, 0)),
                 updated_at = CURRENT_TIMESTAMP
             WHERE ${adTypeCondition}
               AND COALESCE(a.budget, 0) >= $1
               AND COALESCE(a.budget, 0) <= $2${adFilter}`,
            params
        );
    }

    const completionParams = [];
    const completionFilter = adId ? ` AND ad_id = $${completionParams.push(adId)}` : '';
    await pool.query(
        `UPDATE ads
         SET status = 'Completed',
             completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
             last_resumed_at = NULL,
             paused_at = NULL,
             remaining_budget = CASE
                 WHEN LOWER(COALESCE(campaign_type, '')) IN ('product promote','photo promote','video promote','photo and video','photo & video','profile promote')
                 THEN 0
                 ELSE remaining_budget
             END,
             current_reach = GREATEST(COALESCE(current_reach, 0), COALESCE(impressions, 0)),
             updated_at = CURRENT_TIMESTAMP
         WHERE LOWER(TRIM(REPLACE(REPLACE(COALESCE(status, ''), '_', ' '), '-', ' '))) IN ('active', 'approved')
           AND COALESCE(max_reach_cap, 0) > 0
           AND COALESCE(impressions, 0) >= COALESCE(max_reach_cap, 0)${completionFilter}`,
        completionParams
    );
};

const ensureAdEngagementTables = async () => {
    if (ensureAdEngagementTables._promise) return ensureAdEngagementTables._promise;
    ensureAdEngagementTables._promise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ad_likes (
                id SERIAL PRIMARY KEY,
                ad_id VARCHAR(80) NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ad_id, user_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS ad_coin_collections (
                id SERIAL PRIMARY KEY,
                ad_id VARCHAR(80) NOT NULL,
                ad_type VARCHAR(80) NOT NULL DEFAULT 'Ads',
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
                commission DECIMAL(10, 2) NOT NULL DEFAULT 0.25,
                advertiser_charge DECIMAL(10, 2) NOT NULL DEFAULT 1.25,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ad_id, ad_type, user_id)
            );
        `);

        await pool.query(`
            ALTER TABLE ad_coin_collections
                ADD COLUMN IF NOT EXISTS ad_type VARCHAR(80) NOT NULL DEFAULT 'Ads',
                ADD COLUMN IF NOT EXISTS reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
                ADD COLUMN IF NOT EXISTS commission DECIMAL(10, 2) NOT NULL DEFAULT 0.25,
                ADD COLUMN IF NOT EXISTS advertiser_charge DECIMAL(10, 2) NOT NULL DEFAULT 1.25;
        `);
    })();
    try {
        await ensureAdEngagementTables._promise;
    } finally {
        ensureAdEngagementTables._promise = null;
    }
};

const ensureAdsTable = async () => {
    if (adsTableReady) return;
    if (adsTableReadyPromise) return adsTableReadyPromise;
    adsTableReadyPromise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ads (
                id SERIAL PRIMARY KEY,
                ad_id VARCHAR(20) UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                owner_user_id VARCHAR(20),
                owner_username VARCHAR(50),
                campaign_type VARCHAR(100) NOT NULL,
                title TEXT,
                description TEXT,
                media_preview TEXT,
                media_gallery JSONB DEFAULT '[]'::jsonb,
                media_type VARCHAR(20) DEFAULT '',
                gender_target VARCHAR(20),
                age_min INTEGER,
                age_max INTEGER,
                reach INTEGER DEFAULT 0,
                impressions INTEGER DEFAULT 0,
                clicks INTEGER DEFAULT 0,
                budget DECIMAL(12, 2) DEFAULT 0,
                duration_days INTEGER DEFAULT 0,
                spend DECIMAL(12, 2) DEFAULT 0,
                remaining_budget DECIMAL(12, 2) DEFAULT 0,
                status VARCHAR(30) DEFAULT 'Under Review',
                campaign_path TEXT,
                wallet_transfer_id INTEGER,
                edit_draft JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            ALTER TABLE ads
            ADD COLUMN IF NOT EXISTS media_gallery JSONB DEFAULT '[]'::jsonb;
        `);

        await pool.query(`
            ALTER TABLE ads
            ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS media_url TEXT,
            ADD COLUMN IF NOT EXISTS video_url TEXT,
            ADD COLUMN IF NOT EXISTS share_code VARCHAR(32),
            ADD COLUMN IF NOT EXISTS product_code VARCHAR(32),
            ADD COLUMN IF NOT EXISTS active_link TEXT,
            ADD COLUMN IF NOT EXISTS cta_topic VARCHAR(80),
            ADD COLUMN IF NOT EXISTS cta_value TEXT,
            ADD COLUMN IF NOT EXISTS linked_product_id INTEGER,
            ADD COLUMN IF NOT EXISTS linked_product_share_code VARCHAR(32),
            ADD COLUMN IF NOT EXISTS original_product_id INTEGER,
            ADD COLUMN IF NOT EXISTS original_product_code VARCHAR(32);
        `);

        await pool.query(`
            ALTER TABLE ads
                ADD COLUMN IF NOT EXISTS tier_id INTEGER,
                ADD COLUMN IF NOT EXISTS estimated_reach_min INTEGER,
                ADD COLUMN IF NOT EXISTS estimated_reach_max INTEGER,
                ADD COLUMN IF NOT EXISTS max_reach_cap INTEGER,
                ADD COLUMN IF NOT EXISTS current_reach INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS promo_code VARCHAR(20),
                ADD COLUMN IF NOT EXISTS promo_discount INTEGER;
        `);

        await pool.query(`
            ALTER TABLE ads
                ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
        `);

        await pool.query(`
            ALTER TABLE ads
                ADD COLUMN IF NOT EXISTS active_start_time TIMESTAMP,
                ADD COLUMN IF NOT EXISTS last_resumed_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS accumulated_active_ms BIGINT DEFAULT 0,
                ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
        `);

        await pool.query(`
            UPDATE ads
            SET active_start_time = COALESCE(active_start_time, started_at)
            WHERE active_start_time IS NULL
              AND started_at IS NOT NULL;
        `);

        await pool.query(`
            CREATE OR REPLACE FUNCTION _ads_set_active_start_time()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.status = 'Active' AND (OLD.status IS DISTINCT FROM 'Active') THEN
                    IF NEW.active_start_time IS NULL THEN
                        NEW.active_start_time := NOW();
                    END IF;
                    IF NEW.started_at IS NULL THEN
                        NEW.started_at := NOW();
                    END IF;
                    IF NEW.last_resumed_at IS NULL THEN
                        NEW.last_resumed_at := NOW();
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await pool.query(`
            DO $$ BEGIN
                CREATE TRIGGER ads_auto_active_start_time
                BEFORE UPDATE ON ads
                FOR EACH ROW EXECUTE FUNCTION _ads_set_active_start_time();
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);

        await pool.query(`
            UPDATE ads
            SET status = 'Active',
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'Approved';
        `);

        await pool.query(`
            UPDATE ads
            SET active_start_time = CASE
                    WHEN status = 'Completed' THEN COALESCE(started_at, completed_at, updated_at, created_at)
                    ELSE COALESCE(started_at, updated_at, created_at)
                END,
                started_at = COALESCE(started_at, updated_at, created_at),
                last_resumed_at = CASE
                    WHEN status = 'Active' THEN COALESCE(last_resumed_at, started_at, updated_at, created_at)
                    ELSE last_resumed_at
                END
            WHERE active_start_time IS NULL
              AND status IN ('Active', 'Completed', 'Expired', 'Paused', 'Removed');
        `);

        await pool.query(`
            UPDATE ads
            SET current_reach = GREATEST(COALESCE(current_reach, 0), COALESCE(impressions, 0)),
                reach = GREATEST(COALESCE(reach, 0), COALESCE(impressions, 0)),
                updated_at = CURRENT_TIMESTAMP
            WHERE COALESCE(impressions, 0) > 0
              AND (
                  COALESCE(current_reach, 0) = 0
                  OR COALESCE(reach, 0) = 0
              );
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_ads_user_id ON ads(user_id);
            CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
            CREATE INDEX IF NOT EXISTS idx_ads_created_at ON ads(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_ads_active_public_sort
            ON ads(COALESCE(active_start_time, created_at) DESC)
            WHERE status = 'Active';
            CREATE INDEX IF NOT EXISTS idx_ads_active_public_owner_sort
            ON ads(user_id, COALESCE(active_start_time, created_at) DESC)
            WHERE status IN ('Active', 'Completed', 'Paused', 'Removed');
            CREATE INDEX IF NOT EXISTS idx_ad_coin_collections_ad_user
            ON ad_coin_collections(ad_id, user_id);
        `);

        adsTableReady = true;
    })();
    try {
        await adsTableReadyPromise;
    } finally {
        adsTableReadyPromise = null;
    }
};

module.exports = {
    ensureAdEngagementTables,
    ensureAdsTable,
    syncAdsReachCaps,
};
