const pool = require('../backend/src/config/database');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('--- MIGRATING ORDERS TABLE FOR REPORTS ---');
        
        await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS buyer_report JSONB,
            ADD COLUMN IF NOT EXISTS seller_report JSONB,
            ADD COLUMN IF NOT EXISTS report_status TEXT,
            ADD COLUMN IF NOT EXISTS report_by TEXT;
        `);
        
        console.log('✅ Migration successful!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
