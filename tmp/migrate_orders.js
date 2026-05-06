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
        console.log('--- Adding order_number to orders table ---');
        await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20)');
        console.log('--- Successfully added order_number ---');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
