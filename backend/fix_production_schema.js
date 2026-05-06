const { Pool } = require('pg');
async function fix() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Attempting to add missing columns to users table...');
    
    // Check for shipping_address
    const checkRes = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'shipping_address'
    `);
    
    if (checkRes.rows.length === 0) {
      console.log('Adding shipping_address column...');
      await pool.query('ALTER TABLE users ADD COLUMN shipping_address JSONB');
      console.log('✅ Added shipping_address column');
    } else {
      console.log('shipping_address column already exists');
    }

    // Check for status
    const statusCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status'");
    if (statusCheck.rows.length === 0) {
        await pool.query("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
        console.log('✅ Added status column');
    }

    console.log('Database schema update complete!');
  } catch (err) {
    console.error('Error fixing schema:', err.message);
  } finally {
    await pool.end();
    process.exit();
  }
}
fix();
