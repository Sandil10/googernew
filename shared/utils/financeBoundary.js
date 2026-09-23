function normalizeMoney(value) {
    const numeric = Number.parseFloat(String(value ?? 0));
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
}

async function resolveGoogerMainWalletUserId(client) {
    const configuredId = Number.parseInt(String(process.env.GOOGER_MAIN_USER_ID || '').trim(), 10);
    if (Number.isFinite(configuredId) && configuredId > 0) {
        const configuredResult = await client.query(
            'SELECT id FROM users WHERE id = $1 LIMIT 1',
            [configuredId]
        );
        if (configuredResult.rows.length > 0) {
            return configuredResult.rows[0].id;
        }
    }

    const adminResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(COALESCE(user_type, '')) IN ('admin', 'administrator', 'super_admin', 'superadmin')
         ORDER BY id ASC
         LIMIT 1`
    );
    if (adminResult.rows.length > 0) {
        return adminResult.rows[0].id;
    }

    const googerResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(COALESCE(username, '')) = 'googer'
         ORDER BY id ASC
         LIMIT 1`
    );
    if (googerResult.rows.length > 0) {
        return googerResult.rows[0].id;
    }

    const fallbackResult = await client.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    return fallbackResult.rows[0]?.id || null;
}

async function lockGoogerMainWalletUser(client) {
    const userId = await resolveGoogerMainWalletUserId(client);
    if (!userId) return null;

    const result = await client.query(
        'SELECT id, wallet_balance FROM users WHERE id = $1 FOR UPDATE',
        [userId]
    );

    if (result.rows.length === 0) return null;

    return {
        id: result.rows[0].id,
        walletBalance: normalizeMoney(result.rows[0].wallet_balance),
    };
}

async function getGoogerPooledBalance(client) {
    const tableFlags = await client.query(
        `SELECT
            to_regclass('public.upload_content_purchases') IS NOT NULL AS has_upload_purchases,
            to_regclass('public.upload_content_subscriptions') IS NOT NULL AS has_upload_subscriptions`
    );
    const hasUploadPurchases = tableFlags.rows[0]?.has_upload_purchases === true;
    const hasUploadSubscriptions = tableFlags.rows[0]?.has_upload_subscriptions === true;
    const uploadPurchaseCommissionSql = hasUploadPurchases
        ? '(SELECT SUM(commission_amount) FROM upload_content_purchases)'
        : '0';
    const uploadSubscriptionCommissionSql = hasUploadSubscriptions
        ? '(SELECT SUM(commission_amount) FROM upload_content_subscriptions)'
        : '0';

    const result = await client.query(
        `WITH commission_totals AS (
            SELECT
                COALESCE((
                    SELECT SUM(commission)
                    FROM wallet_transfers
                    WHERE LOWER(TRIM(COALESCE(status, ''))) = 'accepted'
                ), 0)::numeric AS wallet_commission,
                COALESCE((
                    SELECT SUM(commission)
                    FROM wallet_transfers
                    WHERE LOWER(TRIM(COALESCE(status, ''))) = 'accepted'
                      AND LOWER(TRIM(COALESCE(type, ''))) = 'commission_hold'
                ), 0)::numeric AS upload_transfer_commission,
                (
                    COALESCE(${uploadPurchaseCommissionSql}, 0)
                    + COALESCE(${uploadSubscriptionCommissionSql}, 0)
                )::numeric AS upload_record_commission
         )
         SELECT (
            wallet_commission
            + GREATEST(0, upload_record_commission - upload_transfer_commission)
         )::numeric AS balance
         FROM commission_totals`
    );

    return normalizeMoney(result.rows[0]?.balance || 0);
}

async function getLockedGoogerPooledState(client) {
    const wallet = await lockGoogerMainWalletUser(client);
    if (!wallet) {
        return null;
    }

    return {
        userId: wallet.id,
        walletBalance: wallet.walletBalance,
        pooledBalance: await getGoogerPooledBalance(client),
    };
}

module.exports = {
    normalizeMoney,
    resolveGoogerMainWalletUserId,
    lockGoogerMainWalletUser,
    getGoogerPooledBalance,
    getLockedGoogerPooledState,
};
