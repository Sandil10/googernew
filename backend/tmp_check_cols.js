const pool = require('./src/config/database');
async function check() {
  try {
    const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'market_likes'");
    console.log('Columns in market_likes:', res.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
    const marketRes = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'market'");
    console.log('Columns in market:', marketRes.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  } catch (err) {
    console.error('Error checking columns:', err.message);
  } finally {
    process.exit();
  }
}
check();
