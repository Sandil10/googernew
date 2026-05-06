const pool = require('./src/config/database');

async function testSupabaseConnection() {
    try {
        console.log('🔄 Connecting to database...');

        // Simple query to check connection
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Connected successfully!');
        console.log('🕒 Database time:', result.rows[0].now);

        // User's requested query
        console.log('📋 Fetching users...');
        const users = await pool.query('SELECT * FROM users LIMIT 5');
        console.log('Result:', users.rows);

        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        console.error('Hint: Did you update the DATABASE_URL in backend/.env with your actual password?');
        process.exit(1);
    }
}

testSupabaseConnection();
