const pool = require('./src/config/database');
pool.query(`SELECT id, amount, type, status, note FROM wallet_transfers WHERE note LIKE '%0620862212%' ORDER BY id ASC`)
  .then(res => console.log(res.rows))
  .catch(console.error)
  .finally(() => pool.end());
