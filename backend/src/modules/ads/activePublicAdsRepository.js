const jwt = require('jsonwebtoken');
const pool = require('../../config/database');
const {
    adIsWithinDeliveryRules,
    adMatchesViewer,
    loadViewerAdProfile,
} = require('../../utils/adDelivery');
const savedAdsRepository = require('./savedAdsRepository');
const readAdsRepository = require('./readAdsRepository');

const ANONYMOUS_PUBLIC_ADS_CACHE_TTL_MS = Math.max(
    0,
    Number.parseInt(process.env.ANONYMOUS_PUBLIC_ADS_CACHE_TTL_MS || '5000', 10) || 5000
);
const anonymousPublicAdsCache = new Map();

const stripDataUrl = (value) => {
    const text = String(value || '').trim();
    return text.startsWith('data:') ? '' : text;
};

const getMediaUrl = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return stripDataUrl(value);
    if (typeof value === 'object') {
        return stripDataUrl(value.url || value.image_url || value.image || value.src || value.path || '');
    }
    return '';
};

const getRawMediaValue = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
        return String(value.url || value.image_url || value.image || value.src || value.path || '').trim();
    }
    return '';
};

const readDurationMs = (startNs) => Number(process.hrtime.bigint() - startNs) / 1e6;
const shouldLogPublicAdsTiming = () => /^(1|true|yes|on)$/i.test(String(process.env.PUBLIC_ADS_TIMING_LOG || '').trim());

const getAnonymousPublicAdsCacheKey = (req, limit, offset, ownerUserId) => {
    if (ownerUserId) return null;
    const queryKeys = Object.keys(req.query || {}).filter((key) => !['limit', 'offset'].includes(key));
    if (queryKeys.length > 0) return null;
    return `anon:${limit}:${offset}`;
};

const getCachedAnonymousPublicAds = (cacheKey) => {
    if (!cacheKey || ANONYMOUS_PUBLIC_ADS_CACHE_TTL_MS <= 0) return null;
    const cached = anonymousPublicAdsCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        anonymousPublicAdsCache.delete(cacheKey);
        return null;
    }
    return cached.payload;
};

const setCachedAnonymousPublicAds = (cacheKey, payload) => {
    if (!cacheKey || ANONYMOUS_PUBLIC_ADS_CACHE_TTL_MS <= 0) return;
    const now = Date.now();
    anonymousPublicAdsCache.set(cacheKey, {
        payload,
        expiresAt: now + ANONYMOUS_PUBLIC_ADS_CACHE_TTL_MS,
    });
    if (anonymousPublicAdsCache.size <= 100) return;
    for (const [key, value] of anonymousPublicAdsCache.entries()) {
        if (value.expiresAt <= now) anonymousPublicAdsCache.delete(key);
    }
};

const getOptionalViewerId = (req) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.replace('Bearer ', '')
            : authHeader;
        if (!token) return null;

        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        if (!secret) return null;

        const decoded = jwt.verify(token, secret);
        return decoded?.id || decoded?.userId || null;
    } catch {
        return null;
    }
};

const getSeededRandom = (seedText) => {
    let hash = 2166136261;
    const text = String(seedText || '');
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
};

const shuffleRowsWithSeed = (rows, seed, getKey) => {
    return [...(rows || [])].sort((first, second) => {
        const firstScore = getSeededRandom(`${seed}:${getKey(first)}`);
        const secondScore = getSeededRandom(`${seed}:${getKey(second)}`);
        return firstScore - secondScore;
    });
};

const isProductPromoteCampaign = (ad) => String(ad?.campaign_type || ad?.campaignType || '').trim().toLowerCase() === 'product promote';

const getProductPromoteTarget = (ad) => {
    const productIdValue =
        ad?.original_product_id ??
        ad?.originalProductId ??
        ad?.linked_product_id ??
        ad?.linkedProductId ??
        ad?.product_id ??
        ad?.productId ??
        ad?.editDraft?.linkedProductId ??
        ad?.editDraft?.productId ??
        ad?.edit_draft?.linkedProductId ??
        ad?.edit_draft?.productId;
    const productCodeValue =
        ad?.original_product_code ??
        ad?.originalProductCode ??
        ad?.linked_product_share_code ??
        ad?.linkedProductShareCode ??
        ad?.linked_product_code ??
        ad?.linkedProductCode ??
        ad?.product_code ??
        ad?.productCode ??
        ad?.share_code ??
        ad?.shareCode ??
        ad?.editDraft?.linkedProductShareCode ??
        ad?.editDraft?.productCode ??
        ad?.edit_draft?.linkedProductShareCode ??
        ad?.edit_draft?.productCode;

    const numericProductId = Number(productIdValue);
    const productId = Number.isFinite(numericProductId) && numericProductId > 0 ? numericProductId : null;
    const productCode = String(productCodeValue || '').trim() || null;
    return { productId, productCode };
};

const deriveVariantSizes = (variants) => {
    if (!Array.isArray(variants)) return [];
    return Array.from(
        new Set(
            variants
                .map((variant) => String(variant?.size || '').trim())
                .filter(Boolean)
        )
    );
};

const deriveVariantColors = (variants) => {
    if (!Array.isArray(variants)) return [];
    return Array.from(
        new Set(
            variants
                .map((variant) => String(variant?.color || '').trim())
                .filter(Boolean)
        )
    );
};

const findCandidateAds = async (fetchLimit, offset, viewerId, ownerUserId, rawPhotoVideoProfileNotExpiredSql) => {
    const viewerSelect = viewerId
        ? `,
            EXISTS(SELECT 1 FROM ad_likes al WHERE al.ad_id = a.ad_id AND al.user_id = $3) AS user_liked,
            EXISTS(SELECT 1 FROM ad_coin_collections acc WHERE acc.ad_id = a.ad_id AND acc.user_id = $3) AS ad_coin_collected`
        : `,
            FALSE AS user_liked,
            FALSE AS ad_coin_collected`;

    const queryParams = viewerId ? [fetchLimit, offset, viewerId] : [fetchLimit, offset];
    const ownerFilter = (ownerUserId && Number.isFinite(ownerUserId))
        ? `AND a.user_id = ${ownerUserId}` : '';
    const statusFilter = (ownerUserId && Number.isFinite(ownerUserId))
        ? `(
               a.status = 'Active'
               OR a.status IN ('Removed', 'Paused')
               OR (
                   a.status = 'Completed'
                   AND EXISTS (
                       SELECT 1
                       FROM ad_saves profile_save
                       WHERE profile_save.ad_id = a.ad_id
                         AND profile_save.user_id = a.user_id
                         AND profile_save.ad_source_type = 'upload'
                   )
                   AND ${rawPhotoVideoProfileNotExpiredSql}
               )
           )`
        : `a.status = 'Active'`;
    const countViewsSelect = ownerUserId && Number.isFinite(ownerUserId)
        ? `COALESCE(av.counted_views, 0) AS counted_views,`
        : `COALESCE(a.current_reach, a.impressions, 0) AS counted_views,`;
    const countViewsJoin = ownerUserId && Number.isFinite(ownerUserId)
        ? `LEFT JOIN (
             SELECT ad_id, COUNT(*) AS counted_views
             FROM ad_views
             GROUP BY ad_id
         ) av ON av.ad_id = a.ad_id`
        : '';

    const result = await pool.query(
        `SELECT a.*, ${countViewsSelect}
                COALESCE(owner_u.id, sponsor_u.id) AS display_user_id,
                COALESCE(owner_u.user_id, sponsor_u.user_id) AS display_public_user_id,
                COALESCE(owner_u.username, sponsor_u.username) AS owner_username_joined,
                COALESCE(owner_u.profile_picture, sponsor_u.profile_picture) AS profile_picture${viewerSelect}
         FROM ads a
         JOIN users sponsor_u ON a.user_id = sponsor_u.id
         LEFT JOIN users owner_u ON owner_u.user_id::text = a.owner_user_id
         ${countViewsJoin}
         WHERE ${statusFilter}
           AND COALESCE(sponsor_u.is_deactivated, false) = false
           AND COALESCE(sponsor_u.status, 'Active') <> 'Deactivated'
           AND (
               a.status <> 'Active'
               OR a.max_reach_cap IS NULL
               OR COALESCE(a.impressions, 0) < a.max_reach_cap
           )
           ${ownerFilter}
         ORDER BY COALESCE(a.active_start_time, a.created_at) DESC
         LIMIT $1 OFFSET $2`,
        queryParams
    );

    return result.rows;
};

const findLinkedProducts = async (productIds, productCodes) => {
    if (!productIds.length && !productCodes.length) return [];

    const linkedResult = await pool.query(
        `SELECT m.id, m.user_id, m.username, m.title, m.description, m.price, m.promo_price,
                m.category, m.sub_category, m.manual_category, m.stock, m.image_url, NULL::jsonb AS media_gallery, m.status,
                m.likes_count, m.comments_count, m.shares_count, m.views_count,
                m.variants, m.shipping_info, m.payment_methods, m.commission_info, m.created_at, m.product_code,
                u.username AS owner_username, u.profile_picture
         FROM market m
         INNER JOIN users u ON m.user_id = u.id
         WHERE (m.id = ANY($1::int[]) OR m.product_code = ANY($2::text[]))
           AND m.status IN ('approved', 'active')
           AND COALESCE(u.is_deactivated, false) = false
           AND COALESCE(u.status, 'Active') <> 'Deactivated'`,
        [productIds.length ? productIds : [0], productCodes.length ? productCodes : ['']]
    );
    return linkedResult.rows || [];
};

module.exports = {
    adIsWithinDeliveryRules,
    adMatchesViewer,
    deriveVariantColors,
    deriveVariantSizes,
    ensureAdEngagementTables: readAdsRepository.ensureAdEngagementTables,
    ensureAdsTable: readAdsRepository.ensureAdsTable,
    findCandidateAds,
    findLinkedProducts,
    getAnonymousPublicAdsCacheKey,
    getCachedAnonymousPublicAds,
    getMediaUrl,
    getOptionalViewerId,
    getProductPromoteTarget,
    getRawMediaValue,
    isProductPromoteCampaign,
    loadViewerAdProfile,
    normalizeMediaGallery: savedAdsRepository.mapRow ? ((value, fallback = []) => {
        const source = Array.isArray(value) ? value : fallback;
        return source.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
    }) : null,
    readDurationMs,
    savedAdsRepository,
    setCachedAnonymousPublicAds,
    shouldLogPublicAdsTiming,
    shuffleRowsWithSeed,
};
