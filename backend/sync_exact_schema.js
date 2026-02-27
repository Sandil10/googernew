const pool = require('./src/config/database');

async function syncLocalSchema() {
    try {
        console.log("🚀 Syncing EXACT 20-Column Schema...");

        await pool.query(`DROP TABLE IF EXISTS market CASCADE;`);

        await pool.query(`
            CREATE TABLE market (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title CHARACTER VARYING(255) NOT NULL,
                description TEXT,
                price NUMERIC(10, 2) NOT NULL,
                currency CHARACTER VARYING(10) DEFAULT 'INR',
                category CHARACTER VARYING(50) NOT NULL,
                image_url TEXT,
                status CHARACTER VARYING(20) DEFAULT 'reviewing',
                views INTEGER DEFAULT 0,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                variants JSONB DEFAULT '[]'::jsonb,
                shipping_info JSONB DEFAULT '{}'::jsonb,
                payment_methods JSONB DEFAULT '[]'::jsonb,
                warranty_info JSONB DEFAULT '{}'::jsonb,
                return_policy JSONB DEFAULT '{}'::jsonb,
                delivery_info JSONB DEFAULT '{}'::jsonb,
                commission_info JSONB DEFAULT '{}'::jsonb,
                username VARCHAR(100)
            );
        `);

        await pool.query(`CREATE INDEX idx_market_user_id ON market(user_id);`);
        await pool.query(`CREATE INDEX idx_market_category ON market(category);`);
        await pool.query(`CREATE INDEX idx_market_status ON market(status);`);

        const res = await pool.query(`SELECT count(*) FROM information_schema.columns WHERE table_name = 'market'`);
        console.log(`✅ Table 'market' re-created with ${res.rows[0].count} columns.`);

    } catch (err) {
        console.error("❌ Sync Failed:", err.message);
    } finally {
        await pool.end();
    }
}

syncLocalSchema();
