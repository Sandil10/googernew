const pool = require('./src/config/database');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log("Starting migration...");
        
        // Add missing columns to orders table
        await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS seller_commission_transfer_id INTEGER,
            ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'wallet'
        `);
        
        console.log("Migration completed successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
