const pool = require('../../config/database');

const ensureVerificationTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_verifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'Under Review',
            rejection_reason TEXT,
            full_name VARCHAR(200),
            email VARCHAR(255),
            phone VARCHAR(50),
            address TEXT,
            date_of_birth DATE,
            country VARCHAR(120),
            document_type VARCHAR(50),
            id_number VARCHAR(100),
            doc_front_url TEXT,
            doc_back_url TEXT,
            official_website TEXT,
            social_links TEXT,
            news_links TEXT,
            brand_proof_url TEXT,
            business_reg_url TEXT,
            vat_number VARCHAR(100),
            company_docs_url TEXT,
            business_website TEXT,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id)
        );
    `);

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'None'`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_badge_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_badge_tick_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
};

const getUserType = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type || null;
};

const getVerificationStatusByUserId = async (userId) => {
    const result = await pool.query('SELECT id, status FROM user_verifications WHERE user_id = $1 LIMIT 1', [userId]);
    return result.rows[0] || null;
};

const updateRejectedVerification = async (userId, payload) => {
    await pool.query(
        `UPDATE user_verifications SET
            status = 'Under Review', rejection_reason = NULL,
            full_name=$2, email=$3, phone=$4, address=$5, date_of_birth=$6, country=$7,
            document_type=$8,
            doc_front_url=COALESCE($9, doc_front_url),
            doc_back_url=COALESCE($10, doc_back_url),
            official_website=$11, social_links=$12, news_links=$13,
            brand_proof_url=COALESCE($14, brand_proof_url),
            business_reg_url=COALESCE($15, business_reg_url),
            vat_number=$16,
            company_docs_url=COALESCE($17, company_docs_url),
            business_website=$18,
            submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
         WHERE user_id=$1`,
        [
            userId,
            payload.fullName,
            payload.email,
            payload.phone,
            payload.address,
            payload.dateOfBirth,
            payload.country,
            payload.documentType,
            payload.docFrontUrl,
            payload.docBackUrl,
            payload.officialWebsite,
            payload.socialLinks,
            payload.newsLinks,
            payload.brandProofUrl,
            payload.businessRegUrl,
            payload.vatNumber,
            payload.companyDocsUrl,
            payload.businessWebsite,
        ]
    );
};

const insertVerification = async (userId, payload) => {
    await pool.query(
        `INSERT INTO user_verifications
            (user_id, full_name, email, phone, address, date_of_birth, country,
             document_type, doc_front_url, doc_back_url,
             official_website, social_links, news_links, brand_proof_url,
             business_reg_url, vat_number, company_docs_url, business_website)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
            userId,
            payload.fullName,
            payload.email,
            payload.phone,
            payload.address,
            payload.dateOfBirth,
            payload.country,
            payload.documentType,
            payload.docFrontUrl,
            payload.docBackUrl,
            payload.officialWebsite,
            payload.socialLinks,
            payload.newsLinks,
            payload.brandProofUrl,
            payload.businessRegUrl,
            payload.vatNumber,
            payload.companyDocsUrl,
            payload.businessWebsite,
        ]
    );
};

const setUserVerificationStatus = async (userId, status) => {
    await pool.query(
        'UPDATE users SET verification_status = $1 WHERE id = $2',
        [status, userId]
    );
};

const getVerificationDetailsByUserId = async (userId) => {
    const result = await pool.query(
        `SELECT id, status, rejection_reason,
                full_name, email, phone, address, date_of_birth, country,
                document_type, id_number, doc_front_url, doc_back_url,
                official_website, social_links, news_links,
                vat_number, business_website,
                submitted_at, reviewed_at
         FROM user_verifications WHERE user_id = $1 LIMIT 1`,
        [userId]
    );
    return result.rows[0] || null;
};

const listVerifications = async (status) => {
    const params = [];
    const where = status && status !== 'All' ? `WHERE uv.status = $1` : '';
    if (status && status !== 'All') params.push(status);

    const result = await pool.query(
        `SELECT uv.*, u.username, u.profile_picture, u.email AS user_email
         FROM user_verifications uv
         JOIN users u ON uv.user_id = u.id
         ${where}
         ORDER BY uv.submitted_at DESC`,
        params
    );

    return result.rows;
};

const updateReviewStatus = async (verificationId, newStatus, rejectionReason) => {
    const result = await pool.query(
        `UPDATE user_verifications
         SET status=$1, rejection_reason=$2, reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
         WHERE id=$3 RETURNING user_id`,
        [newStatus, rejectionReason || null, verificationId]
    );
    return result.rows[0] || null;
};

const syncReviewedUserVerification = async (userId, isApproved, status) => {
    await pool.query(
        `UPDATE users SET is_verified=$1, verification_status=$2,
         verification_badge_color = CASE WHEN $1 AND verification_badge_color IS NULL THEN 'blue' ELSE verification_badge_color END
         WHERE id=$3`,
        [isApproved, status, userId]
    );
};

module.exports = {
    ensureVerificationTable,
    getUserType,
    getVerificationDetailsByUserId,
    getVerificationStatusByUserId,
    insertVerification,
    listVerifications,
    setUserVerificationStatus,
    syncReviewedUserVerification,
    updateRejectedVerification,
    updateReviewStatus,
};
