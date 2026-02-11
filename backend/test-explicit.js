const { Client } = require('pg');
require('dotenv').config();

async function testExplicitConnection() {
    console.log('🔄 Testing connection with explicit parameters (bypassing URL parsing)...');

    // Hardcoding the config based on what we know, to test the password 'Admin@1234' literally
    const client = new Client({
        host: 'db.kmaxihzxqoxakdjytohb.supabase.co',
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: 'sS718643654@', // Correct password from user
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connection successful with explicit parameters!');

        const res = await client.query('SELECT NOW()');
        console.log('🕒 Database time:', res.rows[0].now);

        // Check tables
        console.log('📋 Checking for users table...');
        const tableCheck = await client.query("SELECT to_regclass('public.users');");

        if (tableCheck.rows[0].to_regclass) {
            console.log('✅ Users table exists.');
        } else {
            console.log('❌ Users table MISSING.');
        }

        await client.end();
    } catch (err) {
        console.error('❌ Explicit connection failed:', err.message);
        if (err.message.includes('password')) {
            console.error('⚠️ Password validation failed. The password "Admin@1234" seems incorrect for this database.');
        }
    }
}

testExplicitConnection();
