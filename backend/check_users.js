const pool = require('./src/config/database');

async function checkUsers() {
    try {
        console.log("🔍 Checking 'users' table structure...");
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users';
        `);
        console.log("📊 Users Table:", res.rows);

        const idCol = res.rows.find(r => r.column_name === 'id');
        console.log(`🆔 ID Type: ${idCol ? idCol.data_type : 'MISSING'}`);

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

checkUsers();
