const pool = require('./src/config/database');

async function checkInfrastructure() {
    try {
        console.log("🔍 Checking internal database infrastructure...");

        // 1. Check Tables
        const tablesRes = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        const tableNames = tablesRes.rows.map(r => r.table_name);
        console.log("📂 Existing Tables:", tableNames);

        // 2. Ensure market_likes and market_comments exist if they are part of the ecosystem
        if (!tableNames.includes('market_likes')) {
            console.log("➕ Creating missing 'market_likes' table...");
            await pool.query(`
                CREATE TABLE IF NOT EXISTS market_likes (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    market_id INTEGER NOT NULL REFERENCES market(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, market_id)
                );
            `);
        }

        if (!tableNames.includes('market_comments')) {
            console.log("➕ Creating missing 'market_comments' table...");
            await pool.query(`
                CREATE TABLE IF NOT EXISTS market_comments (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    market_id INTEGER NOT NULL REFERENCES market(id) ON DELETE CASCADE,
                    comment TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        }

        // 3. Check for users table (needed for foreign keys)
        if (!tableNames.includes('users')) {
            throw new Error("CRITICAL: 'users' table is missing. Cannot create 'market' table dependencies.");
        }

        console.log("✅ Database infrastructure is healthy.");

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

checkInfrastructure();
