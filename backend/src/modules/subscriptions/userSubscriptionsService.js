const { recordSubscriptionPayment } = require('../../../../shared/utils/financeCommands');
const { getUserPlanLimits, getUserSubscriptionFeatures } = require('../../utils/planLimits');
const { getGraceDurationSeconds, getPlanDurationSeconds } = require('../../utils/subscriptionRenewal');
const subscriptionPlansRepository = require('./subscriptionPlansRepository');
const subscriptionPlansService = require('./subscriptionPlansService');
const userSubscriptionsRepository = require('./userSubscriptionsRepository');
const { publishInternalEvent } = require('../../shared/events/internalEventBus');
const { ensureCoreInternalEventHandlersRegistered } = require('../../shared/events/coreInternalEventHandlers');
const { DOMAIN_EVENTS } = require('../../shared/contracts/serviceContracts');
const { syncUserApprovedUploadsToPlan } = require('../../utils/uploadContentPlanExpiry');
const savedAdsRepository = require('../ads/savedAdsRepository');

const getBasicSubscriptionShape = (plan) => ({
    auto_renew: false,
    duration_days: 0,
    expires_at: null,
    plan_id: plan.id,
    plan_name: plan.name,
    plan_slug: plan.slug,
    price_paid: 0,
    status: 'active',
});

const ensureTables = async () => {
    await userSubscriptionsRepository.ensureTable();
    await subscriptionPlansRepository.ensureTable();
};

const getMySubscription = async (userId) => {
    await ensureTables();
    const graceSeconds = getGraceDurationSeconds();
    const subscription = await userSubscriptionsRepository.getActiveSubscriptionWithGrace(userId, graceSeconds);

    if (!subscription) {
        const basicPlan = await subscriptionPlansRepository.findBasicPlan();
        if (basicPlan) {
            return { subscription: getBasicSubscriptionShape(basicPlan), success: true };
        }
        return { subscription: null, success: true };
    }

    const planExists = await userSubscriptionsRepository.planExistsById(subscription.plan_id);
    if (!planExists) {
        await userSubscriptionsRepository.cancelSubscriptionById(subscription.id);
        return { subscription: null, success: true };
    }

    return { subscription, success: true };
};

const subscribe = async (userId, body = {}) => {
    await ensureTables();
    const { plan_id, switch_plan, confirm_release_saves } = body;
    if (!plan_id) {
        const error = new Error('plan_id is required');
        error.statusCode = 400;
        throw error;
    }
    if (plan_id < 0) {
        const error = new Error('Demo plans cannot be purchased â€” please ensure plans are loaded from the server');
        error.statusCode = 400;
        throw error;
    }

    const client = await userSubscriptionsRepository.connect();
    try {
        await client.query('BEGIN');
        const plan = await subscriptionPlansRepository.findPlanByIdForSubscribe(client, plan_id);
        if (!plan) {
            await client.query('ROLLBACK');
            const error = new Error('Plan not found');
            error.statusCode = 404;
            throw error;
        }
        if (!plan.is_active) {
            await client.query('ROLLBACK');
            const error = new Error('Plan is not active');
            error.statusCode = 400;
            throw error;
        }

        const graceSeconds = getGraceDurationSeconds();
        const existingSub = await userSubscriptionsRepository.getExistingSubscriptionForSubscribe(client, userId, graceSeconds);
        const isSamePlanGraceRenewal = Boolean(
            existingSub &&
            Number(existingSub.plan_id) === Number(plan.id) &&
            existingSub.in_grace_period &&
            existingSub.expires_at
        );

        if (existingSub && Number(existingSub.plan_id) === Number(plan.id) && !isSamePlanGraceRenewal) {
            await client.query('COMMIT');
            return { statusCode: 200, subscription: existingSub, success: true };
        }
        if (existingSub && Number(existingSub.plan_id) !== Number(plan.id) && switch_plan !== true) {
            await client.query('ROLLBACK');
            const error = new Error('Confirm plan switch is required');
            error.statusCode = 409;
            throw error;
        }
        // A plan with a smaller save allowance costs the owner saved ads. Taking
        // the wallet payment first and only then announcing what was deleted is
        // not a choice they got to make, so the switch stops here and reports
        // the new allowance plus exactly what would go. The client shows that as
        // a confirmation; pressing OK repeats the call with confirm_release_saves.
        const planExtra = plan.extra || {};
        const readSaveLimit = (raw) => {
            if (raw === null || raw === undefined || raw === '') return null;
            const value = Number(raw);
            return Number.isFinite(value) && value >= 0 ? value : null;
        };
        const saveLimits = {
            photo: readSaveLimit(planExtra.ad_photos ?? planExtra.photo_ads_save_limit),
            video: readSaveLimit(planExtra.ad_videos ?? planExtra.video_ads_save_limit),
        };
        const savedCounts = {};
        const willRelease = {};
        for (const mediaType of ['photo', 'video']) {
            savedCounts[mediaType] = await savedAdsRepository.countUploadSavesByType(userId, mediaType, client);
            willRelease[mediaType] = saveLimits[mediaType] === null
                ? []
                : await savedAdsRepository.previewUploadSaveTrim(userId, mediaType, saveLimits[mediaType], client);
        }
        const releaseCount = willRelease.photo.length + willRelease.video.length;
        if (releaseCount > 0 && confirm_release_saves !== true) {
            await client.query('ROLLBACK');
            const allowanceParts = ['photo', 'video']
                .filter((mediaType) => saveLimits[mediaType] !== null)
                .map((mediaType) => `${saveLimits[mediaType]} saved ${mediaType} ad${saveLimits[mediaType] === 1 ? '' : 's'}`);
            const lossParts = ['photo', 'video']
                .filter((mediaType) => willRelease[mediaType].length > 0)
                .map((mediaType) => `${willRelease[mediaType].length} ${mediaType} ad${willRelease[mediaType].length === 1 ? '' : 's'}`);
            const error = new Error(
                `${plan.name} allows only ${allowanceParts.join(' and ')}. `
                + `You have ${savedCounts.photo} saved photo ad${savedCounts.photo === 1 ? '' : 's'} `
                + `and ${savedCounts.video} saved video ad${savedCounts.video === 1 ? '' : 's'}, so your most recent `
                + `${lossParts.join(' and ')} will be removed from your saved ads. Do you want to continue?`
            );
            error.statusCode = 409;
            error.details = {
                code: 'SAVE_RELEASE_CONFIRM_REQUIRED',
                planName: plan.name,
                releaseCount,
                saveLimits,
                savedCounts,
                willRelease,
            };
            throw error;
        }

        if (existingSub) {
            await userSubscriptionsRepository.cancelExistingSubscription(client, existingSub.id);
        }

        const price = parseFloat(plan.price);
        try {
            await recordSubscriptionPayment(client, {
                amount: price,
                planName: plan.name,
                subscriberUserId: userId,
            });
        } catch (financeErr) {
            await client.query('ROLLBACK');
            if (financeErr.code === 'USER_NOT_FOUND') {
                const error = new Error('User not found');
                error.statusCode = 404;
                throw error;
            }
            if (financeErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
                const error = new Error('Insufficient wallet balance');
                error.statusCode = 402;
                error.balance = financeErr.currentBalance;
                error.price = price;
                throw error;
            }
            if (financeErr.code === 'GOOGER_WALLET_NOT_CONFIGURED') {
                const error = new Error(financeErr.message);
                error.statusCode = 500;
                throw error;
            }
            throw financeErr;
        }

        const subscription = await userSubscriptionsRepository.insertSubscription(client, {
            isSamePlanGraceRenewal,
            plan,
            planDurationSeconds: getPlanDurationSeconds(plan),
            previousExpiry: existingSub?.expires_at || null,
            price,
            userId,
        });

        if (plan.verified_tick) {
            const extra = plan.extra || {};
            const badgeColor = extra.badge_custom_color || plan.badge_color || 'blue';
            const tickColor = extra.badge_tick_color || null;
            await userSubscriptionsRepository.applyPlanBadgeToUser(client, userId, badgeColor, tickColor);
        }

        await syncUserApprovedUploadsToPlan(client, userId, plan);

        // The owner accepted this loss in the gate above: release the excess
        // saves newest-first, and report what went so the caller can say so.
        const releasedSaves = [];
        for (const mediaType of ['photo', 'video']) {
            if (saveLimits[mediaType] === null) continue;
            releasedSaves.push(...await savedAdsRepository.trimUploadSavesToLimit(
                userId,
                mediaType,
                saveLimits[mediaType],
                client
            ));
        }

        await client.query('COMMIT');
        ensureCoreInternalEventHandlersRegistered();
        publishInternalEvent(DOMAIN_EVENTS.SUBSCRIPTION_PURCHASED, {
            planId: plan.id,
            planSlug: plan.slug,
            subscriptionId: subscription.id,
            userId,
        });
        return {
            statusCode: 201,
            subscription,
            success: true,
            releasedSaves,
            releasedSavesMessage: releasedSaves.length
                ? `${releasedSaves.length} saved ad${releasedSaves.length === 1 ? '' : 's'} `
                  + `had to be removed because this plan allows fewer saved ads.`
                : null,
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const setAutoRenew = async (userId, autoRenew) => {
    await ensureTables();
    if (typeof autoRenew !== 'boolean') {
        const error = new Error('auto_renew (boolean) is required');
        error.statusCode = 400;
        throw error;
    }

    const subscription = await userSubscriptionsRepository.updateAutoRenew(autoRenew, userId);
    if (!subscription) {
        const error = new Error('No active subscription found');
        error.statusCode = 404;
        throw error;
    }
    return { subscription, success: true };
};

const getBadge = async (userId) => {
    await ensureTables();
    const user = await userSubscriptionsRepository.getUserBadgeInfo(userId);
    const planBadge = await userSubscriptionsRepository.getActivePlanBadge(userId, getGraceDurationSeconds());

    // The plan the account is actually on decides its tick, and is read before
    // the copy kept on the user row. That copy is written when they subscribe,
    // so it goes stale the moment anything changes underneath it — a plan
    // whose colours the admin edits, or a switch that did not rewrite it — and
    // because it used to be preferred, a wrong colour could never correct
    // itself. Reading the plan first makes the badge self-healing, and matches
    // what subscribing already does: overwrite the row from the plan.
    if (planBadge?.verified_tick) {
        const extra = planBadge.extra || {};
        return {
            badge: {
                color: extra.badge_custom_color || planBadge.badge_color,
                tickColor: extra.badge_tick_color || null,
            },
            success: true,
        };
    }

    // No plan tick: the badge can still have been granted by verification, and
    // that one lives only on the user row.
    if (user?.is_verified && user?.verification_badge_color) {
        return {
            badge: {
                color: user.verification_badge_color,
                tickColor: user.verification_badge_tick_color || null,
            },
            success: true,
        };
    }

    if (user?.is_verified) {
        return { badge: { color: 'blue', tickColor: null }, success: true };
    }
    return { badge: null, success: true };
};

const getMyUsage = async (userId) => {
    await ensureTables();
    const limits = await getUserPlanLimits(userId);
    const counts = await userSubscriptionsRepository.getUsageCounts(userId);
    const savedAdCounts = { photo: 0, video: 0 };
    for (const row of counts.savedAdRows || []) {
        if (row.ad_media_type === 'photo' || row.ad_media_type === 'video') {
            savedAdCounts[row.ad_media_type] = row.c;
        }
    }

    const isAtLimit = (count, limit) => Number(limit) > 0 && Number(count) >= Number(limit);
    const googDailyAtLimit = isAtLimit(counts.googDailyCount, limits.writeGoogDailyLimit);
    const googTotalAtLimit = isAtLimit(counts.googTotalCount, limits.writeGoogTotalLimit);
    const features = await getUserSubscriptionFeatures(userId);
    const extra = features.extra || {};
    const contentTotalFallback = features.is_basic ? 5 : 15;
    const contentDailyFallback = features.is_basic ? 1 : 3;
    const uploadContentTotalLimit = Number(extra.content_upload_limit ?? contentTotalFallback);
    const uploadContentDailyLimit = Number(extra.content_daily_upload_limit ?? contentDailyFallback);
    const uploadContentTotalAtLimit = isAtLimit(counts.uploadContentTotalCount, uploadContentTotalLimit);
    const uploadContentDailyAtLimit = isAtLimit(counts.uploadContentDailyCount, uploadContentDailyLimit);

    return {
        success: true,
        usage: {
            googAtLimit: googDailyAtLimit || googTotalAtLimit,
            googDailyAtLimit,
            googTotalAtLimit,
            googCount: counts.googCount,
            googDailyCount: counts.googDailyCount,
            googTotalCount: counts.googTotalCount,
            googLetterLimit: limits.googLetterLimit,
            photoAdsSaveLimit: limits.photoAdsSaveLimit,
            productAtLimit: counts.productCount >= limits.productUploadLimit,
            productCount: counts.productCount,
            productUploadLimit: limits.productUploadLimit,
            saveGoogLimit: limits.saveGoogLimit,
            savedGoogCount: counts.savedGoogCount,
            savedPhotoAdCount: savedAdCounts.photo,
            savedVideoAdCount: savedAdCounts.video,
            uploadContentAtLimit: uploadContentTotalAtLimit || uploadContentDailyAtLimit,
            uploadContentDailyAtLimit,
            uploadContentDailyCount: counts.uploadContentDailyCount,
            uploadContentDailyLimit,
            uploadContentTotalAtLimit,
            uploadContentTotalCount: counts.uploadContentTotalCount,
            uploadContentTotalLimit,
            videoAdsSaveLimit: limits.videoAdsSaveLimit,
            writeGoogLimit: limits.writeGoogLimit,
            writeGoogDailyLimit: limits.writeGoogDailyLimit,
            writeGoogTotalLimit: limits.writeGoogTotalLimit,
        },
    };
};

const debugPlan = async () => subscriptionPlansService.debugPlan();

const getMyFeatures = async (userId) => {
    await ensureTables();
    const features = await getUserSubscriptionFeatures(userId);
    console.log('[getMyFeatures] plan:', features.plan_slug, 'write_goog_color_limit:', features.write_goog_color_limit, 'raw extra:', JSON.stringify(features.extra));
    return { features, success: true };
};

const cancelSubscription = async (userId) => {
    await ensureTables();
    const subscription = await userSubscriptionsRepository.disableAutoRenewForActiveSubscription(
        userId,
        getGraceDurationSeconds()
    );
    if (!subscription) {
        const error = new Error('No active subscription found');
        error.statusCode = 404;
        throw error;
    }
    ensureCoreInternalEventHandlersRegistered();
    publishInternalEvent(DOMAIN_EVENTS.SUBSCRIPTION_CANCELLED, {
        subscriptionId: subscription.id,
        userId,
    });
    return { subscription, success: true };
};

module.exports = {
    cancelSubscription,
    debugPlan,
    ensureTables,
    getBadge,
    getMyFeatures,
    getMySubscription,
    getMyUsage,
    setAutoRenew,
    subscribe,
};
