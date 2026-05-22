const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const {
    filterDeliverableAds,
    loadViewerAdProfile,
} = require('../utils/adDelivery');

const HOME_AD_RATIO = 4;
let feedAdEngagementReady = false;

const ensureFeedAdEngagementSchema = async () => {
    if (feedAdEngagementReady) return;
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
    `);
    await pool.query(`
        ALTER TABLE ads
        ADD COLUMN IF NOT EXISTS linked_product_id INTEGER,
        ADD COLUMN IF NOT EXISTS linked_product_share_code VARCHAR(32),
        ADD COLUMN IF NOT EXISTS current_reach INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS max_reach_cap INTEGER,
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
    `);
    feedAdEngagementReady = true;
};

const getOptionalUserId = (req) => {
    if (req.user?.id) return req.user.id;

    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader;
    if (!token) return null;

    try {
        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        return decoded?.id || null;
    } catch {
        return null;
    }
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

const normalizeMediaGallery = (value, fallback = []) => {
    const parsed = safeJsonParse(value, value);
    const source = Array.isArray(parsed) ? parsed : fallback;
    return normalizeFeedMediaList(source);
};

const SHARE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const UPPERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERS = 'abcdefghijklmnopqrstuvwxyz';

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

const toUtcIso = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)
        ? `${raw.replace(' ', 'T')}Z`
        : raw;
    const date = new Date(normalized);
    const time = date.getTime();
    return Number.isFinite(time) ? date.toISOString() : null;
};

const normalizePost = (row) => ({
    id: Number(row.id),
    share_code: /^[0-9A-Za-z]{8}$/.test(String(row.share_code || '').trim()) ? String(row.share_code).trim() : '',
    shareCode: /^[0-9A-Za-z]{8}$/.test(String(row.share_code || '').trim()) ? String(row.share_code).trim() : '',
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
    liked: !!row.user_liked,
    user: {
        id: row.user_id,
        username: row.username || '',
        name: row.full_name || row.username || 'User',
        img: stripDataUrl(row.profile_picture) || '/assets/images/avatars/avatar-default.jpg',
    },
});

const mapActiveAdToHomeAd = (row) => {
    const draft = safeJsonParse(row.edit_draft, row.edit_draft) || {};
    const gallery = normalizeMediaGallery(row.media_gallery, normalizeMediaGallery(draft.mediaGallery, row.media_preview ? [row.media_preview] : []));
    const mediaPreview = getMediaUrl(row.media_preview) || gallery[0] || getDataUrlFallback(row.media_preview, row.media_gallery, draft.mediaGallery) || '/assets/images/googer.png';
    const canonicalShareCode = /^[0-9A-Za-z]{8}$/.test(String(row.share_code || '').trim())
        ? String(row.share_code).trim()
        : buildShortShareCode('a', row.ad_id || '', 8);
    const isProductPromote = String(row.campaign_type || '').trim().toLowerCase() === 'product promote';
    const linkedProductId = row.linked_product_id ?? null;
    const linkedProductShareCode = row.linked_product_share_code ?? null;
    const safeDraft = {
        ...draft,
        mediaPreview,
        mediaGallery: gallery,
        activeLink: draft.activeLink || '',
    };

    return {
        id: `ad-${row.ad_id}`,
        adId: row.ad_id,
        ad_id: row.ad_id,
        user_id: row.user_id,
        owner_user_id: row.owner_user_id,
        username: row.owner_username_joined || row.owner_username || 'Ads',
        owner_username: row.owner_username_joined || row.owner_username || 'Ads',
        user: {
            id: row.user_id,
            user_id: row.owner_user_id,
            username: row.owner_username_joined || row.owner_username || 'Ads',
            profile_picture: stripDataUrl(row.profile_picture) || null,
        },
        title: row.title || draft.headline || row.description || row.campaign_type || 'Ads',
        description: row.description || draft.description || '',
        category: row.campaign_type || 'Ads',
        price: Number(row.budget || 0),
        image_url: mediaPreview,
        main_image: mediaPreview,
        media_url: getMediaUrl(row.media_url) || getMediaUrl(draft.mediaUrl) || getMediaUrl(draft.media_url) || getMediaUrl(draft.video_url) || mediaPreview,
        thumbnail_url: mediaPreview,
        video_url: getMediaUrl(row.video_url) || getMediaUrl(draft.video_url) || getMediaUrl(row.media_url) || mediaPreview,
        media_preview: mediaPreview,
        media_gallery: gallery,
        images: gallery,
        media_type: row.media_type || '',
        status: 'approved',
        likes_count: Number(row.likes_count || 0),
        likeCount: Number(row.likes_count || 0),
        comments_count: Number(row.comments_count || 0),
        commentCount: Number(row.comments_count || 0),
        shares_count: Number(row.shares_count || 0),
        shareCount: Number(row.shares_count || 0),
        views_count: Number(row.impressions || 0),
        viewCount: Number(row.impressions || 0),
        createdAt: toUtcIso(row.active_start_time || row.started_at || row.created_at),
        created_at: toUtcIso(row.active_start_time || row.started_at || row.created_at),
        activeStartTime: toUtcIso(row.active_start_time || row.started_at),
        active_start_time: toUtcIso(row.active_start_time || row.started_at),
        startedAt: toUtcIso(row.started_at || row.active_start_time),
        started_at: toUtcIso(row.started_at || row.active_start_time),
        profile_picture: stripDataUrl(row.profile_picture) || null,
        product_code: isProductPromote ? (linkedProductShareCode || row.product_code || null) : row.ad_id,
        share_code: isProductPromote ? (linkedProductShareCode || row.share_code || null) : canonicalShareCode,
        shareCode: isProductPromote ? (linkedProductShareCode || row.share_code || null) : canonicalShareCode,
        canonical_share_code: canonicalShareCode,
        canonical_share_path: `/share/${canonicalShareCode}`,
        campaign_type: row.campaign_type || 'Ads',
        editDraft: safeDraft,
        edit_draft: safeDraft,
        active_link: safeDraft.activeLink || '',
        cta_topic: safeDraft.ctaTopic || 'Visit',
        cta_value: safeDraft.ctaValue || '',
        linked_product_id: linkedProductId,
        linked_product_share_code: linkedProductShareCode,
        linked_product_code: linkedProductShareCode,
        product_id: linkedProductId,
        is_sponsored: true,
        user_liked: !!row.user_liked,
        ad_coin_collected: !!row.ad_coin_collected,
        ad_like_locked: !!row.ad_coin_collected,
    };
};

const interleaveHomeFeed = (posts, ads, offset) => {
    const shuffleAds = (items) => [...items].sort(() => Math.random() - 0.5);
    const profileAds = shuffleAds(ads.filter((ad) => ad.campaign_type === 'Profile Promote'));
    const standardAds = shuffleAds(ads.filter((ad) => ad.campaign_type !== 'Profile Promote'));
    const mixed = [];
    let adIndex = standardAds.length ? offset % standardAds.length : 0;

    posts.forEach((post, index) => {
        mixed.push({ type: 'write', post });
        if ((index + 1 + offset) % HOME_AD_RATIO === 0 && standardAds.length > 0) {
            mixed.push({ type: 'ad', ad: standardAds[adIndex % standardAds.length] });
            adIndex += 1;
        }
    });

    if (!posts.length && standardAds[0]) {
        mixed.push({ type: 'ad', ad: standardAds[0] });
    }

    if (profileAds.length > 0) {
        const low = Math.min(2, mixed.length);
        const high = Math.min(Math.max(4, low), mixed.length);
        const insertAt = low + Math.floor(Math.random() * (Math.max(1, high - low + 1)));
        mixed.splice(insertAt, 0, {
            type: 'profilePromoteCarousel',
            id: `profile-promote-carousel-${offset}`,
            ads: profileAds,
        });
    }

    return mixed;
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

const hydrateProductPromoteAds = async (ads) => {
    const productPromoteAds = ads.filter(
        (ad) => ad.campaign_type === 'Product Promote' && (ad.linked_product_id != null || ad.linked_product_share_code)
    );
    if (!productPromoteAds.length) return ads;

    const linkedIds = Array.from(
        new Set(productPromoteAds.map((ad) => parseInt(ad.linked_product_id, 10)).filter((value) => Number.isFinite(value)))
    );
    const linkedCodes = Array.from(new Set(productPromoteAds.map((ad) => ad.linked_product_share_code).filter(Boolean)));

    const linkedResult = await pool.query(
        `SELECT m.id, m.user_id, m.title, m.description, m.price, m.promo_price, m.stock,
                m.image_url, m.variants, m.shipping_info, m.product_code,
                u.username AS owner_username, u.profile_picture
         FROM market m
         INNER JOIN users u ON u.id = m.user_id
         WHERE (m.id = ANY($1::int[]) OR m.product_code = ANY($2::text[]))
           AND m.status IN ('approved', 'active')`,
        [linkedIds.length ? linkedIds : [0], linkedCodes.length ? linkedCodes : ['']]
    );

    const productById = new Map(linkedResult.rows.map((row) => [Number(row.id), row]));
    const productByCode = new Map(linkedResult.rows.map((row) => [String(row.product_code || ''), row]));

    return ads.map((ad) => {
        if (ad.campaign_type !== 'Product Promote') return ad;
        const linked =
            (ad.linked_product_id != null && productById.get(Number(ad.linked_product_id))) ||
            (ad.linked_product_share_code && productByCode.get(String(ad.linked_product_share_code)));
        if (!linked) {
            console.warn("Failed to hydrate Product Promote home feed ad", {
                adId: ad.adId || ad.ad_id,
                productId: ad.linked_product_id ?? null,
                productCode: ad.linked_product_share_code ?? null,
            });
            return null;
        }

        const variants = safeJsonParse(linked.variants, linked.variants);
        const normalizedVariants = (Array.isArray(variants) ? variants : []).map((variant) => ({
            ...variant,
            image: getMediaUrl(variant?.image) || getRawMediaValue(variant?.image),
            image_url: getMediaUrl(variant?.image_url) || getMediaUrl(variant?.url) || getMediaUrl(variant?.image) || getRawMediaValue(variant?.image_url),
            url: getMediaUrl(variant?.url) || getMediaUrl(variant?.image_url) || getMediaUrl(variant?.image) || getRawMediaValue(variant?.url),
        }));
        const gallery = normalizeFeedMediaList(linked.image_url, normalizedVariants, ad.media_gallery);
        const dataUrlFallback = getDataUrlFallback(linked.image_url, linked.variants, ad.media_gallery, ad.image_url, ad.media_preview);
        const primaryImage = getMediaUrl(linked.image_url) || gallery[0] || getMediaUrl(ad.image_url) || dataUrlFallback || '/assets/images/googer.png';
        const { price, promo_price } = normalizeProductPromotePriceFields(linked, ad);

        return {
            ...ad,
            title: linked.title || ad.title,
            description: linked.description || ad.description,
            price,
            main_price: price,
            product_price: price,
            promo_price,
            stock: linked.stock,
            image_url: primaryImage,
            main_image: primaryImage,
            media_url: primaryImage,
            thumbnail_url: primaryImage,
            media_preview: primaryImage,
            media_gallery: gallery,
            images: gallery,
            variants: normalizedVariants,
            shipping_info: linked.shipping_info,
            product_code: linked.product_code || ad.product_code,
            linked_product_share_code: linked.product_code || ad.linked_product_share_code,
            share_code: linked.product_code || String(linked.id),
            product_id: linked.id,
            linked_product_id: linked.id,
            linked_product_code: linked.product_code,
            owner_username: linked.owner_username || ad.owner_username,
            username: linked.owner_username || ad.username,
            profile_picture: stripDataUrl(linked.profile_picture) || ad.profile_picture,
        };
    }).filter(Boolean);
};

exports.getHomeFeed = async (req, res) => {
    try {
        const userId = getOptionalUserId(req);
        const limitRaw = Number.parseInt(req.query.limit, 10);
        const offsetRaw = Number.parseInt(req.query.offset, 10);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
        const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
        await ensureFeedAdEngagementSchema();

        const [postResult, adResult] = await Promise.all([
            pool.query(
                `SELECT gp.id, gp.user_id, gp.text, gp.text_color, gp.likes_count, gp.comments_count,
                        gp.views_count, gp.shares_count, gp.created_at, gp.updated_at,
                        u.username, u.full_name, u.profile_picture,
                        CASE WHEN $1::INTEGER IS NULL THEN FALSE
                             ELSE EXISTS (
                                SELECT 1 FROM goog_likes gl
                                WHERE gl.goog_id = gp.id AND gl.user_id = $1
                             )
                        END AS user_liked
                 FROM goog_posts gp
                 JOIN users u ON u.id = gp.user_id
                 ORDER BY gp.created_at DESC
                 LIMIT $2 OFFSET $3`,
                [userId, limit + 1, offset]
            ),
            pool.query(
                `SELECT a.ad_id, a.user_id, a.owner_user_id, a.owner_username, a.campaign_type,
                        a.title, a.description, a.media_preview, a.media_gallery, a.media_type,
                        a.edit_draft, a.gender_target, a.age_min, a.age_max,
                        a.impressions, a.clicks, a.current_reach, a.max_reach_cap,
                        a.likes_count, a.comments_count, a.shares_count,
                        a.budget, a.remaining_budget, a.duration_days, a.status, a.started_at, a.active_start_time, a.created_at,
                        u.username AS owner_username_joined, u.profile_picture,
                        CASE WHEN $1::int IS NULL THEN FALSE
                             ELSE EXISTS(SELECT 1 FROM ad_likes al WHERE al.ad_id = a.ad_id AND al.user_id = $1)
                        END AS user_liked,
                        CASE WHEN $1::int IS NULL THEN FALSE
                             ELSE EXISTS(SELECT 1 FROM ad_like_coin_rewards acr WHERE acr.ad_id = a.ad_id AND acr.user_id = $1)
                        END AS ad_coin_collected
                 FROM ads a
                 LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.status = 'Active'
                   AND (a.max_reach_cap IS NULL OR COALESCE(a.current_reach, 0) < a.max_reach_cap)
                 ORDER BY a.created_at DESC`,
                [userId]
            ),
        ]);

        const postRows = postResult.rows || [];
        const posts = postRows.slice(0, limit).map(normalizePost);
        const viewerProfile = await loadViewerAdProfile(pool, userId, req);
        const matchedAdRows = viewerProfile?.isAnonymous
            ? (adResult.rows || [])
            : filterDeliverableAds(adResult.rows || [], viewerProfile);
        const ads = await hydrateProductPromoteAds(matchedAdRows.map(mapActiveAdToHomeAd));

        res.status(200).json({
            success: true,
            items: interleaveHomeFeed(posts, ads, offset),
            posts,
            ads,
            pagination: {
                limit,
                offset,
                nextOffset: offset + posts.length,
                hasMore: postRows.length > limit,
            },
        });
    } catch (error) {
        console.error('Error fetching home feed:', error);
        res.status(500).json({ success: false, message: 'Server error fetching home feed' });
    }
};
