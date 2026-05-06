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
        console.log('--- Creating product_views_log table ---');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_views_log (
                id SERIAL PRIMARY KEY,
                item_id INTEGER REFERENCES market(id) ON DELETE CASCADE,
                user_identifier TEXT NOT NULL,
                viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_product_views_log_item_user ON product_views_log(item_id, user_identifier);
            CREATE INDEX IF NOT EXISTS idx_product_views_log_viewed_at ON product_views_log(viewed_at);
        `);
        console.log('--- Migration successful ---');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
