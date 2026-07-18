const normalizeText = (value) => String(value || '').trim().toLowerCase();
const { getGraceDurationSeconds } = require('./subscriptionRenewal');
const { buildManagedMediaSqlPredicate } = require('../modules/media');

const REACH_FIRST_CAMPAIGN_TYPES = new Set([
    'product promote',
    'photo promote',
    'video promote',
    'photo and video',
    'photo & video',
]);

const normalizeCampaignType = (value) => normalizeText(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

const isReachFirstCampaign = (adRow) => {
    const type = normalizeCampaignType(adRow?.campaign_type || adRow?.campaignType || '');
    return REACH_FIRST_CAMPAIGN_TYPES.has(type);
};

const isProfilePromoteCampaign = (adRow) => {
    const campaignType = normalizeCampaignType(adRow?.campaign_type || adRow?.campaignType || '');
    const mediaType = normalizeCampaignType(adRow?.media_type || adRow?.mediaType || '');
    return campaignType === 'profile promote'
        || campaignType === 'profile promote ad'
        || mediaType === 'profile';
};
const DAY_MS = 24 * 60 * 60 * 1000;
const getGraceIntervalSql = () => `((${getGraceDurationSeconds()}::text || ' seconds')::interval)`;

// Cache schema column checks to avoid querying information_schema on every feed request
const schemaColumnCache = new Map();
const getCachedColumnCheck = async (pool, tableName, columnName) => {
    const key = `${tableName}.${columnName}`;
    if (schemaColumnCache.has(key)) return schemaColumnCache.get(key);

    const result = await hasTableColumn(pool, tableName, columnName);
    schemaColumnCache.set(key, result);
    return result;
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

const toArray = (value) => {
    const parsed = safeJsonParse(value, value);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
    return [];
};

const uniqueTexts = (values) => Array.from(
    new Set(
        values
            .flatMap((value) => toArray(value))
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    )
);

const hasTableColumn = async (pool, tableName, columnName) => {
    try {
        const result = await pool.query(
            `SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
             LIMIT 1`,
            [tableName, columnName]
        );
        return result.rows.length > 0;
    } catch {
        return false;
    }
};

const getDraft = (adRow) => safeJsonParse(adRow?.edit_draft || adRow?.editDraft, {}) || {};

const getTimestampMs = (value) => {
    if (!value) return null;
    const raw = value instanceof Date
        ? value.toISOString()
        : String(value).trim().replace(' ', 'T');
    const parsed = new Date(raw.endsWith('Z') ? raw : `${raw}Z`).getTime();
    return Number.isFinite(parsed) ? parsed : null;
};

const calculateAdDurationState = (adRow, nowMs = Date.now()) => {
    const durationDays = Number(adRow?.duration_days || adRow?.durationDays || 0);
    const totalMs = durationDays > 0 ? durationDays * DAY_MS : 0;
    const status = String(adRow?.status || '').trim();
    const activeStartTimeMs = getTimestampMs(adRow?.active_start_time || adRow?.activeStartTime || adRow?.started_at || adRow?.startedAt);
    const lastResumedAtMs = getTimestampMs(adRow?.last_resumed_at || adRow?.lastResumedAt);
    const accumulatedActiveMs = Math.max(0, Number(adRow?.accumulated_active_ms ?? adRow?.accumulatedActiveMs ?? 0) || 0);
    const liveSegmentMs = status === 'Active' && lastResumedAtMs
        ? Math.max(0, nowMs - lastResumedAtMs)
        : 0;
    const elapsedMs = totalMs > 0
        ? Math.min(totalMs, accumulatedActiveMs + liveSegmentMs)
        : 0;
    const remainingMs = totalMs > 0
        ? Math.max(0, totalMs - elapsedMs)
        : 0;

    return {
        totalMs,
        elapsedMs,
        remainingMs,
        activeStartTimeMs,
        lastResumedAtMs,
        accumulatedActiveMs,
        isExpired: totalMs > 0 && remainingMs <= 0,
    };
};

const REACH_FIRST_SQL_LIST = "('product promote','photo promote','video promote','photo and video','photo & video')";
const RAW_PHOTO_VIDEO_UPLOAD_SQL = `
    LOWER(COALESCE(a.campaign_type, '')) IN ('photo and video', 'photo & video')
    AND COALESCE(NULLIF(TRIM(a.media_preview), ''), NULLIF(TRIM(a.media_type), '')) IS NOT NULL
    AND COALESCE(NULLIF(TRIM(a.active_link), ''), NULLIF(TRIM(a.edit_draft->>'activeLink'), ''), NULLIF(TRIM(a.edit_draft->>'active_link'), '')) IS NULL
    AND (
        COALESCE(a.media_preview, '') = ''
        OR ${buildManagedMediaSqlPredicate('a.media_preview')}
    )
`;

const syncExpiredAds = async (pool, adId = null) => {
    const params = [];
    const adFilter = adId ? ' AND ad_id = $1' : '';
    if (adId) params.push(adId);
    let expiredCount = 0;
    try {

    // Duration-based expiry — skip reach-first campaign types (Product Promote, Photo/Video).
    // Those ads complete only when their target reach is met, not when duration runs out.
    await pool.query(
        `UPDATE ads
         SET status = 'Completed',
             accumulated_active_ms = LEAST(
                 GREATEST(COALESCE(duration_days, 0), 0) * ${DAY_MS},
                 COALESCE(accumulated_active_ms, 0) + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(last_resumed_at, CURRENT_TIMESTAMP))) * 1000))
             ),
             last_resumed_at = NULL,
             paused_at = NULL,
             completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE status = 'Active'
           AND COALESCE(duration_days, 0) > 0
           ${adFilter}
           AND LOWER(COALESCE(campaign_type, '')) NOT IN ${REACH_FIRST_SQL_LIST}
           AND (
               COALESCE(accumulated_active_ms, 0) + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(last_resumed_at, CURRENT_TIMESTAMP))) * 1000))
           ) >= (GREATEST(COALESCE(duration_days, 0), 0) * ${DAY_MS})`,
        params
    );

    // Stopped/removed ads are hidden from feeds but remain on the owner's
    // profile until the original calendar expiry from approval time.
    await pool.query(
        `UPDATE ads
         SET status = 'Completed',
             last_resumed_at = NULL,
             paused_at = NULL,
             completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('Paused', 'Removed')
           AND COALESCE(duration_days, 0) > 0
           ${adFilter}
           AND active_start_time IS NOT NULL
           AND active_start_time <= NOW() - (GREATEST(COALESCE(duration_days, 0), 0) * INTERVAL '1 day')`,
        params
    );

    // If another system approves an ad directly in the database, lock the approval-time
    // fallback before expiry checks run. Never use created_at/publish time for this flow.
    await pool.query(
        `UPDATE ads a
         SET active_start_time = COALESCE(
                 a.active_start_time,
                 a.started_at,
                 a.last_resumed_at,
                 CASE WHEN a.updated_at IS NOT NULL AND a.updated_at > a.created_at THEN a.updated_at ELSE CURRENT_TIMESTAMP END
             ),
             started_at = COALESCE(
                 a.started_at,
                 a.active_start_time,
                 a.last_resumed_at,
                 CASE WHEN a.updated_at IS NOT NULL AND a.updated_at > a.created_at THEN a.updated_at ELSE CURRENT_TIMESTAMP END
             ),
             last_resumed_at = COALESCE(
                 a.last_resumed_at,
                 a.active_start_time,
                 a.started_at,
                 CASE WHEN a.updated_at IS NOT NULL AND a.updated_at > a.created_at THEN a.updated_at ELSE CURRENT_TIMESTAMP END
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE a.status = 'Active'
           ${adId ? 'AND a.ad_id = $1' : ''}
           AND a.active_start_time IS NULL
           AND ${RAW_PHOTO_VIDEO_UPLOAD_SQL}`,
        adId ? [adId] : []
    );

    // Raw uploaded Photo & Video expiry only. Link ads are excluded.
    // The clock starts when the admin approves the ad (active_start_time).
    // If the user selected an ad duration, the ad runs until that duration ends.
    // The plan raw-ad expiry is only used when no explicit duration is set.
    await pool.query(
        `WITH raw_ads AS (
             SELECT
                 a.ad_id,
                 a.status,
                 COALESCE(
                     (
                         SELECT
                             CASE
                                 WHEN NULLIF(sp.extra->>'ads_expiry_value', '')::numeric > 0 THEN
                                     NULLIF(sp.extra->>'ads_expiry_value', '')::numeric *
                                     CASE LOWER(COALESCE(sp.extra->>'ads_expiry_unit', 'days'))
                                         WHEN 'minutes' THEN INTERVAL '1 minute'
                                         WHEN 'hours'   THEN INTERVAL '1 hour'
                                         ELSE                INTERVAL '1 day'
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
                                         WHEN 'hours'   THEN INTERVAL '1 hour'
                                         ELSE                INTERVAL '1 day'
                                     END
                                 WHEN NULLIF(sp.extra->>'ads_expiry_days', '')::numeric > 0 THEN
                                     NULLIF(sp.extra->>'ads_expiry_days', '')::numeric * INTERVAL '1 day'
                                 ELSE NULL
                             END
                         FROM subscription_plans sp
                         WHERE sp.slug = 'basic' AND sp.is_active = TRUE
                         LIMIT 1
                     )
                 ) AS plan_interval,
                 CASE
                     WHEN COALESCE(a.duration_days, 0) > 0 THEN COALESCE(a.duration_days, 0) * INTERVAL '1 day'
                     ELSE NULL
                 END AS duration_interval
             FROM ads a
             WHERE a.status IN ('Active', 'Paused', 'Removed')
               AND ${RAW_PHOTO_VIDEO_UPLOAD_SQL}
               ${adId ? 'AND a.ad_id = $1' : ''}
         ),
         expiring_ads AS (
             SELECT
                 ad_id,
                 CASE
                     WHEN status = 'Removed' THEN plan_interval
                     ELSE COALESCE(plan_interval, duration_interval)
                 END AS expiry_interval
             FROM raw_ads
         )
         UPDATE ads a
         SET status = 'Completed',
             accumulated_active_ms = CASE
                 WHEN a.status = 'Active' THEN COALESCE(a.accumulated_active_ms, 0) + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(a.last_resumed_at, CURRENT_TIMESTAMP))) * 1000))
                 ELSE COALESCE(a.accumulated_active_ms, 0)
             END,
             last_resumed_at = NULL,
             paused_at = NULL,
             completed_at = COALESCE(a.completed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         FROM expiring_ads up
         WHERE a.ad_id = up.ad_id
           AND up.expiry_interval IS NOT NULL
           AND a.active_start_time IS NOT NULL
           AND a.active_start_time <= NOW() - up.expiry_interval`,
        adId ? [adId] : []
    );

    // Debug: log how many raw photo/video ads exist and what their expiry config looks like
    try {
        const debugResult = await pool.query(
            `SELECT
                 a.ad_id,
                 a.status,
                 a.active_start_time,
                 a.duration_days,
                 EXTRACT(EPOCH FROM (NOW() - a.active_start_time)) / 60 AS elapsed_minutes,
                 (
                     SELECT COALESCE(sp.extra->>'ads_expiry_value', 'NOT SET') || ' ' || COALESCE(sp.extra->>'ads_expiry_unit', 'days')
                     FROM user_plan_subscriptions ups
                     JOIN subscription_plans sp ON sp.id = ups.plan_id
                     WHERE ups.user_id = a.user_id AND ups.status = 'active'
                       AND (ups.expires_at IS NULL OR ups.expires_at + ${getGraceIntervalSql()} > NOW())
                     ORDER BY ups.started_at DESC LIMIT 1
                 ) AS paid_plan_expiry,
                 (
                     SELECT COALESCE(sp.extra->>'ads_expiry_value', 'NOT SET') || ' ' || COALESCE(sp.extra->>'ads_expiry_unit', 'days')
                     FROM subscription_plans sp
                     WHERE sp.slug = 'basic' AND sp.is_active = TRUE LIMIT 1
                 ) AS basic_plan_expiry
             FROM ads a
             WHERE a.status IN ('Active', 'Paused', 'Removed')
               AND ${RAW_PHOTO_VIDEO_UPLOAD_SQL}
               ${adId ? 'AND a.ad_id = $1' : ''}`,
            adId ? [adId] : []
        );
        if (debugResult.rows.length > 0) {
            console.log('[syncExpiredAds] Raw photo/video ads pending expiry check:', JSON.stringify(debugResult.rows, null, 2));
        }
        expiredCount = debugResult.rows.length;
    } catch (debugErr) {
        console.error('[syncExpiredAds] Debug query error:', debugErr.message);
    }

    // Reach-cap completion — applies to all campaign types.
    // For reach-first campaigns this is the primary exit; for others it is a secondary guard.
    // Budget is zeroed for reach-first types: they paid for reach, and reach is now fulfilled.
    await pool.query(
        `UPDATE ads
         SET status = 'Completed',
             remaining_budget = CASE
                 WHEN LOWER(COALESCE(campaign_type, '')) IN ${REACH_FIRST_SQL_LIST}
                 THEN 0
                 ELSE remaining_budget
             END,
             completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE status = 'Active'
           AND max_reach_cap IS NOT NULL
           AND max_reach_cap > 0
           AND COALESCE(impressions, 0) >= max_reach_cap
           ${adFilter}`,
        params
    );
    } catch (err) {
        console.error('[syncExpiredAds] Error during expiry sync:', err.message, err.stack);
    }
};

const getAdTargeting = (adRow) => {
    const draft = getDraft(adRow);
    return {
        gender: String(adRow?.gender_target || adRow?.genderTarget || draft.genderTarget || '').trim(),
        countries: uniqueTexts([
            draft.selectedLocationCodes,
            draft.selectedLocations,
            draft.selectedCountryCodes,
            draft.selectedCountries,
            draft.countryTarget,
        ]),
        interests: uniqueTexts([
            draft.selectedInterestTopics,
            draft.selectedInterests,
            draft.interests,
            draft.interestTopics,
        ]),
    };
};

const loadViewerAdProfile = async (pool, viewerId, req = null) => {
    const searchTerms = uniqueTexts([req?.query?.search, req?.query?.keyword, req?.query?.q]);

    if (!viewerId) {
        return {
            viewerId: null,
            gender: '',
            countries: [],
            interests: searchTerms,
            isAnonymous: true,
        };
    }

    const [usersHasGender, usersHasCountry, usersHasShipping, usersHasInterests, usersHasBio] = await Promise.all([
        getCachedColumnCheck(pool, 'users', 'gender'),
        getCachedColumnCheck(pool, 'users', 'country'),
        getCachedColumnCheck(pool, 'users', 'shipping_address'),
        getCachedColumnCheck(pool, 'users', 'interests'),
        getCachedColumnCheck(pool, 'users', 'bio'),
    ]);

    const profileResult = await pool.query(
        `SELECT id,
                ${usersHasGender ? 'gender,' : "NULL::text AS gender,"}
                ${usersHasCountry ? 'country,' : "NULL::text AS country,"}
                ${usersHasShipping
            ? `CASE
                    WHEN jsonb_typeof(shipping_address) = 'object' THEN COALESCE(shipping_address->>'country', '')
                    ELSE ''
               END AS shipping_country,`
            : "NULL::text AS shipping_country,"}
                ${usersHasInterests ? 'interests,' : "NULL::jsonb AS interests,"}
                ${usersHasBio ? 'bio' : "NULL::text AS bio"}
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [viewerId]
    );

    let activityRows = [];
    if (await getCachedColumnCheck(pool, 'market_views', 'user_id')) {
        try {
            const result = await pool.query(
                `SELECT DISTINCT m.category, m.sub_category, m.manual_category, m.title
                 FROM market_views mv
                 JOIN market m ON m.id = mv.market_id
                 WHERE mv.user_id = $1
                 ORDER BY m.category, m.title
                 LIMIT 80`,
                [viewerId]
            );
            activityRows = result.rows || [];
        } catch {
            activityRows = [];
        }
    }

    const profile = profileResult.rows[0] || {};
    return {
        viewerId,
        gender: profile.gender || '',
        countries: uniqueTexts([profile.country, profile.shipping_country]),
        interests: uniqueTexts([
            profile.interests,
            profile.bio,
            searchTerms,
            activityRows.flatMap((row) => [row.category, row.sub_category, row.manual_category, row.title]),
        ]),
        isAnonymous: false,
    };
};

const matchesGender = (targetGender, viewerGender) => {
    const target = normalizeText(targetGender);
    if (!target || target === 'all' || target === 'any') return true;
    const viewer = normalizeText(viewerGender);
    if (!viewer) return true;
    return viewer === target || viewer.startsWith(target) || target.startsWith(viewer);
};

const matchesAnyText = (targets, values) => {
    const targetTexts = uniqueTexts(targets).map(normalizeText).filter((value) => value && value !== 'all');
    if (!targetTexts.length) return true;

    const valueTexts = uniqueTexts(values).map(normalizeText).filter(Boolean);
    if (!valueTexts.length) return true;

    return targetTexts.some((target) => valueTexts.some((value) => (
        value === target || value.includes(target) || target.includes(value)
    )));
};

let countryAliases = null;
const getCountryAliases = () => {
    if (countryAliases) return countryAliases;
    countryAliases = new Map();
    try {
        const names = new Intl.DisplayNames(['en'], { type: 'region' });
        for (let first = 65; first <= 90; first += 1) {
            for (let second = 65; second <= 90; second += 1) {
                const code = String.fromCharCode(first, second);
                const name = names.of(code);
                if (!name || name === code || name.toLowerCase().includes('unknown region')) continue;
                countryAliases.set(normalizeText(code), normalizeText(name));
                countryAliases.set(normalizeText(name), normalizeText(code));
            }
        }
    } catch {}
    return countryAliases;
};

const expandCountryValues = (values) => {
    const aliases = getCountryAliases();
    return uniqueTexts(values).flatMap((value) => {
        const normalized = normalizeText(value);
        return aliases.has(normalized) ? [value, aliases.get(normalized)] : [value];
    });
};

const adMatchesViewer = (adRow, viewerProfile) => {
    if (viewerProfile?.isAnonymous) return true;

    const targeting = getAdTargeting(adRow);
    if (!matchesGender(targeting.gender, viewerProfile?.gender)) return false;
    if (!matchesAnyText(expandCountryValues(targeting.countries), expandCountryValues(viewerProfile?.countries || []))) return false;
    if (!matchesAnyText(targeting.interests, viewerProfile?.interests || [])) return false;
    return true;
};

const adIsWithinDeliveryRules = (adRow) => {
    if (normalizeText(adRow?.status) !== 'active') return false;

    const cap = adRow?.max_reach_cap == null ? null : Number(adRow.max_reach_cap);
    const impressions = Number(adRow?.impressions || 0);
    if (Number.isFinite(cap) && cap > 0 && impressions >= cap) return false;

    // Reach-first campaigns (Product Promote, Photo/Video) complete only when target reach is
    // met — duration elapsed does not end delivery for these types.
    if (!isReachFirstCampaign(adRow)) {
        const durationState = calculateAdDurationState(adRow);
        if (durationState.isExpired) return false;
    }

    const budget = Number(adRow?.budget || 0);
    const remainingBudget = Number(adRow?.remaining_budget ?? adRow?.remainingBudget ?? budget);
    if (!isProfilePromoteCampaign(adRow) && budget > 0 && remainingBudget <= 0 && !adRow?.promo_code && !adRow?.promoCode) return false;

    return true;
};

const filterDeliverableAds = (rows, viewerProfile) => (
    (rows || []).filter((row) => adIsWithinDeliveryRules(row) && adMatchesViewer(row, viewerProfile || {}))
);

const recordAdImpression = async (pool, adId, amount = 1) => {
    await syncExpiredAds(pool, adId);
    const increment = Math.max(1, Number.parseInt(String(amount), 10) || 1);
    const result = await pool.query(
        `UPDATE ads
         SET impressions = CASE
                 WHEN max_reach_cap IS NOT NULL AND max_reach_cap > 0
                 THEN LEAST(max_reach_cap, COALESCE(impressions, 0) + $1)
                 ELSE COALESCE(impressions, 0) + $1
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE ad_id = $2 AND status = 'Active'
           AND (max_reach_cap IS NULL OR COALESCE(impressions, 0) < max_reach_cap)
         RETURNING impressions, current_reach, reach, max_reach_cap, status`,
        [increment, adId]
    );

    const row = result.rows[0];
    if (row && row.max_reach_cap !== null && Number(row.impressions || 0) >= Number(row.max_reach_cap)) {
        await pool.query(
            `UPDATE ads
             SET status = 'Completed',
                 remaining_budget = CASE
                     WHEN LOWER(COALESCE(campaign_type, '')) IN ${REACH_FIRST_SQL_LIST}
                     THEN 0
                     ELSE remaining_budget
                 END,
                 completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE ad_id = $1 AND status = 'Active'`,
            [adId]
        );
    }

    return row || null;
};

const recordAdClick = async (pool, adId) => {
    const result = await pool.query(
        `UPDATE ads
         SET clicks = COALESCE(clicks, 0) + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE ad_id = $1
         RETURNING clicks`,
        [adId]
    );
    return result.rows[0] || null;
};

module.exports = {
    adIsWithinDeliveryRules,
    adMatchesViewer,
    calculateAdDurationState,
    filterDeliverableAds,
    getAdTargeting,
    isReachFirstCampaign,
    isProfilePromoteCampaign,
    loadViewerAdProfile,
    normalizeText,
    recordAdClick,
    recordAdImpression,
    safeJsonParse,
    syncExpiredAds,
};
