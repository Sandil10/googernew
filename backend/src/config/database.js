const { Pool, types } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

// IMPORTANT:
// Postgres TIMESTAMP WITHOUT TIME ZONE (OID 1114) arrives as a bare string like
// "2024-01-15 12:31:00" with no timezone info. JS's Date constructor treats a
// string without a timezone as *local time*, causing time shifts on any server
// not in UTC. We fix this by appending 'Z' before parsing so it is always read
// as UTC — which matches the "SET timezone = 'UTC'" we apply on every connection.
types.setTypeParser(1114, (value) => {
    if (!value) return null;
    // Replace the space separator with 'T' and add 'Z' so Date() treats it as UTC.
    return new Date(value.replace(' ', 'T') + 'Z').toISOString();
});

const dbConfig = {};
const localSslEnabled = ['true', '1', 'require', 'enabled'].includes(String(process.env.DB_SSL || '').toLowerCase());
const localSslRejectUnauthorized = ['true', '1'].includes(String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase());

// Prefer a cloud connection string whenever one is configured.
// Local DB_HOST values are only honored when FORCE_LOCAL_DB is explicitly enabled.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const forceLocalDb = ['true', '1', 'yes'].includes(String(process.env.FORCE_LOCAL_DB || '').toLowerCase());

// Hosted Postgres on EC2/RDS often needs relaxed certificate validation in app code.
if (connectionString || (localSslEnabled && !localSslRejectUnauthorized)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

if (connectionString && !forceLocalDb) {
    console.log('Using Cloud Database Connection URL');
    dbConfig.connectionString = connectionString;
    dbConfig.ssl = { rejectUnauthorized: false };
} else if (process.env.DB_HOST) {
    console.log(`Using Database Host Config: ${process.env.DB_HOST}`);
    dbConfig.host = process.env.DB_HOST;
    dbConfig.port = process.env.DB_PORT || 5432;
    dbConfig.database = process.env.DB_NAME;
    dbConfig.user = process.env.DB_USER;
    dbConfig.password = process.env.DB_PASSWORD;
    if (localSslEnabled) {
        dbConfig.ssl = { rejectUnauthorized: localSslRejectUnauthorized };
        console.log(`Local DB SSL: enabled (rejectUnauthorized=${localSslRejectUnauthorized})`);
    }
} else {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('CRITICAL: No Database Connection Configuration Found (POSTGRES_URL/DATABASE_URL missing)');
    }
    console.warn('Warning: No Database Configuration Found. Defaulting to local pg defaults.');
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
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = pool;
