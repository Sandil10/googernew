const { Pool } = require('pg');
require('dotenv').config();

const path = require('path');
const dbPath = path.resolve(__dirname, 'src/config/database.js');
const pool = require(dbPath);

const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log("Applying Migration: Referral System (Clean Slate)...");

        // 1. Drop existing wallet table if it has incorrect schema
        try {
            await client.query("DROP TABLE IF EXISTS wallet;");
            console.log("✅ Dropped old wallet table.");
        } catch (e) {
            console.error("❌ Failed to drop wallet:", e.message);
        }

        // 2. Add referral_code to users
        try {
            await client.query("ALTER TABLE users ADD COLUMN referral_code VARCHAR(50) UNIQUE;");
            console.log("✅ Added referral_code column to users.");
        } catch (e) {
            if (e.code === '42701') {
                console.log("ℹ️ referral_code column already exists.");
            } else {
                console.error("❌ Failed to add column:", e.message);
            }
        }

        // 3. Create wallet table (Fresh)
        try {
            await client.query(`
                CREATE TABLE wallet (
                    id SERIAL PRIMARY KEY,
                    referrer_id INTEGER REFERENCES users(id), -- User A (Who referred)
                    referred_user_id INTEGER REFERENCES users(id), -- User B (Who joined)
                    referred_username VARCHAR(50), 
                    referral_link_used VARCHAR(255),
                    amount DECIMAL(10, 2) DEFAULT 0.00,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log("✅ Created wallet table.");
        } catch (e) {
            console.error("❌ Failed to create wallet table:", e.message);
        }

        // 4. Index
        try {
            await client.query(`CREATE INDEX IF NOT EXISTS idx_wallet_referrer_id ON wallet(referrer_id);`);
            console.log("✅ Created index.");
        } catch (e) {
            console.error("❌ Failed to create index:", e.message);
        }

    } finally {
        client.release();
        process.exit(0);
    }
};

runMigration();
