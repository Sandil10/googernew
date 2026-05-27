const pool = require('./src/config/database');

pool.query(`
    SELECT event_object_table, trigger_name, action_statement 
    FROM information_schema.triggers 
    WHERE event_object_table = 'wallet_transfers'
`)
.then(res => {
    console.log("TRIGGERS ON WALLET_TRANSFERS:", res.rows);
})
.catch(console.error)
.finally(() => pool.end());
