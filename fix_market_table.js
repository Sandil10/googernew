const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
const pool = require('./backend/src/config/database');

async function fixTable() {
    try {
        console.log('Starting table fix...');
        await pool.query('ALTER TABLE market ADD COLUMN IF NOT EXISTS seller_id VARCHAR(10)');
        await pool.query('ALTER TABLE market ADD COLUMN IF NOT EXISTS username VARCHAR(100)');
        console.log('✅ Market table columns added/verified');

        // Populate existing rows if they are missing seller_id/username
        const result = await pool.query('SELECT m.id, m.user_id, u.user_id as seller_uid, u.username as owner_uname FROM market m JOIN users u ON m.user_id = u.id');
        for (const row of result.rows) {
            await pool.query('UPDATE market SET seller_id = $1, username = $2 WHERE id = $3', [row.seller_uid, row.owner_uname, row.id]);
        }
        console.log('✅ Existing rows updated with real seller_id and username');

        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to fix table:', err);
        process.exit(1);
    }
}

fixTable();
