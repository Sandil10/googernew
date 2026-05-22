const normalizeText = (value) => String(value || '').trim().toLowerCase();

const REACH_FIRST_CAMPAIGN_TYPES = new Set([
    'product promote',
    'photo promote',
    'video promote',
    'photo and video',
    'photo & video',
]);

const isReachFirstCampaign = (adRow) => {
    const type = normalizeText(adRow?.campaign_type || adRow?.campaignType || '');
    return REACH_FIRST_CAMPAIGN_TYPES.has(type);
};
const DAY_MS = 24 * 60 * 60 * 1000;

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
const BASIC_RAW_PHOTO_VIDEO_EXPIRY_INTERVAL = "INTERVAL '10 minutes'";
const RAW_PHOTO_VIDEO_UPLOAD_SQL = `
    LOWER(COALESCE(a.campaign_type, '')) IN ('photo and video', 'photo & video')
    AND COALESCE(NULLIF(TRIM(a.media_preview), ''), NULLIF(TRIM(a.media_type), '')) IS NOT NULL
    AND COALESCE(NULLIF(TRIM(a.active_link), ''), NULLIF(TRIM(a.edit_draft->>'activeLink'), ''), NULLIF(TRIM(a.edit_draft->>'active_link'), '')) IS NULL
    AND (
        COALESCE(a.media_preview, '') = ''
        OR COALESCE(a.media_preview, '') !~* '^https?://'
        OR COALESCE(a.media_preview, '') ~* '/uploads?/'
    )
`;

const syncExpiredAds = async (pool, adId = null) => {
    const params = [];
    const adFilter = adId ? ' AND ad_id = $1' : '';
    if (adId) params.push(adId);

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

    // Basic-plan expiry for raw uploaded Photo & Video ads only.
    // Link ads and paid-plan users are deliberately excluded. The clock starts at
    // active_start_time, which is set when the admin approves the ad. This product
    // rule is fixed: warn at 2 minutes in the UI, complete at 10 minutes here.
    await pool.query(
        `WITH expiring_ads AS (
             SELECT
                 a.ad_id,
                 ${BASIC_RAW_PHOTO_VIDEO_EXPIRY_INTERVAL} AS expiry_interval
             FROM ads a
             WHERE a.status = 'Active'
               AND ${RAW_PHOTO_VIDEO_UPLOAD_SQL}
               AND NOT EXISTS (
                   SELECT 1
                   FROM user_plan_subscriptions ups
                   JOIN subscription_plans sp ON sp.id = ups.plan_id
                   WHERE ups.user_id = a.user_id
                     AND ups.status = 'active'
                     AND (ups.expires_at IS NULL OR ups.expires_at > NOW())
                     AND LOWER(COALESCE(sp.slug, '')) <> 'basic'
               )
               ${adId ? 'AND a.ad_id = $1' : ''}
         )
         UPDATE ads a
         SET status = 'Completed',
             last_resumed_at = NULL,
             paused_at = NULL,
             completed_at = COALESCE(a.completed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         FROM expiring_ads up
         WHERE a.ad_id = up.ad_id
           AND up.expiry_interval IS NOT NULL
           AND a.active_start_time IS NOT NULL
           AND a.active_start_time < NOW() - up.expiry_interval`,
        adId ? [adId] : []
    );

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
           AND COALESCE(current_reach, 0) >= max_reach_cap
           ${adFilter}`,
        params
    );
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

    const usersHasGender = await hasTableColumn(pool, 'users', 'gender');
    const usersHasCountry = await hasTableColumn(pool, 'users', 'country');
    const usersHasShipping = await hasTableColumn(pool, 'users', 'shipping_address');
    const usersHasInterests = await hasTableColumn(pool, 'users', 'interests');
    const usersHasBio = await hasTableColumn(pool, 'users', 'bio');

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
    if (await hasTableColumn(pool, 'market_views', 'user_id')) {
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

const adMatchesViewer = (adRow, viewerProfile) => {
    if (viewerProfile?.isAnonymous) return true;

    const targeting = getAdTargeting(adRow);
    if (!matchesGender(targeting.gender, viewerProfile?.gender)) return false;
    if (!matchesAnyText(targeting.countries, viewerProfile?.countries || [])) return false;
    if (!matchesAnyText(targeting.interests, viewerProfile?.interests || [])) return false;
    return true;
};

const adIsWithinDeliveryRules = (adRow) => {
    if (normalizeText(adRow?.status) !== 'active') return false;

    const cap = adRow?.max_reach_cap == null ? null : Number(adRow.max_reach_cap);
    const currentReach = Math.max(
        Number(adRow?.current_reach || 0),
        Number(adRow?.reach || 0),
        Number(adRow?.impressions || 0)
    );
    if (Number.isFinite(cap) && cap > 0 && currentReach >= cap) return false;

    // Reach-first campaigns (Product Promote, Photo/Video) complete only when target reach is
    // met — duration elapsed does not end delivery for these types.
    if (!isReachFirstCampaign(adRow)) {
        const durationState = calculateAdDurationState(adRow);
        if (durationState.isExpired) return false;
    }

    const budget = Number(adRow?.budget || 0);
    const remainingBudget = Number(adRow?.remaining_budget ?? adRow?.remainingBudget ?? budget);
    if (budget > 0 && remainingBudget <= 0 && !adRow?.promo_code && !adRow?.promoCode) return false;

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
         SET impressions = COALESCE(impressions, 0) + $1,
             current_reach = COALESCE(current_reach, 0) + $1,
             reach = COALESCE(reach, 0) + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE ad_id = $2 AND status = 'Active'
           AND (max_reach_cap IS NULL OR COALESCE(current_reach, 0) < max_reach_cap)
         RETURNING current_reach, max_reach_cap`,
        [increment, adId]
    );

    const row = result.rows[0];
    if (row && row.max_reach_cap !== null && Number(row.current_reach || 0) >= Number(row.max_reach_cap)) {
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
    loadViewerAdProfile,
    normalizeText,
    recordAdClick,
    recordAdImpression,
    safeJsonParse,
    syncExpiredAds,
};
