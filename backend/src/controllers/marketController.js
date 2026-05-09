const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const { saveUploadedFile } = require('../utils/localUpload');
const crypto = require('crypto');

let marketFeedSchemaReady = false;
const tableColumnCache = new Map();
const tableExistsCache = new Map();

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

const hasTable = async (tableName) => {
    if (tableExistsCache.has(tableName)) {
        return tableExistsCache.get(tableName);
    }

    const result = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) AS exists`,
        [tableName]
    );

    const exists = Boolean(result.rows[0]?.exists);
    tableExistsCache.set(tableName, exists);
    return exists;
};

const ensureMarketFeedSchema = async () => {
    if (marketFeedSchemaReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id SERIAL PRIMARY KEY,
            subscriber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subscribed_to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (subscriber_id, subscribed_to_id)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_blocks (
            id SERIAL PRIMARY KEY,
            blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (blocker_id, blocked_user_id)
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscriber_id
        ON user_subscriptions(subscriber_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscribed_to_id
        ON user_subscriptions(subscribed_to_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id
        ON user_blocks(blocker_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_user_id
        ON user_blocks(blocked_user_id);
    `);

    marketFeedSchemaReady = true;
};

const getOptionalAuthUser = (req) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.replace('Bearer ', '')
            : authHeader;

        if (!token) return null;

        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        if (!secret) return null;

        return jwt.verify(token, secret);
    } catch {
        return null;
    }
};

const normalizeText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const tokenizeKeywords = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return [];
    return normalized
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
};

const unique = (values) => Array.from(new Set((values || []).filter(Boolean)));

const safeJsonParse = (value, fallback = null) => {
    if (!value) return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const BASE64_IMAGE_DATA_URL_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;
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

const getDataUrlFallback = (...sources) => {
    for (const source of sources) {
        const parsed = safeJsonParse(source, source);
        const values = Array.isArray(parsed) ? parsed : [parsed];
        for (const value of values) {
            const raw = getRawMediaValue(value);
            if (raw.startsWith('data:')) return raw;
        }
    }
    return '';
};

const normalizeFeedMediaList = (...sources) => {
    const output = [];
    for (const source of sources) {
        const parsed = safeJsonParse(source, source);
        const values = Array.isArray(parsed) ? parsed : [parsed];
        for (const value of values) {
            const url = getMediaUrl(value);
            if (url && !output.includes(url)) output.push(url);
        }
    }
    return output;
};

const stripFeedMediaPayload = (item) => {
    if (!item) return item;
    const variants = safeJsonParse(item.variants, item.variants);
    const variantImages = Array.isArray(variants)
        ? variants.flatMap((variant) => [variant?.url, variant?.image_url, variant?.image])
        : [];
    const mediaGallery = normalizeFeedMediaList(
        item.images,
        item.media_gallery,
        item.image_url,
        item.main_image,
        item.media_url,
        item.thumbnail_url,
        item.media_preview,
        variantImages,
    );
    const dataUrlFallback = getDataUrlFallback(
        item.image_url,
        item.main_image,
        item.media_url,
        item.thumbnail_url,
        item.media_preview,
        item.media_gallery,
        item.images,
        variantImages,
    );
    const primaryImage = mediaGallery[0] || dataUrlFallback || '/assets/images/googer.png';

    return {
        ...item,
        image_url: getMediaUrl(item.image_url) || getRawMediaValue(item.image_url) || primaryImage,
        main_image: getMediaUrl(item.main_image) || getMediaUrl(item.image_url) || getRawMediaValue(item.main_image) || primaryImage,
        media_url: getMediaUrl(item.media_url) || getMediaUrl(item.media_preview) || getRawMediaValue(item.media_url) || primaryImage,
        thumbnail_url: getMediaUrl(item.thumbnail_url) || getRawMediaValue(item.thumbnail_url) || primaryImage,
        media_preview: getMediaUrl(item.media_preview) || getMediaUrl(item.image_url) || getRawMediaValue(item.media_preview) || primaryImage,
        media_gallery: mediaGallery,
        images: mediaGallery.length ? mediaGallery : (dataUrlFallback ? [dataUrlFallback] : []),
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
    return {
        ...row,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
        username,
        owner_username: username,
        profile_picture: profilePicture,
        share_code: row.product_code || String(row.id || ''),
        user: {
            id: row.user_id,
            user_id: row.owner_user_id,
            username,
            profile_picture: profilePicture,
        },
    };
};

const getProductCountry = (product) => {
    const candidates = [];

    const shippingInfo = safeJsonParse(product.shipping_info, product.shipping_info);
    if (Array.isArray(shippingInfo?.rates)) {
        for (const rate of shippingInfo.rates) {
            if (typeof rate?.country === 'string') candidates.push(rate.country);
        }
    }

    if (Array.isArray(shippingInfo?.available_countries)) {
        for (const country of shippingInfo.available_countries) {
            if (typeof country === 'string') candidates.push(country);
            if (typeof country?.country === 'string') candidates.push(country.country);
        }
    }

    if (typeof shippingInfo?.country === 'string') candidates.push(shippingInfo.country);
    if (typeof shippingInfo?.region === 'string') candidates.push(shippingInfo.region);
    if (typeof product.seller_country === 'string') candidates.push(product.seller_country);
    if (typeof product.seller_shipping_country === 'string') candidates.push(product.seller_shipping_country);

    return normalizeText(candidates.find(Boolean) || '');
};

const getSeededRandom = (seedInput) => {
    const seed = String(seedInput || '');
    let hash = 0;

    for (let index = 0; index < seed.length; index += 1) {
        hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
    }

    const normalized = Math.abs(hash % 10000) / 10000;
    return normalized * 20;
};

const shuffleItemsWithSeed = (items, seed, getKey) => (
    [...items].sort((first, second) => {
        const firstScore = getSeededRandom(`${seed}:${getKey(first)}`);
        const secondScore = getSeededRandom(`${seed}:${getKey(second)}`);
        return firstScore - secondScore;
    })
);

const buildUserInterestProfile = (userRow, options = {}) => {
    const viewedCategories = unique((options.viewRows || []).map((row) => normalizeText(row.category)));
    const viewedTitleKeywords = unique((options.viewRows || []).flatMap((row) => tokenizeKeywords(row.title)));
    const explicitSearchKeywords = unique([
        ...tokenizeKeywords(options.searchQuery),
        ...tokenizeKeywords(options.searchKeyword),
    ]);

    return {
        userId: userRow?.id || null,
        country: normalizeText(userRow?.country || userRow?.shipping_country || ''),
        viewedCategories,
        searchKeywords: explicitSearchKeywords.length > 0 ? explicitSearchKeywords : viewedTitleKeywords.slice(0, 12),
        followedSellerIds: new Set((options.followingRows || []).map((row) => Number(row.subscribed_to_id)).filter(Boolean)),
        blockedSellerIds: new Set((options.blockedRows || []).map((row) => Number(row.blocked_user_id)).filter(Boolean)),
    };
};

const calculateFreshnessScore = (createdAt) => {
    const createdTime = new Date(createdAt).getTime();
    if (!Number.isFinite(createdTime)) return 5;

    const hoursOld = (Date.now() - createdTime) / 36e5;
    if (hoursOld <= 1) return 50;
    if (hoursOld <= 24) return 30;
    if (hoursOld <= 168) return 15;
    return 5;
};

const calculateSellerQualityScore = (product) => {
    let sellerQuality = 0;

    if (product.seller_verified) sellerQuality += 20;
    if (Number(product.seller_rating || 0) >= 4.5) sellerQuality += 20;
    if (product.seller_fast_response) sellerQuality += 10;
    if (Number(product.seller_cancel_rate || 0) > 20) sellerQuality -= 30;
    if (product.seller_reported) sellerQuality -= 50;

    return sellerQuality;
};

const calculateProductScore = (product, userProfile, randomSeed) => {
    let relevance = 0;
    let engagement = 0;

    const productCategory = normalizeText(product.category);
    const productTitle = normalizeText(product.title);
    const productCountry = getProductCountry(product);

    if (userProfile.viewedCategories.includes(productCategory)) relevance += 40;
    if (userProfile.searchKeywords.some((keyword) => productTitle.includes(keyword))) relevance += 30;
    if (userProfile.country && productCountry && userProfile.country === productCountry) relevance += 20;
    if (userProfile.followedSellerIds.has(Number(product.user_id))) relevance += 10;

    engagement += Number(product.views_count || 0) * 1;
    engagement += Number(product.likes_count || 0) * 3;
    engagement += Number(product.comments_count || 0) * 4;
    engagement += Number(product.shares_count || 0) * 5;
    engagement += Number(product.add_to_cart_count || 0) * 8;
    engagement += Number(product.purchases_count || 0) * 15;

    const freshness = calculateFreshnessScore(product.created_at);
    const sellerQuality = calculateSellerQualityScore(product);
    const randomBoost = getSeededRandom(randomSeed);

    const finalScore = (
        relevance * 0.35 +
        engagement * 0.25 +
        freshness * 0.20 +
        sellerQuality * 0.10 +
        randomBoost * 0.10
    );

    return {
        relevance,
        engagement,
        freshness,
        sellerQuality,
        randomBoost,
        finalScore,
    };
};

const parseSeenProductIds = (rawValue) => {
    if (!rawValue) return [];

    return String(rawValue)
        .split(',')
        .map((value) => Number(String(value).trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
};

const parseLastShownOrder = (rawValue) => {
    if (!rawValue) return [];

    return String(rawValue)
        .split(',')
        .map((value) => String(value).trim())
        .filter(Boolean);
};

const SHARE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const UPPERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERS = 'abcdefghijklmnopqrstuvwxyz';
const SHARE_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;

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

const PRODUCT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRODUCT_CODE_LENGTH = 8;

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

let productShareCodesReady = false;
let productShareCodeColumnReady = false;
const ensureMarketProductCodeColumn = async () => {
    if (productShareCodeColumnReady) return;

    await pool.query(`ALTER TABLE market ADD COLUMN IF NOT EXISTS product_code VARCHAR(32);`);
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

const ensureMarketProductShareCodes = async () => {
    if (productShareCodesReady) return;

    await ensureMarketProductCodeColumn();

    const invalidResult = await pool.query(`
        SELECT id
        FROM market
        WHERE product_code IS NULL
           OR product_code = ''
           OR product_code !~ '^[0-9A-Za-z]{8}$'
    `);

    for (const row of invalidResult.rows || []) {
        const oldCodeResult = await pool.query('SELECT product_code FROM market WHERE id = $1', [row.id]);
        await rememberProductShareAlias(oldCodeResult.rows[0]?.product_code, row.id);
        const code = await generateUniqueProductCode();
        await pool.query('UPDATE market SET product_code = $1 WHERE id = $2', [code, row.id]);
    }

    const duplicateResult = await pool.query(`
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY LOWER(product_code) ORDER BY id) AS rn
            FROM market
            WHERE product_code ~ '^[0-9A-Za-z]{8}$'
        ) ranked
        WHERE rn > 1
    `);

    for (const row of duplicateResult.rows || []) {
        const code = await generateUniqueProductCode();
        await pool.query('UPDATE market SET product_code = $1 WHERE id = $2', [code, row.id]);
    }

    productShareCodesReady = true;
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

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return safeFallback;

        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                const normalized = parsed.map((item) => String(item || '').trim()).filter(Boolean);
                return normalized.length > 0 ? normalized : safeFallback;
            }
        } catch (_error) {
            return [trimmed, ...safeFallback].filter((item, index, array) => array.indexOf(item) === index);
        }
    }

    return safeFallback;
};

const toUtcIso = (value) => (value ? new Date(value).toISOString() : null);

let sponsoredAdsEngagementReady = false;
const DEFAULT_AD_COIN_REWARD_SETTINGS = {
    user_reward_amount: 1.00,
    googer_commission_amount: 0.25,
    advertiser_charge_amount: 1.25,
};
const DIRECT_VIDEO_PATTERN = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;
const EMBED_VIDEO_PATTERN = /(?:youtube\.com\/watch|youtu\.be\/|tiktok\.com\/|fb\.watch|facebook\.com\/.*\/videos\/|\/videos\/|\/watch\/|\?v=)/i;

const getSponsoredAdActiveLink = (adRow) => {
    const draft = safeJsonParse(adRow?.edit_draft, adRow?.edit_draft);
    return String(draft?.activeLink || adRow?.active_link || '').trim();
};

const isSponsoredVideoAd = (adRow) => {
    const mediaType = normalizeText(adRow?.media_type || '');
    if (mediaType.includes('video')) return true;

    const activeLink = getSponsoredAdActiveLink(adRow);
    if (!activeLink) return false;

    return DIRECT_VIDEO_PATTERN.test(activeLink) || EMBED_VIDEO_PATTERN.test(activeLink);
};

const ensureSponsoredAdsEngagementSchema = async () => {
    if (sponsoredAdsEngagementReady) return;
    if (!(await hasTable('ads'))) return;

    await pool.query(`
        ALTER TABLE ads
        ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS linked_product_id INTEGER,
        ADD COLUMN IF NOT EXISTS linked_product_share_code VARCHAR(32),
        ADD COLUMN IF NOT EXISTS original_product_id INTEGER,
        ADD COLUMN IF NOT EXISTS original_product_code VARCHAR(32);
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ad_likes (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(20) NOT NULL REFERENCES ads(ad_id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ad_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS ad_comments (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(20) NOT NULL REFERENCES ads(ad_id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            comment TEXT NOT NULL,
            parent_id INTEGER NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ad_shares (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(20) NOT NULL REFERENCES ads(ad_id) ON DELETE CASCADE,
            user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ad_views (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(20) NOT NULL REFERENCES ads(ad_id) ON DELETE CASCADE,
            user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
            ip_address TEXT,
            last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        CREATE TABLE IF NOT EXISTS ad_coin_reward_settings (
            id SERIAL PRIMARY KEY,
            user_reward_amount DECIMAL(10, 2) DEFAULT 1.00,
            googer_commission_amount DECIMAL(10, 2) DEFAULT 0.25,
            advertiser_charge_amount DECIMAL(10, 2) DEFAULT 1.25,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ad_coin_collections (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(80) NOT NULL,
            ad_type VARCHAR(80) NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
            commission DECIMAL(10, 2) NOT NULL DEFAULT 0.25,
            advertiser_charge DECIMAL(10, 2) NOT NULL DEFAULT 1.25,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ad_id, ad_type, user_id)
        );

        CREATE TABLE IF NOT EXISTS ad_video_watch_eligibility (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(20) NOT NULL REFERENCES ads(ad_id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            watched_seconds INTEGER NOT NULL DEFAULT 0,
            eligible_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ad_id, user_id)
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_ad_likes_ad_id ON ad_likes(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_comments_ad_id ON ad_comments(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_shares_ad_id ON ad_shares(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_views_ad_id ON ad_views(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_like_coin_rewards_ad_id ON ad_like_coin_rewards(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_like_coin_rewards_user_id ON ad_like_coin_rewards(user_id);
        CREATE INDEX IF NOT EXISTS idx_ad_coin_reward_settings_active ON ad_coin_reward_settings(is_active);
        CREATE INDEX IF NOT EXISTS idx_ad_coin_collections_ad_id ON ad_coin_collections(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_coin_collections_user_id ON ad_coin_collections(user_id);
        CREATE INDEX IF NOT EXISTS idx_ad_video_watch_eligibility_ad_id ON ad_video_watch_eligibility(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_video_watch_eligibility_user_id ON ad_video_watch_eligibility(user_id);
    `);

    await pool.query(`
        ALTER TABLE ad_likes ALTER COLUMN ad_id TYPE VARCHAR(80);
        ALTER TABLE ad_comments ALTER COLUMN ad_id TYPE VARCHAR(80);
        ALTER TABLE ad_shares ALTER COLUMN ad_id TYPE VARCHAR(80);
        ALTER TABLE ad_views ALTER COLUMN ad_id TYPE VARCHAR(80);
        ALTER TABLE ad_like_coin_rewards ALTER COLUMN ad_id TYPE VARCHAR(80);
        ALTER TABLE ad_video_watch_eligibility ALTER COLUMN ad_id TYPE VARCHAR(80);

        ALTER TABLE ad_coin_collections
            ADD COLUMN IF NOT EXISTS reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
            ADD COLUMN IF NOT EXISTS commission DECIMAL(10, 2) NOT NULL DEFAULT 0.25,
            ADD COLUMN IF NOT EXISTS advertiser_charge DECIMAL(10, 2) NOT NULL DEFAULT 1.25;

        ALTER TABLE ad_coin_reward_settings
            ADD COLUMN IF NOT EXISTS user_reward_amount DECIMAL(10, 2) DEFAULT 1.00,
            ADD COLUMN IF NOT EXISTS googer_commission_amount DECIMAL(10, 2) DEFAULT 0.25,
            ADD COLUMN IF NOT EXISTS advertiser_charge_amount DECIMAL(10, 2) DEFAULT 1.25,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    const activeRewardResult = await pool.query(
        `SELECT id
         FROM ad_coin_reward_settings
         WHERE is_active = TRUE
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`
    );
    if (activeRewardResult.rows.length === 0) {
        await pool.query(
            `INSERT INTO ad_coin_reward_settings (
                user_reward_amount,
                googer_commission_amount,
                advertiser_charge_amount,
                is_active
            ) VALUES ($1, $2, $3, TRUE)`,
            [
                DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount,
                DEFAULT_AD_COIN_REWARD_SETTINGS.googer_commission_amount,
                DEFAULT_AD_COIN_REWARD_SETTINGS.advertiser_charge_amount,
            ]
        );
    }

    sponsoredAdsEngagementReady = true;
};

const normalizeAdType = (value) => {
    const text = String(value || '').trim();
    return text || 'Ads';
};

const parseRewardSettingAmount = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : fallback;
};

const getActiveAdCoinRewardSettings = async (client = pool) => {
    await ensureSponsoredAdsEngagementSchema();

    const result = await client.query(
        `SELECT id, user_reward_amount, googer_commission_amount, advertiser_charge_amount, is_active
         FROM ad_coin_reward_settings
         WHERE is_active = TRUE
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`
    );

    if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
            id: row.id,
            user_reward_amount: parseRewardSettingAmount(row.user_reward_amount, DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount),
            googer_commission_amount: parseRewardSettingAmount(row.googer_commission_amount, DEFAULT_AD_COIN_REWARD_SETTINGS.googer_commission_amount),
            advertiser_charge_amount: parseRewardSettingAmount(row.advertiser_charge_amount, DEFAULT_AD_COIN_REWARD_SETTINGS.advertiser_charge_amount),
            is_active: row.is_active !== false,
        };
    }

    await client.query(
        `INSERT INTO ad_coin_reward_settings (
            user_reward_amount,
            googer_commission_amount,
            advertiser_charge_amount,
            is_active
        ) VALUES ($1, $2, $3, TRUE)`,
        [
            DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount,
            DEFAULT_AD_COIN_REWARD_SETTINGS.googer_commission_amount,
            DEFAULT_AD_COIN_REWARD_SETTINGS.advertiser_charge_amount,
        ]
    );

    return { ...DEFAULT_AD_COIN_REWARD_SETTINGS, is_active: true };
};

const getGoogerWalletUserId = async (client = pool) => {
    const result = await client.query(
        `SELECT id
         FROM users
         WHERE LOWER(username) = 'googer'
            OR LOWER(COALESCE(user_type, '')) = 'admin'
            OR id = 1
         ORDER BY
            CASE
                WHEN LOWER(username) = 'googer' THEN 0
                WHEN LOWER(COALESCE(user_type, '')) = 'admin' THEN 1
                WHEN id = 1 THEN 2
                ELSE 3
            END,
            id ASC
         LIMIT 1`
    );

    return result.rows[0]?.id || null;
};

const hasCollectedCoinForPromotedProduct = async (client, marketId, userId) => {
    const result = await client.query(
        `WITH product_match AS (
            SELECT id, product_code
            FROM market
            WHERE id = $1
            LIMIT 1
        )
        SELECT 1
        FROM ad_coin_collections acc
        JOIN ads a ON a.ad_id = acc.ad_id
        LEFT JOIN product_match p ON TRUE
        WHERE acc.user_id = $2
          AND LOWER(COALESCE(a.campaign_type, '')) = 'product promote'
          AND (
                a.edit_draft::text ILIKE ('%' || $1::text || '%')
                OR (p.product_code IS NOT NULL AND a.edit_draft::text ILIKE ('%' || p.product_code || '%'))
                OR acc.ad_type = 'Product Promote'
          )
        LIMIT 1`,
        [marketId, userId]
    );

    return result.rows.length > 0;
};

const AD_COIN_REWARD_VALUE_SQL = `COALESCE(
    (
        SELECT r.user_reward_amount
        FROM ad_coin_reward_settings r
        WHERE r.is_active = TRUE
        ORDER BY r.updated_at DESC, r.id DESC
        LIMIT 1
    ),
    ${DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount}
)`;

const rotateItems = (items, offset) => {
    if (!Array.isArray(items) || items.length <= 1) return [...(items || [])];

    const normalizedOffset = ((offset % items.length) + items.length) % items.length;
    if (normalizedOffset === 0) {
        return [...items];
    }

    return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
};

const hasSameOrder = (items, lastShownOrder) => {
    if (!Array.isArray(items) || !Array.isArray(lastShownOrder) || !items.length || items.length !== lastShownOrder.length) {
        return false;
    }

    return items.every((item, index) => String(item?.id) === String(lastShownOrder[index]));
};

const searchMatchesItem = (item, searchTerm) => {
    if (!searchTerm) return false;

    const haystack = [
        item.title,
        item.description,
        item.category,
        item.sub_category,
        item.manual_category,
        item.username,
        item.owner_username,
        item.product_code,
        item.adId,
        item.campaign_type,
    ]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(' ');

    return haystack.includes(searchTerm);
};

const getSeenPenalty = (productId, seenProductIds) => {
    const matches = seenProductIds.filter((seenId) => Number(seenId) === Number(productId)).length;
    return matches * 18;
};

const getBucketName = (product) => {
    if (product?.is_sponsored) return 'sponsored';
    if (Number(product.relevance_score || 0) >= 30) return 'recommended';
    if (Number(product.freshness_score || 0) >= 30) return 'new';
    if (Number(product.engagement_score || 0) >= 40) return 'popular';
    return 'discovery';
};

const pickNextDiverseProduct = (buckets, orderedBucketNames, state, requestSeed) => {
    const recentlyUsedSellers = state.recentSellers.slice(-2);
    const recentlyUsedCategories = state.recentCategories.slice(-2);

    const tryTakeFromBucket = (bucketName, allowRepeat = false) => {
        const bucket = buckets[bucketName] || [];

        for (let index = 0; index < bucket.length; index += 1) {
            const candidate = bucket[index];
            const sellerKey = String(candidate.user_id || '');
            const categoryKey = normalizeText(candidate.category) || 'uncategorized';

            if (!allowRepeat) {
                if (recentlyUsedSellers.includes(sellerKey)) continue;
                if (recentlyUsedCategories.includes(categoryKey)) continue;
            }

            bucket.splice(index, 1);
            return candidate;
        }

        return null;
    };

    for (const bucketName of orderedBucketNames) {
        const candidate = tryTakeFromBucket(bucketName, false);
        if (candidate) return candidate;
    }

    for (const bucketName of orderedBucketNames) {
        const candidate = tryTakeFromBucket(bucketName, true);
        if (candidate) return candidate;
    }

    const fallbackNames = Object.keys(buckets).filter((bucketName) => (buckets[bucketName] || []).length > 0);
    for (const bucketName of fallbackNames) {
        const bucket = buckets[bucketName];
        if (!bucket.length) continue;

        bucket.sort((first, second) => {
            const firstTie = getSeededRandom(`${requestSeed}:${bucketName}:${first.id}:fallback`) * 0.01;
            const secondTie = getSeededRandom(`${requestSeed}:${bucketName}:${second.id}:fallback`) * 0.01;
            return (second.feed_score + secondTie) - (first.feed_score + firstTie);
        });

        return bucket.shift() || null;
    }

    return null;
};

const smartFeedMix = (products, requestSeed) => {
    const buckets = {
        recommended: [],
        new: [],
        popular: [],
        discovery: [],
        sponsored: [],
    };

    for (const product of products) {
        const bucketName = getBucketName(product);
        buckets[bucketName].push(product);
    }

    Object.entries(buckets).forEach(([bucketName, bucket]) => {
        bucket.sort((first, second) => {
            const firstTie = getSeededRandom(`${requestSeed}:${bucketName}:${first.id}:bucket`) * 0.01;
            const secondTie = getSeededRandom(`${requestSeed}:${bucketName}:${second.id}:bucket`) * 0.01;
            return (second.feed_score + secondTie) - (first.feed_score + firstTie);
        });
    });

    const pattern = [
        ['recommended', 'popular', 'new', 'discovery'],
        ['new', 'recommended', 'popular', 'discovery'],
        ['popular', 'recommended', 'new', 'discovery'],
        ['discovery', 'new', 'popular', 'recommended'],
        ['recommended', 'discovery', 'new', 'popular'],
        ['sponsored', 'discovery', 'popular', 'new', 'recommended'],
        ['recommended', 'popular', 'discovery', 'new'],
        ['new', 'popular', 'recommended', 'discovery'],
    ];

    const mixed = [];
    const state = {
        recentSellers: [],
        recentCategories: [],
    };

    let slotIndex = 0;
    while (mixed.length < products.length) {
        const orderedBucketNames = pattern[slotIndex % pattern.length];
        const nextProduct = pickNextDiverseProduct(buckets, orderedBucketNames, state, requestSeed);
        if (!nextProduct) break;

        mixed.push(nextProduct);
        state.recentSellers.push(String(nextProduct.user_id || ''));
        state.recentCategories.push(normalizeText(nextProduct.category) || 'uncategorized');
        slotIndex += 1;
    }

    return mixed;
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

    return {
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
            normalizeSponsoredMediaGallery(draft.mediaGallery, mediaPreview ? [mediaPreview] : []),
        ),
        status: 'approved',
        likes_count: Number(row.likes_count || 0),
        comments_count: Number(row.comments_count || 0),
        shares_count: Number(row.shares_count || 0),
        views_count: Number(row.impressions || 0),
        variants: [],
        shipping_info: null,
        commission_info: null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
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
    };
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

const applyDiversityRules = (products) => {
    const finalFeed = [];
    const deferredFeed = [];
    const sellerCount = {};
    const categoryCount = {};

    for (const product of products) {
        const sellerKey = String(product.user_id || '');
        const categoryKey = normalizeText(product.category) || 'uncategorized';
        const sellerUsed = sellerCount[sellerKey] || 0;
        const categoryUsed = categoryCount[categoryKey] || 0;

        if (sellerUsed >= 2 || categoryUsed >= 4) {
            deferredFeed.push(product);
            continue;
        }

        finalFeed.push(product);
        sellerCount[sellerKey] = sellerUsed + 1;
        categoryCount[categoryKey] = categoryUsed + 1;
    }

    return [...finalFeed, ...deferredFeed];
};

const lightlyShuffleRankedProducts = (products, requestSeed) => {
    const windowSize = Math.min(4, Math.max(products.length, 1));
    const shuffled = [];

    for (let index = 0; index < products.length; index += windowSize) {
        const chunk = [...products.slice(index, index + windowSize)];
        chunk.sort((first, second) => {
            const firstJitter = getSeededRandom(`${requestSeed}:${first.id}:window`) * 0.01;
            const secondJitter = getSeededRandom(`${requestSeed}:${second.id}:window`) * 0.01;
            return secondJitter - firstJitter;
        });

        if (chunk.length > 1) {
            const rotationOffset = (Math.floor(getSeededRandom(`${requestSeed}:${index}:rotate`) * (chunk.length - 1)) + 1) % chunk.length;
            shuffled.push(...rotateItems(chunk, rotationOffset));
        } else {
            shuffled.push(...chunk);
        }
    }

    return shuffled;
};

const normalizeProductPromotePriceFields = (linkedProduct, fallbackAd = {}) => {
    const resolvedPrice = Number(
        linkedProduct?.price ??
        linkedProduct?.main_price ??
        linkedProduct?.product_price ??
        fallbackAd?.price ??
        fallbackAd?.main_price ??
        fallbackAd?.product_price ??
        0
    );
    const resolvedPromoPrice = linkedProduct?.promo_price ?? fallbackAd?.promo_price ?? null;

    return {
        price: Number.isFinite(resolvedPrice) ? resolvedPrice : 0,
        promo_price: resolvedPromoPrice !== null && resolvedPromoPrice !== undefined && resolvedPromoPrice !== ""
            ? Number(resolvedPromoPrice)
            : null,
    };
};

const deriveVariantSizes = (variants) => {
    if (!Array.isArray(variants)) return [];
    return Array.from(new Set(variants.map((variant) => String(variant?.size || variant?.value || variant?.label || "").trim()).filter(Boolean)));
};

const deriveVariantColors = (variants) => {
    if (!Array.isArray(variants)) return [];
    return Array.from(new Set(variants.map((variant) => String(variant?.color || variant?.name || "").trim()).filter(Boolean)));
};

let googShareLookupReady = false;
const ensureGoogShareLookupReady = async () => {
    if (googShareLookupReady) return;

    await pool.query(`ALTER TABLE goog_posts ADD COLUMN IF NOT EXISTS share_code VARCHAR(32);`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS goog_share_aliases (
            id SERIAL PRIMARY KEY,
            alias_code VARCHAR(32) UNIQUE NOT NULL,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_goog_share_aliases_alias_code
        ON goog_share_aliases(alias_code);
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_goog_posts_share_code_unique
        ON goog_posts (LOWER(share_code))
        WHERE share_code IS NOT NULL AND share_code <> ''
    `);

    const rememberGoogAlias = async (aliasCode, googId) => {
        const normalizedAlias = String(aliasCode || '').trim();
        if (!normalizedAlias || /^[0-9A-Za-z]{8}$/.test(normalizedAlias) || !googId) return;
        await pool.query(
            `INSERT INTO goog_share_aliases (alias_code, goog_id)
             VALUES ($1, $2)
             ON CONFLICT (alias_code) DO UPDATE SET goog_id = EXCLUDED.goog_id`,
            [normalizedAlias, googId]
        );
    };

    const invalidResult = await pool.query(`
        SELECT id, share_code
        FROM goog_posts
        WHERE share_code IS NULL
           OR share_code = ''
           OR share_code !~ '^[0-9A-Za-z]{8}$'
    `);

    for (const row of invalidResult.rows || []) {
        await rememberGoogAlias(row.share_code, row.id);
        const canonicalCode = buildShortShareCode('g', row.id, 8);
        await pool.query('UPDATE goog_posts SET share_code = $1 WHERE id = $2', [canonicalCode, row.id]);
    }

    const duplicateResult = await pool.query(`
        SELECT id, share_code
        FROM (
            SELECT id, share_code,
                   ROW_NUMBER() OVER (PARTITION BY LOWER(share_code) ORDER BY id) AS rn
            FROM goog_posts
            WHERE share_code ~ '^[0-9A-Za-z]{8}$'
        ) ranked
        WHERE rn > 1
    `);

    for (const row of duplicateResult.rows || []) {
        await rememberGoogAlias(row.share_code, row.id);
        const canonicalCode = buildShortShareCode('g', `dup:${row.id}`, 8);
        await pool.query('UPDATE goog_posts SET share_code = $1 WHERE id = $2', [canonicalCode, row.id]);
    }

    googShareLookupReady = true;
};

const mapGoogShareResponse = (row) => {
    const storedCode = String(row?.share_code || '').trim();
    const canonicalShareCode = /^[0-9A-Za-z]{8}$/.test(storedCode)
        ? storedCode
        : buildShortShareCode('g', row?.id);

    return {
        id: Number(row.id),
        text: row.text,
        textColor: row.text_color || '#FFFFFF',
        createdAt: toUtcIso(row.created_at),
        created_at: toUtcIso(row.created_at),
        updatedAt: toUtcIso(row.updated_at),
        updated_at: toUtcIso(row.updated_at),
        likes: Number(row.likes_count || 0),
        comments: Number(row.comments_count || 0),
        views: Number(row.views_count || 0),
        reposts: 0,
        shares: Number(row.shares_count || 0),
        liked: false,
        user: {
            id: row.user_id,
            username: row.username || '',
            name: row.full_name || row.username || 'User',
            img: row.profile_picture || '/assets/images/avatars/avatar-default.jpg',
        },
        share_code: canonicalShareCode,
        shareCode: canonicalShareCode,
        canonical_share_code: canonicalShareCode,
        canonical_share_path: `/share/${canonicalShareCode}`,
    };
};

// Create a new market item
exports.createMarketItem = async (req, res) => {
    try {
        const {
            title, description, price, promo_price, category, sub_category, level3_category, manual_category, stock,
            variants_data, shipping_data, payment_data, warranty_data,
            return_data, delivery_data, commission_data, links_data
        } = req.body;

        const userId = req.user.id;

        // Fetch real username and 6-digit user_id (string) from users table
        const userResult = await pool.query('SELECT username, user_id FROM users WHERE id = $1', [userId]);
        const username = userResult.rows.length > 0 ? userResult.rows[0].username : 'Unknown User';
        const owner_user_id = userResult.rows.length > 0 ? userResult.rows[0].user_id : null;

        // Parse incoming JSON strings from FormData with error handling
        let variants = [];
        let shipping_info = {};
        let payment_methods = [];
        let warranty_info = {};
        let return_policy = {};
        let delivery_info = {};
        let commission_info = {};
        let links_info = [];

        try {
            if (variants_data && variants_data !== 'undefined') variants = JSON.parse(variants_data);
            if (shipping_data && shipping_data !== 'undefined') shipping_info = JSON.parse(shipping_data);
            if (payment_data && payment_data !== 'undefined') payment_methods = JSON.parse(payment_data);
            if (warranty_data && warranty_data !== 'undefined') warranty_info = JSON.parse(warranty_data);
            if (return_data && return_data !== 'undefined') return_policy = JSON.parse(return_data);
            if (delivery_data && delivery_data !== 'undefined') delivery_info = JSON.parse(delivery_data);
            if (commission_data && commission_data !== 'undefined') commission_info = JSON.parse(commission_data);
            if (links_data && links_data !== 'undefined') links_info = JSON.parse(links_data);
        } catch (parseErr) {
            console.error('❌ JSON Parse Error:', parseErr);
            return res.status(400).json({ success: false, message: 'Invalid data format provided' });
        }

        // Handle Image Uploads (Match req.files to variants requiring an upload)
        let fileIndex = 0;
        let gallery = [];

        const createdVariants = [];
        for (const v of variants) {
            const needsUploadedImage = v.image_url && v.image_url.startsWith('blob:');
            const needsUploadedVideo = v.media_type === 'video' && v.video_url && v.video_url.startsWith('blob:');

            // Match uploaded files to variants that still point at a temporary blob URL.
            if (needsUploadedImage || needsUploadedVideo) {
                if (req.files && req.files[fileIndex]) {
                    const file = req.files[fileIndex];
                    const url = await saveUploadedFile(file, needsUploadedVideo ? 'product-videos' : 'products');
                    const updatedV = {
                        ...v,
                        ...(needsUploadedImage ? { url, image_url: url } : {}),
                        ...(needsUploadedVideo ? { video_url: url } : {}),
                    };
                    gallery.push({ url: updatedV.image_url || url, color: v.color || null });
                    fileIndex++;
                    createdVariants.push(updatedV);
                    continue;
                }
            }
            // If it's already a data: or http URL, keep it
            if (v.image_url) {
                gallery.push({ url: v.image_url, color: v.color || null });
            }
            createdVariants.push(v);
        }
        variants = createdVariants;

        const imageUrl = gallery.length > 0 ? gallery[0].url : (variants[0]?.image_url || null);

        if (!title || !price || !category) {
            return res.status(400).json({ success: false, message: 'Title, price, and category are required' });
        }

        if (!imageUrl) {
            return res.status(400).json({ success: false, message: 'At least one image is required' });
        }

        await ensureMarketProductShareCodes();

        const parsedVariants = Array.isArray(variants) ? variants : [];
        const aggregateStock = parsedVariants.reduce((acc, v) => {
            const subSelections = v.selections || [];
            if (subSelections.length > 0) {
                return acc + subSelections.reduce((sAcc, s) => sAcc + (parseInt(s.stock) || 0), 0);
            }
            return acc + (parseInt(v.stock || v.quantity) || 0);
        }, 0);

        const productCode = await generateUniqueProductCode();
        const numericPrice = parseFloat(price);
        const numericPromoPrice = promo_price ? parseFloat(promo_price) : null;

        const newItem = await pool.query(
            `INSERT INTO market (
                user_id, owner_user_id, username, title, description, price, promo_price, category, 
                sub_category, level3_category, manual_category, stock, image_url, status,
                variants, shipping_info, payment_methods, warranty_info, return_policy, delivery_info, commission_info, links_data,
                product_code
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'reviewing', $14, $15, $16, $17, $18, $19, $20, $21, $22)
             RETURNING *`,
            [
                userId, owner_user_id, username, title, description, numericPrice, numericPromoPrice, category,
                sub_category, level3_category, manual_category, (parsedVariants.length > 0 ? aggregateStock : (parseInt(stock) || 0)), imageUrl,
                JSON.stringify(variants), JSON.stringify(shipping_info),
                JSON.stringify(payment_methods), JSON.stringify(warranty_info),
                JSON.stringify(return_policy), JSON.stringify(delivery_info),
                JSON.stringify(commission_info), JSON.stringify(links_info),
                productCode
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Market item created successfully and is under review',
            data: newItem.rows[0]
        });
    } catch (error) {
        console.error('❌ [createMarketItem] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating market item',
            error: error.message
        });
    }
};

// Update an item
exports.updateMarketItem = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, description, price, promo_price, category, sub_category, level3_category, manual_category, stock,
            variants_data, shipping_data, payment_data, warranty_data,
            return_data, delivery_data, commission_data, links_data
        } = req.body;
        const userId = req.user.id;

        const itemResult = await pool.query('SELECT * FROM market WHERE id = $1', [id]);
        if (itemResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Item not found' });
        const item = itemResult.rows[0];

        if (parseInt(item.user_id) !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });

        let variants = null;
        let shipping_info = null;
        let payment_methods = null;
        let warranty_info = null;
        let return_policy = null;
        let delivery_info = null;
        let commission_info = null;
        let links_info = null;

        try {
            if (variants_data && variants_data !== 'undefined') variants = JSON.parse(variants_data);
            if (shipping_data && shipping_data !== 'undefined') shipping_info = JSON.parse(shipping_data);
            if (payment_data && payment_data !== 'undefined') payment_methods = JSON.parse(payment_data);
            if (warranty_data && warranty_data !== 'undefined') warranty_info = JSON.parse(warranty_data);
            if (return_data && return_data !== 'undefined') return_policy = JSON.parse(return_data);
            if (delivery_data && delivery_data !== 'undefined') delivery_info = JSON.parse(delivery_data);
            if (commission_data && commission_data !== 'undefined') commission_info = JSON.parse(commission_data);
            if (links_data && links_data !== 'undefined') links_info = JSON.parse(links_data);
        } catch (parseErr) {
            return res.status(400).json({ success: false, message: 'Invalid data format' });
        }

        // Handle Image Uploads (Match req.files to variants requiring an upload)
        let fileIndex = 0;
        let gallery = [];
        if (variants) {
            const updatedVariants = [];
            for (const v of variants) {
                const needsUploadedImage = v.image_url && v.image_url.startsWith('blob:');
                const needsUploadedVideo = v.media_type === 'video' && v.video_url && v.video_url.startsWith('blob:');

                // Match uploaded files to variants that still point at a temporary blob URL.
                if (needsUploadedImage || needsUploadedVideo) {
                    if (req.files && req.files[fileIndex]) {
                        const file = req.files[fileIndex];
                        const url = await saveUploadedFile(file, needsUploadedVideo ? 'product-videos' : 'products');
                        const updatedV = {
                            ...v,
                            ...(needsUploadedImage ? { url, image_url: url } : {}),
                            ...(needsUploadedVideo ? { video_url: url } : {}),
                        };
                        gallery.push({ url: updatedV.image_url || url, color: v.color || null });
                        fileIndex++;
                        updatedVariants.push(updatedV);
                        continue;
                    }
                }
                // If it's already a data: or http URL, keep it
                if (v.image_url) {
                    gallery.push({ url: v.image_url, color: v.color || null });
                }
                updatedVariants.push(v);
            }
            variants = updatedVariants;
        }

        const imageUrl = gallery.length > 0 ? gallery[0].url : (variants?.[0]?.image_url || item.image_url);
        const numericPrice = price ? parseFloat(price) : item.price;
        const numericPromoPrice = promo_price !== undefined ? (promo_price ? parseFloat(promo_price) : null) : item.promo_price;

        const parsedVariants = variants || [];
        const aggregateStock = parsedVariants.reduce((acc, v) => {
            const subSelections = v.selections || [];
            if (subSelections.length > 0) {
                return acc + subSelections.reduce((sAcc, s) => sAcc + (parseInt(s.stock) || 0), 0);
            }
            return acc + (parseInt(v.stock || v.quantity) || 0);
        }, 0);

        // === REVIEW TRIGGER LOGIC (STRICT) ===
        const hasNewPhotos = req.files && req.files.length > 0;

        const getImgIdentity = (url) => {
            if (!url || typeof url !== 'string') return '';
            if (url.startsWith('data:')) return `DATA_URL_${url.length}`;
            const parts = url.split(/[\\/]/);
            return parts[parts.length - 1].split('?')[0] || '';
        };

        const currentImgId = getImgIdentity(item.image_url);
        // Special case: if variants[0].image_url is missing or empty, it's NOT an image change
        const proposedImgUrl = (variants?.[0]?.image_url && variants[0].image_url !== "") ? variants[0].image_url : null;
        const newImgId = gallery.length > 0 ? getImgIdentity(gallery[0].url) : (proposedImgUrl ? getImgIdentity(proposedImgUrl) : currentImgId);

        const mainImageChanged = newImgId !== currentImgId;

        // commission_info comes from JSON.parse(req.body.commission_data)
        const oldGoogerComm = item.commission_info ? parseFloat(item.commission_info.googer_commission ?? item.commission_info.googerCommission ?? 0) : 0;
        const newGoogerComm = commission_info ? parseFloat(commission_info.googer_commission ?? commission_info.googerCommission ?? 0) : 0;
        const googerCommChanged = Math.abs(newGoogerComm - oldGoogerComm) > 0.01;

        const requiresReview = hasNewPhotos || mainImageChanged || googerCommChanged;

        // Detailed logging for debugging
        if (requiresReview && (item.status === 'approved' || item.status === 'active')) {
            console.log(`🛡️ [Review Trigger Detail] Item #${id}:`, {
                reason: hasNewPhotos ? 'NEW_FILES' : (mainImageChanged ? 'IMAGE_CHANGE' : 'COMMISSION_CHANGE'),
                img: `${currentImgId} -> ${newImgId}`,
                comm: `${oldGoogerComm} -> ${newGoogerComm}`,
                allOldComm: item.commission_info,
                allNewComm: commission_info,
                currentStatus: item.status
            });
        }

        let newStatus = item.status;
        if (requiresReview && (item.status === 'approved' || item.status === 'active')) {
            newStatus = 'reviewing';
        } else {
            // No critical changes or already in a non-live state, keep current status
            newStatus = item.status;
        }

        const updatedItem = await pool.query(
            `UPDATE market 
             SET title = COALESCE($1, title), 
                 description = COALESCE($2, description), 
                 price = COALESCE($3, price), 
                 promo_price = $4,
                 category = COALESCE($5, category), 
                 sub_category = COALESCE($6, sub_category),
                 level3_category = COALESCE($7, level3_category),
                 manual_category = COALESCE($8, manual_category),
                 stock = $9,
                 image_url = COALESCE($10, image_url),
                 variants = COALESCE($11, variants),
                 shipping_info = COALESCE($12, shipping_info),
                 payment_methods = COALESCE($13, payment_methods),
                 warranty_info = COALESCE($14, warranty_info),
                 return_policy = COALESCE($15, return_policy),
                 delivery_info = COALESCE($16, delivery_info),
                 commission_info = COALESCE($17, commission_info),
                 links_data = COALESCE($18, links_data),
                 status = $19,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $20 RETURNING *`,
            [
                title, description, isNaN(numericPrice) ? item.price : numericPrice,
                numericPromoPrice,
                category, sub_category, level3_category, manual_category,
                (variants ? aggregateStock : (isNaN(parseInt(stock)) ? item.stock : parseInt(stock))),
                imageUrl,
                variants ? JSON.stringify(variants) : null,
                shipping_info ? JSON.stringify(shipping_info) : null,
                payment_methods ? JSON.stringify(payment_methods) : null,
                warranty_info ? JSON.stringify(warranty_info) : null,
                return_policy ? JSON.stringify(return_policy) : null,
                delivery_info ? JSON.stringify(delivery_info) : null,
                commission_info ? JSON.stringify(commission_info) : null,
                links_info ? JSON.stringify(links_info) : null,
                newStatus,
                id
            ]
        );

        res.status(200).json({
            success: true,
            data: updatedItem.rows[0],
            wentToReview: requiresReview
        });
    } catch (error) {
        console.error('Error updating market item:', error);
        res.status(500).json({ success: false, message: 'Server error while updating item', error: error.message });
    }
};

// Delete an item (Soft delete for 7 days)
exports.deleteMarketItem = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const itemResult = await pool.query('SELECT * FROM market WHERE id = $1', [id]);
        if (itemResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Item not found' });
        const item = itemResult.rows[0];
        if (parseInt(item.user_id) !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });

        // Soft delete: Change status and update updated_at for tracking
        await pool.query("UPDATE market SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);

        res.status(200).json({ success: true, message: 'Item moved to Inactive Products' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting item' });
    }
};

// Get all market items
exports.getMarketProducts = async (req, res) => {
    try {
        const authUser = req.user || getOptionalAuthUser(req);
        const viewerId = authUser?.id ? Number(authUser.id) : null;
        const { category, user_id, status } = req.query;
        const seenProductIds = parseSeenProductIds(req.query._seen);
        const lastShownOrder = parseLastShownOrder(req.query._lastOrder);
        const feedSession = typeof req.query._feedSession === 'string' && req.query._feedSession.trim()
            ? req.query._feedSession.trim()
            : `${Date.now()}:${Math.random()}`;
        const searchTerm = normalizeText(req.query.search);
        const limitRaw = Number.parseInt(req.query.limit, 10);
        const offsetRaw = Number.parseInt(req.query.offset, 10);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
        const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
        const [hasUsersCountry, hasUsersShippingAddress] = await Promise.all([
            hasTableColumn('users', 'country'),
            hasTableColumn('users', 'shipping_address'),
        ]);
        const isPersonalizedWall = !user_id && (!status || String(status).includes('approved') || String(status).includes('active'));

        const params = [viewerId];
        let where = `WHERE 1=1`;

        if (category) {
            params.push(category);
            where += ` AND m.category = $${params.length}`;
        }

        if (user_id) {
            params.push(parseInt(user_id, 10));
            where += ` AND m.user_id = $${params.length}`;
        }

        if (status) {
            const statusArray = String(status).split(',').map((value) => value.trim()).filter(Boolean);
            if (statusArray.includes('approved') && !statusArray.includes('active')) {
                statusArray.push('active');
            }
            params.push(statusArray);
            where += ` AND m.status = ANY($${params.length})`;
        } else {
            where += " AND m.status IN ('approved', 'active')";
        }

        if (searchTerm) {
            params.push(`%${searchTerm}%`);
            where += ` AND (
                m.title ILIKE $${params.length}
                OR m.description ILIKE $${params.length}
                OR m.category ILIKE $${params.length}
                OR m.sub_category ILIKE $${params.length}
                OR m.manual_category ILIKE $${params.length}
            )`;
        }

        const candidateLimit = isPersonalizedWall
            ? Math.min(Math.max(limit * 4, offset + (limit * 3), 60), 240)
            : limit + 1;
        const candidateOffset = isPersonalizedWall ? 0 : offset;

        params.push(candidateLimit, candidateOffset);
        const result = await pool.query(
            `SELECT m.id, m.user_id, m.username, m.title, m.description, m.price, m.promo_price,
                    m.category, m.sub_category, m.manual_category, m.stock, m.image_url, m.status,
                    m.likes_count, m.comments_count, m.shares_count, m.views_count,
                    m.variants, m.shipping_info, m.payment_methods, m.commission_info,
                    m.created_at, m.product_code,
                    u.username AS owner_username, u.profile_picture,
                    ${hasUsersCountry ? 'u.country AS seller_country,' : 'NULL::text AS seller_country,'}
                    ${hasUsersShippingAddress
                ? `CASE
                                WHEN jsonb_typeof(u.shipping_address) = 'object' THEN COALESCE(u.shipping_address->>'country', '')
                                ELSE ''
                           END AS seller_shipping_country,`
                : 'NULL::text AS seller_shipping_country,'}
                    CASE
                        WHEN $1::int IS NULL THEN FALSE
                        ELSE EXISTS(SELECT 1 FROM market_likes ml WHERE ml.market_id = m.id AND ml.user_id = $1)
                    END AS user_liked
             FROM market m
             INNER JOIN users u ON m.user_id = u.id
             ${where}
             ORDER BY m.created_at DESC
             LIMIT $${params.length - 1}
             OFFSET $${params.length}`,
            params
        );

        let rows = (result.rows || []).map(attachCurrentUser);

        if (isPersonalizedWall) {
            let userInterestProfile = buildUserInterestProfile(null, {
                viewRows: [],
                followingRows: [],
                blockedRows: [],
                searchQuery: req.query.search,
                searchKeyword: req.query.keyword,
            });

            if (viewerId) {
                const [userProfileResult, viewHistoryResult, followingResult, blockedResult] = await Promise.all([
                    pool.query(
                        `SELECT id,
                                ${hasUsersCountry ? 'country,' : 'NULL::text AS country,'}
                                ${hasUsersShippingAddress
                            ? `CASE
                                            WHEN jsonb_typeof(shipping_address) = 'object' THEN COALESCE(shipping_address->>'country', '')
                                            ELSE ''
                                       END AS shipping_country`
                            : `NULL::text AS shipping_country`}
                         FROM users
                         WHERE id = $1
                         LIMIT 1`,
                        [viewerId]
                    ),
                    pool.query(
                        `SELECT DISTINCT m.category, m.title
                         FROM market_views mv
                         JOIN market m ON m.id = mv.market_id
                         WHERE mv.user_id = $1
                         ORDER BY m.category, m.title`,
                        [viewerId]
                    ),
                    pool.query(
                        `SELECT subscribed_to_id
                         FROM user_subscriptions
                         WHERE subscriber_id = $1`,
                        [viewerId]
                    ),
                    pool.query(
                        `SELECT blocked_user_id
                         FROM user_blocks
                         WHERE blocker_id = $1`,
                        [viewerId]
                    ),
                ]);

                userInterestProfile = buildUserInterestProfile(userProfileResult.rows[0], {
                    viewRows: viewHistoryResult.rows,
                    followingRows: followingResult.rows,
                    blockedRows: blockedResult.rows,
                    searchQuery: req.query.search,
                    searchKeyword: req.query.keyword,
                });
            }

            const requestShuffleSeed = `${feedSession}:${Date.now()}:${Math.random()}`;
            rows = rows
                .filter((product) => !userInterestProfile.blockedSellerIds.has(Number(product.user_id)))
                .map((product) => {
                    const score = calculateProductScore(
                        product,
                        userInterestProfile,
                        `${requestShuffleSeed}:${viewerId}:${product.id}`
                    );
                    const seenPenalty = getSeenPenalty(product.id, seenProductIds);
                    return {
                        ...product,
                        relevance_score: score.relevance,
                        engagement_score: score.engagement,
                        freshness_score: score.freshness,
                        seller_quality_score: score.sellerQuality,
                        random_boost: Number(score.randomBoost.toFixed(4)),
                        seen_penalty: Number(seenPenalty.toFixed(4)),
                        feed_score: Number((score.finalScore - seenPenalty).toFixed(4)),
                    };
                })
                .sort((first, second) => {
                    if (second.feed_score !== first.feed_score) {
                        return second.feed_score - first.feed_score;
                    }
                    return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
                });

            const matchingRows = searchTerm ? rows.filter((item) => searchMatchesItem(item, searchTerm)) : rows;
            const nonMatchingRows = searchTerm ? rows.filter((item) => !searchMatchesItem(item, searchTerm)) : [];

            rows = [
                ...applyDiversityRules(
                    lightlyShuffleRankedProducts(
                        smartFeedMix(matchingRows, `${requestShuffleSeed}:match`),
                        `${requestShuffleSeed}:match`
                    )
                ),
                ...applyDiversityRules(
                    lightlyShuffleRankedProducts(
                        smartFeedMix(nonMatchingRows, `${requestShuffleSeed}:rest`),
                        `${requestShuffleSeed}:rest`
                    )
                ),
            ];

            if (hasSameOrder(rows, lastShownOrder) && rows.length > 1) {
                const antiRepeatOffset = (Math.floor(getSeededRandom(`${requestShuffleSeed}:anti-repeat`) * (rows.length - 1)) + 1) % rows.length;
                rows = rotateItems(rows, antiRepeatOffset || 1);
            }
        }

        const hasMore = rows.length > offset + limit;
        const dataSlice = rows.slice(offset, offset + limit);
        let data = dataSlice;

        if (!user_id && (!status || String(status).includes('approved') || String(status).includes('active')) && await hasTable('ads')) {
            await ensureSponsoredAdsEngagementSchema();
            const sponsoredResult = await pool.query(
                `SELECT a.ad_id, a.user_id, a.owner_user_id, a.owner_username, a.campaign_type,
                        a.linked_product_id, a.linked_product_share_code, a.original_product_id, a.original_product_code,
                        a.title, a.description, a.media_preview, a.media_gallery, a.media_type,
                        a.edit_draft, a.impressions, a.clicks, a.likes_count, a.comments_count,
                        a.shares_count, a.created_at,
                        u.profile_picture, u.username AS owner_username_joined,
                        ${hasUsersCountry ? 'u.country AS seller_country,' : 'NULL::text AS seller_country,'}
                        ${hasUsersShippingAddress
                    ? `CASE
                                    WHEN jsonb_typeof(u.shipping_address) = 'object' THEN COALESCE(u.shipping_address->>'country', '')
                                    ELSE ''
                               END AS seller_shipping_country`
                    : `NULL::text AS seller_shipping_country`},
                        CASE WHEN $1::int IS NULL THEN FALSE
                             ELSE EXISTS(
                                SELECT 1
                                FROM ad_coin_collections acc
                                WHERE acc.ad_id = a.ad_id
                                  AND acc.ad_type = COALESCE(NULLIF(a.campaign_type, ''), 'Ads')
                                  AND acc.user_id = $1
                             )
                        END AS ad_coin_collected,
                        ${AD_COIN_REWARD_VALUE_SQL}::numeric AS ad_coin_value,
                        CASE WHEN $1::int IS NULL THEN FALSE
                             ELSE EXISTS(SELECT 1 FROM ad_likes al WHERE al.ad_id = a.ad_id AND al.user_id = $1)
                        END AS user_liked
                 FROM ads a
                 LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.status = 'Active'
                 ORDER BY a.created_at DESC`,
                [viewerId]
            );
            let sponsoredRows = sponsoredResult.rows.map(mapActiveAdToMarketCard);
            const productPromoteAds = sponsoredRows.filter(
                (ad) => ad.campaign_type === 'Product Promote' && (ad.linked_product_id != null || ad.linked_product_share_code)
            );

            if (productPromoteAds.length > 0) {
                const linkedIds = Array.from(
                    new Set(productPromoteAds.map((ad) => parseInt(ad.linked_product_id, 10)).filter((value) => Number.isFinite(value)))
                );
                const linkedCodes = Array.from(
                    new Set(productPromoteAds.map((ad) => ad.linked_product_share_code).filter(Boolean))
                );

                const linkedResult = await pool.query(
                    `SELECT m.id, m.user_id, m.username, m.title, m.description, m.price, m.promo_price,
                            m.category, m.sub_category, m.manual_category, m.stock, m.image_url, m.status,
                            m.likes_count, m.comments_count, m.shares_count, m.views_count,
                            m.variants, m.shipping_info, m.payment_methods, m.commission_info, m.created_at, m.product_code,
                            u.username AS owner_username, u.profile_picture,
                            ${hasUsersCountry ? 'u.country AS seller_country,' : 'NULL::text AS seller_country,'}
                            ${hasUsersShippingAddress
                        ? `CASE
                                        WHEN jsonb_typeof(u.shipping_address) = 'object' THEN COALESCE(u.shipping_address->>'country', '')
                                        ELSE ''
                                   END AS seller_shipping_country,`
                        : 'NULL::text AS seller_shipping_country,'}
                            EXISTS(SELECT 1 FROM market_likes ml WHERE ml.market_id = m.id AND ml.user_id = $1) AS user_liked
                     FROM market m
                     INNER JOIN users u ON m.user_id = u.id
                     WHERE (m.id = ANY($2::int[]) OR m.product_code = ANY($3::text[]))
                       AND m.status IN ('approved', 'active')`,
                    [viewerId, linkedIds.length ? linkedIds : [0], linkedCodes.length ? linkedCodes : ['']]
                );

                const productById = new Map(linkedResult.rows.map((row) => [Number(row.id), attachCurrentUser(row)]));
                const productByCode = new Map(linkedResult.rows.map((row) => [String(row.product_code || ''), attachCurrentUser(row)]));
                sponsoredRows = sponsoredRows.map((ad) => {
                    if (ad.campaign_type !== 'Product Promote') return ad;
                    const linked =
                        (ad.linked_product_id != null && productById.get(Number(ad.linked_product_id))) ||
                        (ad.linked_product_share_code && productByCode.get(String(ad.linked_product_share_code)));
                    if (!linked) {
                        console.warn("Failed to hydrate Product Promote market card", {
                            adId: ad.adId || ad.ad_id,
                            productId: ad.linked_product_id ?? null,
                            productCode: ad.linked_product_share_code ?? null,
                        });
                        return null;
                    }
                    const { price, promo_price } = normalizeProductPromotePriceFields(linked, ad);
                    const linkedVariants = Array.isArray(linked.variants) ? linked.variants : [];
                    const sizes = Array.isArray(linked.sizes) ? linked.sizes : deriveVariantSizes(linkedVariants);
                    const colors = Array.isArray(linked.colors) ? linked.colors : deriveVariantColors(linkedVariants);
                    return {
                        ...linked,
                        id: ad.id,
                        adId: ad.adId,
                        ad_id: ad.adId,
                        ad_owner_user_id: ad.user_id,
                        advertiser_id: ad.user_id,
                        price,
                        main_price: price,
                        product_price: price,
                        promo_price,
                        sizes,
                        colors,
                        product_id: linked.id,
                        linked_product_id: linked.id,
                        linked_product_share_code: linked.product_code,
                        linked_product_code: linked.product_code,
                        share_code: linked.product_code || String(linked.id),
                        user_liked: !!ad.user_liked,
                        likes_count: Number(ad.likes_count || 0),
                        comments_count: Number(ad.comments_count || 0),
                        shares_count: Number(ad.shares_count || 0),
                        views_count: Number(ad.views_count || 0),
                        ad_coin_collected: !!ad.ad_coin_collected,
                        ad_like_locked: !!ad.ad_coin_collected,
                        ad_coin_value: Number(ad.ad_coin_value || DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount),
                        is_sponsored: true,
                        sponsored_label: 'Ads',
                        campaign_type: 'Product Promote',
                        active_link: ad.active_link,
                        cta_topic: ad.cta_topic,
                        cta_value: ad.cta_value,
                    };
                }).filter(Boolean);
            }

            if (sponsoredRows.length > 1) {
                const adShuffleSeed = `${feedSession}:ads:${Date.now()}`;
                sponsoredRows = shuffleItemsWithSeed(
                    sponsoredRows,
                    adShuffleSeed,
                    (ad) => String(ad?.adId || ad?.ad_id || ad?.id || '')
                );
            }
            data = [...data, ...sponsoredRows].map(stripFeedMediaPayload);
        } else {
            data = data.map(stripFeedMediaPayload);
        }

        res.status(200).json({
            success: true,
            data,
            pagination: {
                limit,
                offset,
                nextOffset: offset + dataSlice.length,
                hasMore,
            },
        });
    } catch (error) {
        console.error('getMarketProducts error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getMarketItems = async (req, res) => {
    try {
        await ensureMarketFeedSchema();
        const { category, user_id, status } = req.query;
        const authUser = req.user || getOptionalAuthUser(req);
        const viewerId = authUser?.id ? Number(authUser.id) : null;
        const seenProductIds = parseSeenProductIds(req.query._seen);
        const lastShownOrder = parseLastShownOrder(req.query._lastOrder);
        const feedSession = typeof req.query._feedSession === 'string' && req.query._feedSession.trim()
            ? req.query._feedSession.trim()
            : `${Date.now()}:${Math.random()}`;
        const searchTerm = normalizeText(req.query.search);
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const resultLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, 80)
            : null;
        const [hasUsersCountry, hasUsersShippingAddress, hasOrdersReports] = await Promise.all([
            hasTableColumn('users', 'country'),
            hasTableColumn('users', 'shipping_address'),
            hasTableColumn('orders', 'seller_report'),
        ]);

        const userCountrySelect = hasUsersCountry ? 'u.country AS seller_country,' : `NULL::text AS seller_country,`;
        const shippingCountrySelect = hasUsersShippingAddress
            ? `CASE
                    WHEN jsonb_typeof(u.shipping_address) = 'object' THEN COALESCE(u.shipping_address->>'country', '')
                    ELSE ''
               END AS seller_shipping_country,`
            : `NULL::text AS seller_shipping_country,`;
        const sellerReportedSelect = hasOrdersReports
            ? `COALESCE(seller_report_stats.seller_reported, FALSE) AS seller_reported,`
            : `FALSE AS seller_reported,`;
        const sellerReportJoin = hasOrdersReports
            ? `LEFT JOIN (
                        SELECT seller_id, TRUE AS seller_reported
                        FROM orders
                        WHERE seller_report IS NOT NULL
                        GROUP BY seller_id
                     ) seller_report_stats ON seller_report_stats.seller_id = m.user_id`
            : '';
        const isFastMarketFeed = resultLimit && !user_id && !req.query.order_status;

        let query = `SELECT m.id, m.user_id, m.username, m.title, m.description, m.price, m.promo_price, m.category, 
                            m.sub_category, m.manual_category, m.stock, m.image_url, m.status, 
                            m.likes_count, m.comments_count, m.shares_count, m.views_count,
                            m.variants, m.shipping_info, m.commission_info,
                            m.created_at, m.product_code,
                            u.username as owner_username, u.profile_picture,
                            ${userCountrySelect}
                            ${shippingCountrySelect}
                            COALESCE(order_stats.purchases_count, 0) AS purchases_count,
                            COALESCE(cart_stats.add_to_cart_count, 0) AS add_to_cart_count,
                            COALESCE(seller_stats.seller_rating, 0) AS seller_rating,
                            COALESCE(seller_stats.seller_cancel_rate, 0) AS seller_cancel_rate,
                            FALSE AS seller_fast_response,
                            CASE WHEN u.user_type = 'admin' THEN TRUE ELSE FALSE END AS seller_verified,
                            ${sellerReportedSelect}
                            EXISTS(SELECT 1 FROM market_likes ml WHERE ml.market_id = m.id AND ml.user_id = $1) as user_liked
                     FROM market m 
                     INNER JOIN users u ON m.user_id = u.id 
                     LEFT JOIN (
                        SELECT item_id, COUNT(*)::int AS purchases_count
                        FROM orders
                        WHERE status IN ('completed', 'delivered', 'received')
                        GROUP BY item_id
                     ) order_stats ON order_stats.item_id = m.id
                     LEFT JOIN (
                        SELECT product_id, COALESCE(SUM(quantity), 0)::int AS add_to_cart_count
                        FROM cart_items
                        GROUP BY product_id
                     ) cart_stats ON cart_stats.product_id = m.id
                     LEFT JOIN (
                        SELECT seller_id,
                               AVG(CASE WHEN status IN ('completed', 'delivered', 'received') THEN 5.0 ELSE NULL END) AS seller_rating,
                               CASE
                                   WHEN COUNT(*) = 0 THEN 0
                                   ELSE ROUND(
                                       COUNT(*) FILTER (WHERE status = 'cancelled')::numeric * 100.0 / COUNT(*)::numeric,
                                       2
                                   )
                               END AS seller_cancel_rate
                        FROM orders
                        GROUP BY seller_id
                     ) seller_stats ON seller_stats.seller_id = m.user_id
                     ${sellerReportJoin}
                     WHERE 1=1`;
        const params = [viewerId];

        if (isFastMarketFeed) {
            const fastParams = [viewerId];
            let fastWhere = `WHERE 1=1`;

            if (category) {
                fastParams.push(category);
                fastWhere += ` AND m.category = $${fastParams.length}`;
            }
            if (status) {
                let statusArray = status.split(',').map(s => s.trim());
                if (statusArray.includes('approved') && !statusArray.includes('active')) {
                    statusArray.push('active');
                }
                fastParams.push(statusArray);
                fastWhere += ` AND m.status = ANY($${fastParams.length})`;
            } else {
                fastWhere += " AND m.status IN ('approved', 'active')";
            }
            if (searchTerm) {
                fastParams.push(`%${searchTerm}%`);
                fastWhere += ` AND (
                    m.title ILIKE $${fastParams.length}
                    OR m.description ILIKE $${fastParams.length}
                    OR m.category ILIKE $${fastParams.length}
                    OR m.sub_category ILIKE $${fastParams.length}
                    OR m.manual_category ILIKE $${fastParams.length}
                )`;
            }

            fastParams.push(resultLimit * 3);
            query = `WITH limited_market AS (
                        SELECT m.id, m.user_id, m.username, m.title, m.description, m.price, m.promo_price, m.category,
                               m.sub_category, m.manual_category, m.stock, m.image_url, m.status,
                               m.likes_count, m.comments_count, m.shares_count, m.views_count,
                               m.variants, m.shipping_info, m.commission_info, m.created_at, m.product_code
                        FROM market m
                        ${fastWhere}
                        ORDER BY m.created_at DESC
                        LIMIT $${fastParams.length}
                     )
                     SELECT m.id, m.user_id, m.username, m.title, m.description, m.price, m.promo_price, m.category,
                            m.sub_category, m.manual_category, m.stock, m.image_url, m.status,
                            m.likes_count, m.comments_count, m.shares_count, m.views_count,
                            m.variants, m.shipping_info, m.commission_info,
                            m.created_at, m.product_code,
                            u.username as owner_username, u.profile_picture,
                            ${userCountrySelect}
                            ${shippingCountrySelect}
                            COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.item_id = m.id AND o.status IN ('completed', 'delivered', 'received')), 0) AS purchases_count,
                            COALESCE((SELECT SUM(ci.quantity)::int FROM cart_items ci WHERE ci.product_id = m.id), 0) AS add_to_cart_count,
                            0 AS seller_rating,
                            COALESCE((
                                SELECT ROUND(COUNT(*) FILTER (WHERE o.status = 'cancelled')::numeric * 100.0 / NULLIF(COUNT(*)::numeric, 0), 2)
                                FROM orders o
                                WHERE o.seller_id = m.user_id
                            ), 0) AS seller_cancel_rate,
                            FALSE AS seller_fast_response,
                            CASE WHEN u.user_type = 'admin' THEN TRUE ELSE FALSE END AS seller_verified,
                            ${hasOrdersReports
                    ? `EXISTS(SELECT 1 FROM orders o WHERE o.seller_id = m.user_id AND o.seller_report IS NOT NULL) AS seller_reported,`
                    : `FALSE AS seller_reported,`}
                            EXISTS(SELECT 1 FROM market_likes ml WHERE ml.market_id = m.id AND ml.user_id = $1) as user_liked
                     FROM limited_market m
                     INNER JOIN users u ON m.user_id = u.id
                     ORDER BY m.created_at DESC`;

            const result = await pool.query(query, fastParams);
            let rows = (result.rows || []).map(attachCurrentUser);
            const isPersonalizedWall = true;

            if (isPersonalizedWall) {
                let userInterestProfile = buildUserInterestProfile(null, {
                    viewRows: [],
                    followingRows: [],
                    blockedRows: [],
                    searchQuery: req.query.search,
                    searchKeyword: req.query.keyword,
                });

                const requestShuffleSeed = `${feedSession}:${Date.now()}:${Math.random()}`;
                rows = rows
                    .map((product) => {
                        const score = calculateProductScore(product, userInterestProfile, `${requestShuffleSeed}:${viewerId}:${product.id}`);
                        const seenPenalty = getSeenPenalty(product.id, seenProductIds);
                        return {
                            ...product,
                            relevance_score: score.relevance,
                            engagement_score: score.engagement,
                            freshness_score: score.freshness,
                            seller_quality_score: score.sellerQuality,
                            random_boost: Number(score.randomBoost.toFixed(4)),
                            seen_penalty: Number(seenPenalty.toFixed(4)),
                            feed_score: Number((score.finalScore - seenPenalty).toFixed(4)),
                        };
                    })
                    .sort((first, second) => {
                        if (second.feed_score !== first.feed_score) return second.feed_score - first.feed_score;
                        return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
                    });

                const matchingRows = searchTerm ? rows.filter((item) => searchMatchesItem(item, searchTerm)) : rows;
                const nonMatchingRows = searchTerm ? rows.filter((item) => !searchMatchesItem(item, searchTerm)) : [];
                rows = [
                    ...applyDiversityRules(lightlyShuffleRankedProducts(smartFeedMix(matchingRows, `${requestShuffleSeed}:match`), `${requestShuffleSeed}:match`)),
                    ...applyDiversityRules(lightlyShuffleRankedProducts(smartFeedMix(nonMatchingRows, `${requestShuffleSeed}:rest`), `${requestShuffleSeed}:rest`)),
                ];

                if (hasSameOrder(rows, lastShownOrder) && rows.length > 1) {
                    const antiRepeatOffset = (Math.floor(getSeededRandom(`${requestShuffleSeed}:anti-repeat`) * (rows.length - 1)) + 1) % rows.length;
                    rows = rotateItems(rows, antiRepeatOffset || 1);
                }
            }

            return res.status(200).json({ success: true, data: rows.slice(0, resultLimit) });
        }

        if (category) {
            params.push(category);
            query += ` AND m.category = $${params.length}`;
        }
        if (user_id) {
            // Cast to integer for safe comparison
            params.push(parseInt(user_id, 10));
            query += ` AND m.user_id = $${params.length}`;
        }
        if (status) {
            // Normalize: treat 'approved' as also matching 'active' (legacy status)
            let statusArray = status.split(',').map(s => s.trim());
            // If 'approved' is in the list, also include legacy 'active'
            if (statusArray.includes('approved') && !statusArray.includes('active')) {
                statusArray.push('active');
            }
            params.push(statusArray);
            query += ` AND m.status = ANY($${params.length})`;
        } else {
            // Default filter: hide deleted and inactive items from public market
            query += " AND m.status IN ('approved', 'active')";
        }

        if (req.query.order_status) {
            params.push(req.query.order_status);
            query += ` AND m.order_status = $${params.length}`;
        }

        if (searchTerm) {
            params.push(`%${searchTerm}%`);
            query += ` AND (
                m.title ILIKE $${params.length}
                OR m.description ILIKE $${params.length}
                OR m.category ILIKE $${params.length}
                OR m.sub_category ILIKE $${params.length}
                OR m.manual_category ILIKE $${params.length}
            )`;
        }

        query += ` ORDER BY m.created_at DESC`;

        if (resultLimit && !user_id) {
            params.push(resultLimit * 3);
            query += ` LIMIT $${params.length}`;
        }

        const result = await pool.query(query, params);
        let rows = (result.rows || []).map(attachCurrentUser);

        const isPersonalizedWall = !user_id && (!status || String(status).includes('approved') || String(status).includes('active'));

        if (isPersonalizedWall) {
            let userInterestProfile = buildUserInterestProfile(null, {
                viewRows: [],
                followingRows: [],
                blockedRows: [],
                searchQuery: req.query.search,
                searchKeyword: req.query.keyword,
            });

            if (viewerId) {
                const [userProfileResult, viewHistoryResult, followingResult, blockedResult] = await Promise.all([
                    pool.query(
                        `SELECT id,
                                ${hasUsersCountry ? 'country,' : 'NULL::text AS country,'}
                                ${hasUsersShippingAddress
                            ? `CASE
                                            WHEN jsonb_typeof(shipping_address) = 'object' THEN COALESCE(shipping_address->>'country', '')
                                            ELSE ''
                                       END AS shipping_country`
                            : `NULL::text AS shipping_country`}
                         FROM users
                         WHERE id = $1
                         LIMIT 1`,
                        [viewerId]
                    ),
                    pool.query(
                        `SELECT DISTINCT m.category, m.title
                         FROM market_views mv
                         JOIN market m ON m.id = mv.market_id
                         WHERE mv.user_id = $1
                         ORDER BY m.category, m.title`,
                        [viewerId]
                    ),
                    pool.query(
                        `SELECT subscribed_to_id
                         FROM user_subscriptions
                         WHERE subscriber_id = $1`,
                        [viewerId]
                    ),
                    pool.query(
                        `SELECT blocked_user_id
                         FROM user_blocks
                         WHERE blocker_id = $1`,
                        [viewerId]
                    ),
                ]);

                userInterestProfile = buildUserInterestProfile(userProfileResult.rows[0], {
                    viewRows: viewHistoryResult.rows,
                    followingRows: followingResult.rows,
                    blockedRows: blockedResult.rows,
                    searchQuery: req.query.search,
                    searchKeyword: req.query.keyword,
                });
            }

            const requestShuffleSeed = `${feedSession}:${Date.now()}:${Math.random()}`;
            let sponsoredRows = [];

            if (await hasTable('ads')) {
                await ensureSponsoredAdsEngagementSchema();
                const sponsoredResult = await pool.query(
                    `SELECT a.ad_id, a.user_id, a.owner_username, a.campaign_type, a.linked_product_id, a.linked_product_share_code,
                            a.original_product_id, a.original_product_code, a.title, a.description,
                            a.media_preview, a.media_gallery, a.media_type, a.edit_draft, a.impressions, a.clicks, a.likes_count, a.comments_count, a.shares_count, a.created_at,
                            u.profile_picture, u.username AS owner_username_joined,
                            ${hasUsersCountry ? 'u.country AS seller_country,' : 'NULL::text AS seller_country,'}
                            ${hasUsersShippingAddress
                        ? `CASE
                                        WHEN jsonb_typeof(u.shipping_address) = 'object' THEN COALESCE(u.shipping_address->>'country', '')
                                        ELSE ''
                                   END AS seller_shipping_country`
                        : `NULL::text AS seller_shipping_country`},
                            CASE
                                WHEN $1::int IS NULL THEN FALSE
                                ELSE EXISTS(
                                    SELECT 1
                                    FROM ad_coin_collections acc
                                    WHERE acc.ad_id = a.ad_id
                                      AND acc.ad_type = COALESCE(NULLIF(a.campaign_type, ''), 'Ads')
                                      AND acc.user_id = $1
                                )
                            END AS ad_coin_collected,
                            ${AD_COIN_REWARD_VALUE_SQL}::numeric AS ad_coin_value,
                            CASE
                                WHEN $1::int IS NULL THEN FALSE
                                ELSE EXISTS(SELECT 1 FROM ad_likes al WHERE al.ad_id = a.ad_id AND al.user_id = $1)
                            END AS user_liked
                     FROM ads a
                     LEFT JOIN users u ON u.id = a.user_id
                     WHERE a.status = 'Active'
                     ORDER BY a.created_at DESC`
                    , [viewerId]);

                sponsoredRows = sponsoredResult.rows.map(mapActiveAdToMarketCard);

                const productPromoteAds = sponsoredRows.filter(
                    (ad) => ad.campaign_type === 'Product Promote' && (ad.linked_product_id != null || ad.linked_product_share_code)
                );
                if (productPromoteAds.length > 0) {
                    const linkedIds = Array.from(
                        new Set(productPromoteAds.map((ad) => parseInt(ad.linked_product_id, 10)).filter((n) => Number.isFinite(n)))
                    );
                    const linkedCodes = Array.from(
                        new Set(productPromoteAds.map((ad) => ad.linked_product_share_code).filter(Boolean))
                    );
                    if (linkedIds.length > 0 || linkedCodes.length > 0) {
                        const linkedResult = await pool.query(
                            `SELECT m.id, m.user_id, m.username, m.title, m.description, m.price, m.promo_price,
                                    m.category, m.sub_category, m.manual_category, m.stock, m.image_url, m.status,
                                    m.likes_count, m.comments_count, m.shares_count, m.views_count,
                                    m.variants, m.shipping_info, m.payment_methods, m.commission_info, m.created_at, m.product_code,
                                    u.username AS owner_username, u.profile_picture,
                                    ${hasUsersCountry ? 'u.country AS seller_country,' : 'NULL::text AS seller_country,'}
                                    ${hasUsersShippingAddress
                                ? `CASE
                                                WHEN jsonb_typeof(u.shipping_address) = 'object' THEN COALESCE(u.shipping_address->>'country', '')
                                                ELSE ''
                                           END AS seller_shipping_country,`
                                : 'NULL::text AS seller_shipping_country,'}
                                    EXISTS(SELECT 1 FROM market_likes ml WHERE ml.market_id = m.id AND ml.user_id = $1) AS user_liked
                             FROM market m
                             INNER JOIN users u ON m.user_id = u.id
                             WHERE (m.id = ANY($2::int[]) OR m.product_code = ANY($3::text[]))
                               AND m.status IN ('approved', 'active')`,
                            [viewerId, linkedIds.length ? linkedIds : [0], linkedCodes.length ? linkedCodes : ['']]
                        );
                        const productById = new Map(linkedResult.rows.map((r) => [Number(r.id), r]));
                        const productByCode = new Map(linkedResult.rows.map((r) => [String(r.product_code || ''), r]));
                        sponsoredRows = sponsoredRows.map((ad) => {
                            if (ad.campaign_type !== 'Product Promote') return ad;
                            const linked =
                                (ad.linked_product_id != null && productById.get(Number(ad.linked_product_id))) ||
                                (ad.linked_product_share_code && productByCode.get(String(ad.linked_product_share_code)));
                            if (!linked) {
                                console.warn("Failed to hydrate Product Promote market item", {
                                    adId: ad.adId || ad.ad_id,
                                    productId: ad.linked_product_id ?? null,
                                    productCode: ad.linked_product_share_code ?? null,
                                });
                                return null;
                            }
                            const { price, promo_price } = normalizeProductPromotePriceFields(linked, ad);
                            const linkedVariants = Array.isArray(linked.variants) ? linked.variants : [];
                            const sizes = Array.isArray(linked.sizes) ? linked.sizes : deriveVariantSizes(linkedVariants);
                            const colors = Array.isArray(linked.colors) ? linked.colors : deriveVariantColors(linkedVariants);
                            return {
                                ...ad,
                                // Overlay real product fields so the card renders as a normal product.
                                id: Number(linked.id),
                                user_id: linked.user_id,
                                username: linked.owner_username || ad.username,
                                owner_username: linked.owner_username || ad.owner_username,
                                user: {
                                    id: linked.user_id,
                                    username: linked.owner_username || ad.user?.username || ad.username,
                                    profile_picture: linked.profile_picture || ad.user?.profile_picture || ad.profile_picture,
                                },
                                title: linked.title || ad.title,
                                description: linked.description || '',
                                category: linked.category || ad.category,
                                sub_category: linked.sub_category || null,
                                manual_category: linked.manual_category || null,
                                stock: linked.stock,
                                price,
                                main_price: price,
                                product_price: price,
                                promo_price,
                                sizes,
                                colors,
                                image_url: linked.image_url || ad.image_url,
                                main_image: linked.image_url || ad.image_url,
                                media_url: linked.image_url || ad.media_preview || ad.image_url,
                                thumbnail_url: linked.image_url || ad.media_preview || ad.image_url,
                                images: normalizeFeedMediaList(linked.image_url, linked.variants, ad.media_gallery),
                                media_preview: linked.image_url || ad.media_preview,
                                status: 'approved',
                                likes_count: Number(linked.likes_count || 0),
                                comments_count: Number(linked.comments_count || 0),
                                shares_count: Number(linked.shares_count || 0),
                                views_count: Number(linked.views_count || 0),
                                variants: linked.variants || [],
                                shipping_info: linked.shipping_info || null,
                                payment_methods: linked.payment_methods || null,
                                commission_info: linked.commission_info || null,
                                created_at: linked.created_at || ad.created_at,
                                product_code: linked.product_code || ad.product_code,
                                linked_product_share_code: linked.product_code || ad.product_code,
                                linked_product_code: linked.product_code || ad.product_code,
                                share_code: linked.product_code || String(linked.id),
                                profile_picture: linked.profile_picture || ad.profile_picture,
                                seller_country: linked.seller_country || ad.seller_country,
                                seller_shipping_country: linked.seller_shipping_country || ad.seller_shipping_country,
                                user_liked: !!linked.user_liked,
                                // Sponsored markers preserved
                                is_sponsored: true,
                                sponsored_label: 'Ads',
                                campaign_type: 'Product Promote',
                                adId: ad.adId,
                                ad_id: ad.adId,
                                ad_owner_user_id: ad.user_id,
                                advertiser_id: ad.user_id,
                                linked_product_id: linked.id,
                            };
                        }).filter(Boolean);
                    }
                }
            }

            // Product Promote ads are ADDITIONAL to the original product listing — both must appear.
            // React key collisions are avoided on the frontend by using ad.adId for sponsored rows.
            rows = [
                ...rows,
                ...sponsoredRows,
            ]
                .filter((product) => !userInterestProfile.blockedSellerIds.has(Number(product.user_id)))
                .map((product) => {
                    const score = calculateProductScore(
                        product,
                        userInterestProfile,
                        `${requestShuffleSeed}:${viewerId}:${product.id}`
                    );
                    const seenPenalty = getSeenPenalty(product.id, seenProductIds);
                    const adjustedFeedScore = score.finalScore - seenPenalty;

                    return {
                        ...product,
                        relevance_score: score.relevance,
                        engagement_score: score.engagement,
                        freshness_score: score.freshness,
                        seller_quality_score: score.sellerQuality,
                        random_boost: Number(score.randomBoost.toFixed(4)),
                        seen_penalty: Number(seenPenalty.toFixed(4)),
                        feed_score: Number(adjustedFeedScore.toFixed(4)),
                    };
                })
                .sort((first, second) => {
                    if (second.feed_score !== first.feed_score) {
                        return second.feed_score - first.feed_score;
                    }
                    return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
                });

            const matchingRows = searchTerm ? rows.filter((item) => searchMatchesItem(item, searchTerm)) : rows;
            const nonMatchingRows = searchTerm ? rows.filter((item) => !searchMatchesItem(item, searchTerm)) : [];

            const mixedMatchingRows = applyDiversityRules(
                lightlyShuffleRankedProducts(
                    smartFeedMix(matchingRows, `${requestShuffleSeed}:match`),
                    `${requestShuffleSeed}:match`
                )
            );

            const mixedNonMatchingRows = applyDiversityRules(
                lightlyShuffleRankedProducts(
                    smartFeedMix(nonMatchingRows, `${requestShuffleSeed}:rest`),
                    `${requestShuffleSeed}:rest`
                )
            );

            rows = [...mixedMatchingRows, ...mixedNonMatchingRows];

            if (hasSameOrder(rows, lastShownOrder) && rows.length > 1) {
                const antiRepeatOffset = (Math.floor(getSeededRandom(`${requestShuffleSeed}:anti-repeat`) * (rows.length - 1)) + 1) % rows.length;
                rows = rotateItems(rows, antiRepeatOffset || 1);
            }
        }

        if (resultLimit) {
            rows = rows.slice(0, resultLimit);
        }

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('getMarketItems error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get single item by numeric ID
exports.getMarketItemById = async (req, res) => {
    try {
        const { id } = req.params;
        const numericId = parseInt(id, 10);
        let result;
        const marketHasProductCode = await hasTableColumn('market', 'product_code');

        if (!isNaN(numericId)) {
            // Primary lookup by numeric id
            result = await pool.query(
                `SELECT m.*, u.username as owner_username, u.profile_picture 
                 FROM market m 
                 LEFT JOIN users u ON m.user_id = u.id 
                 WHERE m.id = $1`,
                [numericId]
            );
        }

        // Fallback: lookup by product_code (alphanumeric share codes)
        if (marketHasProductCode && (!result || result.rows.length === 0)) {
            result = await pool.query(
                `SELECT m.*, u.username as owner_username, u.profile_picture 
                 FROM market m 
                 LEFT JOIN users u ON m.user_id = u.id 
                 WHERE m.product_code = $1`,
                [id]
            );
        }

        if (!result || result.rows.length === 0) {
            // Check ads table
            const adId = isSponsoredFeedItemId(id) ? normalizeSponsoredAdId(id) : id;
            const adResult = await pool.query(
                `SELECT a.*, u.username as owner_username, u.profile_picture 
                 FROM ads a 
                 LEFT JOIN users u ON a.user_id = u.id 
                 WHERE a.ad_id = $1`,
                [adId]
            );
            if (adResult.rows.length > 0) {
                return res.status(200).json({ success: true, data: await mapSponsoredAdWithCurrentReward(adResult.rows[0]) });
            }
            return res.status(404).json({ success: false, message: 'Not found' });
        }
        res.status(200).json({ success: true, data: attachCurrentUser(result.rows[0]) });
    } catch (error) {
        console.error('Error fetching market item:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get single item by product_code (used by share links)
exports.getMarketItemByCode = async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) {
            return res.status(400).json({ success: false, message: 'Code is required' });
        }

        const marketHasProductCode = await hasTableColumn('market', 'product_code');
        const result = marketHasProductCode
            ? await pool.query(
                `SELECT m.*, u.username as owner_username, u.profile_picture 
                 FROM market m 
                 LEFT JOIN users u ON m.user_id = u.id 
                 WHERE m.product_code = $1`,
                [code]
            )
            : { rows: [] };

        if (result.rows.length === 0) {
            // Check ads table
            const adId = isSponsoredFeedItemId(code) ? normalizeSponsoredAdId(code) : code;
            const adResult = await pool.query(
                `SELECT a.*, u.username as owner_username, u.profile_picture 
                 FROM ads a 
                 LEFT JOIN users u ON a.user_id = u.id 
                 WHERE a.ad_id = $1`,
                [adId]
            );
            if (adResult.rows.length > 0) {
                return res.status(200).json({ success: true, data: await mapSponsoredAdWithCurrentReward(adResult.rows[0]) });
            }
            return res.status(404).json({ success: false, message: 'Not found' });
        }
        res.status(200).json({ success: true, data: attachCurrentUser(result.rows[0]) });
    } catch (error) {
        console.error('Error fetching market item by code:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update item status (e.g., for admin review)
exports.updateMarketItemStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await pool.query('UPDATE market SET status = $1 WHERE id = $2', [status, id]);
        res.status(200).json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ success: false, message: 'Server error while updating status' });
    }
};

// Toggle like on an item
exports.toggleLike = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        if (isSponsoredFeedItemId(id)) {
            await ensureSponsoredAdsEngagementSchema();
            const adId = normalizeSponsoredAdId(id);
            const checkLike = await pool.query('SELECT 1 FROM ad_likes WHERE ad_id = $1 AND user_id = $2', [adId, userId]);

            if (checkLike.rows.length > 0) {
                const rewardCheck = await pool.query(
                    'SELECT 1 FROM ad_coin_collections WHERE ad_id = $1 AND user_id = $2 LIMIT 1',
                    [adId, userId]
                );
                if (rewardCheck.rows.length > 0) {
                    return res.status(403).json({
                        success: false,
                        message: 'This ad like is locked after coin collection.',
                        liked: true,
                        locked: true,
                    });
                }
                await pool.query('DELETE FROM ad_likes WHERE ad_id = $1 AND user_id = $2', [adId, userId]);
                await pool.query('UPDATE ads SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE ad_id = $1', [adId]);
                return res.status(200).json({ success: true, liked: false });
            }

            await pool.query('INSERT INTO ad_likes (ad_id, user_id) VALUES ($1, $2)', [adId, userId]);
            await pool.query('UPDATE ads SET likes_count = COALESCE(likes_count, 0) + 1 WHERE ad_id = $1', [adId]);
            return res.status(200).json({ success: true, liked: true });
        }

        const checkLike = await pool.query('SELECT 1 FROM market_likes WHERE market_id = $1 AND user_id = $2', [id, userId]);

        if (checkLike.rows.length > 0) {
            await ensureSponsoredAdsEngagementSchema();
            if (await hasCollectedCoinForPromotedProduct(pool, id, userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'This ad like is locked after coin collection.',
                    liked: true,
                    locked: true,
                });
            }

            await pool.query('DELETE FROM market_likes WHERE market_id = $1 AND user_id = $2', [id, userId]);
            // Decrement likes_count in market table
            await pool.query('UPDATE market SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1', [id]);
            res.status(200).json({ success: true, liked: false });
        } else {
            await pool.query('INSERT INTO market_likes (market_id, user_id) VALUES ($1, $2)', [id, userId]);
            // Increment likes_count in market table
            await pool.query('UPDATE market SET likes_count = likes_count + 1 WHERE id = $1', [id]);
            res.status(200).json({ success: true, liked: true });
        }
    } catch (error) {
        console.error('Error toggling like:', error);
        res.status(500).json({ success: false, message: 'Server error toggling like' });
    }
};

exports.collectAdLikeCoin = async (req, res) => {
    const client = await pool.connect();

    try {
        const rawAdId = req.body?.ad_id ?? req.params.id;
        const adId = normalizeSponsoredAdId(String(rawAdId || ''));
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        if (!adId) {
            return res.status(400).json({ success: false, message: 'Coin rewards are only available for ads.' });
        }

        await ensureSponsoredAdsEngagementSchema();

        await client.query('BEGIN');

        const adResult = await client.query(
            'SELECT ad_id, user_id, campaign_type, media_type, edit_draft, remaining_budget FROM ads WHERE ad_id = $1 LIMIT 1 FOR UPDATE',
            [adId]
        );
        if (!adResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        const adRow = adResult.rows[0];
        const resolvedAdType = normalizeAdType(req.body?.ad_type ?? req.body?.campaign_type ?? adRow.campaign_type ?? 'Ads');
        const draft = safeJsonParse(adRow.edit_draft, adRow.edit_draft) || {};
        const ownerId = Number(
            adRow.user_id ??
            draft.owner_user_id ??
            draft.ownerUserId ??
            draft.owner_id ??
            draft.user_id ??
            null
        );

        if (!Number.isFinite(ownerId) || ownerId <= 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Ad owner not found' });
        }

        if (ownerId === Number(userId)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'You cannot collect a coin from your own ad.' });
        }

        const ownerResult = await client.query(
            'SELECT id FROM users WHERE id = $1',
            [ownerId]
        );
        if (!ownerResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Ad owner not found' });
        }

        const collectorResult = await client.query(
            'SELECT id, wallet_balance FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        if (!collectorResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const likeResult = await client.query(
            'SELECT 1 FROM ad_likes WHERE ad_id = $1 AND user_id = $2',
            [adId, userId]
        );
        let hasRequiredLike = likeResult.rows.length > 0;
        if (!hasRequiredLike && adRow.campaign_type === 'Product Promote') {
            const linkedProductId = draft.linkedProductId || null;
            const linkedProductCode = draft.linkedProductCode || null;
            if (linkedProductId || linkedProductCode) {
                const productLikeResult = await client.query(
                    `SELECT 1
                     FROM market_likes ml
                     JOIN market m ON m.id = ml.market_id
                     WHERE ml.user_id = $1
                       AND ($2::int IS NULL OR m.id = $2)
                       AND ($3::text IS NULL OR m.product_code = $3)
                     LIMIT 1`,
                    [userId, linkedProductId ? Number(linkedProductId) : null, linkedProductCode || null]
                );
                hasRequiredLike = productLikeResult.rows.length > 0;
            }
        }
        if (!hasRequiredLike) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'You must like this ad before collecting the coin.' });
        }

        if (isSponsoredVideoAd(adRow)) {
            const eligibilityResult = await client.query(
                'SELECT 1 FROM ad_video_watch_eligibility WHERE ad_id = $1 AND user_id = $2 AND watched_seconds >= 5 LIMIT 1',
                [adId, userId]
            );

            if (!eligibilityResult.rows.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'Watch this ad video for at least 5 seconds before collecting the coin.',
                });
            }
        }

        const rewardSettings = await getActiveAdCoinRewardSettings(client);

        const adRemainingBudget = Number(adRow.remaining_budget || 0);
        if (adRemainingBudget < rewardSettings.advertiser_charge_amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Reward unavailable' });
        }

        const collectionInsertResult = await client.query(
            `INSERT INTO ad_coin_collections (
                ad_id,
                ad_type,
                user_id,
                reward_amount,
                commission,
                advertiser_charge
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (ad_id, ad_type, user_id) DO NOTHING
            RETURNING id`,
            [
                adId,
                resolvedAdType,
                userId,
                rewardSettings?.user_reward_amount ?? DEFAULT_AD_COIN_REWARD_SETTINGS.user_reward_amount,
                rewardSettings?.googer_commission_amount ?? DEFAULT_AD_COIN_REWARD_SETTINGS.googer_commission_amount,
                rewardSettings?.advertiser_charge_amount ?? DEFAULT_AD_COIN_REWARD_SETTINGS.advertiser_charge_amount,
            ]
        );

        if (!collectionInsertResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: 'You already collected this coin' });
        }

        await client.query(
            'UPDATE ads SET remaining_budget = GREATEST(0, remaining_budget - $1), spend = COALESCE(spend, 0) + $1 WHERE ad_id = $2',
            [rewardSettings.advertiser_charge_amount, adId]
        );
        await client.query(
            'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
            [rewardSettings.user_reward_amount, userId]
        );
        const googerUserId = await getGoogerWalletUserId(client);
        if (!googerUserId) {
            await client.query('ROLLBACK');
            return res.status(500).json({ success: false, message: 'Googer wallet account not found' });
        }
        await client.query(
            'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
            [rewardSettings.googer_commission_amount, googerUserId]
        );

        await client.query(
            `INSERT INTO wallet_transfers (
                sender_id,
                receiver_id,
                amount,
                status,
                type,
                note,
                commission,
                commission_percentage
            ) VALUES ($1, $2, $3, 'accepted', 'ad_coin', $4, $5, 0)`,
            [
                ownerId,
                userId,
                rewardSettings.user_reward_amount,
                `Ad coin reward for ${adId} (${resolvedAdType})`,
                0,
            ]
        );

        await client.query(
            `INSERT INTO wallet_transfers (
                sender_id,
                receiver_id,
                amount,
                status,
                type,
                note,
                commission,
                commission_percentage
            ) VALUES ($1, $1, $2, 'accepted', 'ad_coin_ad_credit', $3, 0, 0)`,
            [
                ownerId,
                rewardSettings.advertiser_charge_amount,
                `Advertiser ad coin credit for ${adId} (${resolvedAdType})`,
            ]
        );

        await client.query(
            `INSERT INTO wallet_transfers (
                sender_id,
                receiver_id,
                amount,
                status,
                type,
                note,
                commission,
                commission_percentage
            ) VALUES ($1, $2, $3, 'accepted', 'ad_coin_commission', $4, $3, 0)`,
            [
                ownerId,
                googerUserId,
                rewardSettings.googer_commission_amount,
                `Googer commission for ${adId} (${resolvedAdType})`,
            ]
        );

        await client.query(
            `UPDATE wallet_transfers
             SET status = 'accepted',
                 updated_at = CURRENT_TIMESTAMP
             WHERE sender_id = $1
               AND receiver_id = $2
               AND type = 'ad_coin'
               AND note = $3`,
            [
                ownerId,
                userId,
                `Ad coin reward for ${adId} (${resolvedAdType})`,
            ]
        );

        await client.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: 'Coin collected successfully',
            collected: true,
            locked: true,
            amount: rewardSettings.user_reward_amount,
            commission: rewardSettings.googer_commission_amount,
            advertiserCharge: rewardSettings.advertiser_charge_amount,
            adId,
            adType: resolvedAdType,
        }
        );
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error collecting ad like coin:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error collecting ad like coin',
            error: error.message,
        });
    } finally {
        client.release();
    }
};

exports.markAdVideoWatchEligible = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        if (!isSponsoredFeedItemId(id)) {
            return res.status(400).json({ success: false, message: 'Video watch tracking is only available for ads.' });
        }

        await ensureSponsoredAdsEngagementSchema();
        const adId = normalizeSponsoredAdId(id);
        const watchedSeconds = Math.max(0, Math.floor(Number(req.body?.watchedSeconds || 0)));

        const adResult = await pool.query(
            'SELECT ad_id, media_type, edit_draft FROM ads WHERE ad_id = $1 LIMIT 1',
            [adId]
        );

        if (!adResult.rows.length) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        const adRow = adResult.rows[0];
        const eligibleSeconds = Math.max(5, watchedSeconds);

        if (!isSponsoredVideoAd(adRow)) {
            return res.status(200).json({ success: true, eligible: true, watchedSeconds: eligibleSeconds });
        }

        await pool.query(
            `INSERT INTO ad_video_watch_eligibility (ad_id, user_id, watched_seconds, eligible_at, updated_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (ad_id, user_id)
             DO UPDATE SET
                watched_seconds = GREATEST(ad_video_watch_eligibility.watched_seconds, EXCLUDED.watched_seconds),
                eligible_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP`,
            [adId, userId, eligibleSeconds]
        );

        return res.status(200).json({ success: true, eligible: true, watchedSeconds: eligibleSeconds });
    } catch (error) {
        console.error('Error marking ad video watch eligibility:', error);
        return res.status(500).json({ success: false, message: 'Server error tracking ad video watch' });
    }
};

// Add a comment to an item
exports.addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { text, parent_id } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            console.error('❌ [addComment] User ID missing from request');
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });

        const userResult = await pool.query(
            'SELECT username, profile_picture FROM users WHERE id = $1',
            [userId]
        );
        const commentUser = userResult.rows[0] || {};

        console.log(`📝 [addComment] Inserting comment for item ${id} by user ${userId}. Parent: ${parent_id || 'None'}`);

        if (isSponsoredFeedItemId(id)) {
            await ensureSponsoredAdsEngagementSchema();
            const adId = normalizeSponsoredAdId(id);
            const normalizedParentId = parent_id
                ? parseInt(String(parent_id).replace('ad-comment-', ''), 10)
                : null;

            const result = await pool.query(
                `INSERT INTO ad_comments (ad_id, user_id, comment, parent_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, ad_id, user_id, comment as text, parent_id, created_at`,
                [adId, userId, text, Number.isFinite(normalizedParentId) ? normalizedParentId : null]
            );

            await pool.query(
                'UPDATE ads SET comments_count = COALESCE(comments_count, 0) + 1 WHERE ad_id = $1',
                [adId]
            );

            return res.status(201).json({
                success: true,
                data: {
                    ...result.rows[0],
                    id: `ad-comment-${result.rows[0].id}`,
                    parent_id: result.rows[0].parent_id ? `ad-comment-${result.rows[0].parent_id}` : null,
                    market_id: id,
                    username: commentUser.username || 'You',
                    profile_picture: commentUser.profile_picture,
                },
            });
        }

        const numericId = parseInt(id, 10);
        const result = await pool.query(
            'INSERT INTO market_comments (market_id, user_id, comment, parent_id) VALUES ($1, $2, $3, $4) RETURNING id, market_id, user_id, comment as text, parent_id, created_at',
            [numericId, userId, text, parent_id ? parseInt(parent_id, 10) : null]
        );

        await pool.query('UPDATE market SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = $1', [numericId]);

        res.status(201).json({
            success: true,
            data: {
                ...result.rows[0],
                username: commentUser.username || 'You',
                profile_picture: commentUser.profile_picture,
            },
        });
    } catch (error) {
        console.error('❌ [addComment] Database Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error adding comment',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Delete a comment
exports.deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user.id;

        if (String(commentId).startsWith('ad-comment-')) {
            await ensureSponsoredAdsEngagementSchema();
            const normalizedCommentId = parseInt(String(commentId).replace('ad-comment-', ''), 10);
            const commentResult = await pool.query('SELECT * FROM ad_comments WHERE id = $1', [normalizedCommentId]);
            if (commentResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Comment not found' });

            const comment = commentResult.rows[0];
            const ownerResult = await pool.query('SELECT user_id FROM ads WHERE ad_id = $1 LIMIT 1', [comment.ad_id]);
            const ownerId = Number(ownerResult.rows[0]?.user_id || 0);
            const canDelete = Number(comment.user_id) === Number(userId) || ownerId === Number(userId);
            if (!canDelete) return res.status(403).json({ success: false, message: 'Not authorized' });

            const deleteResult = await pool.query(
                `WITH RECURSIVE comment_tree AS (
                    SELECT id, ad_id
                    FROM ad_comments
                    WHERE id = $1
                    UNION ALL
                    SELECT child.id, child.ad_id
                    FROM ad_comments child
                    INNER JOIN comment_tree parent ON child.parent_id = parent.id
                 ),
                 deleted AS (
                    DELETE FROM ad_comments
                    WHERE id IN (SELECT id FROM comment_tree)
                    RETURNING id
                 )
                 SELECT COUNT(*)::int AS deleted_count FROM deleted`,
                [normalizedCommentId]
            );
            const deletedCount = Number(deleteResult.rows[0]?.deleted_count || 0);
            await pool.query(
                'UPDATE ads SET comments_count = GREATEST(COALESCE(comments_count, 0) - $2, 0) WHERE ad_id = $1',
                [comment.ad_id, deletedCount]
            );

            return res.status(200).json({ success: true, message: 'Comment deleted', deletedCount });
        }

        const commentResult = await pool.query('SELECT * FROM market_comments WHERE id = $1', [commentId]);
        if (commentResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Comment not found' });

        const comment = commentResult.rows[0];
        const ownerResult = await pool.query('SELECT user_id FROM market WHERE id = $1 LIMIT 1', [comment.market_id]);
        const ownerId = Number(ownerResult.rows[0]?.user_id || 0);
        const canDelete = Number(comment.user_id) === Number(userId) || ownerId === Number(userId);
        if (!canDelete) return res.status(403).json({ success: false, message: 'Not authorized' });

        const deleteResult = await pool.query(
            `WITH RECURSIVE comment_tree AS (
                SELECT id, market_id
                FROM market_comments
                WHERE id = $1
                UNION ALL
                SELECT child.id, child.market_id
                FROM market_comments child
                INNER JOIN comment_tree parent ON child.parent_id = parent.id
             ),
             deleted AS (
                DELETE FROM market_comments
                WHERE id IN (SELECT id FROM comment_tree)
                RETURNING id
             )
             SELECT COUNT(*)::int AS deleted_count FROM deleted`,
            [commentId]
        );
        const deletedCount = Number(deleteResult.rows[0]?.deleted_count || 0);

        await pool.query(
            'UPDATE market SET comments_count = GREATEST(COALESCE(comments_count, 0) - $2, 0) WHERE id = $1',
            [comment.market_id, deletedCount]
        );

        res.status(200).json({ success: true, message: 'Comment deleted', deletedCount });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ success: false, message: 'Server error deleting comment' });
    }
};

// Log a share event
exports.logShare = async (req, res) => {
    try {
        const { id } = req.params;
        let userId = req.user?.id || null;
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

        // Manual token check if req.user is not set (for public-optional routes)
        if (!userId) {
            const authHeader = req.header('Authorization');
            const token = authHeader?.replace('Bearer ', '');
            if (token) {
                try {
                    const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
                    const decoded = jwt.verify(token, secret);
                    userId = decoded.id;
                } catch (e) { /* ignore */ }
            }
        }

        if (isSponsoredFeedItemId(id)) {
            await ensureSponsoredAdsEngagementSchema();
            await pool.query(`ALTER TABLE ad_shares ADD COLUMN IF NOT EXISTS ip_address TEXT;`);
            const adId = normalizeSponsoredAdId(id);
            let incremented = false;

            if (userId) {
                const existingShare = await pool.query(
                    `SELECT id
                     FROM ad_shares
                     WHERE ad_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE
                     LIMIT 1`,
                    [adId, userId],
                );

                if (existingShare.rows.length === 0) {
                    await pool.query('INSERT INTO ad_shares (ad_id, user_id, ip_address) VALUES ($1, $2, $3)', [adId, userId, ipAddress]);
                    await pool.query('UPDATE ads SET shares_count = COALESCE(shares_count, 0) + 1 WHERE ad_id = $1', [adId]);
                    incremented = true;
                }
            } else {
                const existingShare = await pool.query(
                    `SELECT id
                     FROM ad_shares
                     WHERE ad_id = $1 AND ip_address = $2 AND user_id IS NULL AND created_at::date = CURRENT_DATE
                     LIMIT 1`,
                    [adId, ipAddress],
                );

                if (existingShare.rows.length === 0) {
                    await pool.query('INSERT INTO ad_shares (ad_id, user_id, ip_address) VALUES ($1, $2, $3)', [adId, userId, ipAddress]);
                    await pool.query('UPDATE ads SET shares_count = COALESCE(shares_count, 0) + 1 WHERE ad_id = $1', [adId]);
                    incremented = true;
                }
            }

            return res.status(200).json({ success: true, incremented });
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS market_shares (
                id SERIAL PRIMARY KEY,
                market_id INTEGER NOT NULL REFERENCES market(id) ON DELETE CASCADE,
                user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE,
                ip_address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`ALTER TABLE market_shares ADD COLUMN IF NOT EXISTS ip_address TEXT;`);

        let incremented = false;

        if (userId) {
            const existingShare = await pool.query(
                `SELECT id
                 FROM market_shares
                 WHERE market_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE
                 LIMIT 1`,
                [id, userId],
            );

            if (existingShare.rows.length === 0) {
                await pool.query('INSERT INTO market_shares (market_id, user_id, ip_address) VALUES ($1, $2, $3)', [id, userId, ipAddress]);
                await pool.query('UPDATE market SET shares_count = shares_count + 1 WHERE id = $1', [id]);
                incremented = true;
            }
        } else {
            const existingShare = await pool.query(
                `SELECT id
                 FROM market_shares
                 WHERE market_id = $1 AND ip_address = $2 AND user_id IS NULL AND created_at::date = CURRENT_DATE
                 LIMIT 1`,
                [id, ipAddress],
            );

            if (existingShare.rows.length === 0) {
                await pool.query('INSERT INTO market_shares (market_id, user_id, ip_address) VALUES ($1, $2, $3)', [id, userId, ipAddress]);
                await pool.query('UPDATE market SET shares_count = shares_count + 1 WHERE id = $1', [id]);
                incremented = true;
            }
        }

        res.status(200).json({ success: true, incremented });
    } catch (error) {
        console.error('Error logging share:', error);
        res.status(500).json({ success: false, message: 'Server error logging share' });
    }
};

// Log a view event (Limit to once every 24 hours per user per product)
exports.logView = async (req, res) => {
    try {
        const { id } = req.params;
        let userId = req.user?.id || null;
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

        // Manual token check if req.user is not set
        if (!userId) {
            const authHeader = req.header('Authorization');
            const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader;
            if (token) {
                try {
                    const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
                    const decoded = jwt.verify(token, secret);
                    userId = decoded.id;
                } catch (e) { /* ignore invalid/expired tokens — treat as guest */ }
            }
        }

        if (isSponsoredFeedItemId(id)) {
            await ensureSponsoredAdsEngagementSchema();
            const adId = normalizeSponsoredAdId(id);
            let query = '';
            let params = [];

            if (userId) {
                query = 'SELECT last_viewed_at FROM ad_views WHERE ad_id = $1 AND user_id = $2';
                params = [adId, userId];
            } else {
                query = 'SELECT last_viewed_at FROM ad_views WHERE ad_id = $1 AND ip_address = $2 AND user_id IS NULL';
                params = [adId, ipAddress];
            }

            const viewCheck = await pool.query(query, params);
            const now = new Date();
            let shouldIncrement = false;

            if (viewCheck.rows.length === 0) {
                if (userId) {
                    await pool.query(
                        'INSERT INTO ad_views (ad_id, user_id, ip_address, last_viewed_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
                        [adId, userId, ipAddress]
                    );
                } else {
                    await pool.query(
                        'INSERT INTO ad_views (ad_id, ip_address, last_viewed_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
                        [adId, ipAddress]
                    );
                }
                shouldIncrement = true;
            } else {
                const lastViewed = new Date(viewCheck.rows[0].last_viewed_at);
                const diffInHours = (now - lastViewed) / (1000 * 60 * 60);

                if (diffInHours >= 24) {
                    if (userId) {
                        await pool.query(
                            'UPDATE ad_views SET last_viewed_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE ad_id = $2 AND user_id = $3',
                            [ipAddress, adId, userId]
                        );
                    } else {
                        await pool.query(
                            'UPDATE ad_views SET last_viewed_at = CURRENT_TIMESTAMP WHERE ad_id = $1 AND ip_address = $2 AND user_id IS NULL',
                            [adId, ipAddress]
                        );
                    }
                    shouldIncrement = true;
                }
            }

            if (shouldIncrement) {
                await pool.query('UPDATE ads SET impressions = COALESCE(impressions, 0) + 1 WHERE ad_id = $1', [adId]);
            }

            return res.status(200).json({ success: true, incremented: shouldIncrement });
        }

        // Resolve market_id: support both numeric id and alphanumeric product_code
        let marketId = parseInt(id, 10);
        if (isNaN(marketId)) {
            // Lookup by product_code
            const itemResult = await pool.query('SELECT id FROM market WHERE product_code = $1', [id]);
            if (itemResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }
            marketId = itemResult.rows[0].id;
        }

        let query = '';
        let params = [];

        if (userId) {
            // Logged-in user: deduplicate by user_id (ignore IP for logged-in users)
            query = 'SELECT last_viewed_at FROM market_views WHERE market_id = $1 AND user_id = $2';
            params = [marketId, userId];
        } else {
            // Guest user: deduplicate by IP address
            query = 'SELECT last_viewed_at FROM market_views WHERE market_id = $1 AND ip_address = $2 AND user_id IS NULL';
            params = [marketId, ipAddress];
        }

        const viewCheck = await pool.query(query, params);
        const now = new Date();
        let shouldIncrement = false;

        if (viewCheck.rows.length === 0) {
            // First time viewing — insert a view record
            if (userId) {
                await pool.query(
                    'INSERT INTO market_views (market_id, user_id, ip_address, last_viewed_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
                    [marketId, userId, ipAddress]
                );
            } else {
                await pool.query(
                    'INSERT INTO market_views (market_id, ip_address, last_viewed_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
                    [marketId, ipAddress]
                );
            }
            shouldIncrement = true;
        } else {
            // Existing record found — only count again after 24 hours
            const lastViewed = new Date(viewCheck.rows[0].last_viewed_at);
            const diffInHours = (now - lastViewed) / (1000 * 60 * 60);

            if (diffInHours >= 24) {
                // 24h elapsed — refresh timestamp and increment
                if (userId) {
                    await pool.query(
                        'UPDATE market_views SET last_viewed_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE market_id = $2 AND user_id = $3',
                        [ipAddress, marketId, userId]
                    );
                } else {
                    await pool.query(
                        'UPDATE market_views SET last_viewed_at = CURRENT_TIMESTAMP WHERE market_id = $1 AND ip_address = $2 AND user_id IS NULL',
                        [marketId, ipAddress]
                    );
                }
                shouldIncrement = true;
            }
            // else: within 24h window — do NOT increment again
        }

        if (shouldIncrement) {
            await pool.query('UPDATE market SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [marketId]);
        }

        res.status(200).json({ success: true, incremented: shouldIncrement });
    } catch (error) {
        console.error('Error logging view:', error);
        res.status(500).json({ success: false, message: 'Server error logging view' });
    }
};

// Get all comments for an item
exports.getComments = async (req, res) => {
    try {
        const { id } = req.params;
        if (isSponsoredFeedItemId(id)) {
            await ensureSponsoredAdsEngagementSchema();
            const adId = normalizeSponsoredAdId(id);
            const result = await pool.query(
                `SELECT c.*, c.comment AS text, u.username, u.profile_picture
                 FROM ad_comments c
                 JOIN users u ON c.user_id = u.id
                 WHERE c.ad_id = $1
                 ORDER BY c.created_at DESC`,
                [adId]
            );
            return res.status(200).json({
                success: true,
                data: result.rows.map((row) => ({
                    ...row,
                    id: `ad-comment-${row.id}`,
                    parent_id: row.parent_id ? `ad-comment-${row.parent_id}` : null,
                    market_id: id,
                    created_at: toUtcIso(row.created_at),
                })),
            });
        }
        const result = await pool.query(
            `SELECT c.*, c.comment AS text, u.username, u.profile_picture 
             FROM market_comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.market_id = $1 
             ORDER BY c.created_at DESC`,
            [parseInt(id)]
        );
        res.status(200).json({
            success: true,
            data: result.rows.map((row) => ({
                ...row,
                created_at: toUtcIso(row.created_at),
            })),
        });
    } catch (error) {
        console.error('❌ [getComments] Database Error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching comments', error: error.message });
    }
};
// Get all users who liked an item
exports.getLikes = async (req, res) => {
    try {
        const { id } = req.params;
        if (isSponsoredFeedItemId(id)) {
            await ensureSponsoredAdsEngagementSchema();
            const adId = normalizeSponsoredAdId(id);
            const result = await pool.query(
                `SELECT l.*, u.username, u.profile_picture
                 FROM ad_likes l
                 JOIN users u ON l.user_id = u.id
                 WHERE l.ad_id = $1
                 ORDER BY l.created_at DESC`,
                [adId]
            );
            return res.status(200).json({
                success: true,
                data: result.rows.map((row) => ({
                    ...row,
                    created_at: toUtcIso(row.created_at),
                })),
            });
        }
        const result = await pool.query(
            `SELECT l.*, u.username, u.profile_picture 
             FROM market_likes l 
             JOIN users u ON l.user_id = u.id 
             WHERE l.market_id = $1 
             ORDER BY l.created_at DESC`,
            [id]
        );
        res.status(200).json({
            success: true,
            data: result.rows.map((row) => ({
                ...row,
                created_at: toUtcIso(row.created_at),
            })),
        });
    } catch (error) {
        console.error('Error fetching likes:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get all users who shared an item
exports.getShares = async (req, res) => {
    try {
        const { id } = req.params;
        if (isSponsoredFeedItemId(id)) {
            await ensureSponsoredAdsEngagementSchema();
            const adId = normalizeSponsoredAdId(id);
            const result = await pool.query(
                `SELECT s.*, u.username, u.profile_picture
                 FROM ad_shares s
                 LEFT JOIN users u ON s.user_id = u.id
                 WHERE s.ad_id = $1
                 ORDER BY s.created_at DESC`,
                [adId]
            );
            return res.status(200).json({
                success: true,
                data: result.rows.map((row) => ({
                    ...row,
                    created_at: toUtcIso(row.created_at),
                })),
            });
        }
        const result = await pool.query(
            `SELECT s.*, u.username, u.profile_picture 
             FROM market_shares s 
             JOIN users u ON s.user_id = u.id 
             WHERE s.market_id = $1 
             ORDER BY s.created_at DESC`,
            [id]
        );
        res.status(200).json({
            success: true,
            data: result.rows.map((row) => ({
                ...row,
                created_at: toUtcIso(row.created_at),
            })),
        });
    } catch (error) {
        console.error('Error fetching shares:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get all users who viewed an item
exports.getViews = async (req, res) => {
    try {
        const { id } = req.params;
        if (isSponsoredFeedItemId(id)) {
            await ensureSponsoredAdsEngagementSchema();
            const adId = normalizeSponsoredAdId(id);
            const result = await pool.query(
                `SELECT v.*, u.username, u.profile_picture
                 FROM ad_views v
                 LEFT JOIN users u ON v.user_id = u.id
                 WHERE v.ad_id = $1
                 ORDER BY v.last_viewed_at DESC`,
                [adId]
            );
            return res.status(200).json({
                success: true,
                data: result.rows.map((row) => ({
                    ...row,
                    created_at: toUtcIso(row.last_viewed_at || row.created_at),
                })),
            });
        }
        const result = await pool.query(
            `SELECT v.*, u.username, u.profile_picture 
             FROM market_views v 
             JOIN users u ON v.user_id = u.id 
             WHERE v.market_id = $1 
             ORDER BY v.last_viewed_at DESC`,
            [id]
        );
        res.status(200).json({
            success: true,
            data: result.rows.map((row) => ({
                ...row,
                created_at: toUtcIso(row.last_viewed_at || row.created_at),
            })),
        });
    } catch (error) {
        console.error('Error fetching views:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
exports.getAdPublic = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT a.*, u.username as owner_username, u.profile_picture 
             FROM ads a 
             LEFT JOIN users u ON a.user_id = u.id 
             WHERE a.ad_id = $1`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        res.status(200).json({ success: true, ad: await mapSponsoredAdWithCurrentReward(result.rows[0]) });
    } catch (error) {
        console.error('Error fetching public ad:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getProductByCodePublic = async (req, res) => {
    try {
        await ensureMarketProductCodeColumn();
        const { shareCode } = req.params;
        const normalizedShareCode = decodeURIComponent(String(shareCode || '')).trim();
        let resolvedCode = normalizedShareCode;

        if (/^[0-9A-Za-z]{8}$/.test(normalizedShareCode)) {
            const candidateResult = await pool.query(
                `SELECT m.id, m.product_code
                 FROM market m
                 WHERE m.status IN ('approved', 'active')`
            );
            const matched = (candidateResult.rows || []).find((row) => {
                const codeByProductCode = buildShortShareCode('p', row.product_code || '');
                const codeById = buildShortShareCode('p', row.id);
                return codeByProductCode === normalizedShareCode || codeById === normalizedShareCode;
            });
            if (matched?.product_code) {
                resolvedCode = String(matched.product_code);
            }
        }

        const result = await pool.query(
            `SELECT m.*, u.username as owner_username, u.profile_picture 
             FROM market m 
             LEFT JOIN users u ON m.user_id = u.id 
             WHERE m.product_code = $1 OR LOWER(m.product_code) = LOWER($1) OR m.id::text = $1`,
            [resolvedCode]
        );

        let productRow = result.rows[0] || null;

        if (!productRow) {
            const aliasResult = await pool.query(
                `SELECT m.*, u.username as owner_username, u.profile_picture
                 FROM product_share_aliases psa
                 JOIN market m ON m.id = psa.product_id
                 LEFT JOIN users u ON m.user_id = u.id
                 WHERE LOWER(psa.alias_code) = LOWER($1)
                 LIMIT 1`,
                [normalizedShareCode]
            );
            productRow = aliasResult.rows[0] || null;
        }

        if (!productRow) {
            const adsHasLinkedProductId = await hasTableColumn('ads', 'linked_product_id');
            const adsHasLinkedProductShareCode = await hasTableColumn('ads', 'linked_product_share_code');
            const adsHasLinkedProductCode = await hasTableColumn('ads', 'linked_product_code');
            if (adsHasLinkedProductId || adsHasLinkedProductShareCode || adsHasLinkedProductCode) {
                const linkedClauses = [];
                if (adsHasLinkedProductId) linkedClauses.push('(a.linked_product_id IS NOT NULL AND m.id = a.linked_product_id)');
                if (adsHasLinkedProductShareCode) linkedClauses.push('(a.linked_product_share_code IS NOT NULL AND LOWER(m.product_code) = LOWER(a.linked_product_share_code))');
                if (adsHasLinkedProductCode) linkedClauses.push('(a.linked_product_code IS NOT NULL AND LOWER(m.product_code) = LOWER(a.linked_product_code))');
                const whereClauses = [];
                if (adsHasLinkedProductShareCode) whereClauses.push('LOWER(a.linked_product_share_code) = LOWER($1)');
                if (adsHasLinkedProductCode) whereClauses.push('LOWER(a.linked_product_code) = LOWER($1)');
                whereClauses.push('a.edit_draft::text ILIKE $2');

                const linkedAdResult = await pool.query(
                    `SELECT m.*, u.username as owner_username, u.profile_picture
                     FROM ads a
                     JOIN market m ON (${linkedClauses.join(' OR ')})
                     LEFT JOIN users u ON m.user_id = u.id
                     WHERE (${whereClauses.join(' OR ')})
                       AND m.status IN ('approved', 'active', 'reviewing')
                     LIMIT 1`,
                    [normalizedShareCode, `%${normalizedShareCode}%`]
                );
                productRow = linkedAdResult.rows[0] || null;
            }
        }

        if (!productRow) {
            const linkedAdResult = await pool.query(
                `SELECT m.*, u.username as owner_username, u.profile_picture
                 FROM ads a
                 JOIN market m ON a.edit_draft::text ILIKE ('%' || m.product_code || '%')
                 LEFT JOIN users u ON m.user_id = u.id
                 WHERE a.edit_draft::text ILIKE $1
                   AND m.status IN ('approved', 'active', 'reviewing')
                 LIMIT 1`,
                [`%${normalizedShareCode}%`]
            );
            productRow = linkedAdResult.rows[0] || null;
        }

        if (!productRow) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        productRow = await ensureProductRowHasCanonicalShareCode(productRow);
        const mappedProduct = attachCurrentUser(productRow);
        const canonicalShareCode = getCanonicalProductShareCode(productRow);
        const canonicalSharePath = canonicalShareCode ? `/product/${canonicalShareCode}` : '';
        res.status(200).json({
            success: true,
            product: {
                ...mappedProduct,
                canonical_share_code: canonicalShareCode,
                canonical_share_path: canonicalSharePath,
            },
        });
    } catch (error) {
        console.error('Error fetching public product:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getUnifiedShareItem = async (req, res) => {
    try {
        const { shareCode } = req.params;
        if (!shareCode) return res.status(400).json({ success: false, message: 'Missing share code' });
        const decodedShareCode = decodeURIComponent(String(shareCode)).trim();
        await ensureGoogShareLookupReady();
        let normalizedShareCode = decodedShareCode;
        const resolveSharedProfile = async (userTarget) => {
            const isNumericId = /^\d+$/.test(userTarget);
            let userResult = null;

            if (isNumericId) {
                userResult = await pool.query(
                    `SELECT id, user_id, username, full_name, bio, profile_picture, email, created_at
                     FROM users
                     WHERE id = $1 OR user_id = $2
                     LIMIT 1`,
                    [Number(userTarget), userTarget]
                );
            }

            if (!userResult || !userResult.rows.length) {
                userResult = await pool.query(
                    `SELECT id, user_id, username, full_name, bio, profile_picture, email, created_at
                     FROM users
                     WHERE LOWER(username) = LOWER($1)
                     LIMIT 1`,
                    [userTarget]
                );
            }

            if (userResult?.rows?.length) {
                return res.status(200).json({
                    success: true,
                    type: 'profile',
                    data: userResult.rows[0],
                });
            }
            return null;
        };

        if (/^[0-9A-Za-z]{4,16}$/.test(decodedShareCode)) {
            const profileByCode = await pool.query(
                `SELECT id, user_id, username, full_name, bio, profile_picture, email, created_at
                 FROM users`
            );
            for (const profile of profileByCode.rows || []) {
                const usernameCode = buildShortShareCode('u', profile.username || '');
                const userIdCode = buildShortShareCode('u', profile.user_id || '');
                const idCode = buildShortShareCode('u', profile.id);
                if ([usernameCode, userIdCode, idCode].includes(decodedShareCode)) {
                    return res.status(200).json({
                        success: true,
                        type: 'profile',
                        data: profile,
                    });
                }
            }

            await pool.query(`ALTER TABLE goog_posts ADD COLUMN IF NOT EXISTS share_code VARCHAR(32);`);
            const googByCode = await pool.query(`SELECT id, share_code FROM goog_posts`);
            const matchedGoog = (googByCode.rows || []).find((row) => {
                const storedCode = String(row.share_code || '').trim();
                return storedCode === decodedShareCode || buildShortShareCode('g', row.id) === decodedShareCode;
            });
            let matchedGoogId = matchedGoog?.id ?? null;
            if (matchedGoogId == null) {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS goog_share_aliases (
                        id SERIAL PRIMARY KEY,
                        alias_code VARCHAR(32) UNIQUE NOT NULL,
                        goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                `);
                const googAliasResult = await pool.query(
                    `SELECT goog_id
                     FROM goog_share_aliases
                     WHERE LOWER(alias_code) = LOWER($1)
                     LIMIT 1`,
                    [decodedShareCode]
                );
                matchedGoogId = googAliasResult.rows[0]?.goog_id ?? null;
            }
            if (matchedGoogId != null) {
                const googResult = await pool.query(
                    `SELECT gp.*, u.username, u.full_name, u.profile_picture, gp.share_code
                     FROM goog_posts gp
                     JOIN users u ON u.id = gp.user_id
                     WHERE gp.id = $1`,
                    [Number(matchedGoogId)]
                );
                if (googResult.rows.length > 0) {
                    return res.status(200).json({
                        success: true,
                        type: 'goog',
                        data: mapGoogShareResponse(googResult.rows[0]),
                    });
                }
            }

            const adByCode = await pool.query(`SELECT ad_id FROM ads`);
            const matchedAd = (adByCode.rows || []).find((row) => buildShortShareCode('a', row.ad_id || '') === decodedShareCode);
            if (matchedAd?.ad_id) {
                const adResult = await pool.query(
                    `SELECT a.*, u.username as owner_username, u.profile_picture 
                     FROM ads a 
                     LEFT JOIN users u ON a.user_id = u.id 
                     WHERE a.ad_id = $1`,
                    [matchedAd.ad_id]
                );
                if (adResult.rows.length > 0) {
                    return res.status(200).json({
                        success: true,
                        type: 'ad',
                    data: await mapSponsoredAdWithCurrentReward(adResult.rows[0]),
                    });
                }
            }

            const profileLegacy = await resolveSharedProfile(decodedShareCode);
            if (profileLegacy) return profileLegacy;
        }
        const googMatch = normalizedShareCode.match(/^goog-(\d+)$/i);
        const adMatch = normalizedShareCode.match(/^ad-(.+)$/i);
        if (googMatch) {
            const googResult = await pool.query(
                `SELECT gp.*, u.username, u.full_name, u.profile_picture, gp.share_code
                 FROM goog_posts gp
                 JOIN users u ON u.id = gp.user_id
                 WHERE gp.id = $1`,
                [parseInt(googMatch[1], 10)]
            );
            if (googResult.rows.length > 0) {
                return res.status(200).json({
                    success: true,
                    type: 'goog',
                    data: mapGoogShareResponse(googResult.rows[0]),
                });
            }
        }

        if (!googMatch) {
            const adId = adMatch ? adMatch[1] : normalizedShareCode;
            const adResult = await pool.query(
                `SELECT a.*, u.username as owner_username, u.profile_picture 
                 FROM ads a 
                 LEFT JOIN users u ON a.user_id = u.id 
                 WHERE a.ad_id = $1`,
                [adId]
            );
            if (adResult.rows.length > 0) {
                return res.status(200).json({
                    success: true,
                    type: 'ad',
                    data: await mapSponsoredAdWithCurrentReward(adResult.rows[0])
                });
            }
        }

        if (!adMatch && !googMatch) {
            const adsHasProductCode = await hasTableColumn('ads', 'product_code');
            if (adsHasProductCode) {
                const adResult = await pool.query(
                    `SELECT a.*, u.username as owner_username, u.profile_picture 
                     FROM ads a 
                     LEFT JOIN users u ON a.user_id = u.id 
                     WHERE a.product_code IS NOT NULL AND (a.product_code = $1 OR LOWER(a.product_code) = LOWER($1))`,
                    [normalizedShareCode]
                );
                if (adResult.rows.length > 0) {
                    return res.status(200).json({
                        success: true,
                        type: 'ad',
                        data: await mapSponsoredAdWithCurrentReward(adResult.rows[0])
                    });
                }
            }
        }

        // Legacy support for old numeric Goog links; new links use goog-:id to avoid product collisions.
        if (!adMatch && !googMatch && /^\d+$/.test(normalizedShareCode)) {
            const googResult = await pool.query(
                `SELECT gp.*, u.username, u.full_name, u.profile_picture, gp.share_code
                 FROM goog_posts gp
                 JOIN users u ON u.id = gp.user_id
                 WHERE gp.id = $1`,
                [parseInt(normalizedShareCode, 10)]
            );
            if (googResult.rows.length > 0) {
                return res.status(200).json({
                    success: true,
                    type: 'goog',
                    data: mapGoogShareResponse(googResult.rows[0])
                });
            }
        }

        res.status(404).json({ success: false, message: 'Item not found' });
    } catch (error) {
        console.error('Error in getUnifiedShareItem:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: String(error?.message || error),
        });
    }
};
