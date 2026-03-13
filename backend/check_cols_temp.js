const pool = require('./src/config/database');
async function check() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'market'");
        console.log(JSON.stringify(res.rows.map(r => r.column_name), null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
