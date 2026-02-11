const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Generate unique 6-digit user ID
const generateUserId = async () => {
    let userId;
    let exists = true;

    while (exists) {
        // Generate random 4-digit number (1000-9999)
        userId = Math.floor(1000 + Math.random() * 9000).toString();

        // Check if it already exists
        const result = await pool.query(
            'SELECT user_id FROM users WHERE user_id = $1',
            [userId]
        );

        exists = result.rows.length > 0;
    }

    return userId;
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
        const userId = await generateUserId();

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
            message: error.message || 'Database error occurred',
            error: error.message,
            detail: error.detail, // This will tell us the exact column/table issue
            code: error.code
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

        const token = jwt.sign(
            { id: user.rows[0].id, userId: user.rows[0].user_id },
            process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
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
            details: error.detail
        });
    }
};

// Get current user profile
exports.getProfile = async (req, res) => {
    try {
        const user = await pool.query(
            'SELECT id, user_id, username, full_name, email, profile_picture, bio, referral_code, wallet_balance, created_at FROM users WHERE id = $1',
            [req.user.id]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let userData = user.rows[0];
        console.log(`[DEBUG] Fetching profile for ${userData.username}. Balance: ${userData.wallet_balance}`);

        // Auto-generate referral code for old users if missing
        if (!userData.referral_code) {
            const cleanName = userData.username.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
            const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
            const newCode = `REF-${cleanName}-${randomStr}`;

            await pool.query(
                'UPDATE users SET referral_code = $1 WHERE id = $2',
                [newCode, userData.id]
            );
            userData.referral_code = newCode;
            console.log(`Generated referral code for existing user ${userData.username}: ${newCode}`);
        }

        // Ensure balance is a number and always included
        const balance = parseFloat(userData.wallet_balance || 0);
        userData.wallet_balance = balance;
        userData.balance = balance; // Redundant field for safety

        console.log(`[AUTH] Profile: ${userData.username}, Balance: ${balance}`);

        res.status(200).json({
            success: true,
            user: userData
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
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
        console.error('Get wallet error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching wallet' });
    }
};
