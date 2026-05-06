const pool = require('./src/config/database');

async function checkColumns() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'market'
            ORDER BY column_name
        `);
        console.log('--- START COLUMNS ---');
        res.rows.forEach(row => {
            console.log(`${row.column_name}:${row.data_type}`);
        });
        console.log('--- END COLUMNS ---');
        process.exit(0);
    } catch (err) {
        console.error('Error checking columns:', err);
        process.exit(1);
    }
}

checkColumns();
