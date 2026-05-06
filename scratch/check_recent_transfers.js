const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`
            SELECT * 
            FROM wallet_transfers 
            WHERE amount = 107.00
            OR created_at > CURRENT_DATE
            ORDER BY created_at DESC
            LIMIT 10
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
