const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const EventEmitter = require('events');
const multer = require('multer');
const { saveUploadedFile } = require('../modules/media');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const p2pAdEvents = global.__p2pAdEvents || new EventEmitter();
global.__p2pAdEvents = p2pAdEvents;
p2pAdEvents.setMaxListeners(0);

const verifyEventToken = (req) => {
    const authHeader = req.header('Authorization');
    const token = req.query.token || (authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader);
    const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
    if (!token || !secret) return null;
    return jwt.verify(token, secret);
};

const emitAdLockChange = (type, adId, locked) => {
    p2pAdEvents.emit('ad-lock-change', {
        type,
        adId: String(adId),
        locked: !!locked,
        timestamp: Date.now(),
    });
};

const unlockBuyerForAd = async (adId, buyerId, type = 'unlock') => {
    await pool.query(
        'DELETE FROM p2p_active_buyers WHERE ad_id=$1 AND buyer_id=$2',
        [adId, buyerId]
    );
    const lockCheck = await pool.query('SELECT COUNT(*) FROM p2p_active_buyers WHERE ad_id=$1', [adId]);
    const locked = parseInt(lockCheck.rows[0].count, 10) > 0;
    emitAdLockChange(type, adId, locked);
    return locked;
};

const ensureTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS p2p_buy_ads (
            id              SERIAL PRIMARY KEY,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            catalog_id      TEXT NOT NULL,
            name            TEXT NOT NULL,
            category        TEXT NOT NULL,
            svg_file        TEXT,
            clearbit_domain TEXT,
            admin_fields    JSONB NOT NULL DEFAULT '[]',
            lkr_rate        TEXT NOT NULL,
            crypto_currency TEXT,
            min_amount      NUMERIC(14,2) NOT NULL,
            max_amount      NUMERIC(14,2) NOT NULL,
            release_value   TEXT,
            release_unit    TEXT DEFAULT 'h',
            description     TEXT,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    // Migrate existing tables that may not have the description column
    await pool.query(`ALTER TABLE p2p_buy_ads ADD COLUMN IF NOT EXISTS description TEXT`).catch(() => {});
    // Active buyers table — one row per buyer currently in the purchase flow for an ad
    await pool.query(`
        CREATE TABLE IF NOT EXISTS p2p_active_buyers (
            ad_id      INTEGER NOT NULL REFERENCES p2p_buy_ads(id) ON DELETE CASCADE,
            buyer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (ad_id, buyer_id)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS p2p_transactions (
            id             SERIAL PRIMARY KEY,
            ad_id          INTEGER NOT NULL REFERENCES p2p_buy_ads(id) ON DELETE CASCADE,
            buyer_id       INTEGER NOT NULL REFERENCES users(id),
            seller_id      INTEGER NOT NULL REFERENCES users(id),
            amount         NUMERIC(14,2) NOT NULL,
            receive_amount TEXT,
            tx_id          TEXT,
            status         TEXT NOT NULL DEFAULT 'pending',
            created_at     TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await pool.query(`ALTER TABLE p2p_transactions ADD COLUMN IF NOT EXISTS screenshot_data TEXT`);
    await pool.query(`ALTER TABLE p2p_transactions ADD COLUMN IF NOT EXISTS screenshot_name TEXT`);
    await pool.query(`ALTER TABLE p2p_transactions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE p2p_transactions ADD COLUMN IF NOT EXISTS buyer_report_reason TEXT`);
    await pool.query(`ALTER TABLE p2p_transactions ADD COLUMN IF NOT EXISTS buyer_reported_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE p2p_transactions ADD COLUMN IF NOT EXISTS seller_report_reason TEXT`);
    await pool.query(`ALTER TABLE p2p_transactions ADD COLUMN IF NOT EXISTS seller_reported_at TIMESTAMPTZ`);
    // Disable any database-level auto-cancel triggers so transactions only cancel on explicit user action
    await pool.query(`
        DO $$ BEGIN
            DROP TRIGGER IF EXISTS auto_cancel_pending ON p2p_transactions;
            DROP TRIGGER IF EXISTS cancel_expired_transactions ON p2p_transactions;
            DROP TRIGGER IF EXISTS expire_pending_transactions ON p2p_transactions;
            DROP TRIGGER IF EXISTS auto_expire_p2p_transactions ON p2p_transactions;
        END $$;
    `).catch(() => {});
    await pool.query(`
        DO $$ BEGIN
            PERFORM cron.unschedule(jobname) FROM cron.job
            WHERE jobname ILIKE '%p2p%cancel%' OR jobname ILIKE '%p2p%expire%'
               OR command ILIKE '%p2p_transactions%cancel%';
        END $$;
    `).catch(() => {});
};

const resolveUserId = (req) => req.user.id || req.user.userId;

const USED_AMOUNT_SQL = `
    COALESCE((
        SELECT SUM(
            CASE
                WHEN COALESCE(t.receive_amount, '') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN t.receive_amount::numeric
                ELSE t.amount
            END
        )
        FROM p2p_transactions t
        WHERE t.ad_id = a.id
          AND t.status IN ('pending', 'completed')
    ), 0)
`;
const AVAILABLE_AMOUNT_SQL = `GREATEST(a.max_amount - ${USED_AMOUNT_SQL}, 0)`;

const getAdAvailability = async (adId) => pool.query(`
    SELECT a.user_id, a.min_amount, a.max_amount,
           ${AVAILABLE_AMOUNT_SQL} AS available_amount
    FROM p2p_buy_ads a
    JOIN users u ON u.id = a.user_id
    WHERE a.id=$1
`, [adId]);

const validateRequestedAmount = (adRow, amount) => {
    const requestedAmount = parseFloat(amount) || 0;
    const minAmount = Number(adRow.min_amount);
    const maxAmount = Number(adRow.max_amount);
    const availableAmount = Number(adRow.available_amount);
    if (requestedAmount < minAmount) return { error: `Minimum amount is ${minAmount}.` };
    if (requestedAmount > maxAmount) return { error: `Maximum amount is ${maxAmount}.` };
    if (requestedAmount > availableAmount) return { error: `Available balance is ${availableAmount}.` };
    return { requestedAmount };
};

// GET realtime ad lock/change events. EventSource cannot send auth headers, so
// the token may also be supplied as a query param by the web client.
router.get('/events', async (req, res) => {
    try {
        if (!verifyEventToken(req)) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid authentication token.' });
    }

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');

    const send = (payload) => {
        res.write(`event: ad-lock-change\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 25000);

    p2pAdEvents.on('ad-lock-change', send);
    req.on('close', () => {
        clearInterval(keepAlive);
        p2pAdEvents.off('ad-lock-change', send);
        res.end();
    });
});

// GET all ads — is_locked computed from active buyers count
router.get('/', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const requesterId = resolveUserId(req);
        await pool.query(`DELETE FROM p2p_active_buyers WHERE created_at < NOW() - INTERVAL '25 seconds'`);
        const result = await pool.query(`
            SELECT a.*,
                   u.username, u.profile_picture, u.full_name,
                   (a.user_id = $1)          AS is_own,
                   EXISTS(
                       SELECT 1 FROM p2p_transactions t
                       WHERE t.ad_id = a.id AND t.status = 'pending'
                   ) AS is_locked,
                   ${AVAILABLE_AMOUNT_SQL} AS available_amount,
                   (u.wallet_balance < ${AVAILABLE_AMOUNT_SQL}) AS is_inactive
            FROM p2p_buy_ads a
            JOIN users u ON u.id = a.user_id
            LEFT JOIN p2p_active_buyers ab ON ab.ad_id = a.id
            WHERE a.user_id = $1
               OR u.wallet_balance >= ${AVAILABLE_AMOUNT_SQL}
               OR EXISTS (
                   SELECT 1 FROM p2p_transactions mine
                   WHERE mine.ad_id = a.id
                     AND (mine.buyer_id = $1 OR mine.seller_id = $1)
               )
            GROUP BY a.id, u.username, u.profile_picture, u.full_name, u.wallet_balance
            ORDER BY a.created_at DESC
        `, [requesterId]);
        res.json({ success: true, ads: result.rows });
    } catch (err) {
        console.error('GET /p2p-ads error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch ads.' });
    }
});

// GET current user's P2P buy/sell transaction records
router.get('/transactions', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const status = String(req.query.status || 'all').toLowerCase();
        const params = [userId];
        let statusClause = '';
        if (['pending', 'completed', 'complete', 'cancelled', 'canceled', 'cancel'].includes(status)) {
            const normalizedStatus = status === 'complete' ? 'completed' : status === 'cancel' || status === 'canceled' ? 'cancelled' : status;
            params.push(normalizedStatus);
            statusClause = 'AND t.status = $2';
        }
        const result = await pool.query(`
            SELECT t.*,
                   a.name AS ad_name, a.category, a.crypto_currency,
                   buyer.username AS buyer_username,
                   seller.username AS seller_username
            FROM p2p_transactions t
            LEFT JOIN p2p_buy_ads a ON a.id = t.ad_id
            LEFT JOIN users buyer ON buyer.id = t.buyer_id
            LEFT JOIN users seller ON seller.id = t.seller_id
            WHERE (t.buyer_id = $1 OR t.seller_id = $1)
              ${statusClause}
            ORDER BY t.created_at DESC
            LIMIT 100
        `, params);
        res.json({ success: true, transactions: result.rows });
    } catch (err) {
        console.error('GET /p2p-ads/transactions error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch transactions.' });
    }
});

// GET single transaction by ID — returns full data including screenshot_data
router.get('/transactions/:transactionId', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const transactionId = parseInt(req.params.transactionId, 10);
        if (isNaN(transactionId)) return res.status(400).json({ success: false, message: 'Invalid transaction ID.' });
        const result = await pool.query(`
            SELECT t.*,
                   a.name AS ad_name, a.category, a.crypto_currency,
                   buyer.username AS buyer_username,
                   seller.username AS seller_username
            FROM p2p_transactions t
            LEFT JOIN p2p_buy_ads a ON a.id = t.ad_id
            LEFT JOIN users buyer ON buyer.id = t.buyer_id
            LEFT JOIN users seller ON seller.id = t.seller_id
            WHERE t.id = $1
              AND (t.buyer_id = $2 OR t.seller_id = $2)
        `, [transactionId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Transaction not found.' });
        res.json({ success: true, transaction: result.rows[0] });
    } catch (err) {
        console.error('GET /p2p-ads/transactions/:id error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch transaction.' });
    }
});

// POST cancel pending transaction — releases seller's hold back to wallet_balance
router.post('/transactions/:transactionId/report', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const transactionId = parseInt(req.params.transactionId, 10);
        const reason = String(req.body?.reason || '').trim().slice(0, 500);
        if (isNaN(transactionId)) return res.status(400).json({ success: false, message: 'Invalid transaction ID.' });
        if (!reason) return res.status(400).json({ success: false, message: 'Report reason is required.' });

        const txRow = await pool.query(
            `SELECT * FROM p2p_transactions
             WHERE id=$1
               AND status IN ('pending', 'completed')
               AND (buyer_id=$2 OR seller_id=$2)`,
            [transactionId, userId]
        );
        if (!txRow.rows.length) return res.status(404).json({ success: false, message: 'Transaction not found.' });

        const tx = txRow.rows[0];
        const isBuyer = String(tx.buyer_id) === String(userId);
        const reasonColumn = isBuyer ? 'buyer_report_reason' : 'seller_report_reason';
        const timeColumn = isBuyer ? 'buyer_reported_at' : 'seller_reported_at';
        const result = await pool.query(
            `UPDATE p2p_transactions SET ${reasonColumn}=$1, ${timeColumn}=NOW() WHERE id=$2 RETURNING *`,
            [reason, transactionId]
        );

        res.json({ success: true, transaction: result.rows[0] });
    } catch (err) {
        console.error('POST /p2p-ads/transactions/:transactionId/report error:', err);
        res.status(500).json({ success: false, message: 'Failed to submit report.' });
    }
});

router.post('/transactions/:transactionId/cancel', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable();
        const buyerId = resolveUserId(req);
        const transactionId = parseInt(req.params.transactionId, 10);

        const txRow = await pool.query(
            'SELECT * FROM p2p_transactions WHERE id=$1 AND buyer_id=$2 AND status=$3',
            [transactionId, buyerId, 'pending']
        );
        if (!txRow.rows.length) {
            return res.status(404).json({ success: false, message: 'Pending transaction not found.' });
        }
        const tx = txRow.rows[0];
        const holdAmount = parseFloat(tx.receive_amount) || 0;

        await client.query('BEGIN');

        // Release hold back to seller's wallet
        if (holdAmount > 0) {
            await client.query(
                'UPDATE users SET hold_balance = GREATEST(hold_balance - $1, 0), wallet_balance = wallet_balance + $1 WHERE id = $2',
                [holdAmount, tx.seller_id]
            );
        }

        await client.query(
            'UPDATE p2p_transactions SET status=$1 WHERE id=$2',
            ['cancelled', transactionId]
        );

        // Remove this buyer's ad lock
        await client.query(
            'DELETE FROM p2p_active_buyers WHERE ad_id=$1 AND buyer_id=$2',
            [tx.ad_id, buyerId]
        );

        await client.query('COMMIT');

        const lockCheck = await pool.query('SELECT COUNT(*) FROM p2p_active_buyers WHERE ad_id=$1', [tx.ad_id]);
        emitAdLockChange('transaction-cancel', tx.ad_id, parseInt(lockCheck.rows[0].count, 10) > 0);
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('POST /p2p-ads/transactions/:transactionId/cancel error:', err);
        res.status(500).json({ success: false, message: 'Failed to cancel pending transaction.' });
    } finally {
        client.release();
    }
});

// POST seller confirms pending transaction — transfers hold to buyer's wallet
router.post('/transactions/:transactionId/confirm', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable();
        const sellerId = resolveUserId(req);
        const transactionId = parseInt(req.params.transactionId, 10);

        const txRow = await pool.query(
            'SELECT * FROM p2p_transactions WHERE id=$1 AND seller_id=$2 AND status=$3',
            [transactionId, sellerId, 'pending']
        );
        if (!txRow.rows.length) {
            return res.status(404).json({ success: false, message: 'Pending transaction not found.' });
        }
        const tx = txRow.rows[0];
        const holdAmount = parseFloat(tx.receive_amount) || 0;

        await client.query('BEGIN');

        // Remove from seller's hold_balance
        if (holdAmount > 0) {
            await client.query(
                'UPDATE users SET hold_balance = GREATEST(hold_balance - $1, 0) WHERE id = $2',
                [holdAmount, sellerId]
            );
            // Add to buyer's wallet_balance
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                [holdAmount, tx.buyer_id]
            );
        }

        const txResult = await client.query(
            'UPDATE p2p_transactions SET status=$1, completed_at=NOW() WHERE id=$2 RETURNING *',
            ['completed', transactionId]
        );

        // Remove buyer's ad lock
        await client.query(
            'DELETE FROM p2p_active_buyers WHERE ad_id=$1 AND buyer_id=$2',
            [tx.ad_id, tx.buyer_id]
        );

        await client.query('COMMIT');

        const lockCheck = await pool.query('SELECT COUNT(*) FROM p2p_active_buyers WHERE ad_id=$1', [tx.ad_id]);
        emitAdLockChange('transaction-confirm', tx.ad_id, parseInt(lockCheck.rows[0].count, 10) > 0);
        res.json({ success: true, transaction: txResult.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('POST /p2p-ads/transactions/:transactionId/confirm error:', err);
        res.status(500).json({ success: false, message: 'Failed to confirm transaction.' });
    } finally {
        client.release();
    }
});

// POST buyer starts pending hold after entering amount
// Deducts receive_amount (R) from seller's wallet_balance → hold_balance
router.post('/:id/start', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable();
        const buyerId = resolveUserId(req);
        const adId = parseInt(req.params.id, 10);
        const { amount, receive_amount } = req.body;

        const adRow = await getAdAvailability(adId);
        if (!adRow.rows.length) return res.status(404).json({ success: false, message: 'Ad not found.' });
        if (adRow.rows[0].user_id === buyerId) return res.status(400).json({ success: false, message: 'Cannot buy your own ad.' });
        const validation = validateRequestedAmount(adRow.rows[0], receive_amount);
        if (validation.error) return res.status(400).json({ success: false, message: validation.error });

        const holdAmount = parseFloat(receive_amount) || 0;

        await client.query('BEGIN');

        // Check seller has enough free wallet balance
        const sellerRow = await client.query(
            'SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE',
            [adRow.rows[0].user_id]
        );
        const sellerBalance = parseFloat(sellerRow.rows[0]?.wallet_balance || 0);
        const requiredAvailableBalance = Number(adRow.rows[0].available_amount) || 0;
        if (sellerBalance < requiredAvailableBalance) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Seller ad is inactive due to insufficient balance.' });
        }
        if (holdAmount > 0 && sellerBalance < holdAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Seller has insufficient balance for this trade.' });
        }

        // Move R from seller wallet → hold
        if (holdAmount > 0) {
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = hold_balance + $1 WHERE id = $2',
                [holdAmount, adRow.rows[0].user_id]
            );
        }

        const txResult = await client.query(`
            INSERT INTO p2p_transactions (ad_id, buyer_id, seller_id, amount, receive_amount, tx_id, status)
            VALUES ($1, $2, $3, $4, $5, NULL, 'pending')
            RETURNING *
        `, [adId, buyerId, adRow.rows[0].user_id, parseFloat(amount) || 0, holdAmount || null]);

        await client.query('COMMIT');
        emitAdLockChange('start-pending', adId, true);
        res.json({ success: true, transaction: txResult.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('POST /p2p-ads/:id/start error:', err);
        res.status(500).json({ success: false, message: 'Failed to start pending transaction.' });
    } finally {
        client.release();
    }
});

// POST buyer submits proof/details — accepts file upload (multipart/form-data)
router.post('/transactions/:transactionId/submit-details', authMiddleware, upload.single('screenshot'), async (req, res) => {
    try {
        await ensureTable();
        const buyerId = resolveUserId(req);
        const transactionId = parseInt(req.params.transactionId, 10);
        const tx_id = req.body?.tx_id ? String(req.body.tx_id).trim() : null;
        if (!tx_id && !req.file) {
            return res.status(400).json({ success: false, message: 'Please provide a Transaction ID or upload a payment screenshot.' });
        }

        // Save uploaded file to disk, store its URL (not base64)
        let screenshotUrl = null;
        let screenshotName = null;
        if (req.file) {
            screenshotUrl = await saveUploadedFile(req.file, 'p2p-proofs');
            screenshotName = req.file.originalname || req.file.filename || null;
        }

        const txResult = await pool.query(`
            UPDATE p2p_transactions
            SET tx_id=$1,
                screenshot_data=$2,
                screenshot_name=$3
            WHERE id=$4
              AND buyer_id=$5
              AND status='pending'
            RETURNING *
        `, [tx_id, screenshotUrl, screenshotName, transactionId, buyerId]);
        if (!txResult.rows.length) {
            return res.status(404).json({ success: false, message: 'Pending transaction not found.' });
        }

        emitAdLockChange('transaction-details', txResult.rows[0].ad_id, false);
        res.json({ success: true, transaction: txResult.rows[0] });
    } catch (err) {
        console.error('POST /p2p-ads/transactions/:transactionId/submit-details error:', err);
        res.status(500).json({ success: false, message: 'Failed to submit transaction details.' });
    }
});

// POST create ad
router.post('/', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const { catalog_id, name, category, svg_file, clearbit_domain, admin_fields, lkr_rate, crypto_currency, min_amount, max_amount, release_value, release_unit, description } = req.body;

        if (!catalog_id || !name || !lkr_rate) {
            return res.status(400).json({ success: false, message: 'catalog_id, name, and lkr_rate are required.' });
        }

        const existing = await pool.query(
            'SELECT id FROM p2p_buy_ads WHERE user_id = $1 AND catalog_id = $2 LIMIT 1',
            [userId, catalog_id]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'You already have an ad for this payment method. Delete it before posting another.' });
        }

        const result = await pool.query(`
            INSERT INTO p2p_buy_ads
                (user_id, catalog_id, name, category, svg_file, clearbit_domain, admin_fields, lkr_rate, crypto_currency, min_amount, max_amount, release_value, release_unit, description)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING id, created_at
        `, [userId, catalog_id, name, category, svg_file || null, clearbit_domain || null,
            JSON.stringify(admin_fields || []), lkr_rate, crypto_currency || null,
            parseFloat(min_amount), parseFloat(max_amount), release_value || null, release_unit || 'h',
            description || null]);

        res.json({ success: true, ad: result.rows[0] });
    } catch (err) {
        console.error('POST /p2p-ads error:', err);
        res.status(500).json({ success: false, message: 'Failed to create ad.' });
    }
});

// PUT update own ad — blocked if any buyer is active
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const adId = parseInt(req.params.id, 10);
        const { admin_fields, lkr_rate, crypto_currency, min_amount, max_amount, release_value, release_unit, description } = req.body;

        const check = await pool.query('SELECT user_id FROM p2p_buy_ads WHERE id=$1', [adId]);
        if (!check.rows.length) return res.status(404).json({ success: false, message: 'Ad not found.' });
        if (check.rows[0].user_id !== userId) return res.status(403).json({ success: false, message: 'Not your ad.' });

        const lockCheck = await pool.query(`
            SELECT COUNT(*)::int AS count FROM p2p_transactions WHERE ad_id=$1 AND status='pending'
        `, [adId]);
        if (parseInt(lockCheck.rows[0].count) > 0) {
            return res.status(409).json({ success: false, message: 'Ad is locked while a buyer has a pending transaction.' });
        }

        await pool.query(`
            UPDATE p2p_buy_ads SET
                admin_fields=$1, lkr_rate=$2, crypto_currency=$3, min_amount=$4, max_amount=$5,
                release_value=$6, release_unit=$7, description=$8, updated_at=NOW()
            WHERE id=$9
        `, [JSON.stringify(admin_fields || []), lkr_rate, crypto_currency || null,
            parseFloat(min_amount), parseFloat(max_amount), release_value || null, release_unit || 'h',
            description || null, adId]);

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /p2p-ads/:id error:', err);
        res.status(500).json({ success: false, message: 'Failed to update ad.' });
    }
});

// DELETE own ad — blocked if any buyer is active
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const adId = parseInt(req.params.id, 10);

        const check = await pool.query('SELECT user_id FROM p2p_buy_ads WHERE id=$1', [adId]);
        if (!check.rows.length) return res.status(404).json({ success: false, message: 'Ad not found.' });
        if (check.rows[0].user_id !== userId) return res.status(403).json({ success: false, message: 'Not your ad.' });

        const lockCheck = await pool.query(`
            SELECT COUNT(*)::int AS count FROM p2p_transactions WHERE ad_id=$1 AND status='pending'
        `, [adId]);
        if (parseInt(lockCheck.rows[0].count) > 0) {
            return res.status(409).json({ success: false, message: 'Ad is locked while a buyer has a pending transaction.' });
        }

        // Detach historical transactions so the FK doesn't block the delete.
        await pool.query('DELETE FROM p2p_active_buyers WHERE ad_id=$1', [adId]);
        await pool.query('DELETE FROM p2p_buy_ads WHERE id=$1', [adId]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /p2p-ads/:id error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete ad.' });
    }
});

// POST force-unlock — seller forcibly cancels ALL pending transactions on their own ad
// and releases each one's hold back to their wallet. Use to unstick orphan/test rows.
router.post('/:id/force-unlock', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const adId = parseInt(req.params.id, 10);

        const check = await pool.query('SELECT user_id FROM p2p_buy_ads WHERE id=$1', [adId]);
        if (!check.rows.length) return res.status(404).json({ success: false, message: 'Ad not found.' });
        if (check.rows[0].user_id !== userId) return res.status(403).json({ success: false, message: 'Not your ad.' });

        const pendings = await pool.query(
            `SELECT id, seller_id, receive_amount FROM p2p_transactions WHERE ad_id=$1 AND status='pending'`,
            [adId]
        );

        await client.query('BEGIN');
        for (const row of pendings.rows) {
            const hold = parseFloat(row.receive_amount) || 0;
            if (hold > 0) {
                await client.query(
                    'UPDATE users SET hold_balance = GREATEST(hold_balance - $1, 0), wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [hold, row.seller_id]
                );
            }
            await client.query("UPDATE p2p_transactions SET status='cancelled' WHERE id=$1", [row.id]);
        }
        await client.query('DELETE FROM p2p_active_buyers WHERE ad_id=$1', [adId]);
        await client.query('COMMIT');

        emitAdLockChange('force-unlock', adId, false);
        res.json({ success: true, cleared: pendings.rows.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('POST /p2p-ads/:id/force-unlock error:', err);
        res.status(500).json({ success: false, message: 'Failed to force-unlock.' });
    } finally {
        client.release();
    }
});

// POST lock — buyer entered the purchase flow (upsert: safe to call multiple times)
router.post('/:id/lock', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const buyerId = resolveUserId(req);
        const adId = parseInt(req.params.id, 10);

        const check = await pool.query('SELECT user_id FROM p2p_buy_ads WHERE id=$1', [adId]);
        if (!check.rows.length) return res.status(404).json({ success: false, message: 'Ad not found.' });
        if (check.rows[0].user_id === buyerId) return res.status(400).json({ success: false, message: 'Cannot lock your own ad.' });

        await pool.query(`
            INSERT INTO p2p_active_buyers (ad_id, buyer_id) VALUES ($1, $2)
            ON CONFLICT (ad_id, buyer_id) DO UPDATE SET created_at = NOW()
        `, [adId, buyerId]);

        emitAdLockChange('lock', adId, true);
        res.json({ success: true });
    } catch (err) {
        console.error('POST /p2p-ads/:id/lock error:', err);
        res.status(500).json({ success: false, message: 'Failed to lock ad.' });
    }
});

// POST unlock — this buyer exited without completing (only removes their own lock row)
router.post('/:id/unlock', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const buyerId = resolveUserId(req);
        const adId = parseInt(req.params.id, 10);

        await unlockBuyerForAd(adId, buyerId, 'unlock');
        res.json({ success: true });
    } catch (err) {
        console.error('POST /p2p-ads/:id/unlock error:', err);
        res.status(500).json({ success: false, message: 'Failed to unlock ad.' });
    }
});

// POST cancel — buyer cancelled from the transaction form (records cancelled + unlocks)
router.post('/:id/cancel', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const buyerId = resolveUserId(req);
        const adId = parseInt(req.params.id, 10);
        const { amount, receive_amount } = req.body || {};

        const adRow = await pool.query('SELECT user_id FROM p2p_buy_ads WHERE id=$1', [adId]);
        if (!adRow.rows.length) return res.status(404).json({ success: false, message: 'Ad not found.' });

        await pool.query(`
            INSERT INTO p2p_transactions (ad_id, buyer_id, seller_id, amount, receive_amount, tx_id, status)
            VALUES ($1, $2, $3, $4, $5, NULL, 'cancelled')
        `, [adId, buyerId, adRow.rows[0].user_id, parseFloat(amount) || 0, receive_amount || null]);

        await unlockBuyerForAd(adId, buyerId, 'cancel');
        res.json({ success: true });
    } catch (err) {
        console.error('POST /p2p-ads/:id/cancel error:', err);
        res.status(500).json({ success: false, message: 'Failed to cancel transaction.' });
    }
});

// POST complete — buyer submitted payment (removes their lock row + records transaction)
router.post('/:id/complete', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const buyerId = resolveUserId(req);
        const adId = parseInt(req.params.id, 10);
        const { amount, receive_amount, tx_id, screenshot_data, screenshot_name } = req.body;

        const adRow = await getAdAvailability(adId);
        if (!adRow.rows.length) return res.status(404).json({ success: false, message: 'Ad not found.' });
        const validation = validateRequestedAmount(adRow.rows[0], receive_amount);
        if (validation.error) return res.status(400).json({ success: false, message: validation.error });

        const txResult = await pool.query(`
            INSERT INTO p2p_transactions (ad_id, buyer_id, seller_id, amount, receive_amount, tx_id, screenshot_data, screenshot_name, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
            RETURNING *
        `, [adId, buyerId, adRow.rows[0].user_id, parseFloat(amount) || 0, receive_amount || null, tx_id || null, screenshot_data || null, screenshot_name || null]);

        // Remove only this buyer's lock row
        await unlockBuyerForAd(adId, buyerId, 'complete');

        res.json({ success: true, transaction: txResult.rows[0] });
    } catch (err) {
        console.error('POST /p2p-ads/:id/complete error:', err);
        res.status(500).json({ success: false, message: 'Failed to complete transaction.' });
    }
});

module.exports = router;
