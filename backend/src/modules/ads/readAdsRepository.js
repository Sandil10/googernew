const pool = require('../../config/database');
const { recordAdImpression, syncExpiredAds } = require('../../utils/adDelivery');
const adsRuntimeRepository = require('./adsRuntimeRepository');
const savedAdsRepository = require('./savedAdsRepository');

const ensureAdsTable = async () => savedAdsRepository.ensureAdsTable();
const ensureAdSavesSchema = async () => savedAdsRepository.ensureAdSavesSchema();
const ensureAdEngagementTables = async () => savedAdsRepository.ensureAdEngagementTables();
const syncAdsReachCaps = async (adId = null) => adsRuntimeRepository.syncAdsReachCaps(adId);

const assertAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type === 'admin';
};

const listMyAds = async (userId) => {
    const result = await pool.query(
        `SELECT a.*,
                COALESCE(owner_u.id, sponsor_u.id) AS display_user_id,
                COALESCE(owner_u.user_id, sponsor_u.user_id) AS display_public_user_id,
                COALESCE(owner_u.username, sponsor_u.username) AS owner_username_joined,
                COALESCE(owner_u.profile_picture, sponsor_u.profile_picture) AS profile_picture,
                COALESCE(av.counted_views, 0) AS counted_views
         FROM ads a
         LEFT JOIN users sponsor_u ON a.user_id = sponsor_u.id
         LEFT JOIN users owner_u ON owner_u.user_id::text = a.owner_user_id
         LEFT JOIN (
             SELECT ad_id, COUNT(*) AS counted_views
             FROM ad_views
             GROUP BY ad_id
         ) av ON av.ad_id = a.ad_id
         WHERE a.user_id = $1
         ORDER BY a.created_at DESC`,
        [userId]
    );

    return result.rows;
};

const findMyAdById = async (adId, userId) => {
    const normalizedAdId = String(adId || '').trim().replace(/^ad-/i, '');
    const result = await pool.query(
        `SELECT a.*,
                COALESCE(owner_u.id, sponsor_u.id) AS display_user_id,
                COALESCE(owner_u.user_id, sponsor_u.user_id) AS display_public_user_id,
                COALESCE(owner_u.username, sponsor_u.username) AS owner_username_joined,
                COALESCE(owner_u.profile_picture, sponsor_u.profile_picture) AS profile_picture,
                COALESCE(av.counted_views, 0) AS counted_views
         FROM ads a
         LEFT JOIN users sponsor_u ON a.user_id = sponsor_u.id
         LEFT JOIN users owner_u ON owner_u.user_id::text = a.owner_user_id
         LEFT JOIN (
             SELECT ad_id, COUNT(*) AS counted_views
             FROM ad_views
             GROUP BY ad_id
         ) av ON av.ad_id = a.ad_id
         WHERE (a.ad_id = $1 OR a.id::text = $1) AND a.user_id = $2
         LIMIT 1`,
        [normalizedAdId, userId]
    );

    return result.rows[0] || null;
};

const listAllAds = async (includeAll) => {
    const approvalOnlyWhere = includeAll ? '' : "WHERE a.status IN ('Under Review', 'Pending Approval')";
    const result = await pool.query(
        `SELECT a.*,
                COALESCE(av.counted_views, 0) AS counted_views,
                COALESCE(av.unique_reach, 0) AS reach_count,
                COALESCE(click_stats.click_events, 0) AS click_events,
                COALESCE(owner_u.id, sponsor_u.id) AS display_user_id,
                COALESCE(owner_u.user_id, sponsor_u.user_id) AS display_public_user_id,
                COALESCE(owner_u.username, sponsor_u.username) AS owner_username_joined,
                COALESCE(owner_u.profile_picture, sponsor_u.profile_picture) AS profile_picture
         FROM ads a 
         LEFT JOIN users sponsor_u ON a.user_id = sponsor_u.id 
         LEFT JOIN users owner_u ON owner_u.user_id::text = a.owner_user_id
         LEFT JOIN (
             SELECT ad_id,
                    COUNT(*)::int AS counted_views,
                    COUNT(DISTINCT COALESCE(user_id::text, viewer_key, ip_address, id::text))::int AS unique_reach
             FROM ad_views
             GROUP BY ad_id
         ) av ON av.ad_id = a.ad_id
         LEFT JOIN (
             SELECT ad_id, COUNT(*)::int AS click_events
             FROM ad_click_events
             GROUP BY ad_id
         ) click_stats ON click_stats.ad_id = a.ad_id
         ${approvalOnlyWhere}
         ORDER BY a.created_at DESC`
    );

    return result.rows;
};

const findPublicAdById = async (adId) => {
    const result = await pool.query(
        `SELECT a.*,
                COALESCE(owner_u.id, sponsor_u.id) AS display_user_id,
                COALESCE(owner_u.user_id, sponsor_u.user_id) AS display_public_user_id,
                COALESCE(owner_u.username, sponsor_u.username) AS owner_username_joined,
                COALESCE(owner_u.profile_picture, sponsor_u.profile_picture) AS profile_picture
         FROM ads a
         JOIN users sponsor_u ON a.user_id = sponsor_u.id
         LEFT JOIN users owner_u ON owner_u.user_id::text = a.owner_user_id
         WHERE a.ad_id = $1
           AND a.status = 'Active'
           AND COALESCE(sponsor_u.is_deactivated, false) = false
           AND COALESCE(sponsor_u.status, 'Active') <> 'Deactivated'
         LIMIT 1`,
        [adId]
    );

    return result.rows[0] || null;
};

const updateAdReach = async (adId, reach) => recordAdImpression(pool, adId, reach);

module.exports = {
    assertAdmin,
    ensureAdEngagementTables,
    ensureAdsTable,
    ensureAdSavesSchema,
    findMyAdById,
    findPublicAdById,
    listAllAds,
    listMyAds,
    savedAdsRepository,
    syncAdsReachCaps,
    syncExpiredAds,
    updateAdReach,
};
