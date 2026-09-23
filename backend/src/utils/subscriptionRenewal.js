const pool = require('../config/database');
const { recordSubscriptionPayment } = require('../../../shared/utils/financeCommands');
const userSubscriptionsRepository = require('../modules/subscriptions/userSubscriptionsRepository');

// Required lazily: savedAdsRepository reads getGraceDurationSeconds from this
// module at load time, so requiring it up here would close a cycle and hand it
// a half-built exports object.
const getSavedAdsRepository = () => require('../modules/ads/savedAdsRepository');
const {
    syncUserApprovedUploadsToBasic,
    syncUsersWithoutActivePaidPlanToBasic,
    deleteExpiredUploadContents,
} = require('./uploadContentPlanExpiry');

let tableReady = false;
let processingAll = false;

const getTestDurationMinutes = () => {
    const raw = Number(process.env.SUBSCRIPTION_TEST_DURATION_MINUTES || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

const DURATION_UNIT_MS = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
};

// A plan can state its own billing period in minutes or hours, the same way it
// already states its own grace period. The duration_days column is whole days,
// so it cannot express "this plan lasts 5 minutes" — and the env switch below
// can, but only by forcing that duration on every plan at once. This reads the
// plan's own value first so one plan can be shortened on its own.
const getPlanDurationOverrideMs = (plan) => {
    const extra = plan?.extra || {};
    const value = Number(extra.duration_value ?? extra.subscription_duration_value);
    const unit = String(extra.duration_unit ?? extra.subscription_duration_unit ?? '').toLowerCase();
    if (!Number.isFinite(value) || value <= 0) return null;
    const multiplier = DURATION_UNIT_MS[unit];
    if (!multiplier) return null;
    return Math.floor(value) * multiplier;
};

const getPlanDurationMs = (plan) => {
    const override = getPlanDurationOverrideMs(plan);
    if (override !== null) return override;

    const testMinutes = getTestDurationMinutes();
    if (testMinutes > 0) return testMinutes * 60 * 1000;

    const days = Number(plan?.duration_days || 0);
    return Math.max(0, days) * 24 * 60 * 60 * 1000;
};

const getPlanDurationSeconds = (plan) => Math.max(0, Math.round(getPlanDurationMs(plan) / 1000));

const getGraceDurationMs = (plan = null) => {
    const planExtra = plan?.extra || {};
    const planValue = Number(planExtra.grace_period_value ?? planExtra.subscription_grace_value);
    const planUnit = String(planExtra.grace_period_unit ?? planExtra.subscription_grace_unit ?? '').toLowerCase();
    if (Number.isFinite(planValue) && planValue > 0 && ['minutes', 'hours', 'days'].includes(planUnit)) {
        const multiplier = planUnit === 'minutes' ? 60 * 1000 : planUnit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        return Math.floor(planValue) * multiplier;
    }

    const testMinutes = Number(process.env.SUBSCRIPTION_TEST_GRACE_MINUTES || 0);
    if (Number.isFinite(testMinutes) && testMinutes > 0) return testMinutes * 60 * 1000;

    const days = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7);
    return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
};

const getGraceDurationSeconds = () => Math.max(0, Math.round(getGraceDurationMs() / 1000));

const getPlanIntervalLabel = (plan) => {
    const override = getPlanDurationOverrideMs(plan);
    if (override !== null) {
        const minutes = Math.round(override / 60000);
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.round(minutes / 60);
        if (hours < 48) return `${hours}h`;
        return `${Math.round(hours / 24)}d`;
    }

    const testMinutes = getTestDurationMinutes();
    if (testMinutes > 0) return `${testMinutes} min test`;
    return `${Number(plan?.duration_days || 0)}d`;
};

const getRenewalSweepMs = () => {
    const raw = Number(process.env.SUBSCRIPTION_RENEWAL_SWEEP_SECONDS || 30);
    const seconds = Number.isFinite(raw) && raw > 0 ? raw : 30;
    return seconds * 1000;
};

const ensureTable = async () => {
    if (tableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_plan_subscriptions (
            id            SERIAL PRIMARY KEY,
            user_id       INTEGER       NOT NULL,
            plan_id       INTEGER       NOT NULL,
            plan_slug     VARCHAR(60)   NOT NULL,
            plan_name     VARCHAR(120)  NOT NULL,
            price_paid    DECIMAL(12,2) NOT NULL DEFAULT 0,
            duration_days INTEGER       NOT NULL DEFAULT 30,
            status        VARCHAR(20)   NOT NULL DEFAULT 'active',
            auto_renew    BOOLEAN       NOT NULL DEFAULT TRUE,
            started_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at    TIMESTAMP,
            cancelled_at  TIMESTAMP,
            created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`ALTER TABLE user_plan_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE user_plan_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_plan_subscriptions_due ON user_plan_subscriptions(status, expires_at, auto_renew);`);

    tableReady = true;
};

const normalizeTestModeExpiries = async (userId) => {
    const testMinutes = getTestDurationMinutes();
    if (testMinutes <= 0) return;

    const params = [String(testMinutes)];
    const userFilter = userId ? 'AND user_id = $2' : '';
    if (userId) params.push(userId);

    await pool.query(
        `UPDATE user_plan_subscriptions
         SET expires_at = started_at + (($1::text || ' minutes')::interval)
         WHERE status = 'active'
           AND price_paid > 0
           AND expires_at IS NOT NULL
           ${userFilter}
           AND expires_at > started_at + (($1::text || ' minutes')::interval)`,
        params
    );
};

const renewSubscription = async (client, sub) => {
    const planRes = await client.query(
        `SELECT id, slug, name, price, duration_days, is_active, extra
         FROM subscription_plans
         WHERE id = $1`,
        [sub.plan_id]
    );
    const plan = planRes.rows[0];
    const graceEndsAt = sub.expires_at
        ? new Date(new Date(sub.expires_at).getTime() + getGraceDurationMs(plan))
        : null;
    const isInsideGrace = graceEndsAt && graceEndsAt.getTime() > Date.now();
    if (!plan?.is_active) {
        await client.query(
            `UPDATE user_plan_subscriptions
             SET status = 'expired', cancelled_at = COALESCE(cancelled_at, NOW())
             WHERE id = $1`,
            [sub.id]
        );
        return { action: 'expired', reason: 'plan_inactive' };
    }

    if (!sub.auto_renew) {
        if (isInsideGrace) {
            return { action: 'grace', reason: 'auto_renew_off', grace_ends_at: graceEndsAt };
        }
        await client.query(`UPDATE user_plan_subscriptions SET status = 'expired' WHERE id = $1`, [sub.id]);
        return { action: 'expired', reason: 'auto_renew_off_grace_ended' };
    }

    const price = Number(plan.price || 0);
    const balanceRes = await client.query(
        `SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE`,
        [sub.user_id]
    );
    const balance = Number(balanceRes.rows[0]?.wallet_balance || 0);

    if (balance < price) {
        if (isInsideGrace) {
            await client.query(
                `UPDATE user_plan_subscriptions
                 SET auto_renew = FALSE,
                     cancelled_at = COALESCE(cancelled_at, NOW())
                 WHERE id = $1`,
                [sub.id]
            );
            return { action: 'grace', reason: 'insufficient_balance', grace_ends_at: graceEndsAt, balance, price };
        }
        await client.query(
            `UPDATE user_plan_subscriptions
             SET status = 'expired', auto_renew = FALSE, cancelled_at = COALESCE(cancelled_at, NOW())
             WHERE id = $1`,
            [sub.id]
        );
        return { action: 'expired', reason: 'insufficient_balance', balance, price };
    }

    try {
        await recordSubscriptionPayment(client, {
            subscriberUserId: sub.user_id,
            amount: price,
            planName: plan.name,
            note: `Subscription Auto Renew - ${plan.name}`,
            transferType: 'sub_auto_renew',
        });
    } catch (financeErr) {
        if (financeErr.code === 'GOOGER_WALLET_NOT_CONFIGURED') {
            return { action: 'error', reason: 'googer_wallet_not_found' };
        }
        throw financeErr;
    }

    const renewed = await client.query(
        `UPDATE user_plan_subscriptions
         SET plan_slug = $1,
             plan_name = $2,
             price_paid = $3,
             duration_days = $4,
             status = 'active',
             auto_renew = TRUE,
             started_at = COALESCE(expires_at, NOW()),
             expires_at = COALESCE(expires_at, NOW()) + (($5::text || ' seconds')::interval),
             cancelled_at = NULL
         WHERE id = $6
         RETURNING *`,
        [plan.slug, plan.name, price, plan.duration_days, getPlanDurationSeconds(plan), sub.id]
    );

    return { action: 'renewed', subscription: renewed.rows[0] };
};

const processSubscriptionRow = async (subscriptionId) => {
    const client = await pool.connect();
    try {
        await ensureTable();
        await client.query('BEGIN');

        const subRes = await client.query(
            `SELECT *
             FROM user_plan_subscriptions
             WHERE id = $1
               AND status = 'active'
               AND expires_at IS NOT NULL
               AND expires_at <= NOW()
             FOR UPDATE`,
            [subscriptionId]
        );
        const sub = subRes.rows[0];
        if (!sub) {
            await client.query('COMMIT');
            return { action: 'none' };
        }

        const result = await renewSubscription(client, sub);
        if (result.action === 'expired') {
            await syncUserApprovedUploadsToBasic(client, sub.user_id);
        }
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const processDueSubscriptionsForUser = async (userId) => {
    if (!userId) return [];
    await ensureTable();
    await normalizeTestModeExpiries(userId);

    const due = await pool.query(
        `SELECT id
         FROM user_plan_subscriptions
         WHERE user_id = $1
           AND status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at <= NOW()
         ORDER BY expires_at ASC`,
        [userId]
    );

    const results = [];
    for (const row of due.rows) {
        results.push(await processSubscriptionRow(row.id));
    }
        await syncUsersWithoutActivePaidPlanToBasic(pool, userId, getGraceDurationSeconds());
        await userSubscriptionsRepository.clearBadgesWithoutActivePaidPlan(getGraceDurationSeconds());
        await deleteExpiredUploadContents(pool, getGraceDurationSeconds());
        // Basic allows no saved ads, so a lapsed account's saves fall away with
        // its badge and its content rather than lingering on the profile.
        await getSavedAdsRepository().trimSavesForLapsedAccounts(getGraceDurationSeconds());
    return results;
};

const processDueSubscriptions = async () => {
    if (processingAll) return [];
    processingAll = true;
    try {
        await ensureTable();
        await normalizeTestModeExpiries();
        const due = await pool.query(
            `SELECT id
             FROM user_plan_subscriptions
             WHERE status = 'active'
               AND expires_at IS NOT NULL
               AND expires_at <= NOW()
             ORDER BY expires_at ASC
             LIMIT 100`
        );

        const results = [];
        for (const row of due.rows) {
            results.push(await processSubscriptionRow(row.id));
        }
        await syncUsersWithoutActivePaidPlanToBasic(pool, null, getGraceDurationSeconds());
        await userSubscriptionsRepository.clearBadgesWithoutActivePaidPlan(getGraceDurationSeconds());
        await deleteExpiredUploadContents(pool, getGraceDurationSeconds());
        // Basic allows no saved ads, so a lapsed account's saves fall away with
        // its badge and its content rather than lingering on the profile.
        await getSavedAdsRepository().trimSavesForLapsedAccounts(getGraceDurationSeconds());
        return results;
    } finally {
        processingAll = false;
    }
};

module.exports = {
    getPlanDurationMs,
    getPlanDurationSeconds,
    getGraceDurationMs,
    getGraceDurationSeconds,
    getPlanIntervalLabel,
    getRenewalSweepMs,
    getTestDurationMinutes,
    normalizeTestModeExpiries,
    processDueSubscriptionsForUser,
    processDueSubscriptions,
};
