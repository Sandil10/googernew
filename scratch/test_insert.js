const pool = require('../backend/src/config/database');

async function check() {
    try {
        console.log('Testing manual insert into wallet_transfers...');
        const res = await pool.query(`
            INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
            VALUES (1, 1, 107.00, 'Test Manual Insert', 'order_hold', 'pending')
            RETURNING *
        `);
        console.log('Success:', res.rows[0]);
        
        // Clean up
        await pool.query('DELETE FROM wallet_transfers WHERE id = $1', [res.rows[0].id]);
        console.log('Cleaned up.');
    } catch (err) {
        console.error('Manual INSERT failed:', err);
    } finally {
        process.exit();
    }
}

check();
