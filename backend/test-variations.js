const { Client } = require('pg');
require('dotenv').config();

async function testVariations() {
    const passwords = [
        'sS718643654@',       // Exact password provided
        'sS718643654%40',     // URL encoded version as literal (unlikely)
        'sS718643654',        // Without @
        'sS718643654 @',      // With space
        'SamplePassword'      // Fallback
    ];

    console.log('🔄 Testing password variations...');

    for (const pass of passwords) {
        const client = new Client({
            host: 'db.kmaxihzxqoxakdjytohb.supabase.co',
            port: 5432,
            database: 'postgres',
            user: 'postgres',
            password: pass,
            ssl: { rejectUnauthorized: false }
        });

        try {
            await client.connect();
            console.log(`✅ SUCCESS! The working password is: "${pass}"`);

            // Check tables with this working connection
            const tableCheck = await client.query("SELECT to_regclass('public.users');");
            if (tableCheck.rows[0].to_regclass) {
                console.log('✅ Users table exists.');
            } else {
                console.log('❌ Users table MISSING. You need to run init-db.');
            }

            await client.end();
            process.exit(0);
        } catch (err) {
            console.log(`❌ Failed with "${pass}": ${err.message}`);
        }
    }

    console.log('❌ All password variations failed.');
    process.exit(1);
}

testVariations();
