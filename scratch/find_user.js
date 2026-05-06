const pool = require('../backend/src/config/database');

async function findUser() {
    const username = 'sandildilmith12';
    
    try {
        const res = await pool.query('SELECT id, user_id, username, wallet_balance FROM users WHERE username = $1', [username]);
        
        if (res.rows.length === 0) {
            console.log(`User with username ${username} not found.`);
            // Search for partial or case insensitive
            const partialRes = await pool.query('SELECT id, user_id, username, wallet_balance FROM users WHERE username ILIKE $1', [`%${username}%`]);
            console.log('Partial matches:', JSON.stringify(partialRes.rows, null, 2));
        } else {
            console.log('Found user:', JSON.stringify(res.rows, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

findUser();
