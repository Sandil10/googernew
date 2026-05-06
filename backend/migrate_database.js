const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'Googer',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

async function migrateDatabase() {
    const client = await pool.connect();

    try {
        console.log('🔄 Starting database migration...');

        // Drop existing tables to recreate with new schema
        console.log('📋 Dropping old tables...');
        await client.query('DROP TABLE IF EXISTS wallet CASCADE;');
        await client.query('DROP TABLE IF EXISTS users CASCADE;');

        console.log('✨ Creating users table with 6-digit user_id...');
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(6) UNIQUE NOT NULL,
                username VARCHAR(50) UNIQUE NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                user_type VARCHAR(20) DEFAULT 'user',
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                profile_picture VARCHAR(255) DEFAULT NULL,
                bio TEXT,
                referral_code VARCHAR(50) UNIQUE,
                wallet_balance DECIMAL(15, 2) DEFAULT 1000.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('📊 Creating indexes on users table...');
        await client.query('CREATE INDEX idx_user_id ON users(user_id);');
        await client.query('CREATE INDEX idx_email ON users(email);');
        await client.query('CREATE INDEX idx_username ON users(username);');

        console.log('💰 Creating wallet table...');
        await client.query(`
            CREATE TABLE wallet (
                id SERIAL PRIMARY KEY,
                referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                referred_username VARCHAR(50) NOT NULL,
                referral_link_used VARCHAR(100),
                amount DECIMAL(10, 2) DEFAULT 10.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(referrer_id, referred_user_id)
            );
        `);

        console.log('📊 Creating indexes on wallet table...');
        await client.query('CREATE INDEX idx_wallet_referrer ON wallet(referrer_id);');
        await client.query('CREATE INDEX idx_wallet_referred ON wallet(referred_user_id);');

        console.log('✅ Database migration completed successfully!');
        console.log('');
        console.log('📋 Summary:');
        console.log('  ✓ Users table: VARCHAR(6) for user_id (supports 6-digit IDs)');
        console.log('  ✓ Profile pictures: NULL by default');
        console.log('  ✓ Referral codes: Added');
        console.log('  ✓ Wallet table: Created with foreign keys');
        console.log('  ✓ All indexes: Created');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run migration
migrateDatabase()
    .then(() => {
        console.log('');
        console.log('🎉 Migration complete! You can now register users with 6-digit IDs.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration error:', error);
        process.exit(1);
    });
