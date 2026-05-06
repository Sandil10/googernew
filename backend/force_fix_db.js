const pool = require('./src/config/database');

async function forceFix() {
    try {
        console.log("🛠️ Force repairing 'market' table columns...");

        const jsonbColumns = [
            'variants', 'shipping_info', 'payment_methods',
            'warranty_info', 'return_policy', 'delivery_info', 'commission_info'
        ];

        for (const col of jsonbColumns) {
            console.log(`♻️ Resetting column: ${col}`);
            // Drop if exists (and any dependencies)
            await pool.query(`ALTER TABLE market DROP COLUMN IF EXISTS ${col} CASCADE;`);

            // Re-add as JSONB
            const defaultValue = (col === 'variants' || col === 'payment_methods') ? '[]' : '{}';
            await pool.query(`ALTER TABLE market ADD COLUMN ${col} JSONB DEFAULT '${defaultValue}'::jsonb;`);
        }

        console.log("\n✅ Success! All columns are now strictly JSONB.");
    } catch (err) {
        console.error("❌ Force fix failed:", err.message);
    } finally {
        await pool.end();
    }
}

forceFix();
