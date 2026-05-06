const pool = require('./src/config/database');

async function migrate() {
    try {
        console.log('🚀 Starting Database Migration for Market Engagement Features...');

        const queries = [
            // Add count columns to market table
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS views_count INT DEFAULT 0",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS shares_count INT DEFAULT 0",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0",
            
            // Create table for tracking views (for 24h limit)
            `CREATE TABLE IF NOT EXISTS market_views (
                id SERIAL PRIMARY KEY,
                market_id INT REFERENCES market(id) ON DELETE CASCADE,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(market_id, user_id)
            )`,

            // Create table for tracking shares (if needed for per-user tracking, though count is enough)
            `CREATE TABLE IF NOT EXISTS market_shares (
                id SERIAL PRIMARY KEY,
                market_id INT REFERENCES market(id) ON DELETE CASCADE,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Ensure current counts match actual totals if possible (for likes)
            "UPDATE market m SET likes_count = (SELECT COUNT(*) FROM market_likes ml WHERE ml.market_id = m.id)",
            "UPDATE market m SET comments_count = (SELECT COUNT(*) FROM market_comments mc WHERE mc.market_id = m.id)"
        ];

        for (let query of queries) {
            try {
                await pool.query(query);
                console.log(`✅ Success: ${query.substring(0, 50)}...`);
            } catch (err) {
                console.warn(`⚠️  Skipped or Failed: ${err.message}`);
            }
        }

        console.log('✨ Engagement Migration Complete!');
    } catch (err) {
        console.error('❌ Migration Critical Failure:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
