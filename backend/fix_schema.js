const pool = require('./src/config/database');

async function fixSchema() {
    try {
        console.log('--- FIXING SCHEMA ---');

        // Add missing columns if they don't exist
        const columnsToEnsure = [
            { name: 'warranty_data', type: 'jsonb', default: "'{}'::jsonb" },
            { name: 'variants_data', type: 'jsonb', default: "'[]'::jsonb" },
            { name: 'shipping_data', type: 'jsonb', default: "'{}'::jsonb" },
            { name: 'payment_data', type: 'jsonb', default: "'[]'::jsonb" },
            { name: 'return_data', type: 'jsonb', default: "'{}'::jsonb" },
            { name: 'delivery_data', type: 'jsonb', default: "'{}'::jsonb" },
            { name: 'commission_data', type: 'jsonb', default: "'{}'::jsonb" }
        ];

        for (const col of columnsToEnsure) {
            console.log(`Ensuring column ${col.name}...`);
            await pool.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'market' AND COLUMN_NAME = '${col.name}') THEN
                        ALTER TABLE market ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default};
                    END IF;
                END $$;
            `);
        }

        console.log('--- SCHEMA FIXED ---');
        process.exit(0);
    } catch (err) {
        console.error('Error fixing schema:', err);
        process.exit(1);
    }
}

fixSchema();
