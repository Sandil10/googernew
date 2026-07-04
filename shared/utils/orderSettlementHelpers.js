async function finalizeReceivedOrder(client, order, options = {}) {
    const {
        adminGoogerUserId = 1,
        allowAdvancedSettlement = false,
        ensureOrderResellCommissionColumns = null,
        resolveGoogerMainWalletUserId = null,
        getOrderGoogerCommission = null,
        getOrderProductDiscount = null,
        completeWalletTransferIfGroupSettled = null,
        distributeProductDiscountCommission = null,
        normalizeMoney = null,
    } = options;

    if (!allowAdvancedSettlement) {
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
                await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [commAmount, adminGoogerUserId]);
                await client.query("UPDATE wallet_transfers SET status = 'completed', receiver_id = $2 WHERE id = $1", [order.seller_commission_transfer_id, adminGoogerUserId]);
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

        return;
    }

    if (
        typeof ensureOrderResellCommissionColumns !== 'function' ||
        typeof resolveGoogerMainWalletUserId !== 'function' ||
        typeof getOrderGoogerCommission !== 'function' ||
        typeof getOrderProductDiscount !== 'function' ||
        typeof completeWalletTransferIfGroupSettled !== 'function' ||
        typeof distributeProductDiscountCommission !== 'function' ||
        typeof normalizeMoney !== 'function'
    ) {
        throw new Error('Advanced settlement requires all settlement dependency functions.');
    }

    await ensureOrderResellCommissionColumns(client);
    let orderAlreadyFinalized = false;
    const googerUserId = await resolveGoogerMainWalletUserId(client);
    const orderGrossAmount = Number((
        parseFloat(order.total_price || 0) + parseFloat(order.shipping_fee || 0)
    ).toFixed(2));
    const productCommission = await getOrderGoogerCommission(client, order);
    const productDiscount = await getOrderProductDiscount(client, order);
    let discountAlreadyTakenFromSeller = false;
    let discountAmountForBuyer = productDiscount.amount;
    let commissionSettledFromSellerHold = false;

    if (order.wallet_transfer_id) {
        const holdTxRes = await client.query('SELECT amount, status FROM wallet_transfers WHERE id = $1 FOR UPDATE', [order.wallet_transfer_id]);
        const holdStatus = String(holdTxRes.rows[0]?.status || '').toLowerCase();
        if (holdStatus === 'completed' || holdStatus === 'cancelled') {
            orderAlreadyFinalized = true;
        }
    }

    if (order.seller_commission_transfer_id) {
        const commRes = await client.query('SELECT amount, status FROM wallet_transfers WHERE id = $1 FOR UPDATE', [order.seller_commission_transfer_id]);
        if (commRes.rows.length > 0) {
            const commAmount = parseFloat(commRes.rows[0].amount || 0);
            const commStatus = String(commRes.rows[0].status || '').toLowerCase();
            if (!['accepted', 'completed', 'cancelled', 'refunded'].includes(commStatus)) {
                if (order.payment_method === 'cod') {
                    await client.query(
                        'UPDATE users SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1) WHERE id = $2',
                        [commAmount, order.seller_id]
                    );
                    await client.query(
                        `UPDATE wallet_transfers
                         SET status = 'accepted',
                             receiver_id = $2,
                             commission = $3,
                             commission_percentage = $4,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1`,
                        [order.seller_commission_transfer_id, googerUserId, commAmount, productCommission.percentage]
                    );
                    commissionSettledFromSellerHold = true;
                } else {
                    await client.query(
                        'UPDATE users SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1), wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
                        [commAmount, order.seller_id]
                    );
                    await client.query("UPDATE wallet_transfers SET status = 'refunded', receiver_id = sender_id WHERE id = $1", [order.seller_commission_transfer_id]);
                }
            }
        }
    }

    if (!orderAlreadyFinalized) {
        if (order.seller_discount_transfer_id) {
            const discRes = await client.query('SELECT amount, status FROM wallet_transfers WHERE id = $1 FOR UPDATE', [order.seller_discount_transfer_id]);
            if (discRes.rows.length > 0) {
                const discAmount = parseFloat(discRes.rows[0].amount || 0);
                const discountStatus = String(discRes.rows[0].status || '').toLowerCase();
                if (!['cancelled', 'refunded'].includes(discountStatus) && discAmount > 0) {
                    discountAlreadyTakenFromSeller = true;
                    discountAmountForBuyer = discAmount;
                    if (order.payment_method === 'wallet_manual' || discountStatus === 'pending') {
                        await client.query(
                            'UPDATE users SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1) WHERE id = $2',
                            [discAmount, order.seller_id]
                        );
                    }
                    await client.query("UPDATE wallet_transfers SET status = 'completed', receiver_id = $2 WHERE id = $1", [order.seller_discount_transfer_id, order.buyer_id]);
                }
            }
        }
    }

    if (!orderAlreadyFinalized && order.wallet_transfer_id) {
        const sellerDiscountCharge = discountAlreadyTakenFromSeller ? 0 : discountAmountForBuyer;
        const sellerNetAmount = Math.max(0, orderGrossAmount - productCommission.amount - sellerDiscountCharge);

        await client.query('UPDATE users SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1) WHERE id = $2', [orderGrossAmount, order.buyer_id]);

        if (sellerNetAmount > 0) {
            await client.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2', [sellerNetAmount, order.seller_id]);
        }

        if (productCommission.amount > 0 && !commissionSettledFromSellerHold) {
            await client.query(
                `INSERT INTO wallet_transfers
                    (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'commission_hold', 'accepted', $3, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [
                    order.seller_id,
                    googerUserId,
                    productCommission.amount,
                    `Googer commission for Order Item #${order.item_id}`,
                    productCommission.percentage,
                ]
            );
        }
        await completeWalletTransferIfGroupSettled(client, order.wallet_transfer_id, order.id);
    }

    if (!orderAlreadyFinalized && discountAmountForBuyer > 0 && (discountAlreadyTakenFromSeller || order.wallet_transfer_id)) {
        await distributeProductDiscountCommission(client, {
            buyerId: order.buyer_id,
            payerId: order.seller_id,
            discountAmount: discountAmountForBuyer,
            sourceId: order.id,
            description: `Order Item #${order.item_id} (${order.order_number || order.id})`,
        });
    }

    const resellCommissionAmount = normalizeMoney(parseFloat(order.resell_commission_amount || 0));
    const resellerUserId = Number(order.reseller_user_id || 0);
    if (!orderAlreadyFinalized && resellCommissionAmount > 0 && resellerUserId > 0 && order.resell_commission_transfer_id) {
        const resellTxRes = await client.query('SELECT amount, status FROM wallet_transfers WHERE id = $1 FOR UPDATE', [order.resell_commission_transfer_id]);
        const resellStatus = String(resellTxRes.rows[0]?.status || '').toLowerCase();

        if (!['completed', 'accepted', 'cancelled', 'refunded'].includes(resellStatus)) {
            const googerPct = parseFloat(order.resell_googer_commission_percentage ?? 10);
            const googerShare = normalizeMoney((resellCommissionAmount * (Number.isFinite(googerPct) ? googerPct : 10)) / 100);
            const resellerShare = normalizeMoney(Math.max(0, resellCommissionAmount - googerShare));

            await client.query(
                'UPDATE users SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1) WHERE id = $2',
                [resellCommissionAmount, order.seller_id]
            );

            if (resellerShare > 0) {
                await client.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2', [resellerShare, resellerUserId]);
            }

            await client.query(
                `UPDATE wallet_transfers
                 SET amount = $2,
                     receiver_id = $3,
                     status = 'completed',
                     commission = $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [order.resell_commission_transfer_id, resellerShare, resellerUserId]
            );

            if (googerShare > 0) {
                await client.query(
                    `INSERT INTO wallet_transfers
                        (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, 'resell_googer_fee', 'accepted', $3, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [
                        order.seller_id,
                        googerUserId,
                        googerShare,
                        `Resell Googer commission for Order Item #${order.item_id}`,
                        Number.isFinite(googerPct) ? googerPct : 10,
                    ]
                );
            }
        }
    }
}

module.exports = {
    finalizeReceivedOrder,
};
