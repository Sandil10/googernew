const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// All wallet_transfers — every row, no filter
router.get('/all-transactions', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                t.*,
                s.username AS sender_username, s.full_name AS sender_full_name,
                s.user_id  AS sender_readable_id, s.user_type AS sender_user_type,
                r.username AS receiver_username, r.full_name AS receiver_full_name,
                r.user_id  AS receiver_readable_id, r.user_type AS receiver_user_type
            FROM wallet_transfers t
            JOIN  users s ON t.sender_id   = s.id
            LEFT JOIN users r ON t.receiver_id = r.id
            ORDER BY t.created_at DESC
        `);
        res.json({ success: true, transactions: result.rows });
    } catch (err) {
        console.error('admin /all-transactions error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Coin collect detail
router.get('/coin-collect-detail', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                acc.ad_id, acc.ad_type, acc.commission, acc.reward_amount,
                acc.advertiser_charge, acc.created_at,
                a.user_id   AS advertiser_id,
                a.full_name AS advertiser_name,
                c.user_id   AS collector_user_id,
                c.full_name AS collector_name
            FROM ad_coin_collections acc
            LEFT JOIN ads ad ON acc.ad_id = ad.ad_id
            LEFT JOIN users a ON ad.user_id = a.id
            LEFT JOIN users c ON acc.user_id = c.id
            ORDER BY acc.created_at DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('admin /coin-collect-detail error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Profile promote detail
router.get('/profile-promote-detail', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                wt.id, wt.amount, wt.commission, wt.note, wt.status, wt.created_at,
                a.ad_id,
                COALESCE(owner.full_name, u.full_name)   AS user_name,
                COALESCE(owner.user_id,  u.user_id)      AS user_readable_id,
                COALESCE(owner.username, u.username)     AS username,
                CASE
                    WHEN wt.type = 'ad_refund' OR wt.note ILIKE 'Ad Refund - %' THEN 'refund'
                    ELSE 'credit'
                END AS event_type,
                CASE
                    WHEN wt.type = 'ad_refund' OR wt.note ILIKE 'Ad Refund - %'
                        THEN -ABS(COALESCE(wt.amount, 0))
                    ELSE ABS(COALESCE(NULLIF(wt.commission, 0), wt.amount, 0))
                END AS signed_amount
            FROM wallet_transfers wt
            LEFT JOIN ads a     ON wt.note ILIKE '%' || a.ad_id || '%'
            LEFT JOIN users owner ON a.user_id = owner.id
            LEFT JOIN users u   ON wt.sender_id = u.id
            WHERE (
                wt.type = 'profile_promote'
                OR (
                    (wt.type = 'ad_refund' OR (wt.type = 'transfer' AND wt.note ILIKE 'Ad Refund - %'))
                    AND a.campaign_type = 'Profile Promote'
                )
            )
            ORDER BY wt.created_at DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('admin /profile-promote-detail error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Photo / Product promote collection detail
router.get('/ad-promote-collection-detail', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                wt.id, wt.amount, wt.commission, wt.note, wt.status, wt.created_at,
                a.ad_id,
                COALESCE(owner.full_name, u.full_name)   AS user_name,
                COALESCE(owner.user_id,  u.user_id)      AS user_readable_id,
                COALESCE(owner.username, u.username)     AS username,
                CASE
                    WHEN COALESCE(a.campaign_type, '') IN ('Product Promote', 'Photo and Video') THEN a.campaign_type
                    WHEN wt.note ILIKE '%Product Promote%' THEN 'Product Promote'
                    WHEN wt.note ILIKE '%Photo Promote%' OR wt.note ILIKE '%Photo and Video%' THEN 'Photo and Video'
                    ELSE 'Ad Promote'
                END AS ad_category,
                CASE
                    WHEN wt.type = 'ad_refund' OR wt.note ILIKE 'Ad Refund - %' THEN 'refund'
                    ELSE 'credit'
                END AS event_type,
                CASE
                    WHEN wt.type = 'ad_refund' OR wt.note ILIKE 'Ad Refund - %'
                        THEN -ABS(COALESCE(wt.amount, 0))
                    ELSE ABS(COALESCE(NULLIF(wt.commission, 0), wt.amount, 0))
                END AS signed_amount
            FROM wallet_transfers wt
            LEFT JOIN ads a     ON wt.note ILIKE '%' || a.ad_id || '%'
            LEFT JOIN users owner ON a.user_id = owner.id
            LEFT JOIN users u   ON wt.sender_id = u.id
            WHERE (
                (wt.type = 'transfer' AND wt.note ILIKE 'Ad Promote - %')
                OR (
                    (wt.type = 'ad_refund' OR (wt.type = 'transfer' AND wt.note ILIKE 'Ad Refund - %'))
                    AND (
                        a.campaign_type IN ('Photo and Video', 'Product Promote')
                        OR wt.note ILIKE '%Product Promote%'
                        OR wt.note ILIKE '%Photo and Video%'
                    )
                )
            )
            ORDER BY wt.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('admin /ad-promote-collection-detail error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Product commission history
router.get('/product-commission-history', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                o.id AS order_id,
                o.status AS order_status,
                COALESCE(wt.amount, 0) AS commission_amount,
                wt.status AS transfer_status,
                wt.note,
                COALESCE(wt.created_at, o.created_at) AS created_at,
                seller.full_name AS seller_name,
                seller.username  AS seller_username,
                seller.user_id   AS seller_readable_id,
                buyer.full_name  AS buyer_name,
                buyer.username   AS buyer_username,
                buyer.user_id    AS buyer_readable_id
            FROM orders o
            LEFT JOIN wallet_transfers wt ON wt.id = o.seller_commission_transfer_id
            LEFT JOIN users seller ON seller.id = o.seller_id
            LEFT JOIN users buyer  ON buyer.id  = o.buyer_id
            WHERE o.seller_commission_transfer_id IS NOT NULL
            ORDER BY COALESCE(wt.created_at, o.created_at) DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('admin /product-commission-history error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Capital transfer history (system_topup)
router.get('/capital-transfer-history', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                wt.id, wt.commission AS transfer_amount, wt.note, wt.created_at,
                u.full_name AS sender_name,
                u.username,
                u.user_id   AS user_readable_id
            FROM wallet_transfers wt
            LEFT JOIN users u ON wt.sender_id = u.id
            WHERE wt.type = 'system_topup' AND wt.status = 'accepted'
            ORDER BY wt.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('admin /capital-transfer-history error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Withdrawal transactions
router.get('/withdrawal-transactions', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                wt.id, wt.type, wt.amount, wt.note, wt.status, wt.created_at,
                s.full_name  AS sender_name,   s.username AS sender_username,   s.user_id AS sender_readable_id,
                r.full_name  AS receiver_name, r.username AS receiver_username, r.user_id AS receiver_readable_id
            FROM wallet_transfers wt
            LEFT JOIN users s ON wt.sender_id   = s.id
            LEFT JOIN users r ON wt.receiver_id = r.id
            WHERE wt.type IN ('withdrawal_hold', 'withdrawal_refund')
            ORDER BY wt.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('admin /withdrawal-transactions error:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
