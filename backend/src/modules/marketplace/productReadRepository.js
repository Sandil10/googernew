const crypto = require('crypto');
const pool = require('../../config/database');

const BASE64_IMAGE_DATA_URL_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;
const SHARE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const UPPERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERS = 'abcdefghijklmnopqrstuvwxyz';
const SHARE_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;
const PRODUCT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRODUCT_CODE_LENGTH = 8;

const DEFAULT_AD_COIN_REWARD_SETTINGS = {
    user_reward_amount: 1.00,
    googer_commission_amount: 0.25,
    advertiser_charge_amount: 1.25,
    required_watch_seconds: 5,
};

let productShareCodeColumnReady = false;
let sponsoredAdsRewardSettingsReady = false;

const tableColumnCache = new Map();

const hasTableColumn = async (tableName, columnName) => {
    const cacheKey = `${tableName}.${columnName}`;
    if (tableColumnCache.has(cacheKey)) {
        return tableColumnCache.get(cacheKey);
    }

    const result = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = $1 AND column_name = $2
        ) AS exists`,
        [tableName, columnName]
    );

    const exists = Boolean(result.rows[0]?.exists);
    tableColumnCache.set(cacheKey, exists);
    return exists;
};

const safeJsonParse = (value, fallback = null) => {
    if (!value) return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const stripDataUrl = (value) => {
    const text = String(value || '').trim();
    return BASE64_IMAGE_DATA_URL_PATTERN.test(text) ? '' : text;
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

const isPlaceholderImage = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return !text || text.includes('/assets/images/googer.png') || text.includes('/assets/images/rupeer');
};

const firstRealImage = (...values) => {
    for (const value of values.flat()) {
        if (!isPlaceholderImage(value)) return value;
    }
    return '';
};

const normalizeImageUrl = (item) => {
    const variants = safeJsonParse(item.variants, item.variants);
    const rawImageList = safeJsonParse(item.images, item.images);
    const mediaGallery = Array.isArray(rawImageList)
        ? rawImageList.map((entry) => getMediaUrl(entry) || getRawMediaValue(entry)).filter(Boolean)
        : [];
    const variantImages = Array.isArray(variants)
        ? variants.map((variant) => getMediaUrl(variant?.image_url) || getMediaUrl(variant?.url) || getMediaUrl(variant?.image) || getRawMediaValue(variant?.image_url)).filter(Boolean)
        : [];
    const directImage = getMediaUrl(item.image_url) || getRawMediaValue(item.image_url);
    const primaryImage = firstRealImage(mediaGallery, variantImages, directImage) || '/assets/images/googer.png';

    return {
        ...item,
        image_url: firstRealImage(directImage, primaryImage) || primaryImage,
        main_image: firstRealImage(getMediaUrl(item.main_image), directImage, getRawMediaValue(item.main_image), primaryImage) || primaryImage,
        media_url: firstRealImage(getMediaUrl(item.media_url), getMediaUrl(item.media_preview), getRawMediaValue(item.media_url), primaryImage) || primaryImage,
        thumbnail_url: getMediaUrl(item.thumbnail_url) || getRawMediaValue(item.thumbnail_url) || primaryImage,
        media_preview: firstRealImage(getMediaUrl(item.media_preview), directImage, getRawMediaValue(item.media_preview), primaryImage) || primaryImage,
        media_gallery: mediaGallery.filter((entry) => !isPlaceholderImage(entry)).length ? mediaGallery.filter((entry) => !isPlaceholderImage(entry)) : (primaryImage ? [primaryImage] : []),
        profile_picture: getMediaUrl(item.profile_picture),
        variants: Array.isArray(variants)
            ? variants.map((variant) => ({
                ...variant,
                image: getMediaUrl(variant?.image) || getRawMediaValue(variant?.image),
                image_url: getMediaUrl(variant?.image_url) || getMediaUrl(variant?.url) || getMediaUrl(variant?.image) || getRawMediaValue(variant?.image_url),
                url: getMediaUrl(variant?.url) || getMediaUrl(variant?.image_url) || getMediaUrl(variant?.image) || getRawMediaValue(variant?.url),
            }))
            : variants,
        user: item.user
            ? {
                ...item.user,
                profile_picture: getMediaUrl(item.user.profile_picture),
            }
            : item.user,
    };
};

const attachCurrentUser = (row) => {
    const username = row.owner_username_joined || row.owner_username || row.username || 'User';
    const profilePicture = row.profile_picture || null;
    const activeTs = row.active_start_time || row.started_at || row.created_at;

    return normalizeImageUrl({
        ...row,
        createdAt: activeTs ? new Date(activeTs).toISOString() : null,
        created_at: activeTs ? new Date(activeTs).toISOString() : null,
        activeStartTime: row.active_start_time || row.started_at ? new Date(row.active_start_time || row.started_at).toISOString() : null,
        active_start_time: row.active_start_time || row.started_at ? new Date(row.active_start_time || row.started_at).toISOString() : null,
        startedAt: row.started_at || row.active_start_time ? new Date(row.started_at || row.active_start_time).toISOString() : null,
        started_at: row.started_at || row.active_start_time ? new Date(row.started_at || row.active_start_time).toISOString() : null,
        username,
        owner_username: username,
        owner_public_user_id: row.owner_public_user_id || row.owner_user_id || null,
        profile_picture: profilePicture,
        share_code: row.product_code || String(row.id || ''),
        user: {
            id: row.user_id,
            user_id: row.owner_public_user_id || row.owner_user_id,
            username,
            profile_picture: profilePicture,
        },
    });
};

const hash32 = (input, seed = 0x811c9dc5) => {
    let hash = seed >>> 0;
    const value = String(input || '');
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
};

const positiveModulo = (value, modulus) => {
    const normalized = Number(value) >>> 0;
    return normalized % modulus;
};

const buildShortShareCode = (type, target, length = 8) => {
    const normalizedTarget = String(target || '').trim();
    if (!normalizedTarget) return '';
    const payload = `${type}:${normalizedTarget}`;
    let stateA = hash32(payload, 0x9e3779b9);
    let stateB = hash32(payload, 0x85ebca6b);

    const chars = [];
    for (let index = 0; index < length; index += 1) {
        stateA = (Math.imul(stateA ^ (stateA >>> 15), 2246822519) + stateB + index) >>> 0;
        stateB = (Math.imul(stateB ^ (stateB >>> 13), 3266489917) + stateA + index * 17) >>> 0;
        const nextIndex = positiveModulo(stateA ^ stateB, SHARE_ALPHABET.length);
        chars.push(SHARE_ALPHABET[nextIndex]);
    }

    const codeChars = [...chars];
    const hasDigit = codeChars.some((char) => DIGITS.includes(char));
    const hasUpper = codeChars.some((char) => UPPERS.includes(char));
    const hasLower = codeChars.some((char) => LOWERS.includes(char));

    if (!hasDigit) codeChars[positiveModulo(stateA + 1, length)] = DIGITS[positiveModulo(stateB, DIGITS.length)];
    if (!hasUpper) codeChars[positiveModulo(stateB + 3, length)] = UPPERS[positiveModulo(stateA, UPPERS.length)];
    if (!hasLower) codeChars[positiveModulo(stateA + stateB + 5, length)] = LOWERS[positiveModulo(stateA ^ stateB, LOWERS.length)];

    return codeChars.join('');
};

const getCanonicalProductShareCode = (productRow) => {
    if (!productRow) return '';
    const productCode = String(productRow.product_code || '').trim();
    if (SHARE_CODE_PATTERN.test(productCode)) return productCode;
    const target = String(productRow.id || '').trim();
    return target ? buildShortShareCode('p', target, 8) : '';
};

const generateProductCode = (length = PRODUCT_CODE_LENGTH) => {
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let index = 0; index < length; index += 1) {
        code += PRODUCT_CODE_ALPHABET[bytes[index] % PRODUCT_CODE_ALPHABET.length];
    }
    return code;
};

const generateUniqueProductCode = async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = generateProductCode(PRODUCT_CODE_LENGTH);
        const existsResult = await pool.query(
            'SELECT 1 FROM market WHERE LOWER(product_code) = LOWER($1) LIMIT 1',
            [candidate]
        );
        if (existsResult.rows.length === 0) return candidate;
    }
    throw new Error('Unable to generate unique product code');
};

const ensureMarketProductCodeColumn = async () => {
    if (productShareCodeColumnReady) return;

    await pool.query('ALTER TABLE market ADD COLUMN IF NOT EXISTS product_code VARCHAR(32);');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS product_share_aliases (
            id SERIAL PRIMARY KEY,
            alias_code VARCHAR(32) UNIQUE NOT NULL,
            product_id INTEGER NOT NULL REFERENCES market(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_market_product_code
        ON market(product_code);
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_product_share_aliases_alias_code
        ON product_share_aliases(alias_code);
    `);

    productShareCodeColumnReady = true;
};

const rememberProductShareAlias = async (aliasCode, productId) => {
    const normalizedAlias = String(aliasCode || '').trim();
    if (!normalizedAlias || SHARE_CODE_PATTERN.test(normalizedAlias) || !productId) return;

    await ensureMarketProductCodeColumn();
    await pool.query(
        `INSERT INTO product_share_aliases (alias_code, product_id)
         VALUES ($1, $2)
         ON CONFLICT (alias_code) DO UPDATE SET product_id = EXCLUDED.product_id`,
        [normalizedAlias, productId]
    );
};

const ensureProductRowHasCanonicalShareCode = async (productRow) => {
    if (!productRow?.id) return productRow;
    const currentCode = String(productRow.product_code || '').trim();
    if (SHARE_CODE_PATTERN.test(currentCode)) return productRow;

    await rememberProductShareAlias(currentCode, productRow.id);
    const code = await generateUniqueProductCode();
    const updatedResult = await pool.query(
        `UPDATE market
         SET product_code = $1
         WHERE id = $2
         RETURNING *`,
        [code, productRow.id]
    );
    return updatedResult.rows[0] || { ...productRow, product_code: code };
};

const isSponsoredFeedItemId = (value) => typeof value === 'string' && value.startsWith('ad-');
const normalizeSponsoredAdId = (value) => isSponsoredFeedItemId(value) ? value.slice(3) : String(value || '').trim();

const normalizeSponsoredMediaGallery = (value, fallback = []) => {
    const baseFallback = Array.isArray(fallback) ? fallback : [fallback];
    const safeFallback = baseFallback.map((item) => String(item || '').trim()).filter(Boolean);

    if (!value) return safeFallback;
    if (Array.isArray(value)) {
        const normalized = value.map((item) => String(item || '').trim()).filter(Boolean);
        return normalized.length > 0 ? normalized : safeFallback;
    }

    const parsed = safeJsonParse(value, null);
    if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => String(item || '').trim()).filter(Boolean);
        return normalized.length > 0 ? normalized : safeFallback;
    }

    const singleValue = String(parsed || value || '').trim();
    return singleValue ? [singleValue] : safeFallback;
};

const parseRewardSettingAmount = (value, fallback) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
};

const ensureAdRewardSettingsTable = async (client = pool) => {
    if (sponsoredAdsRewardSettingsReady) return;

    await client.query(`
        CREATE TABLE IF NOT EXISTS ad_coin_reward_settings (
            id SERIAL PRIMARY KEY,
            user_reward_amount NUMERIC(12,2) NOT NULL DEFAULT 1.00,
            googer_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0.25,
            advertiser_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 1.25,
            required_watch_seconds INTEGER NOT NULL DEFAULT 5,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    sponsoredAdsRewardSettingsReady = true;
};

const getActiveAdCoinRewardSettings = async (client = pool) => {
    await ensureAdRewardSettingsTable(client);

    const result = await client.query(
        `SELECT id, user_reward_amount, googer_commission_amount, advertiser_charge_amount, required_watch_seconds, is_active
         FROM ad_coin_reward_settings
         WHERE is_active = TRUE
         ORDER BY id DESC
         LIMIT 1`
    );

    if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
            id: row.id,
            user_reward_amount: parseRewardSettingAmount(row.user_reward_amount, DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount),
            googer_commission_amount: parseRewardSettingAmount(row.googer_commission_amount, DEFAULT_AD_COIN_REWARD_SETTINGS.googer_commission_amount),
            advertiser_charge_amount: parseRewardSettingAmount(row.advertiser_charge_amount, DEFAULT_AD_COIN_REWARD_SETTINGS.advertiser_charge_amount),
            required_watch_seconds: Math.max(1, Math.floor(Number(row.required_watch_seconds || DEFAULT_AD_COIN_REWARD_SETTINGS.required_watch_seconds))),
            is_active: row.is_active !== false,
        };
    }

    await client.query(
        `INSERT INTO ad_coin_reward_settings (
            user_reward_amount,
            googer_commission_amount,
            advertiser_charge_amount,
            required_watch_seconds,
            is_active
        ) VALUES ($1, $2, $3, $4, TRUE)`,
        [
            DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount,
            DEFAULT_AD_COIN_REWARD_SETTINGS.googer_commission_amount,
            DEFAULT_AD_COIN_REWARD_SETTINGS.advertiser_charge_amount,
            DEFAULT_AD_COIN_REWARD_SETTINGS.required_watch_seconds,
        ]
    );

    return { ...DEFAULT_AD_COIN_REWARD_SETTINGS, is_active: true };
};

const mapActiveAdToMarketCard = (row, adCoinValue = DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount) => {
    const draft = safeJsonParse(row.edit_draft, row.edit_draft) || {};
    const mediaPreview = row.media_preview || draft.mediaPreview || draft.media_preview || draft.video_url || '';
    const canonicalShareCode = buildShortShareCode('a', row.ad_id || '', 8);
    const isProductPromote = String(row.campaign_type || '').trim().toLowerCase() === 'product promote';
    const originalProductId = row.original_product_id ?? row.linked_product_id ?? null;
    const originalProductCode = row.original_product_code ?? row.linked_product_share_code ?? null;
    const linkedProductId = row.linked_product_id ?? originalProductId ?? null;
    const linkedProductShareCode = row.linked_product_share_code ?? originalProductCode ?? null;

    return normalizeImageUrl({
        id: `ad-${row.ad_id}`,
        adId: row.ad_id,
        user_id: row.user_id,
        username: row.owner_username_joined || row.owner_username || 'Ads',
        owner_username: row.owner_username_joined || row.owner_username || 'Ads',
        title: row.title || row.description || row.campaign_type || 'Ads',
        description: row.description || '',
        category: row.campaign_type || 'Ads',
        sub_category: 'Ads',
        manual_category: 'Ads',
        stock: null,
        price: Number(row.budget || 0),
        promo_price: null,
        image_url: mediaPreview,
        main_image: mediaPreview,
        media_url: row.media_url || draft.mediaUrl || draft.media_url || draft.video_url || mediaPreview,
        thumbnail_url: mediaPreview,
        video_url: row.video_url || draft.video_url || row.media_url || mediaPreview,
        media_gallery: normalizeSponsoredMediaGallery(
            row.media_gallery,
            normalizeSponsoredMediaGallery(draft.mediaGallery, mediaPreview ? [mediaPreview] : [])
        ),
        status: 'approved',
        likes_count: Number(row.likes_count || 0),
        comments_count: Number(row.comments_count || 0),
        shares_count: Number(row.shares_count || 0),
        views_count: Number(row.views_count || 0),
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        link_actions: Number(row.clicks || 0),
        message_clicks: Number(row.message_clicks || 0),
        visit_clicks: Number(row.visit_clicks || 0),
        call_clicks: Number(row.call_clicks || 0),
        current_reach: Number(row.current_reach || row.reach || 0),
        variants: [],
        shipping_info: null,
        commission_info: null,
        createdAt: row.active_start_time || row.started_at ? new Date(row.active_start_time || row.started_at || row.created_at).toISOString() : (row.created_at ? new Date(row.created_at).toISOString() : null),
        created_at: row.active_start_time || row.started_at ? new Date(row.active_start_time || row.started_at || row.created_at).toISOString() : (row.created_at ? new Date(row.created_at).toISOString() : null),
        activeStartTime: row.active_start_time || row.started_at ? new Date(row.active_start_time || row.started_at).toISOString() : null,
        active_start_time: row.active_start_time || row.started_at ? new Date(row.active_start_time || row.started_at).toISOString() : null,
        startedAt: row.started_at || row.active_start_time ? new Date(row.started_at || row.active_start_time).toISOString() : null,
        started_at: row.started_at || row.active_start_time ? new Date(row.started_at || row.active_start_time).toISOString() : null,
        product_code: isProductPromote ? (linkedProductShareCode || row.product_code || null) : row.ad_id,
        share_code: isProductPromote ? (linkedProductShareCode || row.share_code || null) : canonicalShareCode,
        shareCode: isProductPromote ? (linkedProductShareCode || row.share_code || null) : canonicalShareCode,
        canonical_share_code: canonicalShareCode,
        canonical_share_path: `/share/${canonicalShareCode}`,
        profile_picture: row.profile_picture || null,
        user: {
            id: row.user_id,
            user_id: row.owner_user_id,
            username: row.owner_username_joined || row.owner_username || 'Ads',
            profile_picture: row.profile_picture || null,
        },
        seller_country: row.seller_country || null,
        seller_shipping_country: row.seller_shipping_country || null,
        purchases_count: 0,
        add_to_cart_count: 0,
        seller_rating: 0,
        seller_cancel_rate: 0,
        seller_fast_response: false,
        seller_verified: true,
        seller_reported: false,
        user_liked: !!row.user_liked,
        ad_coin_collected: !!row.ad_coin_collected,
        ad_like_locked: !!row.ad_coin_collected,
        ad_coin_value: Number(row.ad_coin_value || adCoinValue),
        media_preview: mediaPreview,
        campaign_type: row.campaign_type || 'Ads',
        media_type: row.media_type || '',
        active_link: draft.activeLink || '',
        cta_topic: draft.ctaTopic || 'Visit',
        cta_value: draft.ctaValue || '',
        original_product_id: originalProductId,
        original_product_code: originalProductCode,
        linked_product_id: linkedProductId,
        linked_product_share_code: linkedProductShareCode,
        linked_product_code: linkedProductShareCode,
        is_sponsored: true,
        sponsored_label: 'Ads',
    });
};

const mapSponsoredAdWithCurrentReward = async (row, client = pool) => {
    const rewardSettings = await getActiveAdCoinRewardSettings(client);
    return mapActiveAdToMarketCard(
        {
            ...row,
            ad_coin_value: rewardSettings.user_reward_amount,
        },
        rewardSettings.user_reward_amount
    );
};

const getMarketItemByNumericId = async (numericId) => pool.query(
    `SELECT m.*, u.username as owner_username, u.profile_picture, u.user_id AS owner_public_user_id
     FROM market m
     JOIN users u ON m.user_id = u.id
     WHERE m.id = $1
       AND COALESCE(u.is_deactivated, false) = false
       AND COALESCE(u.status, 'Active') <> 'Deactivated'`,
    [numericId]
);

const getMarketItemByProductCode = async (code) => pool.query(
    `SELECT m.*, u.username as owner_username, u.profile_picture, u.user_id AS owner_public_user_id
     FROM market m
     JOIN users u ON m.user_id = u.id
     WHERE m.product_code = $1
       AND COALESCE(u.is_deactivated, false) = false
       AND COALESCE(u.status, 'Active') <> 'Deactivated'`,
    [code]
);

const getPublicAdById = async (adId) => pool.query(
    `SELECT a.*, u.username as owner_username, u.profile_picture
     FROM ads a
     JOIN users u ON a.user_id = u.id
     WHERE a.ad_id = $1
       AND a.status = 'Active'
       AND COALESCE(u.is_deactivated, false) = false
       AND COALESCE(u.status, 'Active') <> 'Deactivated'`,
    [adId]
);

const getProductCodeCandidates = async () => pool.query(
    `SELECT m.id, m.product_code
     FROM market m
     JOIN users u ON m.user_id = u.id
     WHERE m.status IN ('approved', 'active')
       AND COALESCE(u.is_deactivated, false) = false
       AND COALESCE(u.status, 'Active') <> 'Deactivated'`
);

const getPublicProductByResolvedCode = async (resolvedCode) => pool.query(
    `SELECT m.*, u.username as owner_username, u.profile_picture
     FROM market m
     JOIN users u ON m.user_id = u.id
     WHERE (m.product_code = $1 OR LOWER(m.product_code) = LOWER($1) OR m.id::text = $1)
       AND COALESCE(u.is_deactivated, false) = false
       AND COALESCE(u.status, 'Active') <> 'Deactivated'`,
    [resolvedCode]
);

const getPublicProductByAliasCode = async (aliasCode) => pool.query(
    `SELECT m.*, u.username as owner_username, u.profile_picture
     FROM product_share_aliases psa
     JOIN market m ON m.id = psa.product_id
     JOIN users u ON m.user_id = u.id
     WHERE LOWER(psa.alias_code) = LOWER($1)
       AND COALESCE(u.is_deactivated, false) = false
       AND COALESCE(u.status, 'Active') <> 'Deactivated'
     LIMIT 1`,
    [aliasCode]
);

const getLinkedProductFromAdsByShareCode = async (normalizedShareCode) => {
    const adsHasLinkedProductId = await hasTableColumn('ads', 'linked_product_id');
    const adsHasLinkedProductShareCode = await hasTableColumn('ads', 'linked_product_share_code');
    const adsHasLinkedProductCode = await hasTableColumn('ads', 'linked_product_code');
    if (!adsHasLinkedProductId && !adsHasLinkedProductShareCode && !adsHasLinkedProductCode) {
        return { rows: [] };
    }

    const linkedClauses = [];
    if (adsHasLinkedProductId) linkedClauses.push('(a.linked_product_id IS NOT NULL AND m.id = a.linked_product_id)');
    if (adsHasLinkedProductShareCode) linkedClauses.push('(a.linked_product_share_code IS NOT NULL AND LOWER(m.product_code) = LOWER(a.linked_product_share_code))');
    if (adsHasLinkedProductCode) linkedClauses.push('(a.linked_product_code IS NOT NULL AND LOWER(m.product_code) = LOWER(a.linked_product_code))');

    const whereClauses = [];
    if (adsHasLinkedProductShareCode) whereClauses.push('LOWER(a.linked_product_share_code) = LOWER($1)');
    if (adsHasLinkedProductCode) whereClauses.push('LOWER(a.linked_product_code) = LOWER($1)');
    whereClauses.push('a.edit_draft::text ILIKE $2');

    return pool.query(
        `SELECT m.*, u.username as owner_username, u.profile_picture
         FROM ads a
         JOIN market m ON (${linkedClauses.join(' OR ')})
         JOIN users u ON m.user_id = u.id
         WHERE (${whereClauses.join(' OR ')})
           AND m.status IN ('approved', 'active', 'reviewing')
           AND COALESCE(u.is_deactivated, false) = false
           AND COALESCE(u.status, 'Active') <> 'Deactivated'
         LIMIT 1`,
        [normalizedShareCode, `%${normalizedShareCode}%`]
    );
};

const getLinkedProductFromAdsDraft = async (normalizedShareCode) => pool.query(
    `SELECT m.*, u.username as owner_username, u.profile_picture
     FROM ads a
     JOIN market m ON a.edit_draft::text ILIKE ('%' || m.product_code || '%')
     JOIN users u ON m.user_id = u.id
     WHERE a.edit_draft::text ILIKE $1
       AND m.status IN ('approved', 'active', 'reviewing')
       AND COALESCE(u.is_deactivated, false) = false
       AND COALESCE(u.status, 'Active') <> 'Deactivated'
     LIMIT 1`,
    [`%${normalizedShareCode}%`]
);

module.exports = {
    attachCurrentUser,
    buildShortShareCode,
    ensureMarketProductCodeColumn,
    ensureProductRowHasCanonicalShareCode,
    generateUniqueProductCode,
    getCanonicalProductShareCode,
    getLinkedProductFromAdsByShareCode,
    getLinkedProductFromAdsDraft,
    getMarketItemByNumericId,
    getMarketItemByProductCode,
    getProductCodeCandidates,
    getPublicAdById,
    getPublicProductByAliasCode,
    getPublicProductByResolvedCode,
    isSponsoredFeedItemId,
    mapSponsoredAdWithCurrentReward,
    normalizeSponsoredAdId,
    safeJsonParse,
};
