const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`SELECT COUNT(*) FROM users`);
        console.log('User Count:', res.rows[0].count);
        
        const res2 = await pool.query(`SELECT id, username, wallet_balance FROM users ORDER BY id DESC LIMIT 20`);
        console.log('Recent Users:', JSON.stringify(res2.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
