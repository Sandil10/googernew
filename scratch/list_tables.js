const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`
            SELECT tablename 
            FROM pg_catalog.pg_tables 
            WHERE schemaname = 'public'
        `);
        console.log(JSON.stringify(res.rows.map(r => r.tablename), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
