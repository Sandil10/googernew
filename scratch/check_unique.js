const pool = require('../backend/src/config/database');

async function check() {
    try {
        const res = await pool.query(`
            SELECT conname, pg_get_constraintdef(c.oid) 
            FROM pg_constraint c 
            JOIN pg_namespace n ON n.oid = c.connamespace 
            WHERE n.nspname = 'public' 
            AND conrelid = 'wallet_transfers'::regclass 
            AND contype = 'u'
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
