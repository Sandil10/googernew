const pool = require('./src/config/database');
async function test() {
    const fallbackResult = await pool.query(
        `SELECT id FROM users
         WHERE LOWER(COALESCE(user_type, '')) = 'admin'
            OR id = 1
         ORDER BY
            CASE
                WHEN LOWER(COALESCE(user_type, '')) = 'admin' THEN 0
                WHEN id = 1 THEN 1
                ELSE 2
            END,
            id ASC
         LIMIT 1`
    );
    const id = fallbackResult.rows[0]?.id;
    console.log('Googer User ID:', id);
    const res = await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [id]);
    console.log('Balance:', res.rows[0]?.wallet_balance);
}
test().catch(console.error).finally(() => pool.end());
