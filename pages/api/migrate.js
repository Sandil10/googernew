import pool from '../../backend/src/config/database';

export default async function handler(req, res) {
  try {
    const results = [];
    
    // 1. Add shipping_address
    const checkAddress = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'shipping_address'");
    if (checkAddress.rows.length === 0) {
      await pool.query('ALTER TABLE users ADD COLUMN shipping_address JSONB');
      results.push('Added shipping_address');
    }

    // 2. Add status
    const checkStatus = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status'");
    if (checkStatus.rows.length === 0) {
      await pool.query("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
      results.push('Added status');
    }

    // 3. Add hold_balance if missing (User log showed it exists, but just in case)
    const checkHold = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'hold_balance'");
    if (checkHold.rows.length === 0) {
      await pool.query("ALTER TABLE users ADD COLUMN hold_balance NUMERIC DEFAULT 0.00");
      results.push('Added hold_balance');
    }

    // 4. Performance Indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_market_status ON market(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_market_category ON market(category)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_market_created_at ON market(created_at DESC)');
    results.push('Added performance indexes');

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
