const { Pool } = require('pg');
require('dotenv').config();

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

const pool = new Pool(dbConfig);

pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = pool;
