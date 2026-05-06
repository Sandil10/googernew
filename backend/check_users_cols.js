const pool = require('./src/config/database');
async function check() {
  try {
    const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'");
    console.log('Columns in users:', res.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  } catch (err) {
    console.error('Error checking columns:', err.message);
  } finally {
    process.exit();
  }
}
check();
