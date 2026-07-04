const { Pool, types } = require('pg');
const { loadEnv } = require('./loadEnv');

let timestampParserConfigured = false;

const configureTimestampParser = () => {
    if (timestampParserConfigured) return;
    // Match main-backend timestamp handling so extracted services preserve behavior.
    types.setTypeParser(1114, (value) => {
        if (!value) return null;
        return new Date(value.replace(' ', 'T') + 'Z').toISOString();
    });
    timestampParserConfigured = true;
};

const createPgPool = () => {
    loadEnv();
    configureTimestampParser();

    const dbConfig = {};
    const localSslEnabled = ['true', '1', 'require', 'enabled'].includes(String(process.env.DB_SSL || '').toLowerCase());
    const localSslRejectUnauthorized = ['true', '1'].includes(String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase());
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const forceLocalDb = ['true', '1', 'yes'].includes(String(process.env.FORCE_LOCAL_DB || '').toLowerCase());

    if (connectionString || (localSslEnabled && !localSslRejectUnauthorized)) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    if (connectionString && !forceLocalDb) {
        dbConfig.connectionString = connectionString;
        dbConfig.ssl = { rejectUnauthorized: false };
    } else if (process.env.DB_HOST) {
        dbConfig.host = process.env.DB_HOST;
        dbConfig.port = process.env.DB_PORT || 5432;
        dbConfig.database = process.env.DB_NAME;
        dbConfig.user = process.env.DB_USER;
        dbConfig.password = process.env.DB_PASSWORD;
        if (localSslEnabled) {
            dbConfig.ssl = { rejectUnauthorized: localSslRejectUnauthorized };
        }
    } else if (process.env.NODE_ENV === 'production') {
        throw new Error('CRITICAL: No Database Connection Configuration Found (POSTGRES_URL/DATABASE_URL missing)');
    }

    const poolMax = Number.parseInt(String(process.env.DB_POOL_MAX || process.env.PGPOOL_MAX || '25'), 10);
    const poolIdleTimeoutMs = Number.parseInt(String(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000'), 10);
    const poolConnectionTimeoutMs = Number.parseInt(String(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || '10000'), 10);
    const poolMaxUses = Number.parseInt(String(process.env.DB_POOL_MAX_USES || '7500'), 10);

    dbConfig.max = Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 25;
    dbConfig.idleTimeoutMillis = Number.isFinite(poolIdleTimeoutMs) && poolIdleTimeoutMs > 0 ? poolIdleTimeoutMs : 30000;
    dbConfig.connectionTimeoutMillis = Number.isFinite(poolConnectionTimeoutMs) && poolConnectionTimeoutMs > 0 ? poolConnectionTimeoutMs : 10000;
    dbConfig.maxUses = Number.isFinite(poolMaxUses) && poolMaxUses > 0 ? poolMaxUses : 7500;

    const pool = new Pool(dbConfig);

    pool.on('connect', (client) => {
        client.query("SET timezone = 'UTC'").catch((err) => console.error('Failed to set timezone:', err));
    });

    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
    });

    return pool;
};

module.exports = {
    createPgPool,
};
