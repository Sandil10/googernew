const pool = require('./src/config/database');

async function checkAndFix() {
    try {
        console.log('Checking columns in users table...');
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
        const columns = res.rows.map(r => r.column_name);
        console.log('Columns:', columns);

        if (!columns.includes('hold_balance')) {
            console.log('Adding hold_balance column...');
            await pool.query('ALTER TABLE users ADD COLUMN hold_balance DECIMAL(15, 2) DEFAULT 0.00');
            console.log('✅ Created hold_balance column.');
        } else {
            console.log('✅ hold_balance column already exists.');
        }

        // Also check wallet_transfers for any missing columns if needed
        const resTrans = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'wallet_transfers'");
        const transCols = resTrans.rows.map(r => r.column_name);
        console.log('Wallet Transfer Columns:', transCols);

        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

checkAndFix();
