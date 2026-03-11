const pool = require('../config/database');

// Create a new order (Buying an item)
exports.createOrder = async (req, res) => {
    try {
        const { item_id } = req.body;
        const buyer_id = req.user.id;

        // Verify item exists and get seller_id
        const itemResult = await pool.query('SELECT * FROM market WHERE id = $1', [item_id]);
        if (itemResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Item not found' });

        const item = itemResult.rows[0];
        const seller_id = item.user_id;

        if (buyer_id === seller_id) {
            return res.status(400).json({ success: false, message: 'You cannot buy your own product' });
        }

        const newOrder = await pool.query(
            'INSERT INTO orders (item_id, buyer_id, seller_id, status) VALUES ($1, $2, $3, $4) RETURNING *',
            [item_id, buyer_id, seller_id, 'pending']
        );

        res.status(201).json({ success: true, data: newOrder.rows[0] });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: 'Server error while creating order' });
    }
};

// Helper to auto-complete orders that have been delivered for more than 7 days
const autoCompleteOrders = async () => {
    try {
        await pool.query(`
            UPDATE orders 
            SET status = 'received', updated_at = CURRENT_TIMESTAMP 
            WHERE status = 'delivered' 
            AND updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
        `);
    } catch (error) {
        console.error('Auto-complete orders error:', error);
    }
};

// Get orders for buyer
exports.getBuyerOrders = async (req, res) => {
    try {
        await autoCompleteOrders();
        const buyer_id = req.user.id;
        const { status } = req.query;

        let query = `
            SELECT o.*, m.title, m.image_url, m.price, u.username as seller_username
            FROM orders o
            JOIN market m ON o.item_id = m.id
            JOIN users u ON o.seller_id = u.id
            WHERE o.buyer_id = $1
        `;
        const params = [buyer_id];

        if (status && status !== 'all') {
            const statusArray = status.split(',');
            params.push(statusArray);
            query += ` AND o.status = ANY($${params.length})`;
        }

        query += ' ORDER BY o.created_at DESC';

        const result = await pool.query(query, params);
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get buyer orders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get orders for seller
exports.getSellerOrders = async (req, res) => {
    try {
        await autoCompleteOrders();
        const seller_id = req.user.id;
        const { status } = req.query;

        let query = `
            SELECT o.*, m.title, m.image_url, m.price, u.username as buyer_username
            FROM orders o
            JOIN market m ON o.item_id = m.id
            JOIN users u ON o.buyer_id = u.id
            WHERE o.seller_id = $1
        `;
        const params = [seller_id];

        if (status && status !== 'all') {
            const statusArray = status.split(',');
            params.push(statusArray);
            query += ` AND o.status = ANY($${params.length})`;
        }

        query += ' ORDER BY o.created_at DESC';

        const result = await pool.query(query, params);
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get seller orders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update order status (Seller action)
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // processing, shipped, delivered, returns
        const seller_id = req.user.id;

        // Verify ownership
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (orderResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

        const order = orderResult.rows[0];
        const isSeller = order.seller_id === seller_id;
        const isBuyer = order.buyer_id === seller_id; // seller_id variable name is misleading now, it's actually user_id

        if (status === 'received') {
            if (!isBuyer) return res.status(403).json({ success: false, message: 'Only the buyer can confirm receipt' });
            if (order.status !== 'delivered') return res.status(400).json({ success: false, message: 'Order must be delivered before confirming receipt' });
        } else if (order.seller_id !== seller_id) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this order' });
        }

        const updatedOrder = await pool.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, id]
        );

        res.status(200).json({ success: true, data: updatedOrder.rows[0] });
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
