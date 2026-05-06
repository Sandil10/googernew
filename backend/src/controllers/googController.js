const jwt = require('jsonwebtoken');
const pool = require('../config/database');

let schemaReady = false;

const ensureGoogSchema = async () => {
    if (schemaReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS goog_posts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            text VARCHAR(75) NOT NULL,
            text_color VARCHAR(20) DEFAULT '#FFFFFF',
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

const normalizePost = (row) => ({
    id: Number(row.id),
    text: row.text,
    textColor: row.text_color || '#FFFFFF',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
        const text = String(req.body?.text || '').trim().slice(0, 75);
        const textColor = String(req.body?.textColor || '#FFFFFF').trim().slice(0, 20);

        if (!text) return res.status(400).json({ success: false, message: 'Post text is required' });

        const created = await pool.query(
            `INSERT INTO goog_posts (user_id, text, text_color)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, text, textColor]
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
        const text = String(req.body?.text || '').trim().slice(0, 75);
        const textColor = String(req.body?.textColor || '#FFFFFF').trim().slice(0, 20);

        if (!text) return res.status(400).json({ success: false, message: 'Post text is required' });

        const updated = await pool.query(
            `UPDATE goog_posts
             SET text = $1, text_color = $2, updated_at = CURRENT_TIMESTAMP
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
        await pool.query('UPDATE goog_posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = $1', [id]);

        const user = await pool.query('SELECT username, profile_picture FROM users WHERE id = $1', [userId]);
        res.status(201).json({
            success: true,
            data: {
                ...result.rows[0],
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
        res.status(200).json({ success: true, data: result.rows });
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
        res.status(200).json({ success: true, data: result.rows });
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
        res.status(200).json({ success: true, data: result.rows });
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
        res.status(200).json({ success: true, data: result.rows });
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
