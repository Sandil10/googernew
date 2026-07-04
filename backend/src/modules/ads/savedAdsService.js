const { getUserSubscriptionFeatures } = require('../../utils/planLimits');
const savedAdsRepository = require('./savedAdsRepository');

const getAdAnalytics = async (adId, userId) => {
    await savedAdsRepository.ensureAdsTable();
    await savedAdsRepository.syncExpiredAds(require('../../config/database'), adId);

    const adRow = await savedAdsRepository.getOwnedAdForAnalytics(adId, userId);
    if (!adRow) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }

    const [
        viewTotals,
        likeTotals,
        clickTotals,
        clicksByType,
        byGender,
        byCountry,
        byAge,
        likesByGender,
        likesByCountry,
        clicksByGender,
    ] = await Promise.all([
        savedAdsRepository.getViewTotals(adId),
        savedAdsRepository.getLikeTotals(adId),
        savedAdsRepository.getClickTotals(adId),
        savedAdsRepository.getClicksByType(adId),
        savedAdsRepository.getViewsByGender(adId),
        savedAdsRepository.getViewsByCountry(adId),
        savedAdsRepository.getViewsByAge(adId),
        savedAdsRepository.getLikesByGender(adId),
        savedAdsRepository.getLikesByCountry(adId),
        savedAdsRepository.getClicksByGender(adId),
    ]);

    const totals = {
        views: Number(viewTotals.views || 0),
        reach: Number(viewTotals.reach || 0),
        impressions: Number(adRow.impressions || 0),
        clicks: Number(clickTotals.clicks || 0),
        likes: Number(likeTotals.likes || 0),
    };

    return {
        success: true,
        analytics: {
            adId,
            totals,
            byGender: byGender.map((r) => ({ label: r.label, reach: Number(r.reach), impressions: Number(r.impressions) })),
            byCountry: byCountry.map((r) => ({ label: r.label, reach: Number(r.reach), impressions: Number(r.impressions) })),
            byAge: byAge.map((r) => ({ label: r.label, reach: Number(r.reach), impressions: Number(r.impressions) })),
            byClickType: clicksByType.map((r) => ({ label: r.label, clicks: Number(r.clicks) })),
            likesByGender: likesByGender.map((r) => ({ label: r.label, likes: Number(r.likes) })),
            likesByCountry: likesByCountry.map((r) => ({ label: r.label, likes: Number(r.likes) })),
            clicksByGender: clicksByGender.map((r) => ({ label: r.label, clicks: Number(r.clicks) })),
            adTargeting: {
                gender: adRow.gender_target || 'All',
                ageMin: Number(adRow.age_min || 18),
                ageMax: Number(adRow.age_max || 65),
                campaignType: adRow.campaign_type,
            },
        },
    };
};

const toggleAdSave = async (adIdValue, userId) => {
    await savedAdsRepository.ensureAdsTable();
    await savedAdsRepository.ensureAdSavesSchema();
    if (!userId) {
        const error = new Error('Unauthorized');
        error.statusCode = 401;
        throw error;
    }

    const adId = String(adIdValue || '').trim().replace(/^ad-/, '');
    if (!adId) {
        const error = new Error('Invalid ad id');
        error.statusCode = 400;
        throw error;
    }

    const ad = await savedAdsRepository.findAdForSave(adId);
    if (!ad) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }

    const canonicalAdId = String(ad.ad_id || adId);
    const campaignTypeLower = String(ad.campaign_type || '').trim().toLowerCase();
    const isPhotoVideo = campaignTypeLower === 'photo and video' || campaignTypeLower === 'photo & video';
    if (!isPhotoVideo) {
        const error = new Error('Only Photo & Video ads can be saved.');
        error.statusCode = 400;
        throw error;
    }

    const existing = await savedAdsRepository.findExistingSave(userId, canonicalAdId);
    if (existing) {
        await savedAdsRepository.deleteSave(userId, canonicalAdId);
        return { success: true, saved: false };
    }

    const { ad_media_type, ad_source_type } = savedAdsRepository.classifyAdForSave(ad);

    if (ad_source_type === 'upload') {
        const features = await getUserSubscriptionFeatures(userId);
        const limit = ad_media_type === 'video'
            ? features.video_ads_save_limit
            : features.photo_ads_save_limit;

        if (limit !== null && limit >= 0) {
            const current = await savedAdsRepository.countUploadSavesByType(userId, ad_media_type);
            if (current >= limit) {
                const error = new Error('You have reached your ad save limit. Please upgrade to a higher plan.');
                error.statusCode = 403;
                error.payload = {
                    success: false,
                    code: 'AD_SAVE_LIMIT',
                    media_type: ad_media_type,
                    limit,
                    message: error.message,
                };
                throw error;
            }
        }
    }

    await savedAdsRepository.insertSave(userId, canonicalAdId, ad_media_type, ad_source_type);
    return { success: true, saved: true, ad_media_type, ad_source_type };
};

const getMySavedAdIds = async (userId) => {
    await savedAdsRepository.ensureAdSavesSchema();
    if (!userId) return { success: true, savedAdIds: [] };

    const rows = await savedAdsRepository.listSavedAdIds(userId);
    return { success: true, savedAdIds: rows.map((r) => r.ad_id) };
};

const getMySavedAds = async (userId) => {
    await savedAdsRepository.ensureAdsTable();
    await savedAdsRepository.ensureAdSavesSchema();
    await savedAdsRepository.ensureAdEngagementTables();
    await savedAdsRepository.syncExpiredAds(require('../../config/database'));
    if (!userId) {
        const error = new Error('Unauthorized');
        error.statusCode = 401;
        throw error;
    }

    const rows = await savedAdsRepository.listMySavedAds(userId);
    return { success: true, ads: rows.map(savedAdsRepository.mapRow) };
};

const getPublicSavedAdsByUser = async (profileUserIdValue) => {
    await savedAdsRepository.ensureAdsTable();
    await savedAdsRepository.ensureAdSavesSchema();
    await savedAdsRepository.ensureAdEngagementTables();
    await savedAdsRepository.syncExpiredAds(require('../../config/database'));

    const profileUserId = Number(profileUserIdValue);
    if (!Number.isFinite(profileUserId) || profileUserId <= 0) {
        const error = new Error('Invalid user ID');
        error.statusCode = 400;
        throw error;
    }

    const rows = await savedAdsRepository.listPublicSavedAdsByUser(profileUserId);
    return { success: true, ads: rows.map(savedAdsRepository.mapRow) };
};

const getMySavedAdCounts = async (userId) => {
    await savedAdsRepository.ensureAdSavesSchema();
    if (!userId) {
        const error = new Error('Unauthorized');
        error.statusCode = 401;
        throw error;
    }

    const rows = await savedAdsRepository.getSavedAdCounts(userId);
    const counts = { photo: 0, video: 0 };
    for (const r of rows) counts[r.ad_media_type] = r.c;

    const features = await getUserSubscriptionFeatures(userId);
    return {
        success: true,
        counts,
        limits: {
            photo: features.photo_ads_save_limit,
            video: features.video_ads_save_limit,
        },
    };
};

module.exports = {
    getAdAnalytics,
    getMySavedAdCounts,
    getMySavedAdIds,
    getMySavedAds,
    getPublicSavedAdsByUser,
    toggleAdSave,
};
