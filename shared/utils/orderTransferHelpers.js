async function cancelTransferIfUnused(
    client,
    transferColumn,
    transferId,
    currentOrderId,
    options = {}
) {
    if (!transferId) {
        return;
    }

    const allowedColumns = new Set(
        Array.isArray(options.allowedColumns) && options.allowedColumns.length > 0
            ? options.allowedColumns
            : [
                'wallet_transfer_id',
                'seller_commission_transfer_id',
                'seller_discount_transfer_id',
            ]
    );

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

module.exports = {
    cancelTransferIfUnused,
};
