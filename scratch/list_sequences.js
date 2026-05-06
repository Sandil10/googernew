const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`
            SELECT relname 
            FROM pg_class 
            WHERE relkind = 'S'
        `);
        console.log(JSON.stringify(res.rows.map(r => r.relname), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
