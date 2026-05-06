const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`
            SELECT tgname 
            FROM pg_trigger 
            WHERE tgrelid = 'wallet_transfers'::regclass
            AND tgisinternal = false
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
