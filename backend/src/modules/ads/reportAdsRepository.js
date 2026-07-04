const pool = require('../../config/database');

const ensureAdReportsSchema = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ad_reports (
            id SERIAL PRIMARY KEY,
            ad_id BIGINT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            reason VARCHAR(500) NOT NULL,
            custom_reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ad_id, user_id)
        )
    `).catch(() => {});
    await pool.query(`ALTER TABLE ad_reports ALTER COLUMN ad_id TYPE BIGINT`).catch(() => {});
};

const findExistingReport = async (adId, userId) => {
    const result = await pool.query(
        'SELECT 1 FROM ad_reports WHERE ad_id=$1 AND user_id=$2',
        [adId, userId]
    );
    return result.rows[0] || null;
};

const insertReport = async (adId, userId, reason, customReason) => {
    await pool.query(
        'INSERT INTO ad_reports (ad_id, user_id, reason, custom_reason) VALUES ($1,$2,$3,$4)',
        [adId, userId, reason, customReason || null]
    );
};

module.exports = {
    ensureAdReportsSchema,
    findExistingReport,
    insertReport,
};
