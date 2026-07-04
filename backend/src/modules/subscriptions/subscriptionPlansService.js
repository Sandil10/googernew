const {
    getGraceDurationSeconds,
    getPlanIntervalLabel,
    getTestDurationMinutes,
} = require('../../utils/subscriptionRenewal');
const subscriptionPlansRepository = require('./subscriptionPlansRepository');
const userSubscriptionsRepository = require('./userSubscriptionsRepository');

const PUBLIC_PLANS_CACHE_TTL_MS = Math.max(
    0,
    Number.parseInt(process.env.PUBLIC_SUBSCRIPTION_PLANS_CONTROLLER_CACHE_TTL_MS || '30000', 10) || 30000
);
let publicPlansCache = null;

const getCachedPublicPlans = () => {
    if (!publicPlansCache) return null;
    if (publicPlansCache.expiresAt <= Date.now()) {
        publicPlansCache = null;
        return null;
    }
    return publicPlansCache.payload;
};

const setCachedPublicPlans = (payload) => {
    if (PUBLIC_PLANS_CACHE_TTL_MS <= 0) return;
    publicPlansCache = {
        payload,
        expiresAt: Date.now() + PUBLIC_PLANS_CACHE_TTL_MS,
    };
};

const invalidatePublicPlansCache = () => {
    publicPlansCache = null;
};

const syncAutoFeatures = (features = [], extra = {}) => {
    const manual = features.filter((feature) =>
        !feature.startsWith('Create up to ') &&
        !feature.startsWith('Upload up to ') &&
        !feature.includes('characters per Goog')
    );
    const auto = [];
    if (extra.write_goog_limit != null) auto.push(`Create up to ${extra.write_goog_limit} Googs`);
    if (extra.goog_letter_limit != null) auto.push(`${extra.goog_letter_limit} characters per Goog`);
    if (extra.product_upload_limit != null) auto.push(`Upload up to ${extra.product_upload_limit} products`);
    return [...auto, ...manual];
};

const ensureTable = () => subscriptionPlansRepository.ensureTable();

const getMyPlan = async (userId) => {
    await ensureTable();
    await userSubscriptionsRepository.ensureTable();
    const activePlan = await subscriptionPlansRepository.getUserActivePlan(userId, getGraceDurationSeconds());
    if (activePlan) {
        return { data: activePlan, is_basic: false, success: true };
    }

    const basicPlan = await subscriptionPlansRepository.getDefaultActivePlan();
    if (basicPlan) {
        return {
            data: { ...basicPlan, started_at: null, expires_at: null, status: 'active' },
            is_basic: true,
            success: true,
        };
    }

    return { data: null, is_basic: true, success: true };
};

const getPublicPlans = async () => {
    await ensureTable();
    const cached = getCachedPublicPlans();
    if (cached) return cached;

    const plans = await subscriptionPlansRepository.getPublicPaidPlans();
    const payload = {
        success: true,
        plans: plans.map((plan) => ({
            ...plan,
            billing_interval_label: getPlanIntervalLabel(plan),
            test_duration_minutes: getTestDurationMinutes() || null,
        })),
    };
    setCachedPublicPlans(payload);
    return payload;
};

const getAllPlans = async () => {
    await ensureTable();
    const plans = await subscriptionPlansRepository.getAllPlans();
    return { plans, success: true };
};

const createPlan = async (body = {}) => {
    await ensureTable();
    const { slug, name } = body;
    if (!slug || !name) {
        const error = new Error('slug and name are required');
        error.statusCode = 400;
        throw error;
    }

    const mergedFeatures = syncAutoFeatures(body.features ?? [], body.extra ?? {});
    const plan = await subscriptionPlansRepository.createPlan({
        accent_color: body.accent_color ?? 'zinc',
        badge_color: body.badge_color ?? 'silver',
        duration_days: body.duration_days ?? 30,
        extra: body.extra ?? {},
        features: mergedFeatures,
        googs_limit: body.googs_limit ?? 5,
        is_active: body.is_active ?? true,
        is_free: body.is_free ?? false,
        name,
        price: body.price ?? 0,
        slug,
        sort_order: body.sort_order ?? 0,
        verified_tick: body.verified_tick ?? true,
    });
    invalidatePublicPlansCache();
    return { plan, success: true };
};

const updatePlan = async (id, body = {}) => {
    await ensureTable();
    const current = await subscriptionPlansRepository.getPlanFeaturesAndExtra(id);
    const currentFeatures = current?.features || [];
    const currentExtra = current?.extra || {};
    const mergedExtra = body.extra !== undefined ? body.extra : currentExtra;
    const mergedFeatures = syncAutoFeatures(
        body.features !== undefined ? body.features : currentFeatures,
        mergedExtra
    );

    const plan = await subscriptionPlansRepository.updatePlan(id, {
        accent_color: body.accent_color ?? null,
        badge_color: body.badge_color ?? null,
        duration_days: body.duration_days ?? null,
        extraJson: body.extra !== undefined ? JSON.stringify(body.extra) : null,
        features: mergedFeatures,
        googs_limit: body.googs_limit ?? null,
        is_active: body.is_active ?? null,
        is_free: body.is_free ?? null,
        name: body.name ?? null,
        price: body.price ?? null,
        slug: body.slug ?? null,
        sort_order: body.sort_order ?? null,
        verified_tick: body.verified_tick ?? null,
    });

    if (!plan) {
        const error = new Error('Plan not found');
        error.statusCode = 404;
        throw error;
    }

    invalidatePublicPlansCache();
    return { plan, success: true };
};

const deletePlan = async (id) => {
    await ensureTable();
    await userSubscriptionsRepository.ensureTable();
    const client = await subscriptionPlansRepository.connect();
    try {
        await client.query('BEGIN');
        const subscriptionsCancelled = await subscriptionPlansRepository.cancelActiveSubscriptionsByPlanId(client, id);
        const rowCount = await subscriptionPlansRepository.deletePlanById(client, id);
        if (rowCount === 0) {
            await client.query('ROLLBACK');
            const error = new Error('Plan not found');
            error.statusCode = 404;
            throw error;
        }
        await client.query('COMMIT');
        invalidatePublicPlansCache();
        return { subscriptions_cancelled: subscriptionsCancelled, success: true };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const debugPlan = async () => {
    const plans = await subscriptionPlansRepository.getDebugPlans();
    return { plans };
};

module.exports = {
    createPlan,
    debugPlan,
    deletePlan,
    ensureTable,
    getAllPlans,
    getMyPlan,
    getPublicPlans,
    updatePlan,
};
