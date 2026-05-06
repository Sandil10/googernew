const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

function logDebug(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(path.join(__dirname, '../../../payment_debug.log'), logMessage);
}

const TRANSACTION_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function hashString(value) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash);
}

function encodeBase62(value) {
    if (!value) return '0';

    let current = value;
    let encoded = '';

    while (current > 0) {
        encoded = TRANSACTION_ID_ALPHABET[current % TRANSACTION_ID_ALPHABET.length] + encoded;
        current = Math.floor(current / TRANSACTION_ID_ALPHABET.length);
    }

    return encoded;
}

function formatManualPaymentDisplayTransactionId(value) {
    const normalized = String(value ?? '').replace(/\D/g, '').trim() || '0';
    const digitsOnly = `${hashString(`manual:${normalized}`)}${normalized}${hashString(`manual:receipt:${normalized}`)}`.replace(/\D/g, '');
    return digitsOnly.slice(0, 10).padEnd(10, '0');
}

function parseVariants(rawVariants) {
    if (!rawVariants) return [];
    if (Array.isArray(rawVariants)) return rawVariants;
    if (typeof rawVariants === 'string') {
        try {
            return JSON.parse(rawVariants);
        } catch {
            return [];
        }
    }
    return [];
}

async function adjustOrderItemStock(client, marketItem, orderLike, direction = 'decrease') {
    const quantity = parseInt(orderLike.quantity || 0, 10);
    if (!quantity) return;

    const delta = direction === 'decrease' ? -quantity : quantity;
    const variants = parseVariants(marketItem.variants);
    const variantIndex = orderLike.variant_index !== undefined && orderLike.variant_index !== null
        ? parseInt(orderLike.variant_index, 10)
        : null;
    const selectedSize = typeof orderLike.size === 'string' ? orderLike.size.trim() : null;
    const normalizedSelectedSize = selectedSize ? selectedSize.toLowerCase() : null;

    let stockAdjusted = false;

    if (variants.length > 0) {
        let targetVariant = null;

        if (variantIndex !== null && !Number.isNaN(variantIndex) && variants[variantIndex]) {
            targetVariant = variants[variantIndex];
        } else if (orderLike.color) {
            targetVariant = variants.find((variant) => variant.color === orderLike.color) || null;
        }

        if (targetVariant?.selections && Array.isArray(targetVariant.selections) && normalizedSelectedSize) {
            const selectionIndex = targetVariant.selections.findIndex((selection) => {
                const selectionValue = typeof selection?.value === 'string' ? selection.value.trim().toLowerCase() : '';
                return selectionValue === normalizedSelectedSize;
            });

            if (selectionIndex !== -1) {
                const currentStock = parseInt(targetVariant.selections[selectionIndex].stock || 0, 10) || 0;
                const nextStock = currentStock + delta;

                if (direction === 'decrease' && nextStock < 0) {
                    throw new Error(`Insufficient stock for ${selectedSize}`);
                }

                targetVariant.selections[selectionIndex].stock = String(Math.max(0, nextStock));
                stockAdjusted = true;
            }
        }

        if (!stockAdjusted && targetVariant) {
            const currentStock = parseInt(targetVariant.stock || targetVariant.quantity || 0, 10) || 0;
            const nextStock = currentStock + delta;

            if (direction === 'decrease' && nextStock < 0) {
                throw new Error('Insufficient stock for this variant');
            }

            targetVariant.stock = String(Math.max(0, nextStock));
            stockAdjusted = true;
        }

        if (!stockAdjusted && normalizedSelectedSize) {
            const legacyVariant = variants.find((variant) => {
                const variantSize = typeof (variant.size || variant.selection) === 'string'
                    ? (variant.size || variant.selection).trim().toLowerCase()
                    : '';
                const sameColor = orderLike.color
                    ? variant.color === orderLike.color
                    : true;

                return variantSize === normalizedSelectedSize && sameColor;
            });

            if (legacyVariant) {
                const currentStock = parseInt(legacyVariant.stock || legacyVariant.quantity || 0, 10) || 0;
                const nextStock = currentStock + delta;

                if (direction === 'decrease' && nextStock < 0) {
                    throw new Error(`Insufficient stock for ${selectedSize}`);
                }

                legacyVariant.stock = String(Math.max(0, nextStock));
                stockAdjusted = true;
            }
        }
    }

    if (variants.length > 0 && stockAdjusted) {
        const totalStock = variants.reduce((sum, variant) => {
            if (Array.isArray(variant?.selections) && variant.selections.length > 0) {
                return sum + variant.selections.reduce((selectionSum, selection) => {
                    return selectionSum + (parseInt(selection?.stock || 0, 10) || 0);
                }, 0);
            }

            return sum + (parseInt(variant?.stock || variant?.quantity || 0, 10) || 0);
        }, 0);

        await client.query(
            'UPDATE market SET variants = $1, stock = $2 WHERE id = $3',
            [JSON.stringify(variants), totalStock, marketItem.id]
        );
        return;
    }

    const currentStock = parseInt(marketItem.stock || 0, 10) || 0;
    const nextStock = currentStock + delta;

    if (direction === 'decrease' && nextStock < 0) {
        throw new Error('Insufficient overall stock');
    }

    await client.query('UPDATE market SET stock = $1 WHERE id = $2', [Math.max(0, nextStock), marketItem.id]);
}

async function createOrderRecord(client, orderData) {
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
        seller_discount_transfer_id = null
    } = orderData;

    return client.query(
        `INSERT INTO orders (
            item_id, buyer_id, seller_id, status,
            quantity, size, color, variant_index,
            total_price, shipping_address, order_number,
            wallet_transfer_id, seller_commission_transfer_id,
            payment_method, shipping_fee, seller_discount_transfer_id
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14, $15, $16
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
            seller_discount_transfer_id
        ]
    );
}

async function cancelTransferIfUnused(client, transferColumn, transferId, currentOrderId) {
    if (!transferId) {
        return;
    }

    const allowedColumns = new Set([
        'wallet_transfer_id',
        'seller_commission_transfer_id',
        'seller_discount_transfer_id'
    ]);

    if (!allowedColumns.has(transferColumn)) {
        throw new Error(`Unsupported transfer column: ${transferColumn}`);
    }

    const otherActive = await client.query(
        `SELECT 1
         FROM orders
         WHERE ${transferColumn} = $1
           AND id != $2
           AND status NOT IN ('cancelled', 'returned')
         LIMIT 1`,
        [transferId, currentOrderId]
    );

    if (otherActive.rows.length === 0) {
        await client.query("UPDATE wallet_transfers SET status = 'cancelled' WHERE id = $1", [transferId]);
    }
}

async function refundCancelledOrder(client, order) {
    if (order.wallet_transfer_id) {
        const buyerRefundAmount = parseFloat(order.total_price || 0) + parseFloat(order.shipping_fee || 0);
        await client.query(
            'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
            [buyerRefundAmount, order.buyer_id]
        );
        await cancelTransferIfUnused(client, 'wallet_transfer_id', order.wallet_transfer_id, order.id);
    }

    if (order.seller_commission_transfer_id) {
        const commRes = await client.query('SELECT amount FROM wallet_transfers WHERE id = $1', [order.seller_commission_transfer_id]);
        if (commRes.rows.length > 0) {
            const commAmount = parseFloat(commRes.rows[0].amount || 0);
            await client.query(
                'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                [commAmount, order.seller_id]
            );
            await cancelTransferIfUnused(client, 'seller_commission_transfer_id', order.seller_commission_transfer_id, order.id);
        }
    }

    if (order.seller_discount_transfer_id) {
        const discRes = await client.query('SELECT amount, status FROM wallet_transfers WHERE id = $1', [order.seller_discount_transfer_id]);
        if (discRes.rows.length > 0) {
            const discAmount = parseFloat(discRes.rows[0].amount || 0);
            const discountStatus = String(discRes.rows[0].status || '').toLowerCase();
            if (order.payment_method === 'wallet_manual') {
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [discAmount, order.seller_id]
                );
            } else if (discountStatus === 'pending') {
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [discAmount, order.seller_id]
                );
            } else if (order.payment_method !== 'wallet_manual') {
                await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [discAmount, order.seller_id]);
            }
            await cancelTransferIfUnused(client, 'seller_discount_transfer_id', order.seller_discount_transfer_id, order.id);
        }
    }
}

async function validateManualPaymentHoldTransfer(client, { buyerId, sellerId, transferId, expectedAmount }) {
    if (!transferId) {
        throw new Error('Manual payment transaction is required');
    }

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

        if (directTransferRes.rows.length > 0) {
            transfer = directTransferRes.rows[0];
        }
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

        transfer = candidateTransfersRes.rows.find((candidate) => {
            return String(candidate.id) === normalizedTransferId
                || formatManualPaymentDisplayTransactionId(candidate.id) === normalizedTransferId;
        }) || null;
    }

    if (!transfer) {
        throw new Error('Manual payment hold transaction not found');
    }

    const heldAmount = parseFloat(transfer.amount || 0);
    const requiredAmount = parseFloat(expectedAmount || 0);

    if (heldAmount.toFixed(2) !== requiredAmount.toFixed(2)) {
        throw new Error(`Manual payment hold amount mismatch. Required: R ${requiredAmount.toFixed(2)}, Found: R ${heldAmount.toFixed(2)}`);
    }

    return transfer;
}

async function stakeSellerDiscount(client, { sellerId, buyerId, itemId, quantity, notePrefix, isManualPayment }) {
    const itemRes = await client.query('SELECT price, promo_price, commission_info FROM market WHERE id = $1', [itemId]);
    if (itemRes.rows.length === 0) {
        return null;
    }

    const item = itemRes.rows[0];
    const listedPrice = parseFloat(item.promo_price || item.price || 0);

    let discountPct = 0;
    try {
        const cInfo = typeof item.commission_info === 'string' ? JSON.parse(item.commission_info) : item.commission_info;
        discountPct = parseFloat(cInfo?.discount || '0');
    } catch (error) {
        discountPct = 0;
    }

    const totalDiscountAmount = (listedPrice * discountPct / 100) * quantity;
    if (totalDiscountAmount <= 0) {
        return null;
    }

    const sellerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [sellerId]);
    const sellerBalance = parseFloat(sellerRes.rows[0]?.wallet_balance || 0);

    if (sellerBalance < totalDiscountAmount) {
        throw new Error(`Seller has insufficient balance to stake the discount for item ${itemId}.`);
    }

    if (isManualPayment) {
        await client.query(
            'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
            [totalDiscountAmount, sellerId]
        );
        const discountTx = await client.query(
            `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
             VALUES ($1, $2, $3, $4, 'discount_staking', 'completed') RETURNING id`,
            [sellerId, buyerId, totalDiscountAmount, `${notePrefix} #${itemId}`]
        );
        return discountTx.rows[0].id;
    }

    await client.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [totalDiscountAmount, sellerId]);
    const discountTx = await client.query(
        `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
         VALUES ($1, $2, $3, $4, 'discount_staking', 'completed') RETURNING id`,
        [sellerId, buyerId, totalDiscountAmount, `${notePrefix} #${itemId}`]
    );
    return discountTx.rows[0].id;
}

async function finalizeReceivedOrder(client, order) {
    if (order.wallet_transfer_id) {
        const holdTxRes = await client.query('SELECT amount FROM wallet_transfers WHERE id = $1', [order.wallet_transfer_id]);
        const totalReleased = holdTxRes.rows.length > 0
            ? parseFloat(holdTxRes.rows[0].amount || 0)
            : (parseFloat(order.total_price || 0) + parseFloat(order.shipping_fee || 0));
        await client.query('UPDATE users SET hold_balance = hold_balance - $1 WHERE id = $2', [totalReleased, order.buyer_id]);
        await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [totalReleased, order.seller_id]);
        await client.query("UPDATE wallet_transfers SET status = 'completed' WHERE id = $1", [order.wallet_transfer_id]);
    }

    if (order.seller_commission_transfer_id) {
        const commRes = await client.query('SELECT amount FROM wallet_transfers WHERE id = $1', [order.seller_commission_transfer_id]);
        if (commRes.rows.length > 0) {
            const commAmount = parseFloat(commRes.rows[0].amount || 0);
            await client.query('UPDATE users SET hold_balance = hold_balance - $1 WHERE id = $2', [commAmount, order.seller_id]);
            await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = 1', [commAmount]);
            await client.query("UPDATE wallet_transfers SET status = 'completed', receiver_id = 1 WHERE id = $1", [order.seller_commission_transfer_id]);
        }
    }

    if (order.seller_discount_transfer_id) {
        const discRes = await client.query('SELECT amount, status FROM wallet_transfers WHERE id = $1', [order.seller_discount_transfer_id]);
        if (discRes.rows.length > 0) {
            const discAmount = parseFloat(discRes.rows[0].amount || 0);
            const discountStatus = String(discRes.rows[0].status || '').toLowerCase();

            if (order.payment_method === 'wallet_manual') {
                await client.query('UPDATE users SET hold_balance = hold_balance - $1 WHERE id = $2', [discAmount, order.seller_id]);
                if (discountStatus !== 'completed') {
                    await client.query("UPDATE wallet_transfers SET status = 'completed' WHERE id = $1", [order.seller_discount_transfer_id]);
                }
            } else if (discountStatus === 'pending') {
                await client.query("UPDATE wallet_transfers SET status = 'completed' WHERE id = $1", [order.seller_discount_transfer_id]);
            }
        }
    }
}

async function autoReceiveExpiredCodOrders(client, userId) {
    const expiredOrdersRes = await client.query(
        `SELECT *
         FROM orders
         WHERE buyer_id = $1
           AND status = 'delivered'
           AND payment_method = 'cod'
           AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '7 days'
         FOR UPDATE`,
        [userId]
    );

    for (const order of expiredOrdersRes.rows) {
        await finalizeReceivedOrder(client, order);
        await client.query(
            `UPDATE orders
             SET status = 'received',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [order.id]
        );
    }
}

// Create a new order (Buying an item)
exports.createOrder = async (req, res) => {
    console.log('--- CREATE ORDER REQUEST ---');
    const client = await pool.connect();
    try {
        const { item_id, quantity, size, color, variant_index, total_price, shipping_address, wallet_transfer_id } = req.body;
        const buyer_id = req.user.id;

        await client.query('BEGIN');

        // 1. Verify item exists and check stock
        const itemResult = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [item_id]);
        if (itemResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        const item = itemResult.rows[0];
        const seller_id = item.user_id;
        const isManualWalletPayment = req.body.payment_method === 'wallet_manual';

        // 2. Stock Reduction Logic
        try {
            await adjustOrderItemStock(client, item, { quantity, size, color, variant_index }, 'decrease');
        } catch (stockError) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: stockError.message || 'Insufficient stock' });
        }

        // 3. Handle Buyer Fund Hold (ONLY for direct wallet payments)
        let wallet_transfer_id_final = wallet_transfer_id || null;
        const isWalletPayment = req.body.payment_method === 'wallet';

        if (isWalletPayment) {
            const buyerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [buyer_id]);
            const buyerBalance = parseFloat(buyerRes.rows[0].wallet_balance || 0);
            
            // Base price the buyer pays is the LISTED price (promo_price || price)
            const listedPrice = parseFloat(item.promo_price || item.price || 0);
            const shipping = parseFloat(req.body.shipping_fee || 0);
            const totalRequired = (listedPrice * quantity) + shipping;

            if (buyerBalance < totalRequired) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: `Insufficient wallet balance. Required: R ${totalRequired.toFixed(2)}, Available: R ${buyerBalance.toFixed(2)}` 
                });
            }

            // Move from Buyer balance to hold
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
                [totalRequired, buyer_id]
            );
            // Record the hold
            const buyerHoldTx = await client.query(
                `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
                 VALUES ($1, $1, $2, $3, 'order_hold', 'pending') RETURNING id`,
                [buyer_id, totalRequired, `Payment hold for Order Item #${item_id}`]
            );
            wallet_transfer_id_final = buyerHoldTx.rows[0].id;
        }

        if (isManualWalletPayment) {
            const listedPrice = parseFloat(item.promo_price || item.price || 0);
            const shipping = parseFloat(req.body.shipping_fee || 0);
            const totalRequired = (listedPrice * quantity) + shipping;
            const validatedHold = await validateManualPaymentHoldTransfer(client, {
                buyerId: buyer_id,
                sellerId: seller_id,
                transferId: wallet_transfer_id_final,
                expectedAmount: totalRequired,
            });
            wallet_transfer_id_final = validatedHold.id;
        }

        // 4. Handle Seller Commission Hold (ALWAYS)
        const commInfo = typeof item.commission_info === 'string' ? JSON.parse(item.commission_info) : item.commission_info;
        const commissionPercentage = parseFloat(commInfo?.percentage || 0);
        const commissionAmount = (parseFloat(total_price) * commissionPercentage) / 100;
        let seller_commission_transfer_id = null;

        if (commissionAmount > 0) {
            const sellerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [seller_id]);
            const sellerBalance = parseFloat(sellerRes.rows[0].wallet_balance);

            if (sellerBalance >= commissionAmount) {
                // Move from Seller balance to hold
                await client.query(
                    'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
                    [commissionAmount, seller_id]
                );
                // Record the hold
                const sellerHoldTx = await client.query(
                    `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
                     VALUES ($1, $1, $2, $3, 'commission_hold', 'pending') RETURNING id`,
                    [seller_id, seller_id, commissionAmount, `Commission deposit for Order Item #${item_id}`]
                );
                seller_commission_transfer_id = sellerHoldTx.rows[0].id;
            }
        }

        let seller_discount_transfer_id = null;
        try {
            seller_discount_transfer_id = await stakeSellerDiscount(client, {
                sellerId: seller_id,
                buyerId: buyer_id,
                itemId: item_id,
                quantity,
                notePrefix: 'Discount staking for Order Item',
                isManualPayment: isManualWalletPayment
            });
        } catch (discountError) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: discountError.message || 'Seller has insufficient balance to stake the product discount.' });
        }

        // 5. Create Randomized 8-digit Order Number
        let orderNumber;
        let isUnique = false;
        while (!isUnique) {
            orderNumber = Math.floor(10000000 + Math.random() * 90000000).toString();
            const checkRes = await client.query('SELECT 1 FROM orders WHERE order_number = $1', [orderNumber]);
            if (checkRes.rows.length === 0) isUnique = true;
        }

        const newOrder = await createOrderRecord(client, {
            item_id,
            buyer_id,
            seller_id,
            status: 'pending',
            quantity,
            size,
            color,
            variant_index,
            total_price: parseFloat(item.promo_price || item.price || 0) * quantity,
            shipping_address,
            order_number: orderNumber,
            wallet_transfer_id: wallet_transfer_id_final,
            seller_commission_transfer_id,
            payment_method: req.body.payment_method || 'wallet',
            shipping_fee: req.body.shipping_fee || 0,
            seller_discount_transfer_id
        });

        await client.query('COMMIT');
        res.status(201).json({ success: true, data: newOrder.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

// Get orders for buyer
exports.getOrderBadgeCounts = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await autoReceiveExpiredCodOrders(client, req.user.id);
        await client.query('COMMIT');

        const allStatuses = ['pending', 'processing', 'shipped', 'delivered', 'received', 'reshipped', 'cancelled', 'returned', 'rejected'];
        const badgeStatuses = {
            all: allStatuses,
            processing: ['processing'],
            shipped: ['shipped'],
        };

        const countFor = async (column, statuses) => {
            const result = await pool.query(
                `SELECT COUNT(DISTINCT COALESCE(order_number, 'order-item-' || id::text))::int AS count
                 FROM orders
                 WHERE ${column} = $1 AND status = ANY($2::text[])`,
                [req.user.id, statuses]
            );
            return Number(result.rows[0]?.count || 0);
        };

        const [
            buyerAll,
            buyerProcessing,
            buyerShipped,
            sellerAll,
            sellerProcessing,
            sellerShipped,
        ] = await Promise.all([
            countFor('buyer_id', badgeStatuses.all),
            countFor('buyer_id', badgeStatuses.processing),
            countFor('buyer_id', badgeStatuses.shipped),
            countFor('seller_id', badgeStatuses.all),
            countFor('seller_id', badgeStatuses.processing),
            countFor('seller_id', badgeStatuses.shipped),
        ]);

        res.status(200).json({
            success: true,
            data: {
                buyer: { all: buyerAll, processing: buyerProcessing, shipped: buyerShipped, total: buyerAll },
                seller: { all: sellerAll, processing: sellerProcessing, shipped: sellerShipped, total: sellerAll },
            },
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {}
        console.error('getOrderBadgeCounts Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

exports.getBuyerOrders = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await autoReceiveExpiredCodOrders(client, req.user.id);
        await client.query('COMMIT');

        const { status } = req.query;
        let query = `
            SELECT o.*, m.title, m.image_url, m.category, u.username as seller_username,
                   u.profile_picture as profile_picture
            FROM orders o
            JOIN market m ON o.item_id = m.id
            JOIN users u ON o.seller_id = u.id
            WHERE o.buyer_id = $1
        `;
        const params = [req.user.id];

        if (status) {
            const statusList = status.split(',');
            query += ` AND o.status = ANY($${params.length + 1})`;
            params.push(statusList);
        }

        query += ` ORDER BY o.created_at DESC`;

        const result = await pool.query(query, params);
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {}
        console.error('getBuyerOrders Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

// Get orders for seller
exports.getSellerOrders = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await autoReceiveExpiredCodOrders(client, req.user.id);
        await client.query('COMMIT');

        const { status } = req.query;
        let query = `
            SELECT o.*, m.title, m.image_url, m.category, bu.username as buyer_username,
                   bu.profile_picture as profile_picture
            FROM orders o
            JOIN market m ON o.item_id = m.id
            JOIN users bu ON o.buyer_id = bu.id
            WHERE o.seller_id = $1
        `;
        const params = [req.user.id];

        if (status) {
            const statusList = status.split(',');
            query += ` AND o.status = ANY($${params.length + 1})`;
            params.push(statusList);
        }

        query += ` ORDER BY o.created_at DESC`;

        const result = await pool.query(query, params);
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {}
        console.error('getSellerOrders Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

// Update order status (with Fund Release/Refund)
exports.updateOrderStatus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user_id = req.user.id;

        await client.query('BEGIN');

        const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const order = orderRes.rows[0];

        // Authorization
        const isBuyer = order.buyer_id === user_id;
        const isSeller = order.seller_id === user_id;

        if (status === 'received' && !isBuyer) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Only buyer can confirm receipt' });
        }
        if (['processing', 'shipped', 'delivered'].includes(status) && !isSeller) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Only seller can update status' });
        }
        if (status === 'accepted_report' && !isBuyer) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Only buyer can accept a seller report' });
        }
        if (status === 'rejected_report') {
            const canRejectBuyerReport = order.report_by === 'buyer' && isSeller;
            const canRejectSellerReport = order.report_by === 'seller' && isBuyer;
            if (!canRejectBuyerReport && !canRejectSellerReport) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: 'Not authorized to reject this report' });
            }
        }
        if (status === 'reshipped' && !(order.report_by === 'buyer' && isSeller)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Only seller can mark a buyer report as reshipped' });
        }

        if (status === 'cancelled') {
            // Allow Buyer to cancel only if status is pending
            if (isBuyer && order.status !== 'pending') {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Buyers can only cancel orders that are still pending.' });
            }
            // If not seller and not buyer (or buyer not pending), block
            if (!isSeller && !isBuyer) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: 'Only the buyer (if pending) or the seller can cancel this order.' });
            }
            if (['received', 'delivered', 'shipped'].includes(order.status)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Cannot cancel an order that is already shipped, delivered or received.' });
            }
        }

        // Logic for Receipt (Release Funds)
        if (status === 'received' && order.status !== 'received') {
            await finalizeReceivedOrder(client, order);
        }

        // Handle special status updates for reports
        let finalStatus = status;
        let reportStatusToSet = null;

        if (status === 'reshipped') {
            reportStatusToSet = 'reshipped';
            // Keep the order in a state where it can be handled/received
            finalStatus = 'reshipped'; 
        } else if (status === 'rejected_report') {
            reportStatusToSet = 'rejected';
            finalStatus = order.status;
        } else if (status === 'accepted_report') {
            reportStatusToSet = 'accepted';
            finalStatus = order.status;
        }

        // Logic for Cancel (Refund Funds)
        if (status === 'cancelled' && order.status !== 'cancelled') {
            await refundCancelledOrder(client, order);
            const marketItemRes = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [order.item_id]);
            if (marketItemRes.rows.length > 0) {
                await adjustOrderItemStock(client, marketItemRes.rows[0], order, 'increase');
            }
        }

        const updated = await client.query(
            `UPDATE orders 
             SET status = $1, 
                 report_status = COALESCE($2, report_status),
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = $3 
             RETURNING *`,
            [finalStatus, reportStatusToSet, id]
        );

        await client.query('COMMIT');
        res.status(200).json({ success: true, data: updated.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};
// Create multiple orders in one go (Bulk Purchase)
exports.createBulkOrder = async (req, res) => {
    const client = await pool.connect();
    try {
        const { items, shipping_address, wallet_transfer_id, payment_method } = req.body;
        const buyer_id = req.user.id;

        await client.query('BEGIN');

        // --- NEW: Atomic Wallet Deduction for direct wallet payments only ---
        if (payment_method === 'wallet') {
            // 1. Calculate the TOTAL amount that MUST be held (Original Price * Qty + Fees)
            let totalRequired = 0;
            // Pre-calculate to ensure we don't trust the front-end total_price
            for (const itemData of items) {
                const itemRes = await client.query('SELECT price, promo_price FROM market WHERE id = $1', [itemData.item_id]);
                if (itemRes.rows.length > 0) {
                    const dbListedPrice = parseFloat(itemRes.rows[0].promo_price || itemRes.rows[0].price || 0);
                    totalRequired += (dbListedPrice * (itemData.quantity || 1)) + (parseFloat(itemData.shipping_fee || 0));
                }
            }

            // 2. Lock buyer and check balance
            const buyerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [buyer_id]);
            const buyerBalance = parseFloat(buyerRes.rows[0].wallet_balance || 0);

            if (buyerBalance < totalRequired) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: `Insufficient wallet balance. Total required: R ${totalRequired.toFixed(2)}, available: R ${buyerBalance.toFixed(2)}` 
                });
            }

            // 3. Deduct from wallet and move to hold
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
                [totalRequired, buyer_id]
            );

            // 4. Create a single master hold transfer record for this group
            // We'll update the orders later to point to this or a shared ID
            const holdTx = await client.query(
                `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
                 VALUES ($1, $1, $2, $3, 'order_hold', 'pending') RETURNING id`,
                [buyer_id, totalRequired, `Consolidated payment hold for Multi-Seller Order`]
            );
            
            // Set the master transfer ID to be used by all items in this group
            req.wallet_transfer_id_master = holdTx.rows[0].id;
        }

        if (payment_method === 'wallet_manual') {
            let totalRequired = 0;
            let expectedSellerId = null;

            for (const itemData of items) {
                const itemRes = await client.query('SELECT user_id, price, promo_price FROM market WHERE id = $1', [itemData.item_id]);
                if (itemRes.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ success: false, message: `Item ${itemData.item_id} not found` });
                }

                const marketItem = itemRes.rows[0];
                const dbListedPrice = parseFloat(marketItem.promo_price || marketItem.price || 0);
                totalRequired += (dbListedPrice * (itemData.quantity || 1)) + (parseFloat(itemData.shipping_fee || 0));

                if (expectedSellerId === null) {
                    expectedSellerId = marketItem.user_id;
                } else if (expectedSellerId !== marketItem.user_id) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'Googer Manual Payment supports only one seller per order.' });
                }
            }

            let validatedHold;
            try {
                validatedHold = await validateManualPaymentHoldTransfer(client, {
                    buyerId: buyer_id,
                    sellerId: expectedSellerId,
                    transferId: wallet_transfer_id,
                    expectedAmount: totalRequired,
                });
            } catch (manualPaymentError) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: manualPaymentError.message || 'Manual payment hold transaction not found'
                });
            }

            req.wallet_transfer_id_master = validatedHold.id;
        }

        // 5. Generate a single randomized 8-digit Order Number for this entire group
        let orderNumber;
        let isUnique = false;
        while (!isUnique) {
            orderNumber = Math.floor(10000000 + Math.random() * 90000000).toString();
            const checkRes = await client.query('SELECT 1 FROM orders WHERE order_number = $1', [orderNumber]);
            if (checkRes.rows.length === 0) isUnique = true;
        }

        const createdOrders = [];

        // 6. Process each item
        for (const itemData of items) {
            const { item_id, quantity, size, color, variant_index, total_price, shipping_fee } = itemData;

            // Stock reduction logic
            const itemResult = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [item_id]);
            if (itemResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: `Item ${item_id} not found` });
            }
            const item = itemResult.rows[0];
            const seller_id = item.user_id;

            // Handle Seller Commission Hold
            const commInfo = typeof item.commission_info === 'string' ? JSON.parse(item.commission_info) : item.commission_info;
            const commissionPercentage = parseFloat(commInfo?.percentage || 0);
            const commissionAmount = (parseFloat(total_price) * commissionPercentage) / 100;
            let seller_commission_transfer_id = null;

            if (commissionAmount > 0) {
                const sellerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [seller_id]);
                const sellerBalance = parseFloat(sellerRes.rows[0].wallet_balance);

                if (sellerBalance >= commissionAmount) {
                    await client.query(
                        'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
                        [commissionAmount, seller_id]
                    );
                    const sellerHoldTx = await client.query(
                        `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
                         VALUES ($1, $1, $2, $3, 'commission_hold', 'pending') RETURNING id`,
                        [seller_id, commissionAmount, `Commission hold for Bulk Order Item #${item_id}`]
                    );
                    seller_commission_transfer_id = sellerHoldTx.rows[0].id;
                }
            }

            // 3.5 Calculate and Stake Seller Discount (NEW RULE)
            let seller_discount_transfer_id = null;
            try {
                seller_discount_transfer_id = await stakeSellerDiscount(client, {
                    sellerId: seller_id,
                    buyerId: buyer_id,
                    itemId: item_id,
                    quantity,
                    notePrefix: 'Discount staking for Bulk Order Item',
                    isManualPayment: payment_method === 'wallet_manual'
                });
            } catch (discountError) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: discountError.message || `Seller of item ${item_id} has insufficient balance to stake the discount.` });
            }

            try {
                await adjustOrderItemStock(client, item, { quantity, size, color, variant_index }, 'decrease');
            } catch (stockError) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: stockError.message || `Insufficient stock for item ${item_id}` });
            }

            const newOrder = await createOrderRecord(client, {
                item_id,
                buyer_id,
                seller_id,
                status: 'pending',
                quantity,
                size,
                color,
                variant_index,
                total_price: parseFloat(item.promo_price || item.price || 0) * quantity,
                shipping_address,
                order_number: orderNumber,
                wallet_transfer_id: req.wallet_transfer_id_master || wallet_transfer_id || null,
                seller_commission_transfer_id,
                payment_method: payment_method || 'wallet',
                shipping_fee: shipping_fee || 0,
                seller_discount_transfer_id
            });
            createdOrders.push(newOrder.rows[0]);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, data: createdOrders });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Bulk order error:', error);
        res.status(500).json({ success: false, message: 'Server error during bulk order' });
    } finally {
        client.release();
    }
};

// Cancel all items in a specific order_number (Buyer action)
exports.cancelOrderGroup = async (req, res) => {
    const client = await pool.connect();
    try {
        const { orderNumber } = req.params;
        const user_id = req.user.id;

        await client.query('BEGIN');

        // Find all items in this order
        const ordersRes = await client.query('SELECT * FROM orders WHERE order_number = $1 FOR UPDATE', [orderNumber]);
        if (ordersRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Order group not found' });
        }

        // Verify buyer
        if (ordersRes.rows[0].buyer_id !== user_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // --- NEW: Check if any item in the group is already accepted (status != pending) ---
        const nonPendingOrders = ordersRes.rows.filter(o => o.status !== 'pending' && o.status !== 'cancelled');
        if (nonPendingOrders.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot cancel the entire order group because one or more items have already been accepted or processed by the seller.' 
            });
        }

        for (const order of ordersRes.rows) {
            if (order.status === 'cancelled') continue;

            await refundCancelledOrder(client, order);
 
            // Restore stock
            const marketItemRes = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [order.item_id]);
            if (marketItemRes.rows.length > 0) {
                await adjustOrderItemStock(client, marketItemRes.rows[0], order, 'increase');
            }

            await client.query('UPDATE orders SET status = \'cancelled\', updated_at = CURRENT_TIMESTAMP WHERE id = $1', [order.id]);
        }

        await client.query('COMMIT');
        res.status(200).json({ success: true, message: 'Order group cancelled and refunded' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Cancel group error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

// Update entire order group status (Seller action)
exports.updateOrderGroupStatus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { orderNumber } = req.params;
        const { status } = req.body;
        const user_id = req.user.id;

        await client.query('BEGIN');

        // Buyer-side release for Googer Manual Payment:
        // release held funds/discount only after buyer confirms "received".
        if (status === 'received') {
            const buyerOrdersRes = await client.query(
                'SELECT * FROM orders WHERE order_number = $1 AND buyer_id = $2 FOR UPDATE',
                [orderNumber, user_id]
            );

            if (buyerOrdersRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'No items found in this order group for your account' });
            }

            const hasNonManualItems = buyerOrdersRes.rows.some(order => order.payment_method !== 'wallet_manual');
            if (hasNonManualItems) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'This group confirmation release is only available for Googer Manual Payment orders.' });
            }

            const updatedOrders = [];
            for (const order of buyerOrdersRes.rows) {
                if (order.status !== 'received') {
                    await finalizeReceivedOrder(client, order);
                }
                const updated = await client.query(
                    'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
                    ['received', order.id]
                );
                updatedOrders.push(updated.rows[0]);
            }

            await client.query('COMMIT');
            return res.status(200).json({ success: true, data: updatedOrders });
        }

        // Find all items in this order group belonging to this seller
        const ordersRes = await client.query(
            'SELECT * FROM orders WHERE order_number = $1 AND seller_id = $2 FOR UPDATE',
            [orderNumber, user_id]
        );

        if (ordersRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'No items found in this order group for your account' });
        }

        const updatedOrders = [];

        for (const order of ordersRes.rows) {
            // 1. Refund Logic if cancelled
            if (status === 'cancelled' && order.status !== 'cancelled') {
                await refundCancelledOrder(client, order);
                const marketItemRes = await client.query('SELECT * FROM market WHERE id = $1 FOR UPDATE', [order.item_id]);
                if (marketItemRes.rows.length > 0) {
                    await adjustOrderItemStock(client, marketItemRes.rows[0], order, 'increase');
                }
            }

            const updated = await client.query(
                'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
                [status, order.id]
            );
            updatedOrders.push(updated.rows[0]);
        }

        await client.query('COMMIT');
        res.status(200).json({ success: true, data: updatedOrders });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update group status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

// Submit a report for an order
exports.submitOrderReport = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, custom_text, side } = req.body; // side = 'buyer' or 'seller'
        const userId = req.user.id;

        const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (orderRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });
        const order = orderRes.rows[0];

        // Authorization
        if (side === 'buyer' && order.buyer_id !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });
        if (side === 'seller' && order.seller_id !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });

        const reportData = JSON.stringify({ reason, custom_text, timestamp: new Date() });
        const reportColumn = side === 'buyer' ? 'buyer_report' : 'seller_report';

        if (order[reportColumn]) {
            return res.status(400).json({ success: false, message: 'You already submitted a report for this order.' });
        }

        await pool.query(
            `UPDATE orders SET ${reportColumn} = $1, report_status = 'pending', report_by = $2 WHERE id = $3`,
            [reportData, side, id]
        );

        res.status(200).json({ success: true, message: 'Report submitted successfully' });
    } catch (error) {
        console.error('Submit report error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
