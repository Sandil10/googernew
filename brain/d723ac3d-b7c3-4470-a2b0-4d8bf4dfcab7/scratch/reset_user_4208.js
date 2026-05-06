const pool = require('../../../backend/src/config/database');

async function resetUserData() {
    const client = await pool.connect();
    try {
        const username = 'sandildilmith12';
        const userIdRaw = 4208;

        // 1. Find the user
        const userRes = await client.query(
            "SELECT id, user_id, username FROM users WHERE username = $1 OR id = $2",
            [username, userIdRaw]
        );

        if (userRes.rows.length === 0) {
            console.log("No user found with username 'sandildilmith12' or ID 4208");
            return;
        }

        const user = userRes.rows[0];
        const dbId = user.id;
        console.log(`Found user: ${user.username} (DB ID: ${dbId}, UserID: ${user.user_id})`);

        // 2. Clear orders
        console.log(`Clearing orders for user ${dbId}...`);
        
        const deleteRes = await client.query(
            "DELETE FROM orders WHERE buyer_id = $1 OR seller_id = $1",
            [dbId]
        );

        console.log(`✅ Successfully removed ${deleteRes.rowCount} orders.`);

    } catch (err) {
        console.error("Error during reset:", err);
    } finally {
        client.release();
        process.exit();
    }
}

resetUserData();
