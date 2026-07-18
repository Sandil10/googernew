const pool = require('../../config/database');
const adsRuntimeRepository = require('./adsRuntimeRepository');
const { calculateAdDurationState, syncExpiredAds } = require('../../utils/adDelivery');
const { getGraceDurationSeconds } = require('../../utils/subscriptionRenewal');
const { buildManagedMediaSqlPredicate, classifyAdMediaSource } = require('../media');

let adSavesTableReady = false;
let adSavesSchemaPromise = null;

const getGraceIntervalSql = () => `((${getGraceDurationSeconds()}::text || ' seconds')::interval)`;

const ensureAdSavesSchema = async () => {
    if (adSavesTableReady) return;
    if (adSavesSchemaPromise) return adSavesSchemaPromise;
    adSavesSchemaPromise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ad_saves (
                id              SERIAL PRIMARY KEY,
                user_id         INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                ad_id           VARCHAR(20) NOT NULL,
                ad_media_type   VARCHAR(10) NOT NULL,
                ad_source_type  VARCHAR(10) NOT NULL,
                created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, ad_id)
            );
        `);
        await pool.query(`
            ALTER TABLE ad_saves
                ADD COLUMN IF NOT EXISTS ad_media_type VARCHAR(10),
                ADD COLUMN IF NOT EXISTS ad_source_type VARCHAR(10),
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            ALTER TABLE ad_saves
                ALTER COLUMN ad_id TYPE VARCHAR(80),
                ALTER COLUMN ad_media_type SET DEFAULT 'photo',
                ALTER COLUMN ad_source_type SET DEFAULT 'upload';
            UPDATE ad_saves
               SET ad_media_type = COALESCE(ad_media_type, 'photo'),
                   ad_source_type = COALESCE(ad_source_type, 'upload')
             WHERE ad_media_type IS NULL OR ad_source_type IS NULL;
            ALTER TABLE ad_saves
                ALTER COLUMN ad_media_type SET NOT NULL,
                ALTER COLUMN ad_source_type SET NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_ad_saves_user ON ad_saves(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_ad_saves_count ON ad_saves(user_id, ad_media_type, ad_source_type);
        `);
        adSavesTableReady = true;
    })();
    try {
        await adSavesSchemaPromise;
    } finally {
        adSavesSchemaPromise = null;
    }
};

const classifyAdForSave = (row) => {
    const mediaPreview = String(row.media_preview || '').trim();
    const activeLink = String(row.active_link || (row.edit_draft && (row.edit_draft.activeLink || row.edit_draft.active_link)) || '').trim();
    return classifyAdMediaSource({
        activeLink,
        mediaPreview,
        mediaType: row.media_type,
    });
};

const RAW_PHOTO_VIDEO_UPLOAD_SQL = `
    LOWER(COALESCE(a.campaign_type, '')) IN ('photo and video', 'photo & video')
    AND COALESCE(NULLIF(TRIM(a.media_preview), ''), NULLIF(TRIM(a.media_type), '')) IS NOT NULL
    AND COALESCE(NULLIF(TRIM(a.active_link), ''), NULLIF(TRIM(a.edit_draft->>'activeLink'), ''), NULLIF(TRIM(a.edit_draft->>'active_link'), '')) IS NULL
    AND (
        COALESCE(a.media_preview, '') = ''
        OR ${buildManagedMediaSqlPredicate('a.media_preview')}
    )
`;

const getRawPhotoVideoProfileExpiryIntervalSql = () => `COALESCE(
    (
        SELECT
            CASE
                WHEN NULLIF(sp.extra->>'ads_expiry_value', '')::numeric > 0 THEN
                    NULLIF(sp.extra->>'ads_expiry_value', '')::numeric *
                    CASE LOWER(COALESCE(sp.extra->>'ads_expiry_unit', 'days'))
                        WHEN 'minutes' THEN INTERVAL '1 minute'
                        WHEN 'hours' THEN INTERVAL '1 hour'
                        ELSE INTERVAL '1 day'
                    END
                WHEN NULLIF(sp.extra->>'ads_expiry_days', '')::numeric > 0 THEN
                    NULLIF(sp.extra->>'ads_expiry_days', '')::numeric * INTERVAL '1 day'
                ELSE NULL
            END
        FROM user_plan_subscriptions ups
        JOIN subscription_plans sp ON sp.id = ups.plan_id
        WHERE ups.user_id = a.user_id
          AND ups.status = 'active'
          AND (ups.expires_at IS NULL OR ups.expires_at + ${getGraceIntervalSql()} > NOW())
        ORDER BY ups.started_at DESC
        LIMIT 1
    ),
    (
        SELECT
            CASE
                WHEN NULLIF(sp.extra->>'ads_expiry_value', '')::numeric > 0 THEN
                    NULLIF(sp.extra->>'ads_expiry_value', '')::numeric *
                    CASE LOWER(COALESCE(sp.extra->>'ads_expiry_unit', 'days'))
                        WHEN 'minutes' THEN INTERVAL '1 minute'
                        WHEN 'hours' THEN INTERVAL '1 hour'
                        ELSE INTERVAL '1 day'
                    END
                WHEN NULLIF(sp.extra->>'ads_expiry_days', '')::numeric > 0 THEN
                    NULLIF(sp.extra->>'ads_expiry_days', '')::numeric * INTERVAL '1 day'
                ELSE NULL
            END
        FROM subscription_plans sp
        WHERE sp.slug = 'basic' AND sp.is_active = TRUE
        LIMIT 1
    ),
    CASE
        WHEN COALESCE(a.duration_days, 0) > 0 THEN COALESCE(a.duration_days, 0) * INTERVAL '1 day'
        ELSE NULL
    END
)`;

const RAW_PHOTO_VIDEO_PROFILE_NOT_EXPIRED_SQL = `
    a.active_start_time IS NOT NULL
    AND (${getRawPhotoVideoProfileExpiryIntervalSql()}) IS NOT NULL
    AND a.active_start_time > NOW() - (${getRawPhotoVideoProfileExpiryIntervalSql()})
`;

const stripDataUrl = (value) => {
    const text = String(value || '').trim();
    return text.startsWith('data:') ? '' : text;
};

const toUtcIso = (value) => {
    if (!value) return null;
    const raw = value instanceof Date
        ? value.toISOString()
        : String(value).trim().replace(' ', 'T');
    const parsed = new Date(raw.endsWith('Z') ? raw : `${raw}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeMediaGallery = (value, fallback = []) => {
    const source = Array.isArray(value) ? value : fallback;
    return source
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const getDisplayReach = (row) => {
    const currentReach = Number(row.current_reach || 0);
    if (currentReach > 0) return currentReach;
    return Number(row.reach_count ?? row.counted_views ?? 0);
};

const mapRow = (row) => {
    const isProductPromote = String(row.campaign_type || '').trim().toLowerCase() === 'product promote';
    const originalProductId = row.original_product_id ?? row.linked_product_id ?? null;
    const originalProductCode = row.original_product_code ?? row.linked_product_share_code ?? null;
    const linkedProductId = row.linked_product_id ?? originalProductId ?? null;
    const linkedProductShareCode = row.linked_product_share_code ?? originalProductCode ?? null;

    const activeLink = row.active_link || row.edit_draft?.activeLink || row.edit_draft?.active_link || row.cta_value || row.edit_draft?.ctaValue || row.edit_draft?.cta_value || '';
    const durationState = calculateAdDurationState(row);
    return {
        id: row.id,
        adId: row.ad_id,
        ad_id: row.ad_id,
        userId: row.display_user_id ?? row.user_id,
        user_id: row.display_user_id ?? row.user_id,
        ad_owner_user_id: row.user_id,
        advertiser_id: row.user_id,
        ownerUserId: row.owner_user_id,
        ownerUsername: row.owner_username_joined || row.owner_username,
        user: {
            id: row.display_user_id ?? row.user_id,
            user_id: row.display_public_user_id ?? row.owner_user_id,
            username: row.owner_username_joined || row.owner_username,
            profile_picture: row.profile_picture || row.edit_draft?.sourceOwnerProfilePicture || null,
        },
        campaignType: row.campaign_type,
        title: row.title,
        description: row.description,
        mediaPreview: row.media_preview,
        mediaGallery: normalizeMediaGallery(row.media_gallery, normalizeMediaGallery(row.edit_draft?.mediaGallery, row.media_preview ? [row.media_preview] : [])),
        mediaType: row.media_type || '',
        genderTarget: row.gender_target,
        ageMin: row.age_min,
        ageMax: row.age_max,
        reach: Number(row.reach_count ?? row.counted_views ?? 0),
        impressions: Number(row.impressions_count ?? row.impressions ?? 0),
        views_count: Number(row.counted_views ?? row.reach_count ?? 0),
        viewCount: Number(row.counted_views ?? row.reach_count ?? 0),
        likes_count: Number(row.likes_count || 0),
        likeCount: Number(row.likes_count || 0),
        comments_count: Number(row.comments_count || 0),
        commentCount: Number(row.comments_count || 0),
        shares_count: Number(row.shares_count || 0),
        shareCount: Number(row.shares_count || 0),
        clicks: Number(row.clicks || 0),
        budget: Number(row.budget || 0),
        durationDays: Number(row.duration_days || 0),
        spend: Number(row.spend || 0),
        remainingBudget: Number(row.remaining_budget || 0),
        status: row.status || 'Under Review',
        campaignPath: row.campaign_path,
        active_link: activeLink,
        cta_topic: row.cta_topic || row.edit_draft?.ctaTopic || row.edit_draft?.cta_topic || '',
        cta_value: row.cta_value || row.edit_draft?.ctaValue || row.edit_draft?.cta_value || '',
        product_id: row.product_id ?? null,
        productId: row.product_id ?? null,
        original_product_id: originalProductId,
        original_product_code: originalProductCode,
        linked_product_id: linkedProductId,
        linked_product_share_code: linkedProductShareCode,
        linked_product_code: linkedProductShareCode,
        product_code: isProductPromote ? (originalProductCode || linkedProductShareCode || row.product_code || null) : (row.product_code || row.ad_id),
        share_code: isProductPromote ? (originalProductCode || linkedProductShareCode || row.share_code || null) : (row.share_code || row.product_code || row.ad_id),
        shareCode: isProductPromote ? (originalProductCode || linkedProductShareCode || row.share_code || null) : (row.share_code || row.product_code || row.ad_id),
        walletTransferId: row.wallet_transfer_id,
        tierId: row.tier_id ?? null,
        estimatedReachMin: row.estimated_reach_min ?? null,
        estimatedReachMax: row.estimated_reach_max ?? null,
        maxReachCap: row.max_reach_cap ?? null,
        currentReach: getDisplayReach(row),
        promoCode: row.promo_code || null,
        editDraft: row.edit_draft || {},
        createdAt: toUtcIso(row.created_at),
        created_at: toUtcIso(row.created_at),
        publishedAt: toUtcIso(row.created_at),
        published_at: toUtcIso(row.created_at),
        activeStartTime: toUtcIso(row.active_start_time || row.started_at),
        active_start_time: toUtcIso(row.active_start_time || row.started_at),
        startedAt: toUtcIso(row.started_at || row.active_start_time),
        started_at: toUtcIso(row.started_at || row.active_start_time),
        pausedAt: toUtcIso(row.paused_at),
        paused_at: toUtcIso(row.paused_at),
        lastResumedAt: toUtcIso(row.last_resumed_at),
        last_resumed_at: toUtcIso(row.last_resumed_at),
        completedAt: toUtcIso(row.completed_at),
        completed_at: toUtcIso(row.completed_at),
        accumulatedActiveMs: durationState.accumulatedActiveMs,
        accumulated_active_ms: durationState.accumulatedActiveMs,
        durationRemainingMs: durationState.remainingMs,
        duration_remaining_ms: durationState.remainingMs,
        durationElapsedMs: durationState.elapsedMs,
        duration_elapsed_ms: durationState.elapsedMs,
        durationTotalMs: durationState.totalMs,
        duration_total_ms: durationState.totalMs,
        updatedAt: toUtcIso(row.updated_at),
        updated_at: toUtcIso(row.updated_at),
        savedAt: toUtcIso(row.saved_at),
        saved_at: toUtcIso(row.saved_at),
        profile_picture: row.profile_picture || row.edit_draft?.sourceOwnerProfilePicture || null,
    };
};

const ensureAdsTable = async () => adsRuntimeRepository.ensureAdsTable();
const ensureAdEngagementTables = async () => adsRuntimeRepository.ensureAdEngagementTables();

const getOwnedAdForAnalytics = async (adId, userId) => {
    const result = await pool.query(
        'SELECT id, ad_id, campaign_type, gender_target, age_min, age_max, current_reach, impressions, clicks FROM ads WHERE ad_id = $1 AND user_id = $2 LIMIT 1',
        [adId, userId]
    );
    return result.rows[0] || null;
};

const getViewTotals = async (adId) => {
    const result = await pool.query(
        `SELECT COUNT(*) AS views,
                COUNT(DISTINCT COALESCE(user_id::text, viewer_key, ip_address, id::text)) AS reach
         FROM ad_views WHERE ad_id = $1`,
        [adId]
    );
    return result.rows[0] || {};
};

const getLikeTotals = async (adId) => {
    const result = await pool.query(
        'SELECT COUNT(*) AS likes FROM ad_likes WHERE ad_id = $1',
        [adId]
    );
    return result.rows[0] || {};
};

const getClickTotals = async (adId) => {
    const result = await pool.query(
        'SELECT COUNT(*) AS clicks FROM ad_click_events WHERE ad_id = $1',
        [adId]
    );
    return result.rows[0] || {};
};

const getClicksByType = async (adId) => {
    const result = await pool.query(
        `SELECT COALESCE(action_type, 'visit') AS label, COUNT(*) AS clicks
         FROM ad_click_events WHERE ad_id = $1
         GROUP BY action_type ORDER BY clicks DESC`,
        [adId]
    );
    return result.rows;
};

const getViewsByGender = async (adId) => {
    const result = await pool.query(
        `SELECT COALESCE(NULLIF(u.gender, ''), 'Unknown') AS label,
                COUNT(*) AS reach,
                COALESCE(SUM(av.view_count), 0) AS impressions
         FROM ad_views av
         LEFT JOIN users u ON av.user_id = u.id
         WHERE av.ad_id = $1
         GROUP BY COALESCE(NULLIF(u.gender, ''), 'Unknown')
         ORDER BY reach DESC`,
        [adId]
    );
    return result.rows;
};

const getViewsByCountry = async (adId) => {
    const result = await pool.query(
        `SELECT COALESCE(NULLIF(u.country, ''), 'Unknown') AS label,
                COUNT(*) AS reach,
                COALESCE(SUM(av.view_count), 0) AS impressions
         FROM ad_views av
         LEFT JOIN users u ON av.user_id = u.id
         WHERE av.ad_id = $1
         GROUP BY COALESCE(NULLIF(u.country, ''), 'Unknown')
         ORDER BY reach DESC
         LIMIT 20`,
        [adId]
    );
    return result.rows;
};

const getViewsByAge = async (adId) => {
    const result = await pool.query(
        `SELECT
            CASE
                WHEN u.date_of_birth IS NULL THEN 'Unknown'
                WHEN DATE_PART('year', AGE(u.date_of_birth)) < 18 THEN 'Under 18'
                WHEN DATE_PART('year', AGE(u.date_of_birth)) BETWEEN 18 AND 24 THEN '18â€“24'
                WHEN DATE_PART('year', AGE(u.date_of_birth)) BETWEEN 25 AND 34 THEN '25â€“34'
                WHEN DATE_PART('year', AGE(u.date_of_birth)) BETWEEN 35 AND 44 THEN '35â€“44'
                WHEN DATE_PART('year', AGE(u.date_of_birth)) BETWEEN 45 AND 54 THEN '45â€“54'
                ELSE '55+'
            END AS label,
            COUNT(*) AS reach,
            COALESCE(SUM(av.view_count), 0) AS impressions
         FROM ad_views av
         LEFT JOIN users u ON av.user_id = u.id
         WHERE av.ad_id = $1
         GROUP BY label
         ORDER BY reach DESC`,
        [adId]
    );
    return result.rows;
};

const getLikesByGender = async (adId) => {
    const result = await pool.query(
        `SELECT COALESCE(NULLIF(u.gender, ''), 'Unknown') AS label, COUNT(*) AS likes
         FROM ad_likes al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.ad_id = $1
         GROUP BY COALESCE(NULLIF(u.gender, ''), 'Unknown')
         ORDER BY likes DESC`,
        [adId]
    );
    return result.rows;
};

const getLikesByCountry = async (adId) => {
    const result = await pool.query(
        `SELECT COALESCE(NULLIF(u.country, ''), 'Unknown') AS label, COUNT(*) AS likes
         FROM ad_likes al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.ad_id = $1
         GROUP BY COALESCE(NULLIF(u.country, ''), 'Unknown')
         ORDER BY likes DESC
         LIMIT 20`,
        [adId]
    );
    return result.rows;
};

const getClicksByGender = async (adId) => {
    const result = await pool.query(
        `SELECT COALESCE(NULLIF(u.gender, ''), 'Unknown') AS label, COUNT(*) AS clicks
         FROM ad_click_events ace
         LEFT JOIN users u ON ace.user_id = u.id
         WHERE ace.ad_id = $1
         GROUP BY COALESCE(NULLIF(u.gender, ''), 'Unknown')
         ORDER BY clicks DESC`,
        [adId]
    );
    return result.rows;
};

const findAdForSave = async (adId) => {
    const result = await pool.query(
        `SELECT ad_id, campaign_type, media_type, media_preview, active_link, edit_draft
         FROM ads
         WHERE ad_id = $1 OR id::text = $1
         LIMIT 1`,
        [adId]
    );
    return result.rows[0] || null;
};

const findExistingSave = async (userId, adId) => {
    const result = await pool.query(
        'SELECT id FROM ad_saves WHERE user_id = $1 AND ad_id = $2',
        [userId, adId]
    );
    return result.rows[0] || null;
};

const deleteSave = async (userId, adId) => {
    await pool.query('DELETE FROM ad_saves WHERE user_id = $1 AND ad_id = $2', [userId, adId]);
};

const countUploadSavesByType = async (userId, adMediaType) => {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS c FROM ad_saves
         WHERE user_id = $1 AND ad_media_type = $2 AND ad_source_type = 'upload'`,
        [userId, adMediaType]
    );
    return result.rows[0]?.c || 0;
};

const insertSave = async (userId, adId, adMediaType, adSourceType) => {
    await pool.query(
        `INSERT INTO ad_saves (user_id, ad_id, ad_media_type, ad_source_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, ad_id) DO NOTHING`,
        [userId, adId, adMediaType, adSourceType]
    );
};

const listSavedAdIds = async (userId) => {
    const result = await pool.query('SELECT ad_id FROM ad_saves WHERE user_id = $1', [userId]);
    return result.rows;
};

const listMySavedAds = async (userId) => {
    const result = await pool.query(
        `SELECT a.*,
                COALESCE(owner_u.id, sponsor_u.id) AS display_user_id,
                COALESCE(owner_u.user_id, sponsor_u.user_id) AS display_public_user_id,
                COALESCE(owner_u.username, sponsor_u.username) AS owner_username_joined,
                COALESCE(owner_u.profile_picture, sponsor_u.profile_picture) AS profile_picture,
                COALESCE(av.reach_count, 0) AS reach_count,
                s.created_at AS saved_at
         FROM ad_saves s
         JOIN ads a ON a.ad_id = s.ad_id
         LEFT JOIN users sponsor_u ON a.user_id = sponsor_u.id
         LEFT JOIN users owner_u ON owner_u.user_id::text = a.owner_user_id
         LEFT JOIN (
             SELECT ad_id, COUNT(*) AS reach_count
             FROM ad_views
             GROUP BY ad_id
         ) av ON av.ad_id = a.ad_id
         WHERE s.user_id = $1
           AND NOT (
               a.status = 'Completed'
               AND s.ad_source_type = 'upload'
               AND ${RAW_PHOTO_VIDEO_UPLOAD_SQL}
               AND NOT (${RAW_PHOTO_VIDEO_PROFILE_NOT_EXPIRED_SQL})
           )
         ORDER BY s.created_at DESC`,
        [userId]
    );
    return result.rows;
};

const listPublicSavedAdsByUser = async (profileUserId) => {
    const result = await pool.query(
        `SELECT a.*,
                COALESCE(owner_u.id, sponsor_u.id) AS display_user_id,
                COALESCE(owner_u.user_id, sponsor_u.user_id) AS display_public_user_id,
                COALESCE(owner_u.username, sponsor_u.username) AS owner_username_joined,
                COALESCE(owner_u.profile_picture, sponsor_u.profile_picture) AS profile_picture,
                COALESCE(av.reach_count, 0) AS reach_count,
                s.created_at AS saved_at
         FROM ad_saves s
         JOIN ads a ON a.ad_id = s.ad_id
         LEFT JOIN users sponsor_u ON a.user_id = sponsor_u.id
         LEFT JOIN users owner_u ON owner_u.user_id::text = a.owner_user_id
         LEFT JOIN (
             SELECT ad_id, COUNT(*) AS reach_count
             FROM ad_views
             GROUP BY ad_id
          ) av ON av.ad_id = a.ad_id
         WHERE s.user_id = $1
           AND a.user_id = $1
           AND LOWER(COALESCE(a.campaign_type, '')) IN ('photo and video', 'photo & video')
           AND LOWER(TRIM(REPLACE(REPLACE(COALESCE(a.status, ''), '_', ' '), '-', ' '))) = 'completed'
           AND ${RAW_PHOTO_VIDEO_UPLOAD_SQL}
           AND ${RAW_PHOTO_VIDEO_PROFILE_NOT_EXPIRED_SQL}
         ORDER BY s.created_at DESC`,
        [profileUserId]
    );
    return result.rows;
};

const getSavedAdCounts = async (userId) => {
    const result = await pool.query(
        `SELECT ad_media_type, COUNT(*)::int AS c
         FROM ad_saves
         WHERE user_id = $1 AND ad_source_type = 'upload'
         GROUP BY ad_media_type`,
        [userId]
    );
    return result.rows;
};

module.exports = {
    classifyAdForSave,
    ensureAdEngagementTables,
    ensureAdSavesSchema,
    ensureAdsTable,
    findAdForSave,
    findExistingSave,
    getClickTotals,
    getClicksByGender,
    getClicksByType,
    getLikeTotals,
    getLikesByCountry,
    getLikesByGender,
    getOwnedAdForAnalytics,
    getSavedAdCounts,
    getViewTotals,
    getViewsByAge,
    getViewsByCountry,
    getViewsByGender,
    insertSave,
    listMySavedAds,
    listPublicSavedAdsByUser,
    listSavedAdIds,
    mapRow,
    countUploadSavesByType,
    deleteSave,
    syncExpiredAds,
};
