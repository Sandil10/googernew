async function autoReceiveExpiredCodOrders(client, options = {}) {
    const {
        userId = null,
        ageInterval = '7 days',
        finalizeReceivedOrder,
        finalizeOptions = {},
    } = options;

    if (typeof finalizeReceivedOrder !== 'function') {
        throw new Error('autoReceiveExpiredCodOrders requires finalizeReceivedOrder function.');
    }

    const hasScopedBuyer = userId !== null && userId !== undefined;
    const query = hasScopedBuyer
        ? `SELECT *
           FROM orders
           WHERE buyer_id = $1
             AND status = 'delivered'
             AND payment_method = 'cod'
             AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '${ageInterval}'
           FOR UPDATE`
        : `SELECT *
           FROM orders
           WHERE status = 'delivered'
             AND payment_method = 'cod'
             AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '${ageInterval}'
           FOR UPDATE`;

    const expiredOrdersRes = await client.query(
        query,
        hasScopedBuyer ? [userId] : []
    );

    for (const order of expiredOrdersRes.rows) {
        await finalizeReceivedOrder(client, order, finalizeOptions);
        await client.query(
            `UPDATE orders
             SET status = 'received',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [order.id]
        );
    }
}

module.exports = {
    autoReceiveExpiredCodOrders,
};
