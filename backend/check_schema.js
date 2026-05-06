const pool = require('./src/config/database');

async function checkSchema() {
    const client = await pool.connect();
    try {
        const tables = ['market', 'orders', 'users', 'wallet_transfers'];
        for (const table of tables) {
            console.log(`\n--- ${table} schema ---`);
            const res = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '${table}'
                ORDER BY ordinal_position
            `);
            res.rows.forEach(row => {
                console.log(`${row.column_name}: ${row.data_type}`);
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        process.exit();
    }
}

checkSchema();
