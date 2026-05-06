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
        console.log('--- Adding product_code to market table ---');
        await pool.query('ALTER TABLE market ADD COLUMN IF NOT EXISTS product_code VARCHAR(12) UNIQUE');
        
        // Populate existing products with random codes
        const items = await pool.query('SELECT id FROM market WHERE product_code IS NULL');
        for (const item of items.rows) {
            const code = Math.random().toString(36).substring(2, 12).toUpperCase();
            await pool.query('UPDATE market SET product_code = $1 WHERE id = $2', [code, item.id]);
        }
        console.log(`--- Updated ${items.rows.length} existing products ---`);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
