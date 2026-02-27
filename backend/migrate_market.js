const pool = require('./src/config/database');

async function migrate() {
    try {
        console.log('🚀 Starting Database Migration for Market Table...');

        const queries = [
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS payment_data JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS shipping_data JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS commission_data JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS delivery_data JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS return_data JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS variants_data JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE market ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(50)"
        ];

        for (let query of queries) {
            try {
                await pool.query(query);
                console.log(`✅ Success: ${query.split('ADD COLUMN')[0]}...`);
            } catch (err) {
                console.warn(`⚠️  Skipped or Failed: ${err.message}`);
            }
        }

        console.log('✨ Migration Complete!');
    } catch (err) {
        console.error('❌ Migration Critical Failure:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
