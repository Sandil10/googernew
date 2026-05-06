const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Googer',
    password: 'Admin@1234',
    port: 5432,
});

async function migrate() {
    try {
        console.log('--- Modifying market_views table ---');
        await pool.query(`
            ALTER TABLE market_views ADD COLUMN IF NOT EXISTS ip_address TEXT;
            ALTER TABLE market_views ALTER COLUMN user_id DROP NOT NULL;
            
            -- Remove old product_views_log if it exists to clean up
            DROP TABLE IF EXISTS product_views_log;
        `);
        console.log('--- Migration successful ---');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
