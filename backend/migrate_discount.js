const pool = require('./src/config/database');

async function migrate() {
    try {
        console.log('Adding seller_discount_transfer_id to orders table...');
        await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_discount_transfer_id INTEGER');
        console.log('Migration successful!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
