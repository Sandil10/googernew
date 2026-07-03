const jwt = require('jsonwebtoken');
const {
    filterDeliverableAds,
    loadViewerAdProfile,
} = require('../../utils/adDelivery');
const homeFeedRepository = require('./homeFeedRepository');

const HOME_AD_RATIO = 4;
const ANONYMOUS_HOME_FEED_CACHE_TTL_MS = Math.max(
    0,
    Number.parseInt(process.env.ANONYMOUS_HOME_FEED_CACHE_TTL_MS || '5000', 10) || 5000
);
const ANONYMOUS_HOME_FEED_STALE_TTL_MS = Math.max(
    0,
    Number.parseInt(process.env.ANONYMOUS_HOME_FEED_STALE_TTL_MS || '15000', 10) || 15000
);
const anonymousHomeFeedCache = new Map();
const anonymousHomeFeedRefreshes = new Map();

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
    const val = String(input || '');
    for (let index = 0; index < val.length; index += 1) {
        hash ^= val.charCodeAt(index);
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

const readDurationMs = (startNs) => Number(process.hrtime.bigint() - startNs) / 1e6;
const shouldLogHomeFeedTiming = () => /^(1|true|yes|on)$/i.test(String(process.env.HOME_FEED_TIMING_LOG || '').trim());
const getAnonymousHomeFeedCacheKey = (req, limit, offset) => {
    const queryKeys = Object.keys(req.query || {}).filter((key) => !['limit', 'offset'].includes(key));
    if (queryKeys.length > 0) return null;
    return `anon:${limit}:${offset}`;
};

const getCachedAnonymousHomeFeed = (cacheKey) => {
    if (!cacheKey || (ANONYMOUS_HOME_FEED_CACHE_TTL_MS <= 0 && ANONYMOUS_HOME_FEED_STALE_TTL_MS <= 0)) return null;
    const cached = anonymousHomeFeedCache.get(cacheKey);
    if (!cached) return null;
    if (cached.staleAt <= Date.now()) {
        anonymousHomeFeedCache.delete(cacheKey);
        return null;
    }
    return {
        isFresh: cached.expiresAt > Date.now(),
        isStale: cached.expiresAt <= Date.now() && cached.staleAt > Date.now(),
        payload: cached.payload,
    };
};

const setCachedAnonymousHomeFeed = (cacheKey, payload) => {
    if (!cacheKey || (ANONYMOUS_HOME_FEED_CACHE_TTL_MS <= 0 && ANONYMOUS_HOME_FEED_STALE_TTL_MS <= 0)) return;
    const now = Date.now();
    anonymousHomeFeedCache.set(cacheKey, {
        payload,
        expiresAt: now + ANONYMOUS_HOME_FEED_CACHE_TTL_MS,
        staleAt: now + Math.max(ANONYMOUS_HOME_FEED_CACHE_TTL_MS, ANONYMOUS_HOME_FEED_STALE_TTL_MS),
    });

    if (anonymousHomeFeedCache.size <= 100) return;
    for (const [key, value] of anonymousHomeFeedCache.entries()) {
        if (value.staleAt <= now) anonymousHomeFeedCache.delete(key);
    }
};

const getAnonymousHomeFeedRefresh = (cacheKey) => anonymousHomeFeedRefreshes.get(cacheKey) || null;
const setAnonymousHomeFeedRefresh = (cacheKey, promise) => {
    if (!cacheKey || !promise) return promise;
    anonymousHomeFeedRefreshes.set(cacheKey, promise);
    promise.finally(() => {
        if (anonymousHomeFeedRefreshes.get(cacheKey) === promise) {
            anonymousHomeFeedRefreshes.delete(cacheKey);
        }
    });
    return promise;
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
        name: String(row.user_type || '').toLowerCase().replace(/[\s-]+/g, '_') === 'superadmin' || String(row.user_type || '').toLowerCase().replace(/[\s-]+/g, '_') === 'super_admin'
            ? 'Googer Support'
            : String(row.user_type || '').toLowerCase() === 'admin'
                ? (row.username || row.full_name || 'User')
                : (row.full_name || row.username || 'User'),
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
        activeLink: draft.activeLink || '',
        mediaGallery: gallery,
        mediaPreview,
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
        views_count: Number(row.views_count || 0),
        viewCount: Number(row.views_count || 0),
        impressions: Number(row.impressions || 0),
        impressions_count: Number(row.impressions || 0),
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
        promo_price: resolvedPromoPrice !== null && resolvedPromoPrice !== undefined && resolvedPromoPrice !== ''
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
    const linkedResult = await homeFeedRepository.fetchLinkedProducts({ linkedIds, linkedCodes });

    const productById = new Map(linkedResult.rows.map((row) => [Number(row.id), row]));
    const productByCode = new Map(linkedResult.rows.map((row) => [String(row.product_code || ''), row]));

    return ads.map((ad) => {
        if (ad.campaign_type !== 'Product Promote') return ad;
        const linked =
            (ad.linked_product_id != null && productById.get(Number(ad.linked_product_id))) ||
            (ad.linked_product_share_code && productByCode.get(String(ad.linked_product_share_code)));
        if (!linked) {
            console.warn('Failed to hydrate Product Promote home feed ad', {
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

const buildHomeFeedPayload = async ({ req, userId, isAnonymousRequest, limit, offset, timings, requestStartedAt }) => {
    const mark = (label, startedAt) => {
        timings[label] = Number(readDurationMs(startedAt).toFixed(2));
    };
    const baseAdSlots = Math.ceil(limit / HOME_AD_RATIO) + 1;
    const adFetchLimit = isAnonymousRequest
        ? Math.min(Math.max(baseAdSlots * 2, 12), 24)
        : Math.min(Math.max(limit * 3, 40), 120);

    const queriesStartedAt = process.hrtime.bigint();
    const [postResult, adResult] = await Promise.all([
        homeFeedRepository.fetchHomeFeedPosts({ userId, isAnonymousRequest, limit, offset }),
        homeFeedRepository.fetchHomeFeedAds({ userId, isAnonymousRequest, adFetchLimit }),
    ]);
    mark('queriesMs', queriesStartedAt);

    const normalizePostsStartedAt = process.hrtime.bigint();
    const postRows = postResult.rows || [];
    const posts = postRows.slice(0, limit).map(normalizePost);
    mark('normalizePostsMs', normalizePostsStartedAt);

    let matchedAdRows = adResult.rows || [];
    if (!isAnonymousRequest) {
        const viewerProfileStartedAt = process.hrtime.bigint();
        const viewerProfile = await loadViewerAdProfile(homeFeedRepository.db, userId, req);
        mark('viewerProfileMs', viewerProfileStartedAt);

        const filterAdsStartedAt = process.hrtime.bigint();
        matchedAdRows = filterDeliverableAds(matchedAdRows, viewerProfile);
        mark('filterAdsMs', filterAdsStartedAt);
    }

    const hydrateAdsStartedAt = process.hrtime.bigint();
    const ads = await hydrateProductPromoteAds(matchedAdRows.map(mapActiveAdToHomeAd));
    mark('hydrateAdsMs', hydrateAdsStartedAt);

    const interleaveStartedAt = process.hrtime.bigint();
    const items = interleaveHomeFeed(posts, ads, offset);
    mark('interleaveMs', interleaveStartedAt);
    mark('totalMs', requestStartedAt);

    return {
        adFetchLimit,
        adsReturned: ads.length,
        payload: {
            success: true,
            items,
            posts,
            ads,
            pagination: {
                limit,
                offset,
                nextOffset: offset + posts.length,
                hasMore: postRows.length > limit,
            },
        },
        postsReturned: posts.length,
    };
};

const getHomeFeedResult = async (req) => {
    const requestStartedAt = process.hrtime.bigint();
    const timings = {};
    const userId = getOptionalUserId(req);
    const isAnonymousRequest = !userId;
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const offsetRaw = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
    const cacheKey = isAnonymousRequest ? getAnonymousHomeFeedCacheKey(req, limit, offset) : null;

    if (cacheKey) {
        const cachedEntry = getCachedAnonymousHomeFeed(cacheKey);
        if (cachedEntry?.isFresh) {
            return { cacheHeader: 'HIT', payload: cachedEntry.payload, statusCode: 200 };
        }

        const inFlightRefresh = getAnonymousHomeFeedRefresh(cacheKey);
        if (inFlightRefresh) {
            const payload = await inFlightRefresh;
            return { cacheHeader: 'WAIT', payload, statusCode: 200 };
        }

        if (cachedEntry?.isStale) {
            const refreshPromise = setAnonymousHomeFeedRefresh(
                cacheKey,
                buildHomeFeedPayload({ req, userId, isAnonymousRequest, limit, offset, timings: {}, requestStartedAt: process.hrtime.bigint() })
                    .then(({ payload }) => {
                        setCachedAnonymousHomeFeed(cacheKey, payload);
                        return payload;
                    })
                    .catch((error) => {
                        console.error('Error refreshing stale home feed cache:', error);
                        throw error;
                    })
            );
            void refreshPromise.catch(() => {});
            return { cacheHeader: 'STALE', payload: cachedEntry.payload, statusCode: 200 };
        }
    }

    const builder = buildHomeFeedPayload({ req, userId, isAnonymousRequest, limit, offset, timings, requestStartedAt });
    const result = cacheKey
        ? await setAnonymousHomeFeedRefresh(
            cacheKey,
            builder.then((built) => {
                setCachedAnonymousHomeFeed(cacheKey, built.payload);
                return built.payload;
            })
        ).then((payload) => ({ payload }))
        : await builder;

    if (cacheKey) {
        return { cacheHeader: 'MISS', payload: result.payload, statusCode: 200 };
    }

    if (shouldLogHomeFeedTiming()) {
        console.info('[home-feed-timing]', {
            userId: userId || null,
            isAnonymousRequest,
            limit,
            offset,
            adFetchLimit: result.adFetchLimit,
            postsReturned: result.postsReturned,
            adsReturned: result.adsReturned,
            timings,
        });
    }

    return { payload: result.payload, statusCode: 200 };
};

module.exports = {
    getHomeFeedResult,
};
