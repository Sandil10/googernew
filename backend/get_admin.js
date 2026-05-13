const pool = require('./src/config/database');
async function run() {
    const res = await pool.query("SELECT id, username, user_type FROM users WHERE user_type = 'admin' OR username ILIKE '%googer%'");
    console.log(res.rows);
    process.exit(0);
}
run();
