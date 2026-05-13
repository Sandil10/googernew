const normalizeText = (value) => String(value || '').trim().toLowerCase();

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
    if (!viewer) return false;
    return viewer === target || viewer.startsWith(target) || target.startsWith(viewer);
};

const matchesAnyText = (targets, values) => {
    const targetTexts = uniqueTexts(targets).map(normalizeText).filter((value) => value && value !== 'all');
    if (!targetTexts.length) return true;

    const valueTexts = uniqueTexts(values).map(normalizeText).filter(Boolean);
    if (!valueTexts.length) return false;

    return targetTexts.some((target) => valueTexts.some((value) => (
        value === target || value.includes(target) || target.includes(value)
    )));
};

const adMatchesViewer = (adRow, viewerProfile) => {
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

    const durationDays = Number(adRow?.duration_days || adRow?.durationDays || 0);
    const startedAt = adRow?.started_at || adRow?.startedAt;
    if (durationDays > 0 && startedAt) {
        const startedTime = new Date(startedAt).getTime();
        const endTime = startedTime + durationDays * 24 * 60 * 60 * 1000;
        if (Number.isFinite(startedTime) && Date.now() >= endTime) return false;
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
             SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
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
    filterDeliverableAds,
    getAdTargeting,
    loadViewerAdProfile,
    normalizeText,
    recordAdClick,
    recordAdImpression,
    safeJsonParse,
};
