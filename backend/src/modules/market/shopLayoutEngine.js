/**
 * Shop feed layout engine — the single place that decides which products and
 * ads appear, in what order, and where the ads/profile carousels sit.
 *
 * Web and mobile used to each arrange the feed themselves, with different
 * hash functions and with inputs that only exist on one device (recently
 * shown ads in localStorage, per-product dwell time). They could never agree.
 * This is a port of the web arrangement (app/dashboard/shop/page.tsx) with
 * every device-local input removed, so the result is a pure function of
 * (viewer, products, ads) and both apps just render it.
 *
 * Output is token lists, not objects:
 *   "p:<productId>"   a normal product
 *   "a:<adId>"        an ad (numeric ad id, no "ad-" prefix)
 *   "c:<n>"           the n-th profile-promote carousel row
 */

const ALGORITHMS = [
    { id: 'trending', label: 'Trending Now' },
    { id: 'recommended', label: 'Recommended For You' },
    { id: 'best-sellers', label: 'Best Sellers' },
    { id: 'new-arrivals', label: 'New Arrivals' },
    { id: 'most-viewed', label: 'Most Viewed' },
    { id: 'popular-week', label: 'Popular This Week' },
];

const PRODUCT_RATIO = 6;

// ── seeded shuffle (identical to web getSeededRandom / shuffleItemsWithSeed) ──
const getSeededRandom = (seed) => {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000000) / 1000000;
};

const shuffleItemsWithSeed = (items, seed, getKey) =>
    [...items].sort((a, b) => getSeededRandom(`${seed}:${getKey(a)}`) - getSeededRandom(`${seed}:${getKey(b)}`));

// ── ranking (port of the web scoring helpers) ──
const num = (value, fallback = 0) => {
    const parsed = parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const promoPrice = (p) => {
    const promo = num(p?.promo_price ?? p?.promoPrice, NaN);
    if (Number.isFinite(promo)) return promo;
    return num(p?.price ?? p?.main_price ?? p?.product_price, 0);
};

const salesScore = (p) =>
    num(p?.purchases_count) * 1000 + num(p?.add_to_cart_count) * 50 + num(p?.likes_count) * 5 + num(p?.views_count);

const ageHours = (p, now) => {
    const t = new Date(p?.created_at || p?.createdAt || 0).getTime();
    return Number.isFinite(t) && t > 0 ? Math.max((now - t) / 36e5, 0) : 9999;
};

const freshnessScore = (p, now) => {
    const h = ageHours(p, now);
    if (h <= 24) return 100;
    if (h <= 72) return 70;
    if (h <= 168) return 45;
    if (h <= 720) return 20;
    return 5;
};

const stockScore = (p) => {
    const stock = num(p?.stock ?? p?.total_stock ?? p?.available_stock, 0);
    if (stock <= 0) return 0;
    if (stock >= 20) return 100;
    return 45 + stock * 2.75;
};

const priceCompetitiveness = (p) => {
    const price = promoPrice(p);
    const original = num(p?.price ?? p?.main_price ?? p?.product_price, price);
    if (!price) return 0;
    if (original > price) return Math.min(100, 55 + ((original - price) / original) * 150);
    return 45;
};

const sellerPerformance = (p) => {
    let score = 50;
    if (p?.seller_verified || p?.verified_seller) score += 20;
    score += Math.min(20, num(p?.seller_rating ?? p?.rating, 0) * 4);
    if (p?.seller_fast_response) score += 10;
    score -= Math.min(35, num(p?.seller_cancel_rate, 0));
    if (p?.seller_reported) score -= 45;
    return Math.max(0, Math.min(100, score));
};

const textMatch = (p, query) => {
    const keywords = String(query || '').toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length >= 2);
    if (!keywords.length) return 0;
    const haystack = [p?.title, p?.description, p?.category, p?.sub_category, p?.manual_category, p?.username, p?.owner_username]
        .map((v) => String(v || '').toLowerCase()).join(' ');
    return Math.min(100, keywords.filter((w) => haystack.includes(w)).length * 35);
};

const ctrScore = (p) => {
    const views = num(p?.views_count);
    const clicks = num(p?.clicks_count ?? p?.click_count ?? p?.likes_count, 0);
    return views > 0 ? Math.min(100, (clicks / views) * 300) : clicks > 0 ? 40 : 0;
};

const conversionScore = (p) => {
    const views = num(p?.views_count);
    const purchases = num(p?.purchases_count);
    const carts = num(p?.add_to_cart_count);
    if (views <= 0) return Math.min(100, purchases * 25 + carts * 8);
    return Math.min(100, ((purchases * 4 + carts) / views) * 100);
};

// Web adds a per-device "time spent" term here; it is 0 for everyone now.
const engagementScore = (p) =>
    num(p?.views_count) + num(p?.likes_count) * 3 + num(p?.comments_count) * 4 +
    num(p?.shares_count) * 5 + num(p?.add_to_cart_count) * 8 + num(p?.purchases_count) * 15;

const ltrScore = (p, query) =>
    textMatch(p, query) * 0.22 + ctrScore(p) * 0.15 + conversionScore(p) * 0.18 +
    Math.min(100, salesScore(p) / 10) * 0.14 + priceCompetitiveness(p) * 0.10 +
    stockScore(p) * 0.10 + sellerPerformance(p) * 0.08;

const trendingScore = (p, now) => {
    const hoursOld = Math.max(ageHours(p, now), 6);
    const velocity = engagementScore(p) / Math.sqrt(hoursOld);
    return velocity + freshnessScore(p, now) * 0.35 + num(p?.search_count ?? p?.search_frequency, 0) * 6;
};

const popularWeekScore = (p, now) => {
    const boost = ageHours(p, now) <= 168 ? 1.4 : 0.65;
    return engagementScore(p) * boost + salesScore(p) * 0.12;
};

const rankProducts = (products, algorithm, now, query = '') => {
    const score = (p) => {
        if (algorithm === 'trending') return trendingScore(p, now);
        if (algorithm === 'best-sellers') return salesScore(p);
        if (algorithm === 'new-arrivals') return freshnessScore(p, now) * 100 - ageHours(p, now);
        if (algorithm === 'most-viewed') return num(p?.views_count);
        if (algorithm === 'popular-week') return popularWeekScore(p, now);
        return ltrScore(p, query) + trendingScore(p, now) * 0.18;
    };
    const scored = products.map((p) => ({ p, s: score(p) }));
    return scored
        .sort((a, b) => {
            const diff = b.s - a.s;
            if (diff !== 0) return diff;
            return new Date(b.p?.created_at || 0).getTime() - new Date(a.p?.created_at || 0).getTime();
        })
        .map((x) => x.p);
};

// ── ads ──
const adKey = (ad) => String(ad?.adId || ad?.ad_id || String(ad?.id || '').replace(/^ad-/, '') || '');

const campaignType = (ad) => String(ad?.campaign_type || ad?.campaignType || '').trim();

const isProfilePromote = (ad) =>
    campaignType(ad).toLowerCase() === 'profile promote' || ad?.media_type === 'profile';

const insertionType = (ad) => {
    const ct = campaignType(ad).toLowerCase();
    const mediaType = String(ad?.media_type || ad?.mediaType || '').trim().toLowerCase();
    const link = String(ad?.active_link || ad?.activeLink || ad?.cta_value || ad?.ctaValue || '').trim().toLowerCase();
    const title = String(ad?.title || '').trim().toLowerCase();
    if (ct === 'product promote') return 'product-promote';
    if (ct === 'profile promote') return 'profile-promote';
    if (ct.includes('photo') && ct.includes('video')) return 'photo-video';
    if (ct.includes('image') && ct.includes('link')) return 'image-link';
    if (ct.includes('video') && ct.includes('link')) return 'video-link';
    if (ct.includes('photo')) return 'photo';
    if (ct.includes('video')) return 'video';
    if (ct.includes('image')) return 'image';
    if (ct.includes('link')) {
        if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(link) || mediaType.includes('video')) return 'video-link';
        return 'image-link';
    }
    if (mediaType.includes('video') || /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(link) || /\bvideo\b/.test(title)) return 'video';
    if (mediaType.includes('image') || /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(link)) return 'photo';
    return 'standard';
};

// Web's getShuffledShopAdCycle, minus the per-device "recently shown" list.
const shuffledAdCycle = (ads, seed) => {
    const groups = new Map();
    ads.forEach((ad) => {
        const t = insertionType(ad);
        if (!groups.has(t)) groups.set(t, []);
        groups.get(t).push(ad);
    });
    const orderedKeys = shuffleItemsWithSeed([...groups.keys()], `${seed}:group-order`, (k) => k);
    const roundRobin = orderedKeys
        .map((key) => ({
            type: key,
            items: [
                ...shuffleItemsWithSeed(groups.get(key), `${seed}:${key}:fresh`, adKey),
            ],
        }))
        .filter((g) => g.items.length > 0);

    const out = [];
    let remaining = true;
    while (remaining) {
        remaining = false;
        for (const group of roundRobin) {
            const next = group.items.shift();
            if (next) {
                out.push(next);
                remaining = true;
            }
        }
    }
    if (out.length <= 1) return out;
    if (insertionType(out[0]) !== insertionType(out[out.length - 1])) return out;
    for (let offset = 1; offset < out.length; offset += 1) {
        const rotated = [...out.slice(offset), ...out.slice(0, offset)];
        if (insertionType(rotated[0]) !== insertionType(rotated[rotated.length - 1])) return rotated;
    }
    return out;
};

const productToken = (p) => `p:${p.id}`;
const adToken = (ad) => `a:${adKey(ad)}`;

const interleaveWithAds = (productTokens, ads, seed, rotation = 0, ratio = PRODUCT_RATIO) => {
    if (!ads.length) return productTokens;
    const cycle = shuffledAdCycle(ads, seed);
    const offset = cycle.length ? Math.abs(rotation) % cycle.length : 0;
    const rotated = offset > 0 ? [...cycle.slice(offset), ...cycle.slice(0, offset)] : cycle;

    if (!productTokens.length) return rotated[0] ? [adToken(rotated[0])] : productTokens;
    if (productTokens.length < ratio) return rotated[0] ? [...productTokens, adToken(rotated[0])] : productTokens;

    const out = [];
    let adIndex = 0;
    productTokens.forEach((token, index) => {
        out.push(token);
        if ((index + 1) % ratio === 0) {
            const ad = rotated[adIndex % rotated.length];
            if (ad) {
                out.push(adToken(ad));
                adIndex += 1;
            }
        }
    });
    return out;
};

const insertProfileCarousels = (tokens, hasProfileAds) => {
    if (!hasProfileAds) return tokens;
    if (!tokens.length) return ['c:1'];
    const intervals = [4, 24];
    let intervalIndex = 0;
    let slots = 0;
    let count = 0;
    const out = [];
    tokens.forEach((token) => {
        out.push(token);
        if (token.startsWith('c:')) return;
        slots += 1;
        if (slots === intervals[intervalIndex]) {
            count += 1;
            out.push(`c:${count}`);
            slots = 0;
            if (intervalIndex < intervals.length - 1) intervalIndex += 1;
        }
    });
    return out;
};

/**
 * @param {object} input
 * @param {string|number|null} input.viewerId
 * @param {object[]} input.products  market rows (may include sponsored ad rows)
 * @param {object[]} input.ads       ads from /ads/active-public
 * @param {string} [input.query]
 */
const buildShopLayout = ({ viewerId, products, ads, query = '', now = Date.now() }) => {
    const who = viewerId || 'guest';
    const productSeed = `shop-feed-${who}`;
    const adSeed = `shop-feed-ads-${who}`;
    const rotation = 0;

    const sponsoredFromProducts = products.filter((p) => p?.is_sponsored || String(p?.id || '').startsWith('ad-'));
    const rawProducts = products.filter((p) => !sponsoredFromProducts.includes(p) && p?.type !== 'profilePromoteCarousel');

    // Union of both ad sources, one entry per ad id.
    const adMap = new Map();
    [...sponsoredFromProducts, ...ads].forEach((ad) => {
        const key = adKey(ad);
        if (key && !adMap.has(key)) adMap.set(key, ad);
    });
    const allAds = [...adMap.values()].sort((a, b) => adKey(a).localeCompare(adKey(b)));
    const profileAds = allAds.filter(isProfilePromote);
    const topicAds = allAds.filter((ad) => !isProfilePromote(ad));
    const hasProfileAds = profileAds.length > 0;

    const sections = ALGORITHMS.map((section, index) => {
        const ranked = shuffleItemsWithSeed(
            rankProducts(rawProducts, section.id, now, query).slice(0, 10),
            `${productSeed}:${section.id}`,
            (p) => String(p?.id ?? ''),
        );
        const padded = ranked.length > 0 && ranked.length < 4
            ? Array.from({ length: 4 }, (_, i) => ranked[i % ranked.length])
            : ranked;
        return {
            id: section.id,
            label: section.label,
            row: interleaveWithAds(
                padded.map(productToken),
                topicAds,
                `${adSeed}:row:${section.id}`,
                rotation + index,
            ),
        };
    }).filter((s) => s.row.length > 0);

    const ordered = [
        ...sections.filter((s) => s.id === 'recommended'),
        ...sections.filter((s) => s.id !== 'recommended'),
    ];

    const pool = shuffleItemsWithSeed(rawProducts, productSeed, (p) => String(p?.id ?? ''));
    ordered.forEach((section, index) => {
        const sectionProducts = pool.length > 0
            ? Array.from({ length: 12 }, (_, i) => pool[(index * 12 + i) % pool.length])
            : [];
        const interleaved = sectionProducts.length > 0
            ? interleaveWithAds(
                sectionProducts.map(productToken),
                topicAds,
                `${adSeed}:grid:${section.id}`,
                rotation + index,
            )
            : [];
        const remainder = interleaved.length % 4;
        const padded = remainder === 0 || pool.length === 0
            ? interleaved
            : [
                ...interleaved,
                ...Array.from({ length: 4 - remainder }, (_, i) =>
                    productToken(pool[(index * 12 + sectionProducts.length + i) % pool.length])),
            ];
        section.grid = insertProfileCarousels(padded, hasProfileAds);
    });

    const mainRanked = rankProducts(rawProducts, 'recommended', now, query).map(productToken);
    const main = insertProfileCarousels(
        interleaveWithAds(mainRanked, topicAds, `${adSeed}:main`, rotation),
        hasProfileAds,
    );

    return {
        sections: ordered,
        main,
        profileCarouselAdIds: profileAds.map(adKey),
    };
};

module.exports = { buildShopLayout, getSeededRandom };
