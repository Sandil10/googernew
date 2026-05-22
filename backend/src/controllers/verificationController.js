const pool = require('../config/database');
const { saveUploadedFile } = require('../utils/localUpload');

const assertAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type === 'admin';
};

const ensureVerificationTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_verifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'Under Review',
            rejection_reason TEXT,

            -- Personal Info
            full_name VARCHAR(200),
            email VARCHAR(255),
            phone VARCHAR(50),
            address TEXT,
            date_of_birth DATE,
            country VARCHAR(120),

            -- Identity
            document_type VARCHAR(50),
            id_number VARCHAR(100),
            doc_front_url TEXT,
            doc_back_url TEXT,

            -- Authenticity
            official_website TEXT,
            social_links TEXT,
            news_links TEXT,
            brand_proof_url TEXT,

            -- Business (optional)
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

    // Ensure users table has is_verified flag
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'None';
    `);
};

// Submit or re-submit a verification application
exports.submitVerification = async (req, res) => {
    try {
        await ensureVerificationTable();
        const userId = req.user.id;
        const {
            fullName, email, phone, address, dateOfBirth, country,
            documentType,
            officialWebsite, socialLinks, newsLinks,
            vatNumber, businessWebsite,
        } = req.body;

        if (!fullName || !email || !documentType) {
            return res.status(400).json({ success: false, message: 'Full name, email, and document type are required.' });
        }

        const files = req.files || {};
        const getFile = (name) => (Array.isArray(files[name]) ? files[name][0] : files[name]) || null;

        const docFrontUrl = getFile('docFront') ? await saveUploadedFile(getFile('docFront'), 'verification') : null;
        const docBackUrl = getFile('docBack') ? await saveUploadedFile(getFile('docBack'), 'verification') : null;
        const brandProofUrl = getFile('brandProof') ? await saveUploadedFile(getFile('brandProof'), 'verification') : null;
        const businessRegUrl = getFile('businessReg') ? await saveUploadedFile(getFile('businessReg'), 'verification') : null;
        const companyDocsUrl = getFile('companyDocs') ? await saveUploadedFile(getFile('companyDocs'), 'verification') : null;

        const existing = await pool.query('SELECT id, status FROM user_verifications WHERE user_id = $1 LIMIT 1', [userId]);
        const isResubmit = existing.rows.length > 0 && existing.rows[0].status === 'Rejected';

        if (existing.rows.length > 0 && existing.rows[0].status === 'Under Review') {
            return res.status(409).json({ success: false, message: 'Your verification is already under review.' });
        }
        if (existing.rows.length > 0 && existing.rows[0].status === 'Verified') {
            return res.status(409).json({ success: false, message: 'Your account is already verified.' });
        }

        if (isResubmit) {
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
                    userId, fullName, email, phone || null, address || null,
                    dateOfBirth || null, country || null,
                    documentType,
                    docFrontUrl, docBackUrl,
                    officialWebsite || null, socialLinks || null, newsLinks || null,
                    brandProofUrl, businessRegUrl, vatNumber || null,
                    companyDocsUrl, businessWebsite || null,
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO user_verifications
                    (user_id, full_name, email, phone, address, date_of_birth, country,
                     document_type, doc_front_url, doc_back_url,
                     official_website, social_links, news_links, brand_proof_url,
                     business_reg_url, vat_number, company_docs_url, business_website)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
                [
                    userId, fullName, email, phone || null, address || null,
                    dateOfBirth || null, country || null,
                    documentType,
                    docFrontUrl, docBackUrl,
                    officialWebsite || null, socialLinks || null, newsLinks || null,
                    brandProofUrl, businessRegUrl, vatNumber || null,
                    companyDocsUrl, businessWebsite || null,
                ]
            );
        }

        // Keep verification_status in users table in sync
        await pool.query(
            `UPDATE users SET verification_status = 'Under Review' WHERE id = $1`,
            [userId]
        );

        return res.status(200).json({ success: true, message: 'Verification submitted successfully. We will review your application within 2–5 business days.' });
    } catch (error) {
        console.error('submitVerification error:', error);
        return res.status(500).json({ success: false, message: 'Failed to submit verification.' });
    }
};

// Get current user's verification status + data
exports.getVerificationStatus = async (req, res) => {
    try {
        await ensureVerificationTable();
        const userId = req.user.id;
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
        if (!result.rows.length) {
            return res.status(200).json({ success: true, verification: null });
        }
        return res.status(200).json({ success: true, verification: result.rows[0] });
    } catch (error) {
        console.error('getVerificationStatus error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch verification status.' });
    }
};

// Admin: get all verifications
exports.adminGetAll = async (req, res) => {
    try {
        await ensureVerificationTable();
        if (!await assertAdmin(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }
        const { status } = req.query;
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
        return res.status(200).json({ success: true, verifications: result.rows });
    } catch (error) {
        console.error('adminGetAll verifications error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch verifications.' });
    }
};

// Admin: approve or reject
exports.adminReview = async (req, res) => {
    try {
        await ensureVerificationTable();
        if (!await assertAdmin(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }
        const { id } = req.params;
        const { action, rejectionReason } = req.body;
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'action must be approve or reject' });
        }
        const newStatus = action === 'approve' ? 'Verified' : 'Rejected';
        const result = await pool.query(
            `UPDATE user_verifications
             SET status=$1, rejection_reason=$2, reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
             WHERE id=$3 RETURNING user_id`,
            [newStatus, rejectionReason || null, id]
        );
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Verification not found' });

        const targetUserId = result.rows[0].user_id;
        await pool.query(
            `UPDATE users SET is_verified=$1, verification_status=$2 WHERE id=$3`,
            [newStatus === 'Verified', newStatus, targetUserId]
        );

        return res.status(200).json({ success: true, status: newStatus });
    } catch (error) {
        console.error('adminReview verification error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update verification.' });
    }
};
