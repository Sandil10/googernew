const { recordSubscriptionPayment } = require('../../../../shared/utils/financeCommands');
const { getUserPlanLimits, getUserSubscriptionFeatures } = require('../../utils/planLimits');
const { getGraceDurationSeconds, getPlanDurationSeconds } = require('../../utils/subscriptionRenewal');
const subscriptionPlansRepository = require('./subscriptionPlansRepository');
const subscriptionPlansService = require('./subscriptionPlansService');
const userSubscriptionsRepository = require('./userSubscriptionsRepository');
const { publishInternalEvent } = require('../../shared/events/internalEventBus');
const { ensureCoreInternalEventHandlersRegistered } = require('../../shared/events/coreInternalEventHandlers');
const { DOMAIN_EVENTS } = require('../../shared/contracts/serviceContracts');

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
    const { plan_id, switch_plan } = body;
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

        await client.query('COMMIT');
        ensureCoreInternalEventHandlersRegistered();
        publishInternalEvent(DOMAIN_EVENTS.SUBSCRIPTION_PURCHASED, {
            planId: plan.id,
            planSlug: plan.slug,
            subscriptionId: subscription.id,
            userId,
        });
        return { statusCode: 201, subscription, success: true };
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
    if (user?.is_verified && user?.verification_badge_color) {
        return {
            badge: {
                color: user.verification_badge_color,
                tickColor: user.verification_badge_tick_color || null,
            },
            success: true,
        };
    }

    const planBadge = await userSubscriptionsRepository.getActivePlanBadge(userId, getGraceDurationSeconds());
    if (!planBadge || !planBadge.verified_tick) {
        if (user?.is_verified) {
            return { badge: { color: 'blue', tickColor: null }, success: true };
        }
        return { badge: null, success: true };
    }

    const extra = planBadge.extra || {};
    return {
        badge: {
            color: extra.badge_custom_color || planBadge.badge_color,
            tickColor: extra.badge_tick_color || null,
        },
        success: true,
    };
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

    return {
        success: true,
        usage: {
            googAtLimit: counts.googCount >= limits.writeGoogLimit,
            googCount: counts.googCount,
            googLetterLimit: limits.googLetterLimit,
            photoAdsSaveLimit: limits.photoAdsSaveLimit,
            productAtLimit: counts.productCount >= limits.productUploadLimit,
            productCount: counts.productCount,
            productUploadLimit: limits.productUploadLimit,
            saveGoogLimit: limits.saveGoogLimit,
            savedGoogCount: counts.savedGoogCount,
            savedPhotoAdCount: savedAdCounts.photo,
            savedVideoAdCount: savedAdCounts.video,
            videoAdsSaveLimit: limits.videoAdsSaveLimit,
            writeGoogLimit: limits.writeGoogLimit,
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
