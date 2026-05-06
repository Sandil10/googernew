const pool = require('./src/config/database');

async function checkColumns() {
    try {
        console.log("🔍 Detailed inspection of 'market' table...");
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'market';
        `);

        const columns = res.rows.reduce((acc, current) => {
            acc[current.column_name] = current.data_type;
            return acc;
        }, {});

        const targetJsonb = [
            'variants', 'shipping_info', 'payment_methods',
            'warranty_info', 'return_policy', 'delivery_info', 'commission_info'
        ];

        for (const col of targetJsonb) {
            const currentType = columns[col];
            if (!currentType) {
                console.log(`➕ Adding missing column ${col} as JSONB...`);
                await pool.query(`ALTER TABLE market ADD COLUMN ${col} JSONB DEFAULT '{}'::jsonb;`);
            } else if (currentType.toLowerCase() !== 'jsonb') {
                console.log(`🔄 Converting ${col} from ${currentType} to JSONB...`);
                // Use array_to_json for array types, otherwise simple cast
                const castExpr = currentType.includes('ARRAY') ? `array_to_json(${col})::jsonb` : `${col}::jsonb`;
                await pool.query(`ALTER TABLE market ALTER COLUMN ${col} TYPE JSONB USING ${castExpr};`);
            }
        }

        console.log("\n✅ Database structure is now correct (Consolidated JSONB).");
    } catch (err) {
        console.error("❌ Error fixing database:", err.message);
    } finally {
        await pool.end();
    }
}

checkColumns();
