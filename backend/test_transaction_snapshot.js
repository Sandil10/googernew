#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

try {
    require('dotenv').config({ path: path.resolve(__dirname, '.env') });
    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
    // dotenv is optional for environments that already provide DB env vars.
}

const args = process.argv.slice(2);
const labelIndex = args.indexOf('--label');
const label = labelIndex >= 0 && args[labelIndex + 1] ? args[labelIndex + 1] : 'snapshot';

const AUDIT_DIR = path.resolve(__dirname, 'transaction-audits');

const criticalTables = [
    'users',
    'wallet_transfers',
    'orders',
    'cart_items',
    'market',
    'commission_settings',
    'referral_relationships',
    'referral_levels',
    'referral_level_settings',
    'referral_commission_settings',
    'referral_commission_payouts',
    'ad_coin_collections',
    'ad_coin_reward_settings',
    'ads',
    'p2p_transactions',
    'p2p_sell_transactions',
    'withdrawal_requests',
    'coin_requests',
];

function buildPoolConfig() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (connectionString) {
        const config = { connectionString };
        const sslMode = String(process.env.DB_SSL || '').toLowerCase();
        if (sslMode && sslMode !== 'false' && sslMode !== '0' && sslMode !== 'disable') {
            config.ssl = {
                rejectUnauthorized: !['false', '0', 'no'].includes(String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase()),
            };
        }
        return config;
    }

    return {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: ['true', '1', 'require', 'required', 'yes'].includes(String(process.env.DB_SSL || '').toLowerCase())
            ? { rejectUnauthorized: !['false', '0', 'no'].includes(String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase()) }
            : undefined,
    };
}

async function tableExists(client, tableName) {
    const result = await client.query('SELECT to_regclass($1) AS name', [`public.${tableName}`]);
    return Boolean(result.rows[0]?.name);
}

async function getColumns(client, tableName) {
    const result = await client.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
    );
    return result.rows;
}

function hasColumn(columns, name) {
    return columns.some((column) => column.column_name === name);
}

function isNumericColumn(columns, name) {
    const column = columns.find((item) => item.column_name === name);
    return Boolean(column && /integer|numeric|double|real|bigint|smallint|decimal/.test(column.data_type));
}

async function scalar(client, query, params = []) {
    const result = await client.query(query, params);
    return result.rows[0] || {};
}

function fingerprintRows(rows) {
    return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function tableSnapshot(client, tableName) {
    if (!(await tableExists(client, tableName))) {
        return { exists: false };
    }

    const columns = await getColumns(client, tableName);
    const snapshot = {
        exists: true,
        columns: columns.map((column) => column.column_name),
    };

    Object.assign(snapshot, await scalar(client, `SELECT COUNT(*)::int AS row_count FROM public.${tableName}`));

    if (hasColumn(columns, 'id')) {
        Object.assign(snapshot, await scalar(client, `SELECT MIN(id)::text AS min_id, MAX(id)::text AS max_id FROM public.${tableName}`));
    }

    const numericColumns = [
        'wallet_balance',
        'hold_balance',
        'amount',
        'commission',
        'commission_percentage',
        'total_price',
        'shipping_fee',
        'resell_commission_amount',
        'resell_commission_percentage',
        'resell_googer_commission_percentage',
        'reward_amount',
        'advertiser_charge',
    ].filter((name) => hasColumn(columns, name) && isNumericColumn(columns, name));

    snapshot.numeric_totals = {};
    for (const column of numericColumns) {
        const row = await scalar(
            client,
            `SELECT COALESCE(SUM(${column}), 0)::text AS total FROM public.${tableName}`
        );
        snapshot.numeric_totals[column] = row.total;
    }

    if (hasColumn(columns, 'status')) {
        const result = await client.query(
            `SELECT COALESCE(status::text, '__null__') AS status, COUNT(*)::int AS count
             FROM public.${tableName}
             GROUP BY COALESCE(status::text, '__null__')
             ORDER BY status`
        );
        snapshot.by_status = result.rows;
    }

    if (hasColumn(columns, 'type')) {
        const result = await client.query(
            `SELECT COALESCE(type::text, '__null__') AS type, COUNT(*)::int AS count
             FROM public.${tableName}
             GROUP BY COALESCE(type::text, '__null__')
             ORDER BY type`
        );
        snapshot.by_type = result.rows;
    }

    if (hasColumn(columns, 'payment_method')) {
        const result = await client.query(
            `SELECT COALESCE(payment_method::text, '__null__') AS payment_method, COUNT(*)::int AS count
             FROM public.${tableName}
             GROUP BY COALESCE(payment_method::text, '__null__')
             ORDER BY payment_method`
        );
        snapshot.by_payment_method = result.rows;
    }

    const fingerprintColumns = columns
        .map((column) => column.column_name)
        .filter((name) => ['id', 'sender_id', 'receiver_id', 'buyer_id', 'seller_id', 'user_id', 'status', 'type', 'amount', 'commission', 'total_price', 'payment_method', 'reseller_user_id'].includes(name));

    if (hasColumn(columns, 'id') && fingerprintColumns.length > 0) {
        const result = await client.query(
            `SELECT ${fingerprintColumns.join(', ')}
             FROM public.${tableName}
             ORDER BY id DESC
             LIMIT 5000`
        );
        snapshot.latest_5000_fingerprint = fingerprintRows(result.rows);
    }

    return snapshot;
}

async function adminAccountSnapshot(client) {
    if (!(await tableExists(client, 'users'))) return null;

    const result = await client.query(
        `SELECT
             COUNT(*)::int AS admin_count,
             COALESCE(SUM(wallet_balance), 0)::text AS admin_wallet_balance_total,
             COALESCE(SUM(hold_balance), 0)::text AS admin_hold_balance_total,
             MIN(id)::text AS min_admin_id,
             MAX(id)::text AS max_admin_id
         FROM users
         WHERE LOWER(REPLACE(REPLACE(TRIM(COALESCE(user_type, '')), ' ', '_'), '-', '_'))
               IN ('admin', 'super_admin', 'superadmin', 'administrator')`
    );

    return result.rows[0];
}

async function mainGoogerBalanceSnapshot(client) {
    if (!(await tableExists(client, 'wallet_transfers'))) return null;

    const result = await client.query(
        `SELECT
             COALESCE(SUM(commission), 0)::text AS accepted_commission_total,
             COUNT(*)::int AS accepted_commission_rows
         FROM wallet_transfers
         WHERE status = 'accepted'`
    );

    return result.rows[0];
}

async function run() {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });

    const pool = new Pool(buildPoolConfig());
    const client = await pool.connect();

    const snapshot = {
        label,
        generated_at: new Date().toISOString(),
        mode: 'read-only repeatable-read transaction',
        tables: {},
    };

    try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

        snapshot.admin_accounts = await adminAccountSnapshot(client);
        snapshot.main_googer_balance = await mainGoogerBalanceSnapshot(client);

        for (const tableName of criticalTables) {
            snapshot.tables[tableName] = await tableSnapshot(client, tableName);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
        await pool.end();
    }

    const safeLabel = label.replace(/[^a-z0-9_-]/gi, '_');
    const filePath = path.join(AUDIT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}_${safeLabel}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));

    console.log(`Transaction snapshot written: ${filePath}`);
    console.log('This script is read-only. Use before/after snapshots to verify money-flow refactors.');
}

run().catch((error) => {
    console.error('Transaction snapshot failed:', error.message);
    process.exitCode = 1;
});
