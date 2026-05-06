const pool = require('./src/config/database');
async function check() {
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        res.rows.forEach(r => console.log(r.table_name));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
