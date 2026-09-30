const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

// A buyer's in-progress Googer Manual Payment (cart locked, wallet locked to
// one seller and amount), kept per account so the web app and the mobile app
// show the same lock. Each client still keeps its own local copy; this is the
// shared source both sync against.
//
//   GET    /api/checkout-intent   -> { success, intent | null, updatedAt }
//   PUT    /api/checkout-intent   { intent } -> saves it
//   DELETE /api/checkout-intent   -> removes it (cancel / order placed)
const router = express.Router();
router.use(authMiddleware);

let tableReady = null;
const ensureTable = () => {
    if (!tableReady) {
        tableReady = pool
            .query(`CREATE TABLE IF NOT EXISTS checkout_payment_intents (
                user_id INTEGER PRIMARY KEY,
                intent JSONB NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )`)
            .catch((err) => { tableReady = null; throw err; });
    }
    return tableReady;
};

const userIdOf = (req) => {
    const id = Number(req.user?.id ?? req.user?.userId);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const text = (value, max = 64) => {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s ? s.slice(0, max) : null;
};

// Only the fields the clients use, so nothing else can be stored here.
// Two kinds: 'manual' (Googer Manual Payment in progress) and 'googer' (a
// completed Googer Payment waiting for Place Order).
const sanitizeIntent = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.kind === 'googer') {
        const transferId = text(raw.transferId, 32);
        const amount = Number(raw.amount);
        if (!transferId || !/^\d+$/.test(transferId) || !Number.isFinite(amount) || amount <= 0) return null;
        return {
            kind: 'googer',
            transferId,
            amount: Number(amount.toFixed(2)),
            createdAt: text(raw.createdAt, 40) || new Date().toISOString(),
            source: text(raw.source, 16),
        };
    }
    const sellerId = text(raw.sellerId);
    const amount = Number(raw.amount);
    if (!sellerId || !Number.isFinite(amount) || amount <= 0) return null;
    const discount = Number(raw.discountPercent);
    return {
        kind: 'manual',
        sellerId,
        sellerName: text(raw.sellerName, 120),
        amount: Number(amount.toFixed(2)),
        discountPercent: Number.isFinite(discount) ? Number(discount.toFixed(0)) : 0,
        transactionId: text(raw.transactionId) || '',
        verifiedTransferId: text(raw.verifiedTransferId),
        createdAt: text(raw.createdAt, 40) || new Date().toISOString(),
        source: text(raw.source, 16),
    };
};

router.get('/', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    try {
        await ensureTable();
        const result = await pool.query(
            'SELECT intent, updated_at FROM checkout_payment_intents WHERE user_id = $1',
            [userId]
        );
        let row = result.rows[0];
        // Safety net: a lock whose payment already paid for an order is
        // finished even if the device that placed it never cleared it (app
        // closed, old app version, network drop) — end it here.
        const intent = row && row.intent;
        const usedTransferId = intent && (intent.kind === 'googer'
            ? intent.transferId
            : intent.kind === 'manual' ? intent.verifiedTransferId : null);
        if (usedTransferId && /^\d+$/.test(String(usedTransferId))) {
            const used = await pool.query(
                'SELECT 1 FROM orders WHERE wallet_transfer_id = $1 AND buyer_id = $2 LIMIT 1',
                [Number(usedTransferId), userId]
            );
            if (used.rows.length > 0) {
                const cleared = await pool.query(
                    `UPDATE checkout_payment_intents
                        SET intent = '{"kind":"cleared"}'::jsonb, updated_at = NOW()
                      WHERE user_id = $1
                  RETURNING intent, updated_at`,
                    [userId]
                );
                row = cleared.rows[0];
            }
        }
        // A 'cleared' row is the tombstone left by DELETE: it tells other
        // devices the lock ended (order placed / cancelled) and when.
        const cleared = row && row.intent && row.intent.kind === 'cleared';
        res.json({
            success: true,
            intent: row && !cleared ? row.intent : null,
            updatedAt: row ? new Date(row.updated_at).toISOString() : null,
            clearedAt: cleared ? new Date(row.updated_at).toISOString() : null,
        });
    } catch (error) {
        console.error('checkout-intent GET failed:', error.message);
        res.status(500).json({ success: false, message: 'Could not load the payment state' });
    }
});

router.put('/', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const intent = sanitizeIntent(req.body?.intent);
    if (!intent) return res.status(400).json({ success: false, message: 'Invalid payment state' });
    try {
        await ensureTable();
        await pool.query(
            `INSERT INTO checkout_payment_intents (user_id, intent, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE SET intent = EXCLUDED.intent, updated_at = NOW()`,
            [userId, JSON.stringify(intent)]
        );
        res.json({ success: true, intent });
    } catch (error) {
        console.error('checkout-intent PUT failed:', error.message);
        res.status(500).json({ success: false, message: 'Could not save the payment state' });
    }
});

router.delete('/', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    try {
        await ensureTable();
        // Keep a tombstone (not a delete) so a device that still holds the
        // lock knows it ended here rather than re-sharing its copy.
        await pool.query(
            `INSERT INTO checkout_payment_intents (user_id, intent, updated_at)
             VALUES ($1, '{"kind":"cleared"}'::jsonb, NOW())
             ON CONFLICT (user_id) DO UPDATE SET intent = '{"kind":"cleared"}'::jsonb, updated_at = NOW()`,
            [userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('checkout-intent DELETE failed:', error.message);
        res.status(500).json({ success: false, message: 'Could not clear the payment state' });
    }
});

module.exports = router;
