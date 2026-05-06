const pool = require('../../../backend/src/config/database');

async function debugOrder() {
    const client = await pool.connect();
    try {
        const orderNumber = '72727731';
        const res = await client.query(
            "SELECT id, shipping_address, shipping_fee, total_price, order_number FROM orders WHERE order_number = $1",
            [orderNumber]
        );
        console.log("Order Data:", JSON.stringify(res.rows, null, 2));

        if (res.rows.length > 0) {
            const metadata = JSON.parse(res.rows[0].shipping_address);
            console.log("Metadata:", JSON.stringify(metadata, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        process.exit();
    }
}

debugOrder();
