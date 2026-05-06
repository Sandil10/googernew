const pool = require('../backend/src/config/database');

async function updateBalance() {
    const id = 4; // The internal primary key
    const targetBalance = 5000;
    
    try {
        const updateRes = await pool.query('UPDATE users SET wallet_balance = $1 WHERE id = $2 RETURNING *', [targetBalance, id]);
        
        if (updateRes.rows.length === 0) {
            console.error(`User with internal ID ${id} not found during update.`);
            return;
        }
        
        console.log(`Updated state for user ${updateRes.rows[0].username} (ID: ${id}, User ID: ${updateRes.rows[0].user_id}):`, updateRes.rows[0].wallet_balance);
        console.log('SUCCESS: Balance updated to 5000.');
        
    } catch (err) {
        console.error('Update failed:', err);
    } finally {
        process.exit();
    }
}

updateBalance();
