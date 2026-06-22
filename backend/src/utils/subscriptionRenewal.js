const pool = require('../config/database');
const { recordSubscriptionPayment } = require('../../../../shared/utils/financeCommands');

let tableReady = false;
let processingAll = false;

const getTestDurationMinutes = () => {
    const raw = Number(process.env.SUBSCRIPTION_TEST_DURATION_MINUTES || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

const getPlanDurationMs = (plan) => {
    const testMinutes = getTestDurationMinutes();
    if (testMinutes > 0) return testMinutes * 60 * 1000;

    const days = Number(plan?.duration_days || 0);
    return Math.max(0, days) * 24 * 60 * 60 * 1000;
};

const getPlanDurationSeconds = (plan) => Math.max(0, Math.round(getPlanDurationMs(plan) / 1000));

const getGraceDurationMs = () => {
    const testMinutes = Number(process.env.SUBSCRIPTION_TEST_GRACE_MINUTES || 0);
    if (Number.isFinite(testMinutes) && testMinutes > 0) return testMinutes * 60 * 1000;

    const days = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7);
    return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
};

const getGraceDurationSeconds = () => Math.max(0, Math.round(getGraceDurationMs() / 1000));

const getPlanIntervalLabel = (plan) => {
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
    const graceEndsAt = sub.expires_at
        ? new Date(new Date(sub.expires_at).getTime() + getGraceDurationMs())
        : null;
    const isInsideGrace = graceEndsAt && graceEndsAt.getTime() > Date.now();

    const planRes = await client.query(
        `SELECT id, slug, name, price, duration_days, is_active
         FROM subscription_plans
         WHERE id = $1`,
        [sub.plan_id]
    );
    const plan = planRes.rows[0];
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
