const pool = require('./src/config/database');

async function migrate() {
    try {
        console.log('🚀 Starting Database Migration for User Shipping Address...');

        const queries = [
            // Add shipping_address column to users table (JSONB for flexibility)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT NULL"
        ];

        for (let query of queries) {
            try {
                await pool.query(query);
                console.log(`✅ Success: ${query.substring(0, 50)}...`);
            } catch (err) {
                console.warn(`⚠️  Skipped or Failed: ${err.message}`);
            }
        }

        console.log('✨ Address Migration Complete!');
    } catch (err) {
        console.error('❌ Migration Critical Failure:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
