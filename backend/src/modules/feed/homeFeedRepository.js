const pool = require('../../config/database');

let feedAdEngagementReady = false;
let feedAdEngagementPromise = null;

const ensureFeedAdEngagementSchema = async () => {
    if (feedAdEngagementReady) return;
    if (feedAdEngagementPromise) return feedAdEngagementPromise;

    feedAdEngagementPromise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ad_likes (
                id SERIAL PRIMARY KEY,
                ad_id VARCHAR(20) NOT NULL REFERENCES ads(ad_id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ad_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS ad_like_coin_rewards (
                id SERIAL PRIMARY KEY,
                ad_id VARCHAR(20) NOT NULL REFERENCES ads(ad_id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                ad_owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(12, 2) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ad_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS ad_views (
                id SERIAL PRIMARY KEY,
                ad_id VARCHAR(80) NOT NULL REFERENCES ads(ad_id) ON DELETE CASCADE,
                user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                viewer_key TEXT,
                ip_address TEXT,
                view_count INTEGER NOT NULL DEFAULT 1,
                last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            ALTER TABLE ads
            ADD COLUMN IF NOT EXISTS linked_product_id INTEGER,
            ADD COLUMN IF NOT EXISTS linked_product_share_code VARCHAR(32),
            ADD COLUMN IF NOT EXISTS current_reach INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS max_reach_cap INTEGER,
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_goog_posts_active_created_at
            ON goog_posts(created_at DESC)
            WHERE COALESCE(is_active, true) = true;

            CREATE INDEX IF NOT EXISTS idx_ads_feed_active_sort
            ON ads(COALESCE(active_start_time, created_at) DESC)
            WHERE status = 'Active';

            CREATE INDEX IF NOT EXISTS idx_ads_feed_active_user_sort
            ON ads(user_id, COALESCE(active_start_time, created_at) DESC)
            WHERE status = 'Active';

            CREATE INDEX IF NOT EXISTS idx_ad_likes_ad_user
            ON ad_likes(ad_id, user_id);

            CREATE INDEX IF NOT EXISTS idx_ad_like_coin_rewards_ad_user
            ON ad_like_coin_rewards(ad_id, user_id);
        `);
        feedAdEngagementReady = true;
    })();

    try {
        await feedAdEngagementPromise;
    } finally {
        feedAdEngagementPromise = null;
    }
};

const fetchHomeFeedPosts = async ({ userId, isAnonymousRequest, limit, offset }) => {
    const postsQuery = isAnonymousRequest
        ? `SELECT gp.id, gp.user_id, gp.text, gp.text_color, gp.likes_count, gp.comments_count,
                gp.views_count, gp.shares_count, gp.created_at, gp.updated_at, gp.share_code,
                u.username, u.full_name, u.user_type, u.profile_picture,
                FALSE AS user_liked
         FROM goog_posts gp
         JOIN users u ON u.id = gp.user_id
         WHERE COALESCE(gp.is_active, true) = true
           AND COALESCE(u.is_deactivated, false) = false
           AND COALESCE(u.status, 'Active') <> 'Deactivated'
         ORDER BY gp.created_at DESC
         LIMIT $1 OFFSET $2`
        : `SELECT gp.id, gp.user_id, gp.text, gp.text_color, gp.likes_count, gp.comments_count,
                gp.views_count, gp.shares_count, gp.created_at, gp.updated_at, gp.share_code,
                u.username, u.full_name, u.user_type, u.profile_picture,
                EXISTS (
                    SELECT 1 FROM goog_likes gl
                    WHERE gl.goog_id = gp.id AND gl.user_id = $1
                ) AS user_liked
         FROM goog_posts gp
         JOIN users u ON u.id = gp.user_id
         WHERE COALESCE(gp.is_active, true) = true
           AND COALESCE(u.is_deactivated, false) = false
           AND COALESCE(u.status, 'Active') <> 'Deactivated'
         ORDER BY gp.created_at DESC
         LIMIT $2 OFFSET $3`;

    const postsParams = isAnonymousRequest ? [limit + 1, offset] : [userId, limit + 1, offset];
    return pool.query(postsQuery, postsParams);
};

const fetchHomeFeedAds = async ({ userId, isAnonymousRequest, adFetchLimit }) => {
    const adsQuery = isAnonymousRequest
        ? `SELECT a.ad_id, a.user_id, a.owner_user_id, a.owner_username, a.campaign_type,
                a.title, a.description, a.media_preview, a.media_gallery, a.media_type, a.media_url, a.video_url, a.share_code, a.product_code,
                a.edit_draft, a.gender_target, a.age_min, a.age_max,
                a.impressions, a.clicks, a.current_reach, a.max_reach_cap,
                a.likes_count, a.comments_count, a.shares_count,
                a.budget, a.remaining_budget, a.duration_days, a.status, a.started_at, a.active_start_time, a.created_at,
                a.linked_product_id, a.linked_product_share_code,
                u.username AS owner_username_joined, u.profile_picture,
                FALSE AS user_liked,
                FALSE AS ad_coin_collected
         FROM ads a
         JOIN users u ON u.id = a.user_id
         WHERE a.status = 'Active'
           AND COALESCE(u.is_deactivated, false) = false
           AND COALESCE(u.status, 'Active') <> 'Deactivated'
           AND (a.max_reach_cap IS NULL OR COALESCE(a.impressions, 0) < a.max_reach_cap)
         ORDER BY COALESCE(a.active_start_time, a.created_at) DESC
         LIMIT $1`
        : `SELECT a.ad_id, a.user_id, a.owner_user_id, a.owner_username, a.campaign_type,
                a.title, a.description, a.media_preview, a.media_gallery, a.media_type, a.media_url, a.video_url, a.share_code, a.product_code,
                a.edit_draft, a.gender_target, a.age_min, a.age_max,
                a.impressions, a.clicks, a.current_reach, a.max_reach_cap,
                a.likes_count, a.comments_count, a.shares_count,
                a.budget, a.remaining_budget, a.duration_days, a.status, a.started_at, a.active_start_time, a.created_at,
                a.linked_product_id, a.linked_product_share_code,
                u.username AS owner_username_joined, u.profile_picture,
                EXISTS(SELECT 1 FROM ad_likes al WHERE al.ad_id = a.ad_id AND al.user_id = $1) AS user_liked,
                EXISTS(SELECT 1 FROM ad_like_coin_rewards acr WHERE acr.ad_id = a.ad_id AND acr.user_id = $1) AS ad_coin_collected
         FROM ads a
         JOIN users u ON u.id = a.user_id
         WHERE a.status = 'Active'
           AND COALESCE(u.is_deactivated, false) = false
           AND COALESCE(u.status, 'Active') <> 'Deactivated'
           AND (a.max_reach_cap IS NULL OR COALESCE(a.impressions, 0) < a.max_reach_cap)
         ORDER BY COALESCE(a.active_start_time, a.created_at) DESC
         LIMIT $2`;

    const adsParams = isAnonymousRequest ? [adFetchLimit] : [userId, adFetchLimit];
    return pool.query(adsQuery, adsParams);
};

const fetchLinkedProducts = async ({ linkedIds, linkedCodes }) => {
    return pool.query(
        `SELECT m.id, m.user_id, m.title, m.description, m.price, m.promo_price, m.stock,
                m.image_url, m.variants, m.shipping_info, m.product_code,
                u.username AS owner_username, u.profile_picture
         FROM market m
         INNER JOIN users u ON u.id = m.user_id
         WHERE (m.id = ANY($1::int[]) OR m.product_code = ANY($2::text[]))
           AND m.status IN ('approved', 'active')
           AND COALESCE(u.is_deactivated, false) = false
           AND COALESCE(u.status, 'Active') <> 'Deactivated'`,
        [linkedIds.length ? linkedIds : [0], linkedCodes.length ? linkedCodes : ['']]
    );
};

module.exports = {
    db: pool,
    ensureFeedAdEngagementSchema,
    fetchHomeFeedAds,
    fetchHomeFeedPosts,
    fetchLinkedProducts,
};
