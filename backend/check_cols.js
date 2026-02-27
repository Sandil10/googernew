const pool = require('./src/config/database');

async function checkColumns() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'market'
            ORDER BY column_name
        `);
        console.log('--- COLUMNS START ---');
        res.rows.forEach(row => {
            console.log(row.column_name);
        });
        console.log('--- COLUMNS END ---');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkColumns();
