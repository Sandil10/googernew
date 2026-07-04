const pool = require('../../config/database');

const ensureReportsSchema = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS market_reports (
            id SERIAL PRIMARY KEY,
            market_id INTEGER,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            reason VARCHAR(500) NOT NULL,
            custom_reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(market_id, user_id)
        )
    `).catch(() => {});
    await pool.query(`ALTER TABLE market_reports ALTER COLUMN reason TYPE VARCHAR(500)`).catch(() => {});
    await pool.query(`ALTER TABLE market_reports ALTER COLUMN market_id DROP NOT NULL`).catch(() => {});
};

const findExistingReport = async (marketId, userId) => {
    const result = await pool.query(
        'SELECT 1 FROM market_reports WHERE market_id=$1 AND user_id=$2',
        [marketId, userId]
    );
    return result.rows[0] || null;
};

const insertReport = async (marketId, userId, reason, customReason) => {
    await pool.query(
        'INSERT INTO market_reports (market_id, user_id, reason, custom_reason) VALUES ($1,$2,$3,$4)',
        [marketId, userId, reason, customReason || null]
    );
};

module.exports = {
    ensureReportsSchema,
    findExistingReport,
    insertReport,
};
