const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name, is_nullable, column_default, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
            ORDER BY ordinal_position
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
