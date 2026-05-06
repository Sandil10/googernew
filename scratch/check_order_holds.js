const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`SELECT * FROM wallet_transfers WHERE type = 'order_hold'`);
        console.log('Order Holds:', JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
