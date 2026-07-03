const { distributeProductDiscountCommission } = require('../../utils/referralCommission');
const { finalizeReceivedOrder } = require('../../../../../shared/utils/orderSettlementHelpers');
const { autoReceiveExpiredCodOrders } = require('../../../../../shared/utils/orderAutoReceiveHelpers');

async function resolveGoogerMainWalletUserId(client) {
    const configuredId = Number.parseInt(String(process.env.GOOGER_MAIN_USER_ID || '').trim(), 10);
    if (Number.isFinite(configuredId) && configuredId > 0) {
        const configuredResult = await client.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [configuredId]);
        if (configuredResult.rows.length > 0) return configuredResult.rows[0].id;
    }

    const adminResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(COALESCE(user_type, '')) = 'admin'
         ORDER BY id ASC
         LIMIT 1`
    );
    if (adminResult.rows.length > 0) return adminResult.rows[0].id;

    const googerResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(username) = 'googer'
         ORDER BY id ASC
         LIMIT 1`
    );
    if (googerResult.rows.length > 0) return googerResult.rows[0].id;

    return 1;
}

async function ensureOrderDeliveryTimestampColumn(client) {
    await client.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
    `);

    await client.query(`
        UPDATE orders
        SET delivered_at = COALESCE(updated_at, created_at)
        WHERE delivered_at IS NULL
          AND status IN ('delivered', 'received')
    `);
}

async function ensureOrderResellCommissionColumns(client) {
    await client.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS reseller_user_id INTEGER,
        ADD COLUMN IF NOT EXISTS reseller_ref TEXT,
        ADD COLUMN IF NOT EXISTS resell_commission_percentage NUMERIC(8,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS resell_commission_amount NUMERIC(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS resell_googer_commission_percentage NUMERIC(8,2) DEFAULT 10,
        ADD COLUMN IF NOT EXISTS resell_commission_transfer_id INTEGER;
    `);
}

function parseCommissionInfo(rawInfo) {
    if (!rawInfo) return {};
    if (typeof rawInfo === 'object') return rawInfo;
    try {
        return JSON.parse(rawInfo);
    } catch {
        return {};
    }
}

function normalizeMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Number(number.toFixed(2));
}

function getProductDiscountPercentage(commissionInfo) {
    const percentage = parseFloat(commissionInfo?.discount || 0);
    return Number.isFinite(percentage) && percentage > 0 ? percentage : 0;
}

function getGoogerCommissionPercentage(commissionInfo) {
    const percentage = parseFloat(
        commissionInfo?.googer_commission
        ?? commissionInfo?.percentage
        ?? 0
    );
    return Number.isFinite(percentage) && percentage > 0 ? percentage : 0;
}

function calculateDiscountedProductAmount(item, quantity = 1) {
    const listedPrice = parseFloat(item?.promo_price || item?.price || 0);
    const safeQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1;
    const commissionInfo = parseCommissionInfo(item?.commission_info);
    const discountPct = getProductDiscountPercentage(commissionInfo);
    const productAmount = listedPrice * safeQuantity;
    const discountAmount = (productAmount * discountPct) / 100;

    return {
        discountAmount: normalizeMoney(discountAmount),
        discountPct,
    };
}

async function getOrderGoogerCommission(client, order) {
    const itemRes = await client.query('SELECT price, promo_price, commission_info FROM market WHERE id = $1', [order.item_id]);
    const item = itemRes.rows[0] || {};
    const info = parseCommissionInfo(item.commission_info);
    const commissionPercentage = getGoogerCommissionPercentage(info);

    if (!Number.isFinite(commissionPercentage) || commissionPercentage <= 0) {
        return { percentage: 0, amount: 0 };
    }

    const productAmount = parseFloat(order.total_price || 0);
    const commissionBase = Math.max(0, productAmount);
    const amount = normalizeMoney((commissionBase * commissionPercentage) / 100);
    return {
        percentage: commissionPercentage,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        baseAmount: normalizeMoney(commissionBase),
    };
}

async function getOrderProductDiscount(client, order) {
    const itemRes = await client.query('SELECT price, promo_price, commission_info FROM market WHERE id = $1', [order.item_id]);
    const item = itemRes.rows[0] || {};
    const quantity = parseFloat(order.quantity || 1);
    const { discountAmount, discountPct } = calculateDiscountedProductAmount(item, quantity);

    return {
        percentage: discountPct,
        amount: discountAmount,
    };
}

async function completeWalletTransferIfGroupSettled(client, transferId, currentOrderId) {
    if (!transferId) return;

    const activeSiblings = await client.query(
        `SELECT 1
         FROM orders
         WHERE wallet_transfer_id = $1
           AND id <> $2
           AND status NOT IN ('received', 'cancelled', 'returned', 'rejected')
         LIMIT 1`,
        [transferId, currentOrderId]
    );

    if (activeSiblings.rows.length === 0) {
        await client.query("UPDATE wallet_transfers SET status = 'completed' WHERE id = $1", [transferId]);
    }
}

async function runOrderAutoReceivePreflight(client, userId) {
    await client.query('BEGIN');
    await ensureOrderDeliveryTimestampColumn(client);
    await autoReceiveExpiredCodOrders(client, {
        userId,
        ageInterval: '48 hours',
        finalizeReceivedOrder,
        finalizeOptions: {
            allowAdvancedSettlement: true,
            ensureOrderResellCommissionColumns,
            resolveGoogerMainWalletUserId,
            getOrderGoogerCommission,
            getOrderProductDiscount,
            completeWalletTransferIfGroupSettled,
            distributeProductDiscountCommission,
            normalizeMoney,
        },
    });
    await client.query('COMMIT');
}

module.exports = {
    calculateDiscountedProductAmount,
    completeWalletTransferIfGroupSettled,
    ensureOrderDeliveryTimestampColumn,
    ensureOrderResellCommissionColumns,
    getGoogerCommissionPercentage,
    getOrderGoogerCommission,
    getOrderProductDiscount,
    normalizeMoney,
    parseCommissionInfo,
    resolveGoogerMainWalletUserId,
    runOrderAutoReceivePreflight,
};
