let financeSchemaValidated = false;

const REQUIRED_SCHEMA = {
    users: ['hold_balance'],
    withdrawal_settings: ['min_amount', 'max_amount', 'coin_rate'],
    withdrawal_payment_methods: ['name', 'icon', 'fields', 'is_active'],
    withdrawal_requests: ['user_id', 'payment_method_id', 'payment_method_name', 'amount', 'payment_details', 'status', 'wallet_transfer_id'],
    topup_payment_methods: ['name', 'icon', 'fields', 'is_active', 'category'],
    coin_requests: ['user_id', 'payment_method_id', 'payment_method_name', 'method_category', 'method_name', 'bank_name', 'amount', 'payment_details', 'notes', 'status'],
    finance_idempotency_keys: ['scope', 'idempotency_key', 'request_hash', 'status', 'response_body'],
};

async function queryColumns(client, tableName) {
    const result = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
    );
    return new Set(result.rows.map((row) => row.column_name));
}

async function assertFinanceSchemaReady(poolOrClient) {
    if (financeSchemaValidated) return;

    const client = typeof poolOrClient.connect === 'function'
        ? await poolOrClient.connect()
        : poolOrClient;
    const shouldRelease = typeof poolOrClient.connect === 'function';

    try {
        const missing = [];
        for (const [tableName, columns] of Object.entries(REQUIRED_SCHEMA)) {
            const existingColumns = await queryColumns(client, tableName);
            if (existingColumns.size === 0) {
                missing.push(`${tableName} (table missing)`);
                continue;
            }

            const missingColumns = columns.filter((column) => !existingColumns.has(column));
            if (missingColumns.length > 0) {
                missing.push(`${tableName}.${missingColumns.join(', ')}`);
            }
        }

        if (missing.length > 0) {
            throw new Error(
                `Finance schema is missing required objects: ${missing.join(' | ')}. Run the migration command before starting the service.`
            );
        }

        financeSchemaValidated = true;
    } finally {
        if (shouldRelease) {
            client.release();
        }
    }
}

module.exports = {
    assertFinanceSchemaReady,
};
