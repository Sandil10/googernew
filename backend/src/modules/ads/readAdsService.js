const { adIsWithinDeliveryRules } = require('../../utils/adDelivery');
const readAdsRepository = require('./readAdsRepository');

// Product / Profile Promote ads are often saved with no media of their own, so
// the Ad Center had nothing to preview (Under Review, Paused, Completed, ...).
// Fill it from the linked product's image / the promoted profile's picture.
// Read-time only — stored rows are not changed.
const fillPromotePreviews = async (rows) => {
    const pool = require('../../config/database');
    const isEmpty = (v) => !String(v ?? '').trim();
    const promote = (row) => String(row?.campaign_type || row?.campaignType || '').trim().toLowerCase();
    const productIds = [...new Set(rows
        .filter((r) => promote(r) === 'product promote' && isEmpty(r.media_preview) && r.linked_product_id)
        .map((r) => Number(r.linked_product_id))
        .filter(Number.isFinite))];
    const userIds = [...new Set(rows
        .filter((r) => promote(r) === 'profile promote' && (isEmpty(r.media_preview) || isEmpty(r.profile_picture)))
        .map((r) => Number(r.user_id))
        .filter(Number.isFinite))];
    const productImages = new Map();
    const profilePictures = new Map();
    try {
        if (productIds.length) {
            const r = await pool.query('SELECT id, image_url FROM market WHERE id = ANY($1::int[])', [productIds]);
            r.rows.forEach((p) => productImages.set(Number(p.id), p.image_url));
        }
        if (userIds.length) {
            const r = await pool.query('SELECT id, profile_picture FROM users WHERE id = ANY($1::int[])', [userIds]);
            r.rows.forEach((u) => profilePictures.set(Number(u.id), u.profile_picture));
        }
    } catch (err) {
        console.error('fillPromotePreviews error:', err.message);
        return rows;
    }
    return rows.map((row) => {
        const type = promote(row);
        if (type === 'product promote' && isEmpty(row.media_preview)) {
            const image = productImages.get(Number(row.linked_product_id));
            return image ? { ...row, media_preview: image } : row;
        }
        if (type === 'profile promote') {
            const picture = profilePictures.get(Number(row.user_id));
            if (!picture) return row;
            return {
                ...row,
                media_preview: isEmpty(row.media_preview) ? picture : row.media_preview,
                profile_picture: isEmpty(row.profile_picture) ? picture : row.profile_picture,
            };
        }
        return row;
    });
};

const getMyAds = async (userId) => {
    await readAdsRepository.ensureAdsTable();
    await readAdsRepository.ensureAdSavesSchema();
    await readAdsRepository.ensureAdEngagementTables();
    await readAdsRepository.syncExpiredAds(require('../../config/database'));
    await readAdsRepository.syncAdsReachCaps();

    const rows = await fillPromotePreviews(await readAdsRepository.listMyAds(userId));
    return { success: true, ads: rows.map(readAdsRepository.savedAdsRepository.mapRow) };
};

const getMyAdById = async (adId, userId) => {
    await readAdsRepository.ensureAdsTable();
    await readAdsRepository.syncExpiredAds(require('../../config/database'), adId);
    await readAdsRepository.syncAdsReachCaps(adId);

    const found = await readAdsRepository.findMyAdById(adId, userId);
    if (!found) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }
    const [row] = await fillPromotePreviews([found]);

    return { success: true, ad: readAdsRepository.savedAdsRepository.mapRow(row) };
};

const getAllAds = async (userId, query) => {
    await readAdsRepository.ensureAdsTable();
    await readAdsRepository.syncExpiredAds(require('../../config/database'));
    await readAdsRepository.syncAdsReachCaps();

    const isAdmin = await readAdsRepository.assertAdmin(userId);
    if (!isAdmin) {
        const error = new Error('Admin access required');
        error.statusCode = 403;
        throw error;
    }

    const includeAll = String(query.include_all || query.includeAll || '').toLowerCase() === 'true';
    const rows = await fillPromotePreviews(await readAdsRepository.listAllAds(includeAll));
    return { success: true, ads: rows.map(readAdsRepository.savedAdsRepository.mapRow) };
};

const getAdPublic = async (adId) => {
    await readAdsRepository.ensureAdsTable();

    const row = await readAdsRepository.findPublicAdById(adId);
    if (!row || !adIsWithinDeliveryRules(row)) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }

    return { success: true, ad: readAdsRepository.savedAdsRepository.mapRow(row) };
};

const updateAdReach = async (adId, reach) => {
    await readAdsRepository.ensureAdsTable();
    if (typeof reach !== 'number' || reach < 0) {
        const error = new Error('reach must be a non-negative number');
        error.statusCode = 400;
        throw error;
    }

    const ad = await readAdsRepository.updateAdReach(adId, reach);
    if (!ad) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }

    return { success: true };
};

module.exports = {
    getAdPublic,
    getAllAds,
    getMyAdById,
    getMyAds,
    updateAdReach,
};
