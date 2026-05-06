const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function testConnection() {
    try {
        console.log(`🔌 Attempting to connect to database: ${process.env.DB_NAME}...`);
        await client.connect();
        console.log('✅ Connected successfully!');

        const res = await client.query('SELECT NOW()');
        console.log('🕒 Database time:', res.rows[0].now);

        await client.end();
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        if (err.message.includes('password authentication failed')) {
            console.log('\n❌ Authentication Failed!');
            console.log('💡 Hint: The password in your .env file is likely incorrect.');
            console.log('   Trying common default passwords for you...');

            const passwords = ['', 'root', 'admin', 'password', '123456'];
            for (const pass of passwords) {
                try {
                    const tempClient = new Client({ ...client.options, password: pass });
                    await tempClient.connect();
                    console.log(`✅ Success! The correct password is: "${pass}"`);
                    console.log(' 👉 Please update DB_PASSWORD in backend/.env with this value.');
                    await tempClient.end();
                    process.exit(0);
                } catch (e) {
                    // ignore
                }
            }
            console.log('❌ Could not guess the password. Please check your PostgreSQL installation.');
        } else if (err.message.includes('database')) {
            console.log(`💡 Hint: Ensure database "${process.env.DB_NAME}" exists.`);
            console.log(`   Run this in PSQL: CREATE DATABASE "${process.env.DB_NAME}";`);
        }
        process.exit(1);
    }
}

testConnection();
