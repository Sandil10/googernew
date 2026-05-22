const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const crypto = require('crypto');
const { getUserPlanLimits } = require('../utils/planLimits');

let schemaReady = false;
let googShareCodesReady = false;

const SHARE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const UPPERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERS = 'abcdefghijklmnopqrstuvwxyz';
const SHARE_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;
const GOOG_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz';

const hash32 = (input, seed = 0x811c9dc5) => {
    let hash = seed >>> 0;
    const value = String(input || '');
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
};

const positiveModulo = (value, modulus) => {
    const normalized = Number(value) >>> 0;
    return normalized % modulus;
};

const buildShortShareCode = (type, target, length = 8) => {
    const normalizedTarget = String(target || '').trim();
    if (!normalizedTarget) return '';
    const payload = `${type}:${normalizedTarget}`;
    let stateA = hash32(payload, 0x9e3779b9);
    let stateB = hash32(payload, 0x85ebca6b);

    const chars = [];
    for (let index = 0; index < length; index += 1) {
        stateA = (Math.imul(stateA ^ (stateA >>> 15), 2246822519) + stateB + index) >>> 0;
        stateB = (Math.imul(stateB ^ (stateB >>> 13), 3266489917) + stateA + index * 17) >>> 0;
        const nextIndex = positiveModulo(stateA ^ stateB, SHARE_ALPHABET.length);
        chars.push(SHARE_ALPHABET[nextIndex]);
    }

    const codeChars = [...chars];
    const hasDigit = codeChars.some((char) => DIGITS.includes(char));
    const hasUpper = codeChars.some((char) => UPPERS.includes(char));
    const hasLower = codeChars.some((char) => LOWERS.includes(char));

    if (!hasDigit) codeChars[positiveModulo(stateA + 1, length)] = DIGITS[positiveModulo(stateB, DIGITS.length)];
    if (!hasUpper) codeChars[positiveModulo(stateB + 3, length)] = UPPERS[positiveModulo(stateA, UPPERS.length)];
    if (!hasLower) codeChars[positiveModulo(stateA + stateB + 5, length)] = LOWERS[positiveModulo(stateA ^ stateB, LOWERS.length)];

    return codeChars.join('');
};

const generateRandomGoogShareCode = (length = 8) => {
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let index = 0; index < length; index += 1) {
        code += GOOG_CODE_ALPHABET[bytes[index] % GOOG_CODE_ALPHABET.length];
    }
    return code;
};

const getCanonicalGoogShareCode = (row) => {
    const storedCode = String(row?.share_code || '').trim();
    if (SHARE_CODE_PATTERN.test(storedCode)) return storedCode;
    return buildShortShareCode('g', row?.id, 8);
};

const pickGoogShareCode = async (postId) => {
    const deterministic = buildShortShareCode('g', postId, 8);
    const deterministicResult = await pool.query(
        'SELECT id FROM goog_posts WHERE LOWER(share_code) = LOWER($1) LIMIT 1',
        [deterministic]
    );
    if (!deterministicResult.rows.length || Number(deterministicResult.rows[0].id) === Number(postId)) {
        return deterministic;
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = generateRandomGoogShareCode(8);
        const existsResult = await pool.query(
            'SELECT id FROM goog_posts WHERE LOWER(share_code) = LOWER($1) LIMIT 1',
            [candidate]
        );
        if (!existsResult.rows.length) return candidate;
    }

    throw new Error('Unable to generate unique Goog share code');
};

const ensureGoogShareCodes = async () => {
    if (googShareCodesReady) return;

    await pool.query(`ALTER TABLE goog_posts ADD COLUMN IF NOT EXISTS share_code VARCHAR(32);`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS goog_share_aliases (
            id SERIAL PRIMARY KEY,
            alias_code VARCHAR(32) UNIQUE NOT NULL,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_goog_share_aliases_alias_code
        ON goog_share_aliases(alias_code);
    `);

    const rememberGoogShareAlias = async (aliasCode, googId) => {
        const normalizedAlias = String(aliasCode || '').trim();
        if (!normalizedAlias || SHARE_CODE_PATTERN.test(normalizedAlias) || !googId) return;

        await pool.query(
            `INSERT INTO goog_share_aliases (alias_code, goog_id)
             VALUES ($1, $2)
             ON CONFLICT (alias_code) DO UPDATE SET goog_id = EXCLUDED.goog_id`,
            [normalizedAlias, googId]
        );
    };

    const invalidResult = await pool.query(`
        SELECT id, share_code
        FROM goog_posts
        WHERE share_code IS NULL
           OR share_code = ''
           OR share_code !~ '^[0-9A-Za-z]{8}$'
    `);

    for (const row of invalidResult.rows || []) {
        await rememberGoogShareAlias(row.share_code, row.id);
        const code = await pickGoogShareCode(row.id);
        await pool.query('UPDATE goog_posts SET share_code = $1 WHERE id = $2', [code, row.id]);
    }

    const duplicateResult = await pool.query(`
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY LOWER(share_code) ORDER BY id) AS rn
            FROM goog_posts
            WHERE share_code ~ '^[0-9A-Za-z]{8}$'
        ) ranked
        WHERE rn > 1
    `);

    for (const row of duplicateResult.rows || []) {
        const code = await pickGoogShareCode(row.id);
        await pool.query('UPDATE goog_posts SET share_code = $1 WHERE id = $2', [code, row.id]);
    }

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_goog_posts_share_code_unique
        ON goog_posts (LOWER(share_code))
        WHERE share_code IS NOT NULL AND share_code <> ''
    `);

    googShareCodesReady = true;
};

const ensureGoogSchema = async () => {
    if (schemaReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS goog_posts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            text VARCHAR(75) NOT NULL,
            text_color VARCHAR(20) DEFAULT '#FFFFFF',
            share_code VARCHAR(32),
            likes_count INTEGER DEFAULT 0,
            comments_count INTEGER DEFAULT 0,
            views_count INTEGER DEFAULT 0,
            shares_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS goog_likes (
            id SERIAL PRIMARY KEY,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (goog_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS goog_comments (
            id SERIAL PRIMARY KEY,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            comment TEXT NOT NULL,
            parent_id INTEGER REFERENCES goog_comments(id) ON DELETE CASCADE,
            likes INTEGER DEFAULT 0,
            dislikes INTEGER DEFAULT 0,
            reports INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS goog_shares (
            id SERIAL PRIMARY KEY,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            ip_address VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS goog_views (
            id SERIAL PRIMARY KEY,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            ip_address VARCHAR(255),
            last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS goog_subscribes (
            id SERIAL NOT NULL PRIMARY KEY,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (goog_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS goog_share_logs (
            id SERIAL NOT NULL PRIMARY KEY,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            ip_address VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (goog_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS goog_reports (
            id SERIAL NOT NULL PRIMARY KEY,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            reason VARCHAR(50) NOT NULL,
            custom_reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (goog_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_goog_posts_created_at ON goog_posts(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_goog_posts_user_id ON goog_posts(user_id);
        CREATE INDEX IF NOT EXISTS idx_goog_likes_post_user ON goog_likes(goog_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_goog_comments_post ON goog_comments(goog_id);
        CREATE INDEX IF NOT EXISTS idx_goog_shares_post ON goog_shares(goog_id);
        CREATE INDEX IF NOT EXISTS idx_goog_views_post_user ON goog_views(goog_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_goog_views_post_ip ON goog_views(goog_id, ip_address);
        CREATE INDEX IF NOT EXISTS idx_goog_subscribes_post_user ON goog_subscribes(goog_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_goog_reports_post ON goog_reports(goog_id);
    `);

    // Widen text column so dynamic goog_letter_limit > 75 can be set by admin
    await pool.query(`ALTER TABLE goog_posts ALTER COLUMN text TYPE TEXT`).catch(() => {});

    await ensureGoogShareCodes();

    schemaReady = true;
};

const getOptionalUserId = (req) => {
    if (req.user?.id) return req.user.id;

    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader;
    if (!token) return null;

    try {
        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        return decoded?.id || null;
    } catch {
        return null;
    }
};

const toUtcIso = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)
        ? `${raw.replace(' ', 'T')}Z`
        : raw;
    const date = new Date(normalized);
    const time = date.getTime();
    return Number.isFinite(time) ? date.toISOString() : null;
};

const normalizePost = (row) => ({
    id: Number(row.id),
    share_code: getCanonicalGoogShareCode(row),
    shareCode: getCanonicalGoogShareCode(row),
    canonical_share_code: getCanonicalGoogShareCode(row),
    canonical_share_path: `/share/${getCanonicalGoogShareCode(row)}`,
    text: row.text,
    textColor: row.text_color || '#FFFFFF',
    createdAt: toUtcIso(row.created_at),
    created_at: toUtcIso(row.created_at),
    updatedAt: toUtcIso(row.updated_at),
    updated_at: toUtcIso(row.updated_at),
    likes: Number(row.likes_count || 0),
    comments: Number(row.comments_count || 0),
    views: Number(row.views_count || 0),
    reposts: 0,
    shares: Number(row.shares_count || 0),
    liked: !!row.user_liked,
    user: {
        id: row.user_id,
        username: row.username || '',
        name: row.full_name || row.username || 'User',
        img: row.profile_picture || '/assets/images/avatars/avatar-default.jpg',
    },
});

const selectPostsSql = `
    SELECT
        gp.*,
        u.username,
        u.full_name,
        u.profile_picture,
        CASE WHEN $1::INTEGER IS NULL THEN FALSE
             ELSE EXISTS (
                SELECT 1 FROM goog_likes gl
                WHERE gl.goog_id = gp.id AND gl.user_id = $1
             )
        END AS user_liked
    FROM goog_posts gp
    JOIN users u ON u.id = gp.user_id
`;

exports.getPosts = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = getOptionalUserId(req);
        const result = await pool.query(`${selectPostsSql} ORDER BY gp.created_at DESC LIMIT 100`, [userId]);
        res.status(200).json({ success: true, data: result.rows.map(normalizePost) });
    } catch (error) {
        console.error('Error fetching Goog posts:', error);
        res.status(500).json({ success: false, message: 'Server error fetching Goog posts' });
    }
};

exports.createPost = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;

        // Fetch dynamic limits for this user
        const limits = await getUserPlanLimits(userId);

        // Enforce write goog count limit
        const countRes = await pool.query(
            'SELECT COUNT(*)::int AS c FROM goog_posts WHERE user_id = $1',
            [userId]
        );
        if (countRes.rows[0].c >= limits.writeGoogLimit) {
            return res.status(403).json({
                success: false,
                message: 'Limit reached. Subscribe to a higher plan to create more googs.',
                code: 'WRITE_GOOG_LIMIT',
                limit: limits.writeGoogLimit,
            });
        }

        const text = String(req.body?.text || '').trim().slice(0, limits.googLetterLimit);
        const textColor = String(req.body?.textColor || '#FFFFFF').trim().slice(0, 20);

        // Enforce colored goog limit if a non-default color is requested
        const isColored = textColor && textColor.toUpperCase() !== '#FFFFFF' && textColor.toLowerCase() !== 'white';
        if (isColored && limits.writeGoogColorLimit !== undefined) {
            const colorCountRes = await pool.query(
                `SELECT COUNT(*)::int AS c FROM goog_posts WHERE user_id = $1 AND UPPER(text_color) != '#FFFFFF' AND text_color IS NOT NULL AND text_color != ''`,
                [userId]
            );
            if (colorCountRes.rows[0].c >= limits.writeGoogColorLimit) {
                return res.status(403).json({
                    success: false,
                    message: `You have reached your colored Goog limit (${limits.writeGoogColorLimit}). Upgrade your plan to create more colored Googs.`,
                    code: 'WRITE_GOOG_COLOR_LIMIT',
                    limit: limits.writeGoogColorLimit,
                });
            }
        }

        if (!text) return res.status(400).json({ success: false, message: 'Post text is required' });

        const created = await pool.query(
            `INSERT INTO goog_posts (user_id, text, text_color, share_code, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
             RETURNING *`,
            [userId, text, textColor, await pickGoogShareCode(`new:${userId}:${Date.now()}:${Math.random()}`)]
        );
        await pool.query(
            'UPDATE goog_posts SET share_code = $1 WHERE id = $2',
            [await pickGoogShareCode(created.rows[0].id), created.rows[0].id]
        );
        const result = await pool.query(`${selectPostsSql} WHERE gp.id = $2`, [userId, created.rows[0].id]);
        res.status(201).json({ success: true, data: normalizePost(result.rows[0]) });
    } catch (error) {
        console.error('Error creating Goog post:', error);
        res.status(500).json({ success: false, message: 'Server error creating Goog post' });
    }
};

exports.updatePost = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        const limits = await getUserPlanLimits(userId);
        const text = String(req.body?.text || '').trim().slice(0, limits.googLetterLimit);
        const textColor = String(req.body?.textColor || '#FFFFFF').trim().slice(0, 20);

        if (!text) return res.status(400).json({ success: false, message: 'Post text is required' });

        const updated = await pool.query(
            `UPDATE goog_posts
             SET text = $1, text_color = $2, updated_at = NOW() AT TIME ZONE 'UTC'
             WHERE id = $3 AND user_id = $4
             RETURNING *`,
            [text, textColor, id, userId]
        );

        if (!updated.rows.length) return res.status(404).json({ success: false, message: 'Goog post not found' });

        const result = await pool.query(`${selectPostsSql} WHERE gp.id = $2`, [userId, id]);
        res.status(200).json({ success: true, data: normalizePost(result.rows[0]) });
    } catch (error) {
        console.error('Error updating Goog post:', error);
        res.status(500).json({ success: false, message: 'Server error updating Goog post' });
    }
};

exports.deletePost = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        const result = await pool.query('DELETE FROM goog_posts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Goog post not found' });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting Goog post:', error);
        res.status(500).json({ success: false, message: 'Server error deleting Goog post' });
    }
};

exports.toggleLike = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);

        const existing = await pool.query('SELECT 1 FROM goog_likes WHERE goog_id = $1 AND user_id = $2', [id, userId]);
        if (existing.rows.length) {
            await pool.query('DELETE FROM goog_likes WHERE goog_id = $1 AND user_id = $2', [id, userId]);
            await pool.query('UPDATE goog_posts SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = $1', [id]);
            return res.status(200).json({ success: true, liked: false });
        }

        await pool.query('INSERT INTO goog_likes (goog_id, user_id) VALUES ($1, $2)', [id, userId]);
        await pool.query('UPDATE goog_posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1', [id]);
        res.status(200).json({ success: true, liked: true });
    } catch (error) {
        console.error('Error toggling Goog like:', error);
        res.status(500).json({ success: false, message: 'Server error toggling Goog like' });
    }
};

exports.toggleSubscribe = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);

        const existing = await pool.query('SELECT 1 FROM goog_subscribes WHERE goog_id = $1 AND user_id = $2', [id, userId]);
        if (existing.rows.length) {
            await pool.query('DELETE FROM goog_subscribes WHERE goog_id = $1 AND user_id = $2', [id, userId]);
            return res.status(200).json({ success: true, subscribed: false });
        }

        await pool.query('INSERT INTO goog_subscribes (goog_id, user_id) VALUES ($1, $2)', [id, userId]);
        res.status(201).json({ success: true, subscribed: true });
    } catch (error) {
        console.error('Error toggling Goog subscription:', error);
        res.status(500).json({ success: false, message: 'Server error toggling Goog subscription' });
    }
};

exports.checkSubscribe = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);

        const result = await pool.query('SELECT 1 FROM goog_subscribes WHERE goog_id = $1 AND user_id = $2', [id, userId]);
        res.status(200).json({ success: true, subscribed: result.rows.length > 0 });
    } catch (error) {
        console.error('Error checking subscription:', error);
        res.status(500).json({ success: false, message: 'Server error checking subscription' });
    }
};

exports.logShare = async (req, res) => {
    try {
        await ensureGoogSchema();
        const id = parseInt(req.params.id, 10);
        const userId = getOptionalUserId(req);
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

        // Check if this user has already shared this post
        const existingShare = await pool.query(
            userId 
                ? 'SELECT 1 FROM goog_share_logs WHERE goog_id = $1 AND user_id = $2'
                : 'SELECT 1 FROM goog_share_logs WHERE goog_id = $1 AND ip_address = $2 AND user_id IS NULL',
            userId ? [id, userId] : [id, ipAddress]
        );

        // Also check the goog_shares table for any share record
        const existingShareAlt = await pool.query(
            userId
                ? 'SELECT 1 FROM goog_shares WHERE goog_id = $1 AND user_id = $2'
                : 'SELECT 1 FROM goog_shares WHERE goog_id = $1 AND ip_address = $2 AND user_id IS NULL',
            userId ? [id, userId] : [id, ipAddress]
        );

        if (existingShare.rows.length || existingShareAlt.rows.length) {
            // User already shared this post, don't increment count
            return res.status(200).json({ success: true, incremented: false, message: 'Already shared' });
        }

        // Record in goog_share_logs
        await pool.query('INSERT INTO goog_share_logs (goog_id, user_id, ip_address) VALUES ($1, $2, $3)', [id, userId, ipAddress]);
        
        // Record in goog_shares for compatibility
        await pool.query('INSERT INTO goog_shares (goog_id, user_id, ip_address) VALUES ($1, $2, $3)', [id, userId, ipAddress]);
        
        // Increment share count
        await pool.query('UPDATE goog_posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = $1', [id]);
        
        res.status(200).json({ success: true, incremented: true });
    } catch (error) {
        console.error('Error logging Goog share:', error);
        res.status(500).json({ success: false, message: 'Server error logging Goog share' });
    }
};

exports.createReport = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        const { reason, custom_reason } = req.body;

        if (!reason || !['Spam or misleading', 'Harassment or bullying', 'Hate speech or graphic', 'Inappropriate content'].includes(reason)) {
            return res.status(400).json({ success: false, message: 'Valid reason is required' });
        }

        // Check if user already reported this post
        const existingReport = await pool.query('SELECT 1 FROM goog_reports WHERE goog_id = $1 AND user_id = $2', [id, userId]);
        if (existingReport.rows.length) {
            return res.status(400).json({ success: false, message: 'You have already reported this post' });
        }

        await pool.query(
            'INSERT INTO goog_reports (goog_id, user_id, reason, custom_reason) VALUES ($1, $2, $3, $4)',
            [id, userId, reason, custom_reason || null]
        );

        // Update reports count on post
        await pool.query('UPDATE goog_posts SET reports = COALESCE(reports, 0) + 1 WHERE id = $1', [id]);

        res.status(201).json({ success: true, message: 'Report submitted successfully' });
    } catch (error) {
        console.error('Error creating Goog report:', error);
        res.status(500).json({ success: false, message: 'Server error creating Goog report' });
    }
};

exports.addComment = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        const text = String(req.body?.text || '').trim();
        const parentId = req.body?.parent_id ? parseInt(req.body.parent_id, 10) : null;

        if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });

        const result = await pool.query(
            `INSERT INTO goog_comments (goog_id, user_id, comment, parent_id)
             VALUES ($1, $2, $3, $4)
              RETURNING id, goog_id, user_id, comment as text, parent_id, likes, dislikes, reports, created_at`,
            [id, userId, text, Number.isFinite(parentId) ? parentId : null]
        );
        const comment = result.rows[0];
        if (comment && comment.created_at) {
            comment.created_at = toUtcIso(comment.created_at);
        }
        await pool.query('UPDATE goog_posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = $1', [id]);

        const user = await pool.query('SELECT username, profile_picture FROM users WHERE id = $1', [userId]);
        res.status(201).json({
            success: true,
            data: {
                ...comment,
                market_id: `goog-${id}`,
                username: user.rows[0]?.username || 'You',
                profile_picture: user.rows[0]?.profile_picture,
            },
        });
    } catch (error) {
        console.error('Error adding Goog comment:', error);
        res.status(500).json({ success: false, message: 'Server error adding Goog comment' });
    }
};

exports.getComments = async (req, res) => {
    try {
        await ensureGoogSchema();
        const id = parseInt(req.params.id, 10);
        const result = await pool.query(
            `SELECT gc.id, gc.goog_id, gc.goog_id as market_id, gc.user_id, gc.comment as text,
                    gc.parent_id, gc.likes, gc.dislikes, gc.reports, gc.created_at,
                    u.username, u.profile_picture
             FROM goog_comments gc
             JOIN users u ON u.id = gc.user_id
             WHERE gc.goog_id = $1
             ORDER BY gc.created_at ASC`,
            [id]
        );
        const normalizedComments = result.rows.map(row => ({
            ...row,
            created_at: toUtcIso(row.created_at)
        }));
        res.status(200).json({ success: true, data: normalizedComments });
    } catch (error) {
        console.error('Error fetching Goog comments:', error);
        res.status(500).json({ success: false, message: 'Server error fetching Goog comments' });
    }
};

exports.deleteComment = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = req.user.id;
        const commentId = parseInt(req.params.commentId, 10);
        const comment = await pool.query(
            `SELECT gc.*, gp.user_id as post_owner_id
             FROM goog_comments gc
             JOIN goog_posts gp ON gp.id = gc.goog_id
             WHERE gc.id = $1`,
            [commentId]
        );

        if (!comment.rows.length) return res.status(404).json({ success: false, message: 'Comment not found' });
        const canDelete = Number(comment.rows[0].user_id) === Number(userId) || Number(comment.rows[0].post_owner_id) === Number(userId);
        if (!canDelete) return res.status(403).json({ success: false, message: 'Not authorized' });

        const deleteResult = await pool.query(
            `WITH RECURSIVE comment_tree AS (
                SELECT id, goog_id FROM goog_comments WHERE id = $1
                UNION ALL
                SELECT child.id, child.goog_id
                FROM goog_comments child
                INNER JOIN comment_tree parent ON child.parent_id = parent.id
             ),
             deleted AS (
                DELETE FROM goog_comments
                WHERE id IN (SELECT id FROM comment_tree)
                RETURNING id
             )
             SELECT COUNT(*)::int AS deleted_count FROM deleted`,
            [commentId]
        );
        const deletedCount = Number(deleteResult.rows[0]?.deleted_count || 0);
        await pool.query(
            'UPDATE goog_posts SET comments_count = GREATEST(COALESCE(comments_count, 0) - $2, 0) WHERE id = $1',
            [comment.rows[0].goog_id, deletedCount]
        );

        res.status(200).json({ success: true, deletedCount });
    } catch (error) {
        console.error('Error deleting Goog comment:', error);
        res.status(500).json({ success: false, message: 'Server error deleting Goog comment' });
    }
};

exports.logShare = async (req, res) => {
    try {
        await ensureGoogSchema();
        const id = parseInt(req.params.id, 10);
        const userId = getOptionalUserId(req);
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        const existingShare = await pool.query(
            userId
                ? `SELECT id
                   FROM goog_shares
                   WHERE goog_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE
                   LIMIT 1`
                : `SELECT id
                   FROM goog_shares
                   WHERE goog_id = $1 AND ip_address = $2 AND user_id IS NULL AND created_at::date = CURRENT_DATE
                   LIMIT 1`,
            userId ? [id, userId] : [id, ipAddress],
        );

        if (existingShare.rows.length > 0) {
            return res.status(200).json({ success: true, incremented: false });
        }

        await pool.query('INSERT INTO goog_shares (goog_id, user_id, ip_address) VALUES ($1, $2, $3)', [id, userId, ipAddress]);
        await pool.query('UPDATE goog_posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = $1', [id]);
        res.status(200).json({ success: true, incremented: true });
    } catch (error) {
        console.error('Error logging Goog share:', error);
        res.status(500).json({ success: false, message: 'Server error logging Goog share' });
    }
};

exports.logView = async (req, res) => {
    try {
        await ensureGoogSchema();
        const id = parseInt(req.params.id, 10);
        const userId = getOptionalUserId(req);
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        const params = userId ? [id, userId] : [id, ipAddress];
        const viewCheck = await pool.query(
            userId
                ? 'SELECT id, last_viewed_at FROM goog_views WHERE goog_id = $1 AND user_id = $2'
                : 'SELECT id, last_viewed_at FROM goog_views WHERE goog_id = $1 AND ip_address = $2 AND user_id IS NULL',
            params
        );

        let shouldIncrement = false;
        if (!viewCheck.rows.length) {
            await pool.query(
                'INSERT INTO goog_views (goog_id, user_id, ip_address, last_viewed_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
                [id, userId, ipAddress]
            );
            shouldIncrement = true;
        } else {
            const diffHours = (Date.now() - new Date(viewCheck.rows[0].last_viewed_at).getTime()) / (1000 * 60 * 60);
            if (diffHours >= 24) {
                await pool.query('UPDATE goog_views SET last_viewed_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE id = $2', [ipAddress, viewCheck.rows[0].id]);
                shouldIncrement = true;
            }
        }

        if (shouldIncrement) {
            await pool.query('UPDATE goog_posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [id]);
        }

        res.status(200).json({ success: true, incremented: shouldIncrement });
    } catch (error) {
        console.error('Error logging Goog view:', error);
        res.status(500).json({ success: false, message: 'Server error logging Goog view' });
    }
};

exports.getLikes = async (req, res) => {
    try {
        await ensureGoogSchema();
        const result = await pool.query(
            `SELECT gl.id, gl.created_at, u.id as user_id, u.username, u.profile_picture
             FROM goog_likes gl
             JOIN users u ON u.id = gl.user_id
             WHERE gl.goog_id = $1
             ORDER BY gl.created_at DESC`,
            [parseInt(req.params.id, 10)]
        );
        const normalizedLikes = result.rows.map(row => ({
            ...row,
            created_at: toUtcIso(row.created_at)
        }));
        res.status(200).json({ success: true, data: normalizedLikes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching Goog likes' });
    }
};

exports.getShares = async (req, res) => {
    try {
        await ensureGoogSchema();
        const result = await pool.query(
            `SELECT gs.id, gs.created_at, u.id as user_id, u.username, u.profile_picture
             FROM goog_shares gs
             LEFT JOIN users u ON u.id = gs.user_id
             WHERE gs.goog_id = $1
             ORDER BY gs.created_at DESC`,
            [parseInt(req.params.id, 10)]
        );
        const normalizedShares = result.rows.map(row => ({
            ...row,
            created_at: toUtcIso(row.created_at)
        }));
        res.status(200).json({ success: true, data: normalizedShares });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching Goog shares' });
    }
};

exports.getViews = async (req, res) => {
    try {
        await ensureGoogSchema();
        const result = await pool.query(
            `SELECT gv.id, gv.last_viewed_at as created_at, u.id as user_id, u.username, u.profile_picture
             FROM goog_views gv
             LEFT JOIN users u ON u.id = gv.user_id
             WHERE gv.goog_id = $1
             ORDER BY gv.last_viewed_at DESC`,
            [parseInt(req.params.id, 10)]
        );
        const normalizedViews = result.rows.map(row => ({
            ...row,
            created_at: toUtcIso(row.created_at)
        }));
        res.status(200).json({ success: true, data: normalizedViews });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching Goog views' });
    }
};

exports.getPostById = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = getOptionalUserId(req);
        const id = parseInt(req.params.id, 10);
        const result = await pool.query(`${selectPostsSql} WHERE gp.id = $2`, [userId, id]);
        
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Goog post not found' });
        }
        
        res.status(200).json({ success: true, data: normalizePost(result.rows[0]) });
    } catch (error) {
        console.error('Error fetching Goog post by id:', error);
        res.status(500).json({ success: false, message: 'Server error fetching Goog post' });
    }
};

exports.getPostPublic = async (req, res) => {
    try {
        await ensureGoogSchema();
        const id = parseInt(req.params.id, 10);
        // Use null for userId in selectPostsSql for public view
        const result = await pool.query(`${selectPostsSql} WHERE gp.id = $2`, [null, id]);
        
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Goog post not found' });
        }
        
        res.status(200).json({ success: true, data: normalizePost(result.rows[0]) });
    } catch (error) {
        console.error('Error fetching public Goog post:', error);
        res.status(500).json({ success: false, message: 'Server error fetching public Goog post' });
    }
};

exports.getUserPosts = async (req, res) => {
    try {
        await ensureGoogSchema();
        const userId = getOptionalUserId(req);
        const targetUserId = parseInt(req.params.userId, 10);
        const result = await pool.query(
            `${selectPostsSql} WHERE gp.user_id = $2 ORDER BY gp.created_at DESC`,
            [userId, targetUserId]
        );
        res.status(200).json({ success: true, data: result.rows.map(normalizePost) });
    } catch (error) {
        console.error('Error fetching user Goog posts:', error);
        res.status(500).json({ success: false, message: 'Server error fetching user posts' });
    }
};

// ── Saved Googs ─────────────────────────────────────────────────────────────

let savedGoogsReady = false;
const ensureSavedGoogsSchema = async () => {
    if (savedGoogsReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS saved_googs (
            id       SERIAL PRIMARY KEY,
            user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            goog_id  INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, goog_id)
        );
        CREATE INDEX IF NOT EXISTS idx_saved_googs_user ON saved_googs(user_id, saved_at DESC);
    `);
    savedGoogsReady = true;
};

exports.toggleSave = async (req, res) => {
    try {
        await ensureGoogSchema();
        await ensureSavedGoogsSchema();
        const userId = req.user?.id || req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const googId = parseInt(req.params.id, 10);
        if (!googId) return res.status(400).json({ success: false, message: 'Invalid goog id' });

        // Unsave if already saved
        const existing = await pool.query(
            'SELECT id FROM saved_googs WHERE user_id = $1 AND goog_id = $2',
            [userId, googId]
        );
        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM saved_googs WHERE user_id = $1 AND goog_id = $2', [userId, googId]);
            return res.json({ success: true, saved: false });
        }

        // Check save limit using getUserPlanLimits — respects both basic and paid plans
        const limits = await getUserPlanLimits(userId);
        const limit = limits.saveGoogLimit;
        if (limit === 0) {
            return res.status(403).json({ success: false, message: 'Subscribe to a plan to save Googs.' });
        }

        const countRes = await pool.query(
            'SELECT COUNT(*)::int AS c FROM saved_googs WHERE user_id = $1',
            [userId]
        );
        if ((countRes.rows[0]?.c || 0) >= limit) {
            return res.status(403).json({
                success: false,
                message: `Your plan allows saving up to ${limit} Goog${limit === 1 ? '' : 's'}. Upgrade to save more.`,
                limit,
            });
        }

        await pool.query(
            'INSERT INTO saved_googs (user_id, goog_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, googId]
        );
        return res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[googs] toggleSave error:', err);
        return res.status(500).json({ success: false, message: 'Failed to save goog' });
    }
};

exports.getSavedGoogs = async (req, res) => {
    try {
        await ensureGoogSchema();
        await ensureSavedGoogsSchema();
        const userId = req.user?.id || req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { rows } = await pool.query(
            `SELECT gp.*, u.username, u.full_name, u.profile_picture, sg.saved_at,
                    EXISTS(SELECT 1 FROM goog_likes gl WHERE gl.goog_id = gp.id AND gl.user_id = $1) AS user_liked
             FROM saved_googs sg
             JOIN goog_posts gp ON gp.id = sg.goog_id
             JOIN users u ON u.id = gp.user_id
             WHERE sg.user_id = $1
             ORDER BY sg.saved_at DESC`,
            [userId]
        );
        res.json({ success: true, data: rows.map(normalizePost) });
    } catch (err) {
        console.error('[googs] getSavedGoogs error:', err);
        res.status(500).json({ success: false, message: 'Failed to get saved googs' });
    }
};

exports.getSavedStatus = async (req, res) => {
    try {
        await ensureSavedGoogsSchema();
        const userId = req.user?.id || req.user?.userId;
        if (!userId) return res.json({ success: true, savedIds: [] });

        const { rows } = await pool.query(
            'SELECT goog_id FROM saved_googs WHERE user_id = $1',
            [userId]
        );
        return res.json({ success: true, savedIds: rows.map(r => r.goog_id) });
    } catch (err) {
        return res.json({ success: true, savedIds: [] });
    }
};
