const pool = require('../../config/database');
const { distributeProductDiscountCommission } = require('../../utils/referralCommission');
const { adjustOrderItemStock } = require('../../../../../shared/utils/orderStockHelpers');
const { refundCancelledOrder } = require('../../../../../shared/utils/orderRefundHelpers');
const { finalizeReceivedOrder } = require('../../../../../shared/utils/orderSettlementHelpers');
const orderRepository = require('./orderRepository');
const {
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
} = require('./orderReadSupport');

const createHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const withRollback = async (client, error) => {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
};

const ensureOrderPreflight = async (userId) => {
    const client = await pool.connect();
    try {
        await runOrderAutoReceivePreflight(client, userId);
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {}
        throw error;
    } finally {
        client.release();
    }
};

const getOrderSettlementOptions = () => ({
    allowAdvancedSettlement: true,
    completeWalletTransferIfGroupSettled,
    distributeProductDiscountCommission,
    ensureOrderResellCommissionColumns,
    getOrderGoogerCommission,
    getOrderProductDiscount,
    normalizeMoney,
    resolveGoogerMainWalletUserId,
});

const getResellCommissionPercentage = (commissionInfo) => {
    const percentage = parseFloat(
        commissionInfo?.resell_percentage
        ?? commissionInfo?.resell_percent
        ?? commissionInfo?.resell_commission
        ?? commissionInfo?.reseller_commission
        ?? 0
    );
    return Number.isFinite(percentage) && percentage > 0 ? percentage : 0;
};

const getResellGoogerCommissionPercentage = async (client) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS ad_coin_reward_settings (
            id SERIAL PRIMARY KEY,
            user_reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
            googer_commission_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.25,
            advertiser_charge_amount DECIMAL(10, 2) NOT NULL DEFAULT 1.25,
            required_watch_seconds INTEGER NOT NULL DEFAULT 15,
            resell_googer_commission_percentage DECIMAL(8, 2) NOT NULL DEFAULT 10.00,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await client.query(`
        ALTER TABLE ad_coin_reward_settings
        ADD COLUMN IF NOT EXISTS resell_googer_commission_percentage DECIMAL(8, 2) NOT NULL DEFAULT 10.00
    `);

    const countRes = await client.query('SELECT COUNT(*)::int AS count FROM ad_coin_reward_settings');
    if (Number(countRes.rows[0]?.count || 0) === 0) {
        await client.query(`
            INSERT INTO ad_coin_reward_settings (
                user_reward_amount,
                googer_commission_amount,
                advertiser_charge_amount,
                required_watch_seconds,
                resell_googer_commission_percentage,
                is_active
            ) VALUES (1.00, 0.25, 1.25, 15, 10.00, true)
        `);
    }

    const result = await client.query(`
        SELECT resell_googer_commission_percentage
        FROM ad_coin_reward_settings
        WHERE is_active = true
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
    `);

    const percentage = parseFloat(result.rows[0]?.resell_googer_commission_percentage ?? 10);
    return Number.isFinite(percentage) && percentage >= 0 ? percentage : 10;
};

const resolveResellerUser = async (client, resellerRef) => {
    const ref = String(resellerRef || '').trim().replace(/^@+/, '');
    if (!ref) return null;

    const result = await client.query(
        `SELECT id, username, user_id
         FROM users
         WHERE id::text = $1
            OR user_id::text = $1
            OR LOWER(username) = LOWER($1)
         ORDER BY id ASC
         LIMIT 1`,
        [ref]
    );

    return result.rows[0] || null;
};

const createResellCommissionHold = async (client, { sellerId, buyerId, item, quantity, resellerRef }) => {
    if (!resellerRef || !String(resellerRef).trim()) return null;

    const reseller = await resolveResellerUser(client, resellerRef);
    if (!reseller) return null;

    const resellerId = Number(reseller.id || 0);
    if (!resellerId || resellerId === Number(buyerId) || resellerId === Number(sellerId)) {
        return null;
    }

    const commInfo = parseCommissionInfo(item.commission_info);
    const resellPct = getResellCommissionPercentage(commInfo);
    if (resellPct <= 0) return null;

    const productAmount = parseFloat(item.promo_price || item.price || 0) * (Number(quantity) || 1);
    const resellAmount = normalizeMoney((productAmount * resellPct) / 100);
    if (resellAmount <= 0) return null;

    const googerPct = await getResellGoogerCommissionPercentage(client);
    const googerShare = normalizeMoney((resellAmount * googerPct) / 100);

    const sellerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [sellerId]);
    const sellerBalance = parseFloat(sellerRes.rows[0]?.wallet_balance || 0);
    if (sellerBalance < resellAmount) {
        throw createHttpError(
            400,
            `Seller has insufficient balance to hold resell commission for item ${item.id}. Needs ${resellAmount}, has ${sellerBalance.toFixed(2)}.`
        );
    }

    await client.query(
        'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
        [resellAmount, sellerId]
    );

    const transferResult = await client.query(
        `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage)
         VALUES ($1, $2, $3, $4, 'resell_commission', 'pending', $5, $6)
         RETURNING id`,
        [sellerId, resellerId, resellAmount, `Resell commission HOLD for ${item.title || `Order Item #${item.id}`}`, googerShare, resellPct]
    );

    return {
        amount: resellAmount,
        googerPercentage: googerPct,
        percentage: resellPct,
        resellerRef: String(reseller.user_id || reseller.username || resellerId),
        resellerUserId: resellerId,
        transferId: transferResult.rows[0].id,
    };
};

const createOrderRecord = async (client, orderData) => {
    const {
        item_id,
        buyer_id,
        seller_id,
        status = 'pending',
        quantity,
        size = null,
        color = null,
        variant_index = null,
        total_price,
        shipping_address,
        order_number,
        wallet_transfer_id = null,
        seller_commission_transfer_id = null,
        payment_method = 'wallet',
        shipping_fee = 0,
        seller_discount_transfer_id = null,
        reseller_user_id = null,
        reseller_ref = null,
        resell_commission_percentage = 0,
        resell_commission_amount = 0,
        resell_googer_commission_percentage = 10,
        resell_commission_transfer_id = null,
    } = orderData;

    await ensureOrderResellCommissionColumns(client);

    return client.query(
        `INSERT INTO orders (
            item_id, buyer_id, seller_id, status,
            quantity, size, color, variant_index,
            total_price, shipping_address, order_number,
            wallet_transfer_id, seller_commission_transfer_id,
            payment_method, shipping_fee, seller_discount_transfer_id,
            reseller_user_id, reseller_ref, resell_commission_percentage,
            resell_commission_amount, resell_googer_commission_percentage,
            resell_commission_transfer_id
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22
        ) RETURNING *`,
        [
            item_id,
            buyer_id,
            seller_id,
            status,
            quantity,
            size,
            color,
            variant_index,
            total_price,
            shipping_address,
            order_number,
            wallet_transfer_id,
            seller_commission_transfer_id,
            payment_method,
            shipping_fee,
            seller_discount_transfer_id,
            reseller_user_id,
            reseller_ref,
            resell_commission_percentage,
            resell_commission_amount,
            resell_googer_commission_percentage,
            resell_commission_transfer_id,
        ]
    );
};

const validateManualPaymentHoldTransfer = async (client, { buyerId, sellerId, transferId, expectedAmount }) => {
    if (!transferId) throw createHttpError(400, 'Manual payment transaction is required');

    const normalizedTransferId = String(transferId).trim();
    const isNumericTransferId = /^\d+$/.test(normalizedTransferId);
    let transfer = null;

    if (isNumericTransferId) {
        const directTransferRes = await client.query(
            `SELECT *
             FROM wallet_transfers
             WHERE id = $1
               AND sender_id = $2
               AND receiver_id = $3
               AND type = 'order_hold'
               AND status = 'pending'
             FOR UPDATE`,
            [normalizedTransferId, buyerId, sellerId]
        );
        if (directTransferRes.rows.length > 0) transfer = directTransferRes.rows[0];
    }

    if (!transfer) {
        const candidateTransfersRes = await client.query(
            `SELECT *
             FROM wallet_transfers
             WHERE sender_id = $1
               AND receiver_id = $2
               AND type = 'order_hold'
               AND status = 'pending'
             FOR UPDATE`,
            [buyerId, sellerId]
        );

        transfer = candidateTransfersRes.rows.find((candidate) => String(candidate.id) === normalizedTransferId) || null;
    }

    if (!transfer) throw createHttpError(400, 'Manual payment hold transaction not found');

    const heldAmount = parseFloat(transfer.amount || 0);
    const requiredAmount = parseFloat(expectedAmount || 0);
    if (heldAmount.toFixed(2) !== requiredAmount.toFixed(2)) {
        throw createHttpError(
            400,
            `Manual payment hold amount mismatch. Required: R ${requiredAmount.toFixed(2)}, Found: R ${heldAmount.toFixed(2)}`
        );
    }

    return transfer;
};

const validateWalletPaymentHoldTransfer = async (client, { buyerId, transferId, expectedAmount }) => {
    if (!transferId) throw createHttpError(400, 'Googer payment transaction is required');

    const normalizedTransferId = String(transferId).trim();
    if (!/^\d+$/.test(normalizedTransferId)) {
        throw createHttpError(400, 'Invalid Googer payment transaction');
    }

    const transferRes = await client.query(
        `SELECT *
         FROM wallet_transfers
         WHERE id = $1
           AND sender_id = $2
           AND receiver_id = $2
           AND type = 'order_hold'
           AND status = 'pending'
         FOR UPDATE`,
        [normalizedTransferId, buyerId]
    );

    if (transferRes.rows.length === 0) throw createHttpError(400, 'Googer payment hold transaction not found');

    const transfer = transferRes.rows[0];
    const heldAmount = parseFloat(transfer.amount || 0);
    const requiredAmount = parseFloat(expectedAmount || 0);
    if (heldAmount.toFixed(2) !== requiredAmount.toFixed(2)) {
        throw createHttpError(
            400,
            `Googer payment hold amount mismatch. Required: R ${requiredAmount.toFixed(2)}, Found: R ${heldAmount.toFixed(2)}`
        );
    }

    return transfer;
};

const stakeSellerDiscount = async (client, { sellerId, buyerId, itemId, quantity, notePrefix, isManualPayment }) => {
    const itemRes = await client.query('SELECT price, promo_price, commission_info FROM market WHERE id = $1', [itemId]);
    if (itemRes.rows.length === 0) return null;

    const item = itemRes.rows[0];
    const { discountAmount } = calculateDiscountedProductAmount(item, quantity);
    if (discountAmount <= 0) return null;

    const sellerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [sellerId]);
    const sellerBalance = parseFloat(sellerRes.rows[0]?.wallet_balance || 0);
    if (sellerBalance < discountAmount) return null;

    if (isManualPayment) {
        await client.query(
            'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
            [discountAmount, sellerId]
        );
    } else {
        await client.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [discountAmount, sellerId]);
    }

    const discountTx = await client.query(
        `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
         VALUES ($1, $2, $3, $4, 'discount_staking', 'completed') RETURNING id`,
        [sellerId, buyerId, discountAmount, `${notePrefix} #${itemId}`]
    );

    return discountTx.rows[0].id;
};

const generateOrderNumber = async (client) => {
    while (true) {
        const orderNumber = Math.floor(10000000 + Math.random() * 90000000).toString();
        const checkRes = await client.query('SELECT 1 FROM orders WHERE order_number = $1', [orderNumber]);
        if (checkRes.rows.length === 0) return orderNumber;
    }
};

const holdSellerCommission = async (client, { item, itemId, quantity, sellerId, notePrefix, paymentMethod }) => {
    const commInfo = parseCommissionInfo(item.commission_info);
    const isCodPayment = (paymentMethod || 'wallet') === 'cod';
    const commissionPercentage = isCodPayment
        ? getGoogerCommissionPercentage(commInfo)
        : parseFloat(commInfo?.percentage || 0);
    const commissionProductAmount = parseFloat(item.promo_price || item.price || 0) * quantity;
    const commissionAmount = normalizeMoney((commissionProductAmount * commissionPercentage) / 100);
    if (commissionAmount <= 0) return null;

    const sellerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [sellerId]);
    const sellerBalance = parseFloat(sellerRes.rows[0]?.wallet_balance || 0);

    if (sellerBalance < commissionAmount && isCodPayment) {
        throw createHttpError(400, `Seller has insufficient balance to hold Googer commission for item ${itemId}.`);
    }

    if (sellerBalance < commissionAmount) return null;

    await client.query(
        'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
        [commissionAmount, sellerId]
    );

    const sellerHoldTx = await client.query(
        `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
         VALUES ($1, $1, $2, $3, 'commission_hold', 'pending') RETURNING id`,
        [sellerId, commissionAmount, `${notePrefix} #${itemId}`]
    );

    return sellerHoldTx.rows[0].id;
};

const createOrder = async ({
    buyerId,
    color,
    itemId,
    paymentMethod,
    quantity,
    resellerRef,
    shippingAddress,
    shippingFee,
    size,
    variantIndex,
    walletTransferId,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureOrderResellCommissionColumns(client);

        const itemResult = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [itemId]);
        if (itemResult.rows.length === 0) {
            throw createHttpError(404, 'Item not found');
        }

        const item = itemResult.rows[0];
        const sellerId = item.user_id;
        const isManualWalletPayment = paymentMethod === 'wallet_manual';
        const resolvedShippingFee = parseFloat(shippingFee || 0);
        const totalRequired = (parseFloat(item.promo_price || item.price || 0) * quantity) + resolvedShippingFee;

        await adjustOrderItemStock(client, item, { color, quantity, size, variant_index: variantIndex }, 'decrease');

        let walletTransferIdFinal = walletTransferId || null;
        if (paymentMethod === 'wallet') {
            const buyerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [buyerId]);
            const buyerBalance = parseFloat(buyerRes.rows[0]?.wallet_balance || 0);
            if (buyerBalance < totalRequired) {
                throw createHttpError(
                    400,
                    `Insufficient wallet balance. Required: R ${totalRequired.toFixed(2)}, Available: R ${buyerBalance.toFixed(2)}`
                );
            }

            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
                [totalRequired, buyerId]
            );

            const buyerHoldTx = await client.query(
                `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
                 VALUES ($1, $1, $2, $3, 'order_hold', 'pending') RETURNING id`,
                [buyerId, totalRequired, `Payment hold for Order Item #${itemId}`]
            );
            walletTransferIdFinal = buyerHoldTx.rows[0].id;
        }

        if (isManualWalletPayment) {
            const validatedHold = await validateManualPaymentHoldTransfer(client, {
                buyerId,
                expectedAmount: totalRequired,
                sellerId,
                transferId: walletTransferIdFinal,
            });
            walletTransferIdFinal = validatedHold.id;
        }

        const sellerCommissionTransferId = await holdSellerCommission(client, {
            item,
            itemId,
            notePrefix: 'Commission deposit for Order Item',
            paymentMethod,
            quantity,
            sellerId,
        });

        const sellerDiscountTransferId = await stakeSellerDiscount(client, {
            buyerId,
            isManualPayment: isManualWalletPayment,
            itemId,
            notePrefix: 'Discount staking for Order Item',
            quantity,
            sellerId,
        });

        const resellCommission = await createResellCommissionHold(client, {
            buyerId,
            item,
            quantity,
            resellerRef,
            sellerId,
        });

        const orderNumber = await generateOrderNumber(client);
        const newOrder = await createOrderRecord(client, {
            buyer_id: buyerId,
            color,
            item_id: itemId,
            order_number: orderNumber,
            payment_method: paymentMethod || 'wallet',
            quantity,
            reseller_ref: resellCommission?.resellerRef || null,
            reseller_user_id: resellCommission?.resellerUserId || null,
            resell_commission_amount: resellCommission?.amount || 0,
            resell_commission_percentage: resellCommission?.percentage || 0,
            resell_commission_transfer_id: resellCommission?.transferId || null,
            resell_googer_commission_percentage: resellCommission?.googerPercentage || 10,
            seller_commission_transfer_id: sellerCommissionTransferId,
            seller_discount_transfer_id: sellerDiscountTransferId,
            seller_id: sellerId,
            shipping_address: shippingAddress,
            shipping_fee: shippingFee || 0,
            size,
            status: 'pending',
            total_price: parseFloat(item.promo_price || item.price || 0) * quantity,
            variant_index: variantIndex,
            wallet_transfer_id: walletTransferIdFinal,
        });

        await client.query('COMMIT');
        return { success: true, data: newOrder.rows[0] };
    } catch (error) {
        return withRollback(client, error);
    } finally {
        client.release();
    }
};

const createBulkOrder = async ({
    buyerId,
    items,
    paymentMethod,
    shippingAddress,
    walletTransferId,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let walletTransferIdMaster = walletTransferId || null;

        if (paymentMethod === 'wallet') {
            let totalRequired = 0;
            for (const itemData of items) {
                const itemRes = await client.query('SELECT price, promo_price FROM market WHERE id = $1', [itemData.item_id]);
                if (itemRes.rows.length > 0) {
                    const dbListedPrice = parseFloat(itemRes.rows[0].promo_price || itemRes.rows[0].price || 0);
                    totalRequired += (dbListedPrice * (itemData.quantity || 1)) + (parseFloat(itemData.shipping_fee || 0));
                }
            }

            if (walletTransferIdMaster) {
                const validatedHold = await validateWalletPaymentHoldTransfer(client, {
                    buyerId,
                    expectedAmount: totalRequired,
                    transferId: walletTransferIdMaster,
                });
                walletTransferIdMaster = validatedHold.id;
            } else {
                const buyerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [buyerId]);
                const buyerBalance = parseFloat(buyerRes.rows[0]?.wallet_balance || 0);
                if (buyerBalance < totalRequired) {
                    throw createHttpError(
                        400,
                        `Insufficient wallet balance. Total required: R ${totalRequired.toFixed(2)}, available: R ${buyerBalance.toFixed(2)}`
                    );
                }

                await client.query(
                    'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
                    [totalRequired, buyerId]
                );

                const holdTx = await client.query(
                    `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
                     VALUES ($1, $1, $2, $3, 'order_hold', 'pending') RETURNING id`,
                    [buyerId, totalRequired, 'Consolidated payment hold for Multi-Seller Order']
                );
                walletTransferIdMaster = holdTx.rows[0].id;
            }
        }

        if (paymentMethod === 'wallet_manual') {
            let totalRequired = 0;
            let expectedSellerId = null;

            for (const itemData of items) {
                const itemRes = await client.query('SELECT user_id, price, promo_price FROM market WHERE id = $1', [itemData.item_id]);
                if (itemRes.rows.length === 0) {
                    throw createHttpError(404, `Item ${itemData.item_id} not found`);
                }

                const marketItem = itemRes.rows[0];
                const dbListedPrice = parseFloat(marketItem.promo_price || marketItem.price || 0);
                totalRequired += (dbListedPrice * (itemData.quantity || 1)) + (parseFloat(itemData.shipping_fee || 0));

                if (expectedSellerId === null) {
                    expectedSellerId = marketItem.user_id;
                } else if (expectedSellerId !== marketItem.user_id) {
                    throw createHttpError(400, 'Googer Manual Payment supports only one seller per order.');
                }
            }

            const validatedHold = await validateManualPaymentHoldTransfer(client, {
                buyerId,
                expectedAmount: totalRequired,
                sellerId: expectedSellerId,
                transferId: walletTransferIdMaster,
            });
            walletTransferIdMaster = validatedHold.id;
        }

        const orderNumber = await generateOrderNumber(client);
        const createdOrders = [];

        for (const itemData of items) {
            const { item_id, quantity, size, color, variant_index, shipping_fee, reseller_ref } = itemData;
            const itemResult = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [item_id]);
            if (itemResult.rows.length === 0) {
                throw createHttpError(404, `Item ${item_id} not found`);
            }

            const item = itemResult.rows[0];
            const sellerId = item.user_id;
            const sellerCommissionTransferId = await holdSellerCommission(client, {
                item,
                itemId: item_id,
                notePrefix: 'Commission hold for Bulk Order Item',
                paymentMethod,
                quantity,
                sellerId,
            });

            const sellerDiscountTransferId = await stakeSellerDiscount(client, {
                buyerId,
                isManualPayment: paymentMethod === 'wallet_manual',
                itemId: item_id,
                notePrefix: 'Discount staking for Bulk Order Item',
                quantity,
                sellerId,
            });

            const resellCommission = await createResellCommissionHold(client, {
                buyerId,
                item,
                quantity,
                resellerRef: reseller_ref,
                sellerId,
            });

            await adjustOrderItemStock(client, item, { color, quantity, size, variant_index }, 'decrease');

            const newOrder = await createOrderRecord(client, {
                buyer_id: buyerId,
                color,
                item_id: item_id,
                order_number: orderNumber,
                payment_method: paymentMethod || 'wallet',
                quantity,
                reseller_ref: resellCommission?.resellerRef || null,
                reseller_user_id: resellCommission?.resellerUserId || null,
                resell_commission_amount: resellCommission?.amount || 0,
                resell_commission_percentage: resellCommission?.percentage || 0,
                resell_commission_transfer_id: resellCommission?.transferId || null,
                resell_googer_commission_percentage: resellCommission?.googerPercentage || 10,
                seller_commission_transfer_id: sellerCommissionTransferId,
                seller_discount_transfer_id: sellerDiscountTransferId,
                seller_id: sellerId,
                shipping_address: shippingAddress,
                shipping_fee: shipping_fee || 0,
                size,
                status: 'pending',
                total_price: parseFloat(item.promo_price || item.price || 0) * quantity,
                variant_index: variant_index,
                wallet_transfer_id: walletTransferIdMaster || null,
            });

            createdOrders.push(newOrder.rows[0]);
        }

        await client.query('COMMIT');
        return { success: true, data: createdOrders };
    } catch (error) {
        return withRollback(client, error);
    } finally {
        client.release();
    }
};

const getOrderBadgeCounts = async (userId) => {
    await ensureOrderPreflight(userId);

    const allStatuses = ['pending', 'processing', 'shipped', 'delivered', 'received', 'reshipped', 'cancelled', 'returned', 'rejected'];
    const badgeStatuses = {
        all: allStatuses,
        processing: ['processing'],
        shipped: ['shipped'],
    };

    const countFor = async (column, statuses) => {
        const result = await orderRepository.countDistinctOrdersForUser({ column, statuses, userId });
        return Number(result.rows[0]?.count || 0);
    };

    const [buyerAll, buyerProcessing, buyerShipped, sellerAll, sellerProcessing, sellerShipped] = await Promise.all([
        countFor('buyer_id', badgeStatuses.all),
        countFor('buyer_id', badgeStatuses.processing),
        countFor('buyer_id', badgeStatuses.shipped),
        countFor('seller_id', badgeStatuses.all),
        countFor('seller_id', badgeStatuses.processing),
        countFor('seller_id', badgeStatuses.shipped),
    ]);

    return {
        success: true,
        data: {
            buyer: { all: buyerAll, processing: buyerProcessing, shipped: buyerShipped, total: buyerAll },
            seller: { all: sellerAll, processing: sellerProcessing, shipped: sellerShipped, total: sellerAll },
        },
    };
};

const getBuyerOrders = async ({ status, userId }) => {
    await ensureOrderPreflight(userId);
    const result = await orderRepository.getBuyerOrders({
        statusList: status ? String(status).split(',') : null,
        userId,
    });

    return { success: true, data: result.rows };
};

const getSellerOrders = async ({ status, userId }) => {
    await ensureOrderPreflight(userId);
    const result = await orderRepository.getSellerOrders({
        statusList: status ? String(status).split(',') : null,
        userId,
    });

    return { success: true, data: result.rows };
};

const updateOrderStatus = async ({ id, status, userId }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureOrderDeliveryTimestampColumn(client);

        const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
        if (orderRes.rows.length === 0) throw createHttpError(404, 'Order not found');

        const order = orderRes.rows[0];
        const isBuyer = order.buyer_id === userId;
        const isSeller = order.seller_id === userId;

        if (status === 'received' && !isBuyer) throw createHttpError(403, 'Only buyer can confirm receipt');
        if (['processing', 'shipped', 'delivered'].includes(status) && !isSeller) {
            throw createHttpError(403, 'Only seller can update status');
        }
        if (status === 'accepted_report' && !isBuyer) {
            throw createHttpError(403, 'Only buyer can accept a seller report');
        }
        if (status === 'rejected_report') {
            const canRejectBuyerReport = order.report_by === 'buyer' && isSeller;
            const canRejectSellerReport = order.report_by === 'seller' && isBuyer;
            if (!canRejectBuyerReport && !canRejectSellerReport) {
                throw createHttpError(403, 'Not authorized to reject this report');
            }
        }
        if (status === 'reshipped' && !(order.report_by === 'buyer' && isSeller)) {
            throw createHttpError(403, 'Only seller can mark a buyer report as reshipped');
        }

        if (status === 'cancelled') {
            if (isBuyer && order.status !== 'pending') {
                throw createHttpError(400, 'Buyers can only cancel orders that are still pending.');
            }
            if (!isSeller && !isBuyer) {
                throw createHttpError(403, 'Only the buyer (if pending) or the seller can cancel this order.');
            }
            if (['received', 'delivered', 'shipped'].includes(order.status)) {
                throw createHttpError(400, 'Cannot cancel an order that is already shipped, delivered or received.');
            }
        }

        if (status === 'received' && order.status !== 'received') {
            await finalizeReceivedOrder(client, order, getOrderSettlementOptions());
        }

        let finalStatus = status;
        let reportStatusToSet = null;
        if (status === 'reshipped') {
            reportStatusToSet = 'reshipped';
            finalStatus = 'reshipped';
        } else if (status === 'rejected_report') {
            reportStatusToSet = 'rejected';
            finalStatus = order.status;
        } else if (status === 'accepted_report') {
            reportStatusToSet = 'accepted';
            finalStatus = order.status;
        }

        if (status === 'cancelled' && order.status !== 'cancelled') {
            await refundCancelledOrder(client, order, {
                allowResellCommissionRefund: true,
                allowedTransferColumns: [
                    'wallet_transfer_id',
                    'seller_commission_transfer_id',
                    'seller_discount_transfer_id',
                    'resell_commission_transfer_id',
                ],
                lockTransferRows: true,
                skipResellCommissionStatuses: ['cancelled', 'completed', 'accepted', 'refunded'],
                skipSellerCommissionStatuses: ['cancelled', 'completed', 'refunded'],
                skipSellerDiscountStatuses: ['cancelled', 'refunded'],
                skipWalletTransferStatuses: ['cancelled', 'completed'],
            });

            const marketItemRes = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [order.item_id]);
            if (marketItemRes.rows.length > 0) {
                await adjustOrderItemStock(client, marketItemRes.rows[0], order, 'increase');
            }
        }

        const updated = await client.query(
            `UPDATE orders
             SET status = $1,
                 report_status = COALESCE($2, report_status),
                 delivered_at = CASE WHEN $1 = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING *`,
            [finalStatus, reportStatusToSet, id]
        );

        await client.query('COMMIT');
        return { success: true, data: updated.rows[0] };
    } catch (error) {
        return withRollback(client, error);
    } finally {
        client.release();
    }
};

const cancelOrderGroup = async ({ orderNumber, userId }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const ordersRes = await client.query('SELECT * FROM orders WHERE order_number = $1 FOR UPDATE', [orderNumber]);
        if (ordersRes.rows.length === 0) throw createHttpError(404, 'Order group not found');
        if (ordersRes.rows[0].buyer_id !== userId) throw createHttpError(403, 'Not authorized');

        const nonPendingOrders = ordersRes.rows.filter((order) => order.status !== 'pending' && order.status !== 'cancelled');
        if (nonPendingOrders.length > 0) {
            throw createHttpError(
                400,
                'Cannot cancel the entire order group because one or more items have already been accepted or processed by the seller.'
            );
        }

        for (const order of ordersRes.rows) {
            if (order.status === 'cancelled') continue;

            await refundCancelledOrder(client, order, {
                allowResellCommissionRefund: true,
                allowedTransferColumns: [
                    'wallet_transfer_id',
                    'seller_commission_transfer_id',
                    'seller_discount_transfer_id',
                    'resell_commission_transfer_id',
                ],
                lockTransferRows: true,
                skipResellCommissionStatuses: ['cancelled', 'completed', 'accepted', 'refunded'],
                skipSellerCommissionStatuses: ['cancelled', 'completed', 'refunded'],
                skipSellerDiscountStatuses: ['cancelled', 'refunded'],
                skipWalletTransferStatuses: ['cancelled', 'completed'],
            });

            const marketItemRes = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [order.item_id]);
            if (marketItemRes.rows.length > 0) {
                await adjustOrderItemStock(client, marketItemRes.rows[0], order, 'increase');
            }

            await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [order.id]);
        }

        await client.query('COMMIT');
        return { success: true, message: 'Order group cancelled and refunded' };
    } catch (error) {
        return withRollback(client, error);
    } finally {
        client.release();
    }
};

const updateOrderGroupStatus = async ({ orderNumber, status, userId }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (status === 'received') {
            const buyerOrdersRes = await client.query(
                'SELECT * FROM orders WHERE order_number = $1 AND buyer_id = $2 FOR UPDATE',
                [orderNumber, userId]
            );
            if (buyerOrdersRes.rows.length === 0) {
                throw createHttpError(404, 'No items found in this order group for your account');
            }

            if (buyerOrdersRes.rows.some((order) => order.payment_method !== 'wallet_manual')) {
                throw createHttpError(400, 'This group confirmation release is only available for Googer Manual Payment orders.');
            }

            const updatedOrders = [];
            for (const order of buyerOrdersRes.rows) {
                if (order.status !== 'received') {
                    await finalizeReceivedOrder(client, order, getOrderSettlementOptions());
                }
                const updated = await client.query(
                    'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
                    ['received', order.id]
                );
                updatedOrders.push(updated.rows[0]);
            }

            await client.query('COMMIT');
            return { success: true, data: updatedOrders };
        }

        const ordersRes = await client.query(
            'SELECT * FROM orders WHERE order_number = $1 AND seller_id = $2 FOR UPDATE',
            [orderNumber, userId]
        );
        if (ordersRes.rows.length === 0) {
            throw createHttpError(404, 'No items found in this order group for your account');
        }

        const updatedOrders = [];
        for (const order of ordersRes.rows) {
            if (status === 'cancelled' && order.status !== 'cancelled') {
                await refundCancelledOrder(client, order, {
                    allowResellCommissionRefund: true,
                    allowedTransferColumns: [
                        'wallet_transfer_id',
                        'seller_commission_transfer_id',
                        'seller_discount_transfer_id',
                        'resell_commission_transfer_id',
                    ],
                    lockTransferRows: true,
                    skipResellCommissionStatuses: ['cancelled', 'completed', 'accepted', 'refunded'],
                    skipSellerCommissionStatuses: ['cancelled', 'completed', 'refunded'],
                    skipSellerDiscountStatuses: ['cancelled', 'refunded'],
                    skipWalletTransferStatuses: ['cancelled', 'completed'],
                });

                const marketItemRes = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [order.item_id]);
                if (marketItemRes.rows.length > 0) {
                    await adjustOrderItemStock(client, marketItemRes.rows[0], order, 'increase');
                }
            }

            const updated = await client.query(
                `UPDATE orders
                 SET status = $1,
                     delivered_at = CASE WHEN $1 = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [status, order.id]
            );
            updatedOrders.push(updated.rows[0]);
        }

        await client.query('COMMIT');
        return { success: true, data: updatedOrders };
    } catch (error) {
        return withRollback(client, error);
    } finally {
        client.release();
    }
};

const submitOrderReport = async ({ id, reason, customText, side, userId }) => {
    const orderRes = await orderRepository.findOrderById(id);
    if (orderRes.rows.length === 0) throw createHttpError(404, 'Order not found');

    const order = orderRes.rows[0];
    if (side === 'buyer' && order.buyer_id !== userId) throw createHttpError(403, 'Not authorized');
    if (side === 'seller' && order.seller_id !== userId) throw createHttpError(403, 'Not authorized');

    const reportColumn = side === 'buyer' ? 'buyer_report' : 'seller_report';
    if (reportColumn !== 'buyer_report' && reportColumn !== 'seller_report') {
        throw createHttpError(400, 'Invalid report side');
    }
    if (order[reportColumn]) throw createHttpError(400, 'You already submitted a report for this order.');

    const reportData = JSON.stringify({ reason, custom_text: customText, timestamp: new Date() });
    await orderRepository.submitOrderReport({
        id,
        reportBy: side,
        reportColumn,
        reportData,
    });

    return {
        success: true,
        message: 'Report submitted successfully',
    };
};

module.exports = {
    cancelOrderGroup,
    createBulkOrder,
    createOrder,
    getBuyerOrders,
    getOrderBadgeCounts,
    getSellerOrders,
    submitOrderReport,
    updateOrderGroupStatus,
    updateOrderStatus,
};
