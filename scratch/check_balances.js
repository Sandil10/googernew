const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`SELECT id, username, wallet_balance, hold_balance FROM users`);
        console.log('Users Balances:', JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
