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
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                user_type VARCHAR(20) DEFAULT 'user',
                email VARCHAR(255) UNIQUE NOT NULL,
                phone_number VARCHAR(50),
                date_of_birth DATE,
                gender VARCHAR(50),
                relationship_status VARCHAR(100),
                who_can_follow_me VARCHAR(30) DEFAULT 'everyone',
                who_can_see_activity VARCHAR(30) DEFAULT 'followers',
                password VARCHAR(255) NOT NULL,
                profile_picture TEXT DEFAULT '/assets/images/avatars/avatar-default.jpg',
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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_subscriptions (
                id SERIAL PRIMARY KEY,
                subscriber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subscribed_to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (subscriber_id, subscribed_to_id)
            );
        `);

        console.log('✅ User subscriptions table created successfully');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS profile_views (
                id SERIAL PRIMARY KEY,
                profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                viewer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                ip_address VARCHAR(255),
                last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Profile views table created successfully');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_blocks (
                id SERIAL PRIMARY KEY,
                blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (blocker_id, blocked_user_id)
            );
        `);

        console.log('✅ User blocks table created successfully');

        // Create index on user_id for faster lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_user_id ON users(user_id);
            CREATE INDEX IF NOT EXISTS idx_referral_code ON users(referral_code);
            CREATE INDEX IF NOT EXISTS idx_wallet_referrer ON wallet(referrer_id);
            CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscriber_id ON user_subscriptions(subscriber_id);
            CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscribed_to_id ON user_subscriptions(subscribed_to_id);
            CREATE INDEX IF NOT EXISTS idx_profile_views_profile_user_id ON profile_views(profile_user_id);
            CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_user_id ON profile_views(viewer_user_id);
            CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id ON user_blocks(blocker_id);
            CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_user_id ON user_blocks(blocked_user_id);
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
