const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { saveUploadedFile } = require('../utils/localUpload');
const { getUserPlanLimits } = require('../utils/planLimits');

let usersTableHasShippingAddressColumn = null;
let subscriptionsTableEnsured = false;
let profileViewsTableEnsured = false;
let profilePictureColumnEnsured = false;
let extendedUserProfileSchemaEnsured = false;
let userBlocksTableEnsured = false;
let googerIdNormalizationPromise = null;

const GOOGER_ID_MIN = 100000;
const GOOGER_ID_MAX = 999999;

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

            // Insert new user
            const newUser = await client.query(
                `INSERT INTO users (user_id, username, full_name, email, password, user_type, referral_code, wallet_balance)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, user_id, username, full_name, email, user_type, profile_picture, referral_code, wallet_balance, created_at`,
                [userId, username, fullName, email, hashedPassword, userType, newReferralCode, 1000.00]
            );

            const newUserId = newUser.rows[0].id;

            // HANDLE REFERRAL LOGIC
            if (referralCode) {
                console.log(`🔍 Processing referral: ${referralCode} for new user ${username}`);

                // Check if referrer exists (support both referral_code and username)
                const referrer = await client.query(
                    'SELECT id, username FROM users WHERE referral_code = $1 OR username = $2',
                    [referralCode, referralCode]
                );

                if (referrer.rows.length > 0) {
                    const referrerId = referrer.rows[0].id;
                    const referrerUsername = referrer.rows[0].username;

                    // Add entry to Wallet
                    await client.query(
                        `INSERT INTO wallet (referrer_id, referred_user_id, referred_username, referral_link_used, amount)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [referrerId, newUserId, username, referralCode, 10.00]
                    );

                    // ALSO: Update referrer's wallet_balance
                    await client.query(
                        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                        [10.00, referrerId]
                    );

                    console.log(`✅ Wallet record saved and referrer balance updated! Referrer: ${referrerUsername}, Referred: ${username}`);
                } else {
                    console.log(`⚠️ Referral code ${referralCode} not found in database.`);
                }
            }

            await client.query('COMMIT');

            // Create JWT token
            const token = jwt.sign(
                { id: newUser.rows[0].id, userId: newUser.rows[0].user_id },
                process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRE || '30d' }
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

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password' });
        }

        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (user.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.rows[0].password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        if (!secret) {
            throw new Error('JWT Secret is not configured in environment variables');
        }

        await ensureGoogerIdNormalization();

        const token = jwt.sign(
            { id: user.rows[0].id, userId: user.rows[0].user_id },
            secret,
            { expiresIn: process.env.JWT_EXPIRE || '30d' }
        );

        const { password: _, ...userWithoutPassword } = user.rows[0];

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
            `SELECT ${publicColumns.join(', ')} FROM users WHERE id = $1`,
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

        // Get Wallet Summary (Joins with users table to get real names and pics)
        const walletData = await pool.query(
            `SELECT 
                u.full_name as referred_full_name,
                u.username as referred_username,
                u.profile_picture as referred_profile_picture,
                w.amount, 
                w.created_at 
             FROM wallet w
             JOIN users u ON w.referred_user_id = u.id
             WHERE w.referrer_id = $1 
             ORDER BY w.created_at DESC`,
            [userId]
        );

        const totalEarned = walletData.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);

        res.status(200).json({
            success: true,
            totalReferrals: walletData.rows.length,
            totalEarned: totalEarned.toFixed(2),
            referrals: walletData.rows
        });

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
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.user.id]);

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
