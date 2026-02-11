const pool = require('./database');

const createTables = async () => {
    try {
        console.log('🔄 Creating database tables...');

        // Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(4) UNIQUE NOT NULL,
                username VARCHAR(50) UNIQUE NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                user_type VARCHAR(20) DEFAULT 'user',
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                profile_picture VARCHAR(255) DEFAULT '/assets/images/avatars/avatar-default.jpg',
                bio TEXT,
                referral_code VARCHAR(20) UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Users table created/verified successfully');

        // Create wallet table (for referrals)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS wallet (
                id SERIAL PRIMARY KEY,
                referrer_id INTEGER REFERENCES users(id),
                referred_user_id INTEGER REFERENCES users(id),
                referred_username VARCHAR(50),
                referral_link_used VARCHAR(50),
                amount DECIMAL(10, 2) DEFAULT 0.00,
                status VARCHAR(20) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Wallet table created successfully');

        // Create index on user_id for faster lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_user_id ON users(user_id);
            CREATE INDEX IF NOT EXISTS idx_referral_code ON users(referral_code);
            CREATE INDEX IF NOT EXISTS idx_wallet_referrer ON wallet(referrer_id);
        `);

        // Create index on email for faster lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_email ON users(email);
        `);

        console.log('✅ Indexes created successfully');
        console.log('🎉 Database initialization completed!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating tables:', error);
        process.exit(1);
    }
};

createTables();
