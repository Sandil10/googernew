const pool = require('./src/config/database');

async function checkColumns() {
    try {
        console.log("🔍 Checking columns in 'market' table...");
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'market';
        `);

        console.log("📊 Current Columns:");
        const columns = res.rows.map(r => r.column_name);
        console.log(columns.join(', '));

        const required = [
            'variants', 'shipping_info', 'payment_methods',
            'warranty_info', 'return_policy', 'delivery_info', 'commission_info'
        ];

        let missing = [];
        required.forEach(col => {
            if (!columns.includes(col)) {
                missing.push(col);
            }
        });

        if (missing.length > 0) {
            console.log("\n❌ MISSING COLUMNS:", missing);
            console.log("💡 Attempting to fix local database automatically...");

            for (const col of missing) {
                console.log(`➕ Adding column: ${col}`);
                const type = (col === 'variants' || col === 'payment_methods') ? 'JSONB DEFAULT \'[]\'::jsonb' : 'JSONB DEFAULT \'{}\'::jsonb';
                await pool.query(`ALTER TABLE market ADD COLUMN IF NOT EXISTS ${col} ${type};`);
            }
            console.log("✅ Fix applied to local database!");
        } else {
            console.log("\n✅ All consolidated JSONB columns exist in local database.");
        }

    } catch (err) {
        console.error("❌ Error checking database:", err.message);
    } finally {
        await pool.end();
    }
}

checkColumns();
