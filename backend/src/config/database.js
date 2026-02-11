const { Pool } = require('pg');
require('dotenv').config();

// Workaround for "self-signed certificate" issues with Vercel/Supabase
if (process.env.NODE_ENV === 'production' && !process.env.DB_HOST) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const dbConfig = {};

// LOGIC: Priority is given to EXPLICIT LOCAL CONFIG (DB_HOST) if present.
// This allows developers to use a local DB by setting DB_HOST in .env,
// while Vercel automatically uses DATABASE_URL/POSTGRES_URL for Supabase.

if (process.env.DB_HOST) {
    console.log(`🔌 Using Local Database Config: ${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`);
    dbConfig.host = process.env.DB_HOST;
    dbConfig.port = process.env.DB_PORT || 5432;
    dbConfig.database = process.env.DB_NAME;
    dbConfig.user = process.env.DB_USER;
    dbConfig.password = process.env.DB_PASSWORD;
    // Local DB usually doesn't need SSL unless configured
} else {
    // Fallback to Connection String (Supabase / Vercel)
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (connectionString) {
        console.log("🔌 Using Cloud Database Connection URL");
        dbConfig.connectionString = connectionString;
        // Enforce SSL for Cloud connections
        dbConfig.ssl = { rejectUnauthorized: false };
    } else {
        if (process.env.NODE_ENV === 'production') {
            console.error("❌ CRITICAL: No Database Connection Configuration Found!");
        } else {
            console.warn("⚠️ Warning: No Database Configuration Found in .env (DB_HOST or DATABASE_URL missing)");
        }
    }
}

const pool = new Pool(dbConfig);

// Test database connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = pool;
