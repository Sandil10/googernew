const pool = require('./src/config/database');

async function resetUserData() {
    const TARGET_USER_ID = 4208;
    const client = await pool.connect();
    
    try {
        console.log(`Starting data reset for User ID: ${TARGET_USER_ID} (sandildilmith12)...`);

        // 1. Delete orders where the user is the buyer
        const buyerRes = await client.query('DELETE FROM orders WHERE buyer_id = $1', [TARGET_USER_ID]);
        console.log(`Deleted ${buyerRes.rowCount} orders as Buyer.`);

        // 2. Delete orders where the user is the seller
        const sellerRes = await client.query('DELETE FROM orders WHERE seller_id = $1', [TARGET_USER_ID]);
        console.log(`Deleted ${sellerRes.rowCount} orders as Seller.`);

        console.log("Data reset completed successfully.");
    } catch (err) {
        console.error("Data reset failed:", err);
    } finally {
        client.release();
        process.exit();
    }
}

resetUserData();
