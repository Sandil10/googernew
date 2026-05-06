const pool = require('./src/config/database');

async function checkData() {
    try {
        const res = await pool.query(`SELECT * FROM market ORDER BY created_at DESC LIMIT 1`);
        if (res.rows.length === 0) {
            console.log('No items found');
        } else {
            const item = res.rows[0];
            console.log('--- LAST ITEM DATA ---');
            console.log('Title:', item.title);
            console.log('Shipping Info:', item.shipping_info);
            console.log('Payment Methods:', item.payment_methods);
            console.log('Commission Info:', item.commission_info);
            console.log('Delivery Info:', item.delivery_info);
            console.log('Return Policy:', item.return_policy);
            console.log('--- END DATA ---');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkData();
