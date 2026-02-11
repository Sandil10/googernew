
require('dotenv').config();
const { Pool } = require('pg');

console.log('--- Database Connection Diagnostic ---');

// 1. Check Configuration source
if (process.env.DATABASE_URL) {
    console.log('Using DATABASE_URL from .env');
    // Mask the password for display
    const maskedUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
    console.log('URL:', maskedUrl);
} else {
    console.log('Using individual DB variables from .env');
    console.log('Host:', process.env.DB_HOST);
    console.log('Database:', process.env.DB_NAME);
    console.log('User:', process.env.DB_USER);
}

// 2. Attempt Connection
const dbConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    };

const pool = new Pool(dbConfig);

async function runDiagnostic() {
    try {
        console.log('\nConnecting to database...');
        const client = await pool.connect();
        console.log('✅ Connection Successful!');

        // 3. Check Users Table
        console.log('\nChecking "users" table...');
        const countResult = await client.query('SELECT COUNT(*) FROM users');
        console.log(`Total Users Count: ${countResult.rows[0].count}`);

        // 4. View Last Registered User
        console.log('\n--- LATEST REGISTERED USER ---');
        const lastUsers = await client.query('SELECT id, username, email, created_at FROM users ORDER BY created_at DESC LIMIT 1');
        if (lastUsers.rowCount === 0) {
            console.log('No users found in database.');
        } else {
            console.log('User ID:', lastUsers.rows[0].id);
            console.log('Username:', lastUsers.rows[0].username);
            console.log('Email:', lastUsers.rows[0].email);
            console.log('Created At:', lastUsers.rows[0].created_at);
        }

        // 5. Test Write Permission (optional, safe insert/rollback)
        // console.log('\nTesting write permissions...');
        // await client.query('BEGIN');
        // ...
        // await client.query('ROLLBACK');

        client.release();
    } catch (err) {
        console.error('❌ Diagnostic Failed:', err);
    } finally {
        await pool.end();
    }
}

runDiagnostic();
