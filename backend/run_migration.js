const pool = require('./src/config/database');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🚀 Starting Wallet & Coins Management Migration...');

        await client.query('BEGIN');

        // 1. Add wallet_balance to users table if not exists with default 1000.00
        // NOTE: We use 1000.00 as default for NEW users, but for existing users they might have 0 or 1000.
        // The user specifically asked: "every time 1000 Ruppier need to show on wallet" for new accounts.
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'wallet_balance') THEN
                    ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(15, 2) DEFAULT 1000.00;
                END IF;
            END $$;
        `);

        // 2. Fix wallet table typos and add necessary columns if needed
        // The user mentioned id, referrer_id, referred_user_id, referred_usernmae ,referreal_link_used , amount , created_at
        // Our current table has: id, referrer_id, referred_user_id, referred_username, referral_link_used, amount, created_at
        // Let's ensure 'referred_username' is correct and add 'referral_link_used' if missing.
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'wallet' AND COLUMN_NAME = 'referred_username') THEN
                    ALTER TABLE wallet ADD COLUMN referred_username VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'wallet' AND COLUMN_NAME = 'referral_link_used') THEN
                    ALTER TABLE wallet ADD COLUMN referral_link_used VARCHAR(100);
                END IF;
            END $$;
        `);

        // 3. Create wallet_transfers table for User-to-User transfers and requests
        await client.query(`
            CREATE TABLE IF NOT EXISTS wallet_transfers (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount DECIMAL(15, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected, cancelled
                type VARCHAR(20) DEFAULT 'transfer', -- transfer (direct), request (needs acceptance)
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
