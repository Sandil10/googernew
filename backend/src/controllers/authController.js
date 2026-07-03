const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../config/database');
const { saveUploadedFile } = require('../modules/media');
const { getUserPlanLimits } = require('../utils/planLimits');
const { ensureReferralCommissionTables } = require('../utils/referralCommission');

let usersTableHasShippingAddressColumn = null;
let subscriptionsTableEnsured = false;
let referralRelationshipsEnsured = false;
let referralRelationshipsEnsurePromise = null;
let profileViewsTableEnsured = false;
let profilePictureColumnEnsured = false;
let extendedUserProfileSchemaEnsured = false;
let userBlocksTableEnsured = false;
let googerIdNormalizationPromise = null;
let passwordResetOtpTableEnsured = false;

const GOOGER_ID_MIN = 100000;
const GOOGER_ID_MAX = 999999;

const PASSWORD_RESET_OTP_TTL_MINUTES = Number.parseInt(process.env.PASSWORD_RESET_OTP_TTL_MINUTES || '10', 10);
const PASSWORD_RESET_VERIFY_TTL_MINUTES = Number.parseInt(process.env.PASSWORD_RESET_VERIFY_TTL_MINUTES || '15', 10);

const hashResetValue = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const normalizeResetEmail = (email) => String(email || '').trim().toLowerCase();

const generateResetOtp = () => String(crypto.randomInt(100000, 1000000));

const ensurePasswordResetOtpTable = async () => {
    if (passwordResetOtpTableEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_otps (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL,
            otp_hash VARCHAR(128) NOT NULL,
            verify_token_hash VARCHAR(128),
            expires_at TIMESTAMP NOT NULL,
            verified_at TIMESTAMP,
            used_at TIMESTAMP,
            requested_ip TEXT,
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email_created_at
        ON password_reset_otps(email, created_at DESC);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_otps_verify_token_hash
        ON password_reset_otps(verify_token_hash);
    `);

    passwordResetOtpTableEnsured = true;
};

const getSmtpConfig = () => {
    const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
    const port = Number.parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '587', 10);
    const user = process.env.SMTP_USER || process.env.MAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;
    const from = process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SES_FROM_EMAIL;

    if (!host || !user || !pass || !from) {
        return null;
    }

    return {
        host,
        port,
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
        auth: { user, pass },
        from,
    };
};

const sendPasswordResetOtpEmail = async ({ email, otp, fullName }) => {
    const smtpConfig = getSmtpConfig();
    if (!smtpConfig) {
        const error = new Error('Password reset email is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
        error.statusCode = 503;
        throw error;
    }

    const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: smtpConfig.auth,
    });

    await transporter.sendMail({
        from: smtpConfig.from,
        to: email,
        subject: 'Your Googer password reset OTP',
        text: `Your Googer password reset OTP is ${otp}. It expires in ${PASSWORD_RESET_OTP_TTL_MINUTES} minutes. If you did not request this, ignore this email.`,
        html: `
            <div style="font-family:Arial,sans-serif;background:#050505;color:#ffffff;padding:24px;border-radius:18px">
                <h2 style="margin:0 0 12px">Googer password reset</h2>
                <p style="color:#cbd5e1">Hi ${String(fullName || 'there')}, use this OTP to reset your password:</p>
                <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#111827;border:1px solid #334155;border-radius:14px;padding:16px;text-align:center">${otp}</div>
                <p style="color:#94a3b8;font-size:13px">This code expires in ${PASSWORD_RESET_OTP_TTL_MINUTES} minutes. If you did not request it, you can safely ignore this email.</p>
            </div>
        `,
    });
};

const hasUsersTableColumn = async (columnName) => {
    if (columnName === 'shipping_address' && usersTableHasShippingAddressColumn !== null) {
        return usersTableHasShippingAddressColumn;
    }

    const result = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = $1
        ) AS exists`,
        [columnName]
    );

    const exists = Boolean(result.rows[0]?.exists);

    if (columnName === 'shipping_address') {
        usersTableHasShippingAddressColumn = exists;
    }

    return exists;
};

const ensureSubscriptionsTable = async () => {
    if (subscriptionsTableEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id SERIAL PRIMARY KEY,
            subscriber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subscribed_to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (subscriber_id, subscribed_to_id)
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscriber_id
        ON user_subscriptions(subscriber_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscribed_to_id
        ON user_subscriptions(subscribed_to_id);
    `);

    subscriptionsTableEnsured = true;
};

const ensureReferralRelationshipsTable = async (client = pool) => {
    if (referralRelationshipsEnsured && client === pool) return;
    if (client === pool && referralRelationshipsEnsurePromise) return referralRelationshipsEnsurePromise;

    const run = async () => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS referral_relationships (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                referred_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                referral_code_used VARCHAR(80),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id)
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_referral_relationships_referred_by
            ON referral_relationships(referred_by);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_referral_relationships_referred_by_created_at
            ON referral_relationships(referred_by, created_at DESC);
        `);

        await client.query(`
            ALTER TABLE referral_relationships
            ADD COLUMN IF NOT EXISTS level INTEGER,
            ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(8,2);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS referral_level_settings (
                id SERIAL PRIMARY KEY,
                level INTEGER UNIQUE NOT NULL,
                name VARCHAR(80) NOT NULL,
                commission_percentage NUMERIC(8,2) NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            INSERT INTO referral_relationships (user_id, referred_by, referral_code_used, created_at)
            SELECT w.referred_user_id, w.referrer_id, w.referral_link_used, MIN(w.created_at)
            FROM wallet w
            WHERE w.referred_user_id IS NOT NULL
              AND w.referrer_id IS NOT NULL
              AND w.referred_user_id <> w.referrer_id
            GROUP BY w.referred_user_id, w.referrer_id, w.referral_link_used
            ON CONFLICT (user_id) DO NOTHING;
        `).catch(() => {});
    };

    if (client === pool) {
        referralRelationshipsEnsurePromise = (async () => {
            await run();
            referralRelationshipsEnsured = true;
        })();

        try {
            await referralRelationshipsEnsurePromise;
        } finally {
            referralRelationshipsEnsurePromise = null;
        }
        return;
    }

    await run();
};

const ensureProfileViewsTable = async () => {
    if (profileViewsTableEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS profile_views (
            id SERIAL PRIMARY KEY,
            profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            viewer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            ip_address VARCHAR(255),
            last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_profile_views_profile_user_id
        ON profile_views(profile_user_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_user_id
        ON profile_views(viewer_user_id);
    `);

    profileViewsTableEnsured = true;
};

const ensureProfilePictureColumnSupportsUploads = async () => {
    if (profilePictureColumnEnsured) return;

    await pool.query(`
        ALTER TABLE users
        ALTER COLUMN profile_picture TYPE TEXT
    `);

    profilePictureColumnEnsured = true;
};

const ensureExtendedUserProfileSchema = async () => {
    if (extendedUserProfileSchemaEnsured) return;

    await ensureProfilePictureColumnSupportsUploads();

    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS province VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS who_can_follow_me VARCHAR(30) DEFAULT 'everyone';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS who_can_see_activity VARCHAR(30) DEFAULT 'followers';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email_visibility VARCHAR(30) DEFAULT 'public';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_phone_visibility VARCHAR(30) DEFAULT 'public';
    `);

    extendedUserProfileSchemaEnsured = true;
};

const ensureSuspensionColumns = async () => {
    await pool.query(`ALTER TABLE users ALTER COLUMN status TYPE VARCHAR(40)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS self_deactivated_at TIMESTAMP DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS self_deleted_at TIMESTAMP DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permanent_deactivated_at TIMESTAMP DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marked_for_deletion_at TIMESTAMP DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_reason TEXT DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason_category VARCHAR(120) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason_custom TEXT DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_action VARCHAR(80) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_days INTEGER DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_ends_at TIMESTAMP DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_text TEXT DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_status VARCHAR(30) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_submitted_at TIMESTAMP DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_reviewed_at TIMESTAMP DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_admin_note TEXT DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_id VARCHAR(12) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_contact_email TEXT DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_phone_number TEXT DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_agreement_confirmed BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_wallet_access BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
};

const generateAppealId = () => String(Math.floor(10000000 + Math.random() * 90000000));
const PERMANENT_DEACTIVATION_MESSAGE = 'Your account is permanently deactivated.';

const isPermanentlyDeactivatedUser = (user) => {
    const status = String(user?.status || '').toLowerCase();
    const appealStatus = String(user?.appeal_status || '').toLowerCase();
    return Boolean(user?.permanent_deactivated_at)
        || status === 'permanently deactivated'
        || (Boolean(user?.is_deactivated) && appealStatus === 'rejected');
};

const isSelfDeletedUser = (user) => {
    const status = String(user?.status || '').toLowerCase();
    return Boolean(user?.self_deleted_at) || status === 'deleted';
};

const pauseActiveAdsForUser = async (client, userId) => {
    const result = await client.query(
        `UPDATE ads
         SET status = 'Paused',
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
           AND status IN ('Active', 'Approved')
         RETURNING id`,
        [userId]
    ).catch((error) => {
        if (error.code === '42P01') return { rowCount: 0 };
        throw error;
    });
    return result.rowCount || 0;
};

const ensureUserBlocksTable = async () => {
    if (userBlocksTableEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_blocks (
            id SERIAL PRIMARY KEY,
            blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (blocker_id, blocked_user_id)
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id
        ON user_blocks(blocker_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_user_id
        ON user_blocks(blocked_user_id);
    `);

    userBlocksTableEnsured = true;
};

const getOptionalAuthUser = (req) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.replace('Bearer ', '')
            : authHeader;

        if (!token) return null;

        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        if (!secret) return null;

        return jwt.verify(token, secret);
    } catch {
        return null;
    }
};

const getSubscriberCount = async (userId) => {
    await ensureSubscriptionsTable();
    const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM user_subscriptions WHERE subscribed_to_id = $1',
        [userId]
    );
    return result.rows[0]?.count || 0;
};

const getProfileViewCount = async (userId) => {
    await ensureProfileViewsTable();
    const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM profile_views WHERE profile_user_id = $1',
        [userId]
    );
    return result.rows[0]?.count || 0;
};

const getFollowingCount = async (userId) => {
    await ensureSubscriptionsTable();
    const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM user_subscriptions WHERE subscriber_id = $1',
        [userId]
    );
    return result.rows[0]?.count || 0;
};

const getBlockedCount = async (userId) => {
    await ensureUserBlocksTable();
    const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM user_blocks WHERE blocker_id = $1',
        [userId]
    );
    return result.rows[0]?.count || 0;
};

const getSubscribedStatus = async (viewerId, profileUserId) => {
    if (!viewerId || !profileUserId) {
        return false;
    }

    await ensureSubscriptionsTable();
    const result = await pool.query(
        `SELECT 1
         FROM user_subscriptions
         WHERE subscriber_id = $1 AND subscribed_to_id = $2
         LIMIT 1`,
        [viewerId, profileUserId]
    );
    return result.rows.length > 0;
};

const isValidGoogerId = (value) => /^\d{6}$/.test(String(value || '').trim());

const generateUserId = async (db = pool, excludedIds = new Set()) => {
    for (let attempts = 0; attempts < 40; attempts += 1) {
        const candidate = Math.floor(GOOGER_ID_MIN + Math.random() * (GOOGER_ID_MAX - GOOGER_ID_MIN + 1)).toString();
        if (excludedIds.has(candidate)) continue;

        const result = await db.query(
            'SELECT 1 FROM users WHERE user_id = $1 LIMIT 1',
            [candidate]
        );

        if (result.rows.length === 0) {
            excludedIds.add(candidate);
            return candidate;
        }
    }

    throw new Error('Unable to generate a unique Googer ID');
};

const ensureGoogerIdNormalization = async () => {
    if (googerIdNormalizationPromise) return googerIdNormalizationPromise;

    googerIdNormalizationPromise = (async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query('SELECT id, user_id FROM users ORDER BY id ASC');
            const seenIds = new Set();

            for (const row of result.rows) {
                const currentId = String(row.user_id || '').trim();
                const isFresh = isValidGoogerId(currentId) && !seenIds.has(currentId);

                if (isFresh) {
                    seenIds.add(currentId);
                    continue;
                }

                const nextId = await generateUserId(client, seenIds);
                await client.query('UPDATE users SET user_id = $1 WHERE id = $2', [nextId, row.id]);
                seenIds.add(nextId);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    })();

    try {
        return await googerIdNormalizationPromise;
    } finally {
        googerIdNormalizationPromise = null;
    }
};

// Validate password strength
const validatePassword = (password) => {
    // Medium policy: At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (password.length < minLength) {
        return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!hasUpperCase) {
        return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!hasLowerCase) {
        return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!hasNumber) {
        return { valid: false, message: 'Password must contain at least one number' };
    }

    return { valid: true };
};

// ... existing code ...

// Register new user
exports.register = async (req, res) => {
    try {
        const { username, fullName, email, password, isSeller, referralCode } = req.body; // Accept referralCode
        await ensureSuspensionColumns();

        // Validate required fields
        if (!username || !fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Validate password strength
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                success: false,
                message: passwordValidation.message
            });
        }

        // Check if user exists
        const userExists = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (userExists.rows.length > 0) {
            const existingUser = userExists.rows[0];
            if (existingUser.email === email) {
                if (isSelfDeletedUser(existingUser)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Profile not found'
                    });
                }
                if (isPermanentlyDeactivatedUser(existingUser)) {
                    return res.status(403).json({
                        success: false,
                        message: PERMANENT_DEACTIVATION_MESSAGE
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: 'Email already registered'
                });
            }
            if (existingUser.username === username) {
                return res.status(400).json({
                    success: false,
                    message: 'Username already taken'
                });
            }
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate unique user ID
        await ensureGoogerIdNormalization();
        const userId = await generateUserId(pool);

        // Generate Unique Referral Code for the New User
        // Format: REF-[USERNAME-3chars]-[RANDOM-4chars]
        const cleanName = username.substring(0, 3).toUpperCase();
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const newReferralCode = `REF-${cleanName}-${randomStr}`;

        // Determine user type
        const userType = isSeller ? 'seller' : 'user';

        // START TRANSACTION
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await ensureReferralRelationshipsTable(client);

            // Insert new user
            const newUser = await client.query(
                `INSERT INTO users (user_id, username, full_name, email, password, user_type, referral_code, wallet_balance)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, user_id, username, full_name, email, user_type, profile_picture, referral_code, wallet_balance, created_at`,
                [userId, username, fullName, email, hashedPassword, userType, newReferralCode, 0.00]
            );

            const newUserId = newUser.rows[0].id;

            // HANDLE REFERRAL LOGIC
            if (referralCode) {
                console.log(`🔍 Processing referral: ${referralCode} for new user ${username}`);

                // Check if referrer exists (support referral_code, username, or visible Googer ID)
                const referrer = await client.query(
                    `SELECT id, username
                     FROM users
                     WHERE referral_code = $1
                        OR username = $1
                        OR user_id::text = $1
                     LIMIT 1`,
                    [String(referralCode).trim()]
                );

                if (referrer.rows.length > 0) {
                    const referrerId = referrer.rows[0].id;
                    const referrerUsername = referrer.rows[0].username;

                    await client.query(
                        `INSERT INTO referral_relationships (user_id, referred_by, referral_code_used)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (user_id) DO NOTHING`,
                        [newUserId, referrerId, referralCode]
                    );

                    console.log(`Referral relationship saved. Referrer: ${referrerUsername}, Referred: ${username}`);
                } else {
                    console.log(`⚠️ Referral code ${referralCode} not found in database.`);
                }
            }

            await client.query('COMMIT');

            // Create JWT token
            const token = jwt.sign(
                { id: newUser.rows[0].id, userId: newUser.rows[0].user_id, tokenVersion: 0 },
                process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRE || '7d' }
            );

            res.status(201).json({
                success: true,
                message: 'Account created successfully',
                token,
                user: newUser.rows[0]
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('CRITICAL Registration Transaction Error:', {
                message: error.message,
                code: error.code,
                detail: error.detail,
                table: error.table
            });
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Outer Registration Error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.',
        });
    }
};

// Login user
// ... existing login code ...
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        await ensureSuspensionColumns();

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password' });
        }

        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (user.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (isPermanentlyDeactivatedUser(user.rows[0])) {
            return res.status(403).json({
                success: false,
                message: PERMANENT_DEACTIVATION_MESSAGE,
                status: 'permanently_deactivated'
            });
        }

        if (isSelfDeletedUser(user.rows[0])) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found',
                status: 'profile_not_found'
            });
        }

        const isMatch = await bcrypt.compare(password, user.rows[0].password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Auto-reactivate self-deactivated accounts on login
        let userData = user.rows[0];
        if (userData.is_deactivated && userData.suspension_reason_category === 'Self Deactivated') {
            const reactivated = await pool.query(
                `UPDATE users SET is_deactivated = false, deactivation_reason = NULL, suspension_reason_category = NULL,
                 suspension_action = NULL, self_deactivated_at = NULL, status = 'Active'
                 WHERE id = $1 RETURNING *`,
                [userData.id]
            );
            if (reactivated.rows.length > 0) {
                userData = reactivated.rows[0];
            }
        }

        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        if (!secret) {
            throw new Error('JWT Secret is not configured in environment variables');
        }

        await ensureGoogerIdNormalization();

        const token = jwt.sign(
            { id: userData.id, userId: userData.user_id, tokenVersion: userData.token_version ?? 0 },
            secret,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        const { password: _, ...userWithoutPassword } = userData;

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: userWithoutPassword
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

exports.requestPasswordResetOtp = async (req, res) => {
    try {
        const email = normalizeResetEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ success: false, message: 'Registered email is required' });
        }

        await ensurePasswordResetOtpTable();

        const userResult = await pool.query(
            `SELECT id, email, full_name, username, status, self_deleted_at, permanent_deactivated_at
             FROM users
             WHERE LOWER(email) = LOWER($1)
             LIMIT 1`,
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No registered account found for this email' });
        }

        const user = userResult.rows[0];
        if (isPermanentlyDeactivatedUser(user)) {
            return res.status(403).json({ success: false, message: PERMANENT_DEACTIVATION_MESSAGE });
        }
        if (isSelfDeletedUser(user)) {
            return res.status(404).json({ success: false, message: 'Profile not found' });
        }

        const recentResult = await pool.query(
            `SELECT COUNT(*)::int AS count
             FROM password_reset_otps
             WHERE email = $1
               AND created_at >= NOW() - INTERVAL '10 minutes'`,
            [email]
        );
        if (Number(recentResult.rows[0]?.count || 0) >= 5) {
            return res.status(429).json({ success: false, message: 'Too many OTP requests. Please wait and try again.' });
        }

        const otp = generateResetOtp();
        const otpHash = hashResetValue(otp);
        const ttlMinutes = Number.isFinite(PASSWORD_RESET_OTP_TTL_MINUTES) ? PASSWORD_RESET_OTP_TTL_MINUTES : 10;

        await pool.query(
            `INSERT INTO password_reset_otps (user_id, email, otp_hash, expires_at, requested_ip, user_agent)
             VALUES ($1, $2, $3, NOW() + ($4::text || ' minutes')::interval, $5, $6)`,
            [user.id, email, otpHash, ttlMinutes, req.ip || null, req.get('user-agent') || null]
        );

        await sendPasswordResetOtpEmail({
            email: user.email || email,
            otp,
            fullName: user.full_name || user.username,
        });

        res.status(200).json({
            success: true,
            message: 'OTP sent to registered email',
            expiresInMinutes: ttlMinutes,
            ...(process.env.NODE_ENV !== 'production' && process.env.PASSWORD_RESET_DEBUG_OTP === 'true' ? { debugOtp: otp } : {}),
        });
    } catch (error) {
        console.error('Request password reset OTP error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Server error sending password reset OTP',
        });
    }
};

exports.verifyPasswordResetOtp = async (req, res) => {
    try {
        const email = normalizeResetEmail(req.body?.email);
        const otp = String(req.body?.otp || '').trim();
        if (!email || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: 'Valid email and 6-digit OTP are required' });
        }

        await ensurePasswordResetOtpTable();

        const otpHash = hashResetValue(otp);
        const result = await pool.query(
            `SELECT id, user_id
             FROM password_reset_otps
             WHERE email = $1
               AND otp_hash = $2
               AND used_at IS NULL
               AND expires_at > NOW()
             ORDER BY created_at DESC
             LIMIT 1`,
            [email, otpHash]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = hashResetValue(resetToken);
        const verifyTtlMinutes = Number.isFinite(PASSWORD_RESET_VERIFY_TTL_MINUTES) ? PASSWORD_RESET_VERIFY_TTL_MINUTES : 15;

        await pool.query(
            `UPDATE password_reset_otps
             SET verified_at = NOW(),
                 verify_token_hash = $1,
                 expires_at = NOW() + ($2::text || ' minutes')::interval
             WHERE id = $3`,
            [resetTokenHash, verifyTtlMinutes, result.rows[0].id]
        );

        res.status(200).json({
            success: true,
            message: 'OTP verified',
            resetToken,
            expiresInMinutes: verifyTtlMinutes,
        });
    } catch (error) {
        console.error('Verify password reset OTP error:', error);
        res.status(500).json({ success: false, message: 'Server error verifying password reset OTP' });
    }
};

exports.resetPasswordWithOtp = async (req, res) => {
    const client = await pool.connect();
    try {
        const email = normalizeResetEmail(req.body?.email);
        const resetToken = String(req.body?.resetToken || '').trim();
        const newPassword = String(req.body?.newPassword || '');

        if (!email || !resetToken || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email, reset token, and new password are required' });
        }

        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.valid) {
            return res.status(400).json({ success: false, message: passwordValidation.message });
        }

        await ensurePasswordResetOtpTable();
        await client.query('BEGIN');

        const resetResult = await client.query(
            `SELECT id, user_id
             FROM password_reset_otps
             WHERE email = $1
               AND verify_token_hash = $2
               AND verified_at IS NOT NULL
               AND used_at IS NULL
               AND expires_at > NOW()
             ORDER BY verified_at DESC
             LIMIT 1
             FOR UPDATE`,
            [email, hashResetValue(resetToken)]
        );

        if (resetResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Invalid or expired reset session' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        const userId = resetResult.rows[0].user_id;

        await client.query(
            `UPDATE users
             SET password = $1,
                 token_version = COALESCE(token_version, 0) + 1
             WHERE id = $2`,
            [hashedPassword, userId]
        );

        await client.query(
            `UPDATE password_reset_otps
             SET used_at = NOW()
             WHERE user_id = $1 AND used_at IS NULL`,
            [userId]
        );

        await client.query('COMMIT');
        res.status(200).json({ success: true, message: 'Password reset successfully. Please login with your new password.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Reset password with OTP error:', error);
        res.status(500).json({ success: false, message: 'Server error resetting password' });
    } finally {
        client.release();
    }
};

// Verify user password
exports.verifyPassword = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required' });
        }

        const user = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
        if (user.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.rows[0].password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect password' });
        }

        res.status(200).json({ success: true, message: 'Password verified' });
    } catch (error) {
        console.error('Verify password error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

// Get public profile of any user
exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const authUser = getOptionalAuthUser(req);
        await ensureGoogerIdNormalization();
        await ensureSubscriptionsTable();
        await ensureExtendedUserProfileSchema();
        await ensureUserBlocksTable();
        const includeShippingAddress = await hasUsersTableColumn('shipping_address');
        const publicColumns = [
            'id',
            'user_id',
            'username',
            'full_name',
            'first_name',
            'last_name',
            'profile_picture',
            'bio',
            'user_type',
            'created_at',
            'email',
            'contact_email',
            'phone_number',
            'country',
            'province',
            'date_of_birth',
            'gender',
            'relationship_status',
            'who_can_follow_me',
            'who_can_see_activity',
            'contact_email_visibility',
            'contact_phone_visibility'
        ];
        if (includeShippingAddress) {
            publicColumns.push('shipping_address');
        }
        const result = await pool.query(
            `SELECT ${publicColumns.join(', ')}
             FROM users
             WHERE id = $1
               AND COALESCE(is_deactivated, false) = false
               AND COALESCE(status, 'Active') <> 'Deactivated'`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = result.rows[0];
        const isOwner = Number(authUser?.id) === Number(user.id);
        user.subscriber_count = await getSubscriberCount(user.id);
        user.is_subscribed = await getSubscribedStatus(authUser?.id, user.id);
        user.profile_views_count = await getProfileViewCount(user.id);
        user.following_count = await getFollowingCount(user.id);
        user.blocked_count = await getBlockedCount(user.id);
        user.contact_email = isOwner || user.contact_email_visibility !== 'only_me' ? (user.contact_email || null) : null;
        user.contact_phone = isOwner || user.contact_phone_visibility !== 'only_me'
            ? (user.phone_number || user.shipping_address?.phone || user.shipping_address?.phone2 || null)
            : null;
        if (!isOwner) {
            user.email = null;
        }

        const limits = await getUserPlanLimits(user.id);
        user.verified_tick = limits.verifiedTick;

        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        console.error('getUserById error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get current user profile
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`[AUTH] Fetching profile for ID: ${userId}`);
        await ensureGoogerIdNormalization();
        await ensureSubscriptionsTable();
        await ensureProfileViewsTable();
        await ensureExtendedUserProfileSchema();
        await ensureSuspensionColumns();
        await ensureUserBlocksTable();

        const includeShippingAddress = await hasUsersTableColumn('shipping_address');
        const profileColumns = [
            'id',
            'user_id',
            'username',
            'full_name',
            'first_name',
            'last_name',
            'email',
            'contact_email',
            'profile_picture',
            'bio',
            'phone_number',
            'country',
            'province',
            'date_of_birth',
            'gender',
            'relationship_status',
            'who_can_follow_me',
            'who_can_see_activity',
            'contact_email_visibility',
            'contact_phone_visibility',
            'referral_code',
            'wallet_balance',
            'user_type',
            'is_deactivated',
            'deactivation_reason',
            'suspension_reason_category',
            'suspension_reason_custom',
            'suspension_action',
            'suspension_days',
            'suspended_at',
            'suspension_ends_at',
            'appeal_text',
            'appeal_status',
            'appeal_submitted_at',
            'appeal_reviewed_at',
            'appeal_admin_note',
            'suspended_wallet_access',
            'created_at'
        ];

        if (includeShippingAddress) {
            profileColumns.push('shipping_address');
        }

        const user = await pool.query(
            `SELECT ${profileColumns.join(', ')} FROM users WHERE id = $1`,
            [userId]
        );

        if (user.rows.length === 0) {
            console.warn(`[AUTH] Profile fetch failed: User with ID ${req.user.id} not found`);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let userData = user.rows[0];
        console.log(`[DEBUG] Processing profile for ${userData.username}`);

        try {
            // Auto-generate referral code for old users if missing
            if (!userData.referral_code) {
                const cleanName = (userData.username || 'USR').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
                const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
                const newCode = `REF-${cleanName}-${randomStr}`;

                await pool.query(
                    'UPDATE users SET referral_code = $1 WHERE id = $2',
                    [newCode, userData.id]
                );
                userData.referral_code = newCode;
                console.log(`Generated referral code for ${userData.username}: ${newCode}`);
            }
        } catch (refError) {
            console.error('[AUTH] Referral generation error:', refError.message);
            // Non-critical, continue
        }

        // Ensure balance is a number and always included
        const balance = parseFloat(userData.wallet_balance || 0);
        userData.wallet_balance = balance;
        userData.balance = balance;
        userData.subscriber_count = await getSubscriberCount(userData.id);
        userData.is_subscribed = await getSubscribedStatus(req.user.id, userData.id);
        userData.profile_views_count = await getProfileViewCount(userData.id);
        userData.following_count = await getFollowingCount(userData.id);
        userData.blocked_count = await getBlockedCount(userData.id);
        userData.contact_email = userData.contact_email || null;
        userData.contact_phone = userData.phone_number || userData.shipping_address?.phone || userData.shipping_address?.phone2 || null;

        const limits = await getUserPlanLimits(userData.id);
        userData.verified_tick = limits.verifiedTick;

        res.status(200).json({
            success: true,
            user: userData
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: `Server error fetching profile: ${error.message}`,
            error: error.message
        });
    }
};

exports.getMySuspension = async (req, res) => {
    try {
        await ensureSuspensionColumns();
        const result = await pool.query(
            `SELECT id, username, full_name, is_deactivated, deactivation_reason,
                    suspension_reason_category, suspension_reason_custom, suspension_action,
                    suspension_days, suspended_at, self_deactivated_at, suspension_ends_at,
                    appeal_text, appeal_status, appeal_submitted_at, appeal_reviewed_at, appeal_admin_note,
                    appeal_id, appeal_contact_email, appeal_phone_number, appeal_agreement_confirmed,
                    suspended_wallet_access
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, suspension: result.rows[0] });
    } catch (error) {
        console.error('Get suspension error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching suspension' });
    }
};

exports.submitSuspensionAppeal = async (req, res) => {
    try {
        await ensureSuspensionColumns();
        const appealText = String(req.body?.appeal || '').trim();
        const contactEmail = String(req.body?.contactEmail || '').trim();
        const phoneNumber = String(req.body?.phoneNumber || '').trim();
        const agreementConfirmed = Boolean(req.body?.agreementConfirmed);
        if (!appealText) return res.status(400).json({ success: false, message: 'Appeal message is required' });
        if (appealText.length > 2000) return res.status(400).json({ success: false, message: 'Appeal must be 2000 characters or less' });
        if (!contactEmail) return res.status(400).json({ success: false, message: 'Contact email is required' });
        if (!phoneNumber) return res.status(400).json({ success: false, message: 'Phone number is required' });
        if (!agreementConfirmed) return res.status(400).json({ success: false, message: 'Please confirm the user agreement' });

        const current = await pool.query(
            `SELECT is_deactivated, appeal_status FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (!current.rows.length) return res.status(404).json({ success: false, message: 'User not found' });
        if (!current.rows[0].is_deactivated) return res.status(400).json({ success: false, message: 'Account is not suspended' });
        if (current.rows[0].appeal_status === 'pending') return res.status(409).json({ success: false, message: 'Appeal already submitted and pending review' });

        let result;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const appealId = generateAppealId();
            try {
                result = await pool.query(
                    `UPDATE users
                     SET appeal_text = $1,
                         appeal_status = 'pending',
                         appeal_submitted_at = NOW(),
                         appeal_reviewed_at = NULL,
                         appeal_admin_note = NULL,
                         appeal_id = $2,
                         appeal_contact_email = $3,
                         appeal_phone_number = $4,
                         appeal_agreement_confirmed = $5
                     WHERE id = $6
                       AND NOT EXISTS (
                           SELECT 1 FROM users existing
                           WHERE existing.appeal_id = $2 AND existing.id <> $6
                       )
                     RETURNING id, is_deactivated, deactivation_reason, suspension_reason_category,
                               suspension_action, suspension_days, suspension_ends_at,
                               appeal_text, appeal_status, appeal_submitted_at, appeal_reviewed_at, appeal_admin_note,
                               appeal_id, appeal_contact_email, appeal_phone_number, appeal_agreement_confirmed,
                               suspended_wallet_access`,
                    [appealText, appealId, contactEmail, phoneNumber, agreementConfirmed, req.user.id]
                );
                if (result.rows.length) break;
            } catch (error) {
                if (attempt === 4) throw error;
            }
        }
        if (!result?.rows?.length) return res.status(500).json({ success: false, message: 'Failed to generate appeal ID' });
        res.json({ success: true, suspension: result.rows[0] });
    } catch (error) {
        console.error('Submit suspension appeal error:', error);
        res.status(500).json({ success: false, message: 'Server error submitting appeal' });
    }
};

exports.selfDeactivateAccount = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureSuspensionColumns();
        await client.query('BEGIN');

        const pausedAdsCount = await pauseActiveAdsForUser(client, req.user.id);
        const result = await client.query(
            `UPDATE users
             SET is_deactivated = true,
                 status = 'Deactivated',
                 marked_for_deletion_at = NULL,
                 self_deactivated_at = NOW(),
                 deactivation_reason = 'Self Deactivated',
                 suspension_reason_category = 'Self Deactivated',
                 suspension_reason_custom = NULL,
                 suspension_action = 'Self Deactivated',
                 suspension_days = NULL,
                 suspended_at = NOW(),
                 suspension_ends_at = NULL,
                 suspended_wallet_access = false,
                 appeal_text = NULL,
                 appeal_status = NULL,
                 appeal_submitted_at = NULL,
                 appeal_reviewed_at = NULL,
                 appeal_admin_note = NULL,
                 appeal_id = NULL,
                 appeal_contact_email = NULL,
                 appeal_phone_number = NULL,
                 appeal_agreement_confirmed = false
             WHERE id = $1
             RETURNING id, username, full_name, is_deactivated, status, self_deactivated_at, deactivation_reason`,
            [req.user.id]
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        await client.query('COMMIT');
        res.json({ success: true, paused_ads_count: pausedAdsCount, user: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Self deactivate account error:', error);
        res.status(500).json({ success: false, message: 'Server error deactivating account' });
    } finally {
        client.release();
    }
};

exports.selfDeleteAccount = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureSuspensionColumns();
        await client.query('BEGIN');

        const pausedAdsCount = await pauseActiveAdsForUser(client, req.user.id);
        const result = await client.query(
            `UPDATE users
             SET is_deactivated = true,
                 status = 'Deleted',
                 marked_for_deletion_at = NULL,
                 self_deactivated_at = NULL,
                 self_deleted_at = NOW(),
                 deactivation_reason = 'User Deleted Account',
                 suspension_reason_category = 'User Deleted Account',
                 suspension_reason_custom = NULL,
                 suspension_action = 'User Deleted Account',
                 suspension_days = NULL,
                 suspended_at = NOW(),
                 suspension_ends_at = NULL,
                 suspended_wallet_access = false,
                 appeal_text = NULL,
                 appeal_status = NULL,
                 appeal_submitted_at = NULL,
                 appeal_reviewed_at = NULL,
                 appeal_admin_note = NULL,
                 appeal_id = NULL,
                 appeal_contact_email = NULL,
                 appeal_phone_number = NULL,
                 appeal_agreement_confirmed = false
             WHERE id = $1
             RETURNING id, username, full_name, email, phone_number, is_deactivated, status, self_deleted_at`,
            [req.user.id]
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        await client.query('COMMIT');
        res.json({ success: true, paused_ads_count: pausedAdsCount, user: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Self delete account error:', error);
        res.status(500).json({ success: false, message: 'Server error deleting account' });
    } finally {
        client.release();
    }
};

// Update user profile
exports.updateProfile = async (req, res) => {
    try {
        await ensureProfilePictureColumnSupportsUploads();
        await ensureExtendedUserProfileSchema();

        const {
            username,
            firstName,
            lastName,
            fullName,
            email,
            contactEmail,
            bio,
            profilePicture,
            shippingAddress,
            phoneNumber,
            country,
            province,
            dateOfBirth,
            gender,
            relationshipStatus,
            whoCanFollowMe,
            whoCanSeeActivity,
            contactEmailVisibility,
            contactPhoneVisibility
        } = req.body;
        let finalProfilePicture = profilePicture;
        const includeShippingAddress = await hasUsersTableColumn('shipping_address');

        if (req.file) {
            finalProfilePicture = await saveUploadedFile(req.file, 'profiles');
        }

        const normalizedFirstName = typeof firstName === 'string' ? firstName.trim() : null;
        const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : null;
        const normalizedFullName = typeof fullName === 'string' && fullName.trim()
            ? fullName.trim()
            : [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ').trim() || null;

        if (username) {
            const normalizedUsername = username.trim().toLowerCase();
            const existingUsername = await pool.query(
                'SELECT id FROM users WHERE LOWER(username) = $1 AND id <> $2 LIMIT 1',
                [normalizedUsername, req.user.id]
            );
            if (existingUsername.rows.length > 0) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }
        }

        if (email) {
            const existingEmail = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1',
                [email.trim(), req.user.id]
            );
            if (existingEmail.rows.length > 0) {
                return res.status(400).json({ success: false, message: 'Email already registered' });
            }
        }

        const queryParts = [
            'UPDATE users',
            'SET username = COALESCE($1, username),',
            'first_name = COALESCE($2, first_name),',
            'last_name = COALESCE($3, last_name),',
            'full_name = COALESCE($4, full_name),',
            'email = COALESCE($5, email),',
            'contact_email = COALESCE($6, contact_email),',
            'bio = COALESCE($7, bio),',
            'profile_picture = COALESCE($8, profile_picture),',
            'phone_number = COALESCE($9, phone_number),',
            'country = COALESCE($10, country),',
            'province = COALESCE($11, province),',
            'date_of_birth = COALESCE($12, date_of_birth),',
            'gender = COALESCE($13, gender),',
            'relationship_status = COALESCE($14, relationship_status),',
            'who_can_follow_me = COALESCE($15, who_can_follow_me),',
            'who_can_see_activity = COALESCE($16, who_can_see_activity),',
            'contact_email_visibility = COALESCE($17, contact_email_visibility),',
            'contact_phone_visibility = COALESCE($18, contact_phone_visibility)'
        ];

        const values = [
            username ? username.trim().toLowerCase() : null,
            normalizedFirstName,
            normalizedLastName,
            normalizedFullName,
            email ? email.trim() : null,
            contactEmail ? contactEmail.trim() : null,
            bio,
            finalProfilePicture,
            phoneNumber ? phoneNumber.trim() : null,
            country ? country.trim() : null,
            province ? province.trim() : null,
            dateOfBirth || null,
            gender || null,
            relationshipStatus || null,
            whoCanFollowMe || null,
            whoCanSeeActivity || null,
            contactEmailVisibility || null,
            contactPhoneVisibility || null
        ];
        let whereParamIndex = 19;
        let returningColumns = 'id, user_id, username, first_name, last_name, full_name, email, contact_email, profile_picture, bio, phone_number, country, province, date_of_birth, gender, relationship_status, who_can_follow_me, who_can_see_activity, contact_email_visibility, contact_phone_visibility';

        if (includeShippingAddress) {
            queryParts.push(', shipping_address = COALESCE($19, shipping_address)');
            values.push(shippingAddress ? JSON.stringify(shippingAddress) : null);
            returningColumns += ', shipping_address';
            whereParamIndex = 20;
        }

        queryParts.push(`WHERE id = $${whereParamIndex}`);
        queryParts.push(`RETURNING ${returningColumns}`);
        values.push(req.user.id);

        const result = await pool.query(queryParts.join(' '), values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Server error updating profile.' });
    }
};

// Update shipping address only
exports.updateShippingAddress = async (req, res) => {
    try {
        const { shippingAddress } = req.body;

        if (!shippingAddress) {
            return res.status(400).json({ success: false, message: 'Shipping address is required' });
        }

        const result = await pool.query(
            'UPDATE users SET shipping_address = $1 WHERE id = $2 RETURNING shipping_address',
            [JSON.stringify(shippingAddress), req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Shipping address updated successfully',
            shippingAddress: result.rows[0].shipping_address
        });
    } catch (error) {
        console.error('Update shipping address error:', error);
        res.status(500).json({ success: false, message: 'Server error updating shipping address' });
    }
};

// Get Wallet Data (Referrals)
exports.getWallet = async (req, res) => {
    try {
        const userId = req.user.id;
        await ensureReferralRelationshipsTable();
        await ensureReferralCommissionTables(pool);
        const includeReferrals = ['1', 'true', 'yes'].includes(String(req.query.include_referrals || '').toLowerCase());
        const requestedPage = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
        const requestedLimit = Math.max(1, Math.min(200, Number.parseInt(String(req.query.limit || '50'), 10) || 50));

        const levelSettings = await pool.query(
            `SELECT level, name, commission_percentage, is_active, sort_order
             FROM referral_level_settings
             ORDER BY sort_order ASC, level ASC`
        );
        const maxConfiguredLevel = levelSettings.rows.reduce((max, row) => {
            const level = Number(row.level || 0);
            return Number.isFinite(level) && level > max ? level : max;
        }, 0);
        const maxReferralLevel = Math.max(5, maxConfiguredLevel);
        const detailOffset = (requestedPage - 1) * requestedLimit;

        const walletSummary = await pool.query(
            `WITH RECURSIVE referral_tree AS (
                SELECT
                    rr.id,
                    rr.user_id,
                    rr.referred_by,
                    rr.referral_code_used,
                    rr.level AS stored_level,
                    rr.commission_percentage AS stored_commission_percentage,
                    rr.created_at,
                    1 AS level
                FROM referral_relationships rr
                WHERE rr.referred_by = $1

                UNION ALL

                SELECT
                    child.id,
                    child.user_id,
                    child.referred_by,
                    child.referral_code_used,
                    child.level AS stored_level,
                    child.commission_percentage AS stored_commission_percentage,
                    child.created_at,
                    parent.level + 1 AS level
                FROM referral_relationships child
                JOIN referral_tree parent ON child.referred_by = parent.user_id
                WHERE parent.level < $2
            ),
            payout_totals AS (
                SELECT
                    buyer_id AS referred_user_id,
                    SUM(amount)::numeric AS earned_amount
                FROM referral_commission_payouts
                WHERE earner_id = $1
                  AND source_type IN ('wallet_discount', 'product_discount', 'ad_coin')
                GROUP BY buyer_id
            )
            SELECT
                COUNT(*)::int AS total_referrals,
                COALESCE(SUM(COALESCE(pt.earned_amount, 0)), 0)::numeric AS total_earned,
                COALESCE(
                    jsonb_object_agg(level_key, level_count)
                    FILTER (WHERE level_key IS NOT NULL),
                    '{}'::jsonb
                ) AS level_counts
            FROM (
                SELECT
                    rt.user_id,
                    CONCAT('level', rt.level) AS level_key,
                    COUNT(*) OVER (PARTITION BY rt.level)::int AS level_count
                FROM referral_tree rt
            ) rt_stats
            LEFT JOIN payout_totals pt
              ON pt.referred_user_id = rt_stats.user_id`,
            [userId, maxReferralLevel]
        );

        let referrals = [];
        let pagination = {
            page: 1,
            limit: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
        };

        if (includeReferrals) {
            const walletData = await pool.query(
                `WITH RECURSIVE referral_tree AS (
                    SELECT
                        rr.id,
                        rr.user_id,
                        rr.referred_by,
                        rr.referral_code_used,
                        rr.level AS stored_level,
                        rr.commission_percentage AS stored_commission_percentage,
                        rr.created_at,
                        1 AS level
                    FROM referral_relationships rr
                    WHERE rr.referred_by = $1

                    UNION ALL

                    SELECT
                        child.id,
                        child.user_id,
                        child.referred_by,
                        child.referral_code_used,
                        child.level AS stored_level,
                        child.commission_percentage AS stored_commission_percentage,
                        child.created_at,
                        parent.level + 1 AS level
                    FROM referral_relationships child
                    JOIN referral_tree parent ON child.referred_by = parent.user_id
                    WHERE parent.level < $2
                ),
                payout_totals AS (
                    SELECT
                        buyer_id AS referred_user_id,
                        SUM(amount)::numeric AS earned_amount
                    FROM referral_commission_payouts
                    WHERE earner_id = $1
                      AND source_type IN ('wallet_discount', 'product_discount', 'ad_coin')
                    GROUP BY buyer_id
                )
                SELECT
                    rt.level,
                    rt.stored_level,
                    rt.referral_code_used,
                    rt.created_at,
                    rt.referred_by,
                    parent.full_name AS referred_by_full_name,
                    parent.username AS referred_by_username,
                    u.id AS referred_user_id,
                    u.user_id AS referred_readable_id,
                    u.full_name AS referred_full_name,
                    u.username AS referred_username,
                    u.profile_picture AS referred_profile_picture,
                    COALESCE(rt.stored_commission_percentage, rls.commission_percentage, 0)::numeric AS commission_percentage,
                    COALESCE(pt.earned_amount, 0)::numeric AS amount
                 FROM referral_tree rt
                 JOIN users u ON rt.user_id = u.id
                 LEFT JOIN users parent ON rt.referred_by = parent.id
                  LEFT JOIN referral_level_settings rls
                     ON rls.level = COALESCE(rt.stored_level, rt.level)
                    AND rls.is_active = TRUE
                  LEFT JOIN payout_totals pt
                    ON pt.referred_user_id = u.id
                  ORDER BY rt.level ASC, rt.created_at DESC
                  LIMIT $3 OFFSET $4`,
                [userId, maxReferralLevel, requestedLimit, detailOffset]
            );
            referrals = walletData.rows;
            const totalReferrals = Number(walletSummary.rows[0]?.total_referrals || 0);
            const totalPages = totalReferrals > 0 ? Math.ceil(totalReferrals / requestedLimit) : 0;
            pagination = {
                page: requestedPage,
                limit: requestedLimit,
                totalPages,
                hasNextPage: totalPages > requestedPage,
                hasPrevPage: requestedPage > 1,
            };
        }

        const totalReferrals = Number(walletSummary.rows[0]?.total_referrals || 0);
        const totalEarned = Number(walletSummary.rows[0]?.total_earned || 0);
        const levelCounts = walletSummary.rows[0]?.level_counts || {};

        res.status(200).json({
            success: true,
            totalReferrals,
            totalEarned: totalEarned.toFixed(2),
            levelCounts,
            levelSettings: levelSettings.rows,
            referrals,
            referralsIncluded: includeReferrals,
            pagination,
        });
        return;
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Server error fetching user' });
    }
};

exports.getUserByUsername = async (req, res) => {
    try {
        const { username } = req.params;
        const authUser = getOptionalAuthUser(req);
        await ensureGoogerIdNormalization();
        await ensureSubscriptionsTable();
        await ensureExtendedUserProfileSchema();
        await ensureUserBlocksTable();
        const includeShippingAddress = await hasUsersTableColumn('shipping_address');
        const publicColumns = [
            'id',
            'user_id',
            'username',
            'full_name',
            'first_name',
            'last_name',
            'profile_picture',
            'bio',
            'user_type',
            'created_at',
            'email',
            'contact_email',
            'phone_number',
            'country',
            'province',
            'date_of_birth',
            'gender',
            'relationship_status',
            'who_can_follow_me',
            'who_can_see_activity',
            'contact_email_visibility',
            'contact_phone_visibility'
        ];
        if (includeShippingAddress) {
            publicColumns.push('shipping_address');
        }

        const result = await pool.query(
            `SELECT ${publicColumns.join(', ')}
             FROM users
             WHERE LOWER(username) = LOWER($1)
               AND COALESCE(is_deactivated, false) = false
               AND COALESCE(status, 'Active') <> 'Deactivated'
             LIMIT 1`,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = result.rows[0];
        const isOwner = Number(authUser?.id) === Number(user.id);
        user.subscriber_count = await getSubscriberCount(user.id);
        user.is_subscribed = await getSubscribedStatus(authUser?.id, user.id);
        user.profile_views_count = await getProfileViewCount(user.id);
        user.following_count = await getFollowingCount(user.id);
        user.blocked_count = await getBlockedCount(user.id);
        user.contact_email = isOwner || user.contact_email_visibility !== 'only_me' ? (user.contact_email || null) : null;
        user.contact_phone = isOwner || user.contact_phone_visibility !== 'only_me'
            ? (user.phone_number || user.shipping_address?.phone || user.shipping_address?.phone2 || null)
            : null;
        if (!isOwner) {
            user.email = null;
        }

        const limits = await getUserPlanLimits(user.id);
        user.verified_tick = limits.verifiedTick;

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error('Error fetching user by username:', error);
        res.status(500).json({ success: false, message: 'Server error fetching user' });
    }
};

exports.getSubscriptionStatus = async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Invalid user id' });
        }

        const authUser = getOptionalAuthUser(req);
        const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const subscriberCount = await getSubscriberCount(targetUserId);
        const isSubscribed = await getSubscribedStatus(authUser?.id, targetUserId);

        res.status(200).json({
            success: true,
            subscriberCount,
            isSubscribed
        });
    } catch (error) {
        console.error('Get subscription status error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching subscription status' });
    }
};

exports.getFollowingUsers = async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Invalid user id' });
        }

        await ensureSubscriptionsTable();
        const result = await pool.query(
            `SELECT
                u.id,
                u.user_id,
                u.username,
                u.full_name,
                u.user_type,
                u.profile_picture,
                u.bio,
                us.created_at AS subscribed_at
             FROM user_subscriptions us
             JOIN users u ON u.id = us.subscribed_to_id
             WHERE us.subscriber_id = $1
             ORDER BY us.created_at DESC`,
            [targetUserId]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Get following users error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching following users' });
    }
};

exports.getFollowerUsers = async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Invalid user id' });
        }

        await ensureSubscriptionsTable();
        const result = await pool.query(
            `SELECT
                u.id,
                u.user_id,
                u.username,
                u.full_name,
                u.user_type,
                u.profile_picture,
                u.bio,
                us.created_at AS followed_at
             FROM user_subscriptions us
             JOIN users u ON u.id = us.subscriber_id
             WHERE us.subscribed_to_id = $1
             ORDER BY us.created_at DESC`,
            [targetUserId]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Get follower users error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching followers' });
    }
};

exports.checkUsernameAvailability = async (req, res) => {
    try {
        const rawUsername = typeof req.query.username === 'string' ? req.query.username.trim() : '';
        if (!rawUsername) {
            return res.status(400).json({ success: false, message: 'Username is required' });
        }

        const existingUsername = await pool.query(
            'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1',
            [rawUsername, req.user.id]
        );

        res.status(200).json({
            success: true,
            available: existingUsername.rows.length === 0
        });
    } catch (error) {
        console.error('Check username availability error:', error);
        res.status(500).json({ success: false, message: 'Server error checking username' });
    }
};

exports.getBlockedUsers = async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Invalid user id' });
        }

        await ensureUserBlocksTable();
        const result = await pool.query(
            `SELECT
                u.id,
                u.user_id,
                u.username,
                u.full_name,
                u.user_type,
                u.profile_picture,
                u.bio,
                ub.created_at AS blocked_at
             FROM user_blocks ub
             JOIN users u ON u.id = ub.blocked_user_id
             WHERE ub.blocker_id = $1
             ORDER BY ub.created_at DESC`,
            [targetUserId]
        );

        res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        console.error('Get blocked users error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching blocked users' });
    }
};

exports.toggleBlockUser = async (req, res) => {
    try {
        const blockerId = req.user.id;
        const blockedUserId = Number(req.params.id);
        if (!blockedUserId || blockedUserId === blockerId) {
            return res.status(400).json({ success: false, message: 'Invalid target' });
        }
        await ensureUserBlocksTable();
        const existing = await pool.query(
            'SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_user_id = $2',
            [blockerId, blockedUserId]
        );
        if (existing.rows.length) {
            await pool.query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_user_id = $2', [blockerId, blockedUserId]);
            return res.status(200).json({ success: true, blocked: false, message: 'User unblocked' });
        } else {
            await pool.query('INSERT INTO user_blocks (blocker_id, blocked_user_id) VALUES ($1, $2)', [blockerId, blockedUserId]);
            return res.status(200).json({ success: true, blocked: true, message: 'User blocked' });
        }
    } catch (error) {
        console.error('Toggle block error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }

        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.valid) {
            return res.status(400).json({ success: false, message: passwordValidation.message });
        }

        const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, userResult.rows[0].password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await pool.query(
            'UPDATE users SET password = $1, token_version = COALESCE(token_version, 0) + 1 WHERE id = $2',
            [hashedPassword, req.user.id]
        );

        res.status(200).json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, message: 'Server error changing password' });
    }
};

exports.logProfileView = async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Invalid user id' });
        }

        let viewerUserId = req.user?.id || null;
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        await ensureProfileViewsTable();

        if (!viewerUserId) {
            const authUser = getOptionalAuthUser(req);
            viewerUserId = authUser?.id || null;
        }

        if (viewerUserId && Number(viewerUserId) === targetUserId) {
            const profileViewsCount = await getProfileViewCount(targetUserId);
            return res.status(200).json({ success: true, incremented: false, profileViewsCount });
        }

        const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let existingView;
        if (viewerUserId) {
            existingView = await pool.query(
                'SELECT last_viewed_at FROM profile_views WHERE profile_user_id = $1 AND viewer_user_id = $2 LIMIT 1',
                [targetUserId, viewerUserId]
            );
        } else {
            existingView = await pool.query(
                'SELECT last_viewed_at FROM profile_views WHERE profile_user_id = $1 AND ip_address = $2 AND viewer_user_id IS NULL LIMIT 1',
                [targetUserId, ipAddress]
            );
        }

        const now = new Date();
        let shouldIncrement = false;

        if (existingView.rows.length === 0) {
            if (viewerUserId) {
                await pool.query(
                    'INSERT INTO profile_views (profile_user_id, viewer_user_id, ip_address, last_viewed_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
                    [targetUserId, viewerUserId, ipAddress]
                );
            } else {
                await pool.query(
                    'INSERT INTO profile_views (profile_user_id, ip_address, last_viewed_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
                    [targetUserId, ipAddress]
                );
            }
            shouldIncrement = true;
        } else {
            const lastViewed = new Date(existingView.rows[0].last_viewed_at);
            const diffInHours = (now - lastViewed) / (1000 * 60 * 60);
            if (diffInHours >= 24) {
                if (viewerUserId) {
                    await pool.query(
                        'UPDATE profile_views SET last_viewed_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE profile_user_id = $2 AND viewer_user_id = $3',
                        [ipAddress, targetUserId, viewerUserId]
                    );
                } else {
                    await pool.query(
                        'UPDATE profile_views SET last_viewed_at = CURRENT_TIMESTAMP WHERE profile_user_id = $1 AND ip_address = $2 AND viewer_user_id IS NULL',
                        [targetUserId, ipAddress]
                    );
                }
                shouldIncrement = true;
            }
        }

        const profileViewsCount = await getProfileViewCount(targetUserId);
        res.status(200).json({ success: true, incremented: shouldIncrement, profileViewsCount });
    } catch (error) {
        console.error('Log profile view error:', error);
        res.status(500).json({ success: false, message: 'Server error logging profile view' });
    }
};

exports.getProfileViews = async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Invalid user id' });
        }

        const count = await getProfileViewCount(targetUserId);
        res.status(200).json({ success: true, profileViewsCount: count });
    } catch (error) {
        console.error('Get profile views error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching profile views' });
    }
};

exports.toggleSubscription = async (req, res) => {
    const targetUserId = Number(req.params.id);
    const subscriberId = req.user.id;

    if (!targetUserId) {
        return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const client = await pool.connect();
    try {
        await ensureSubscriptionsTable();
        await client.query('BEGIN');

        const targetUser = await client.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
        if (targetUser.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const existing = await client.query(
            `SELECT id
             FROM user_subscriptions
             WHERE subscriber_id = $1 AND subscribed_to_id = $2
             LIMIT 1`,
            [subscriberId, targetUserId]
        );

        let isSubscribed = false;
        if (existing.rows.length > 0) {
            await client.query(
                'DELETE FROM user_subscriptions WHERE subscriber_id = $1 AND subscribed_to_id = $2',
                [subscriberId, targetUserId]
            );
        } else {
            await client.query(
                'INSERT INTO user_subscriptions (subscriber_id, subscribed_to_id) VALUES ($1, $2)',
                [subscriberId, targetUserId]
            );
            isSubscribed = true;
        }

        const countResult = await client.query(
            'SELECT COUNT(*)::int AS count FROM user_subscriptions WHERE subscribed_to_id = $1',
            [targetUserId]
        );

        await client.query('COMMIT');

        res.status(200).json({
            success: true,
            isSubscribed,
            subscriberCount: countResult.rows[0]?.count || 0
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Toggle subscription error:', error);
        res.status(500).json({ success: false, message: 'Server error updating subscription' });
    } finally {
        client.release();
    }
};

exports.reportUser = async (req, res) => {
    try {
        const reportedUserId = Number(req.params.id);
        const reporterId = req.user.id;
        const { reason, custom_reason } = req.body;

        if (!reportedUserId || reportedUserId === reporterId) {
            return res.status(400).json({ success: false, message: 'Invalid report target' });
        }
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Reason is required' });
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_reports (
                id SERIAL PRIMARY KEY,
                reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                reason VARCHAR(100) NOT NULL,
                custom_reason TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(reported_user_id, reporter_id)
            )
        `);

        const existing = await pool.query(
            'SELECT 1 FROM user_reports WHERE reported_user_id = $1 AND reporter_id = $2',
            [reportedUserId, reporterId]
        );
        if (existing.rows.length) {
            return res.status(400).json({ success: false, message: 'You have already reported this user' });
        }

        await pool.query(
            'INSERT INTO user_reports (reported_user_id, reporter_id, reason, custom_reason) VALUES ($1, $2, $3, $4)',
            [reportedUserId, reporterId, reason, custom_reason || null]
        );

        res.status(201).json({ success: true, message: 'Report submitted successfully' });
    } catch (error) {
        console.error('Report user error:', error);
        res.status(500).json({ success: false, message: 'Server error submitting report' });
    }
};
