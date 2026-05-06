const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query("SELECT id, username, user_type FROM users WHERE user_type = 'admin' OR username = 'admin' LIMIT 5");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
