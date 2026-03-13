const pool = require('./src/config/database');

async function fixSchema() {
    try {
        console.log('🚀 Fixing Market Table Schema...');

        const queries = [
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS promo_price DECIMAL(12,2)",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100)",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS level3_category VARCHAR(100)",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS manual_category VARCHAR(100)",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0"
        ];

        for (let query of queries) {
            try {
                await pool.query(query);
                console.log(`✅ Success: ${query}`);
            } catch (err) {
                console.warn(`⚠️  Failed: ${query} - ${err.message}`);
            }
        }

        console.log('✨ Schema Fix Complete!');
    } catch (err) {
        console.error('❌ Critical Failure:', err.message);
    } finally {
        await pool.end();
    }
}

fixSchema();
