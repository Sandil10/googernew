const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`SELECT COUNT(*) FROM wallet_transfers`);
        console.log('Count:', res.rows[0].count);
        
        const res2 = await pool.query(`SELECT * FROM wallet_transfers LIMIT 5`);
        console.log('Recent:', JSON.stringify(res2.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
