const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`SELECT NOW()`);
        console.log('Now:', res.rows[0].now);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
