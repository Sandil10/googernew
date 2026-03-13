const pool = require('../config/database');

// Create a new market item
exports.createMarketItem = async (req, res) => {
    try {
        const {
            title, description, price, promo_price, category, sub_category, level3_category, manual_category, stock,
            variants_data, shipping_data, payment_data, warranty_data,
            return_data, delivery_data, commission_data, links_data
        } = req.body;

        const userId = req.user.id;

        // Fetch real username and 6-digit user_id (string) from users table
        const userResult = await pool.query('SELECT username, user_id FROM users WHERE id = $1', [userId]);
        const username = userResult.rows.length > 0 ? userResult.rows[0].username : 'Unknown User';
        const owner_user_id = userResult.rows.length > 0 ? userResult.rows[0].user_id : null;

        // Parse incoming JSON strings from FormData with error handling
        let variants = [];
        let shipping_info = {};
        let payment_methods = [];
        let warranty_info = {};
        let return_policy = {};
        let delivery_info = {};
        let commission_info = {};
        let links_info = [];

        try {
            if (variants_data && variants_data !== 'undefined') variants = JSON.parse(variants_data);
            if (shipping_data && shipping_data !== 'undefined') shipping_info = JSON.parse(shipping_data);
            if (payment_data && payment_data !== 'undefined') payment_methods = JSON.parse(payment_data);
            if (warranty_data && warranty_data !== 'undefined') warranty_info = JSON.parse(warranty_data);
            if (return_data && return_data !== 'undefined') return_policy = JSON.parse(return_data);
            if (delivery_data && delivery_data !== 'undefined') delivery_info = JSON.parse(delivery_data);
            if (commission_data && commission_data !== 'undefined') commission_info = JSON.parse(commission_data);
            if (links_data && links_data !== 'undefined') links_info = JSON.parse(links_data);
        } catch (parseErr) {
            console.error('❌ JSON Parse Error:', parseErr);
            return res.status(400).json({ success: false, message: 'Invalid data format provided' });
        }

        // Handle Image Uploads (Convert memory buffers to Base64 Data URLs)
        let gallery = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                const base64 = file.buffer.toString('base64');
                const url = `data:${file.mimetype};base64,${base64}`;
                gallery.push({ url, color: (variants[index] && variants[index].color) || null });
                if (variants[index]) variants[index].url = url;
            });
        }

        const imageUrl = gallery.length > 0 ? gallery[0].url : (variants[0]?.url || null);

        if (!title || !price || !category) {
            return res.status(400).json({ success: false, message: 'Title, price, and category are required' });
        }

        if (!imageUrl) {
            return res.status(400).json({ success: false, message: 'At least one image is required' });
        }

        const numericPrice = parseFloat(price);
        const numericPromoPrice = promo_price ? parseFloat(promo_price) : null;

        if (isNaN(numericPrice)) {
            return res.status(400).json({ success: false, message: 'Invalid price format' });
        }

        const newItem = await pool.query(
            `INSERT INTO market (
                user_id, owner_user_id, username, title, description, price, promo_price, category, 
                sub_category, level3_category, manual_category, stock, image_url, status,
                variants, shipping_info, payment_methods, warranty_info, return_policy, delivery_info, commission_info, links_data
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'reviewing', $14, $15, $16, $17, $18, $19, $20, $21)
             RETURNING *`,
            [
                userId, owner_user_id, username, title, description, numericPrice, numericPromoPrice, category,
                sub_category, level3_category, manual_category, parseInt(stock) || 0, imageUrl,
                JSON.stringify(variants), JSON.stringify(shipping_info),
                JSON.stringify(payment_methods), JSON.stringify(warranty_info),
                JSON.stringify(return_policy), JSON.stringify(delivery_info),
                JSON.stringify(commission_info), JSON.stringify(links_info)
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Market item created successfully and is under review',
            data: newItem.rows[0]
        });
    } catch (error) {
        console.error('❌ [createMarketItem] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating market item',
            error: error.message
        });
    }
};

// Update an item
exports.updateMarketItem = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, description, price, promo_price, category, sub_category, level3_category, manual_category, stock,
            variants_data, shipping_data, payment_data, warranty_data,
            return_data, delivery_data, commission_data, links_data
        } = req.body;
        const userId = req.user.id;

        const itemResult = await pool.query('SELECT * FROM market WHERE id = $1', [id]);
        if (itemResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Item not found' });
        const item = itemResult.rows[0];

        if (parseInt(item.user_id) !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });

        let variants = null;
        let shipping_info = null;
        let payment_methods = null;
        let warranty_info = null;
        let return_policy = null;
        let delivery_info = null;
        let commission_info = null;
        let links_info = null;

        try {
            if (variants_data && variants_data !== 'undefined') variants = JSON.parse(variants_data);
            if (shipping_data && shipping_data !== 'undefined') shipping_info = JSON.parse(shipping_data);
            if (payment_data && payment_data !== 'undefined') payment_methods = JSON.parse(payment_data);
            if (warranty_data && warranty_data !== 'undefined') warranty_info = JSON.parse(warranty_data);
            if (return_data && return_data !== 'undefined') return_policy = JSON.parse(return_data);
            if (delivery_data && delivery_data !== 'undefined') delivery_info = JSON.parse(delivery_data);
            if (commission_data && commission_data !== 'undefined') commission_info = JSON.parse(commission_data);
            if (links_data && links_data !== 'undefined') links_info = JSON.parse(links_data);
        } catch (parseErr) {
            return res.status(400).json({ success: false, message: 'Invalid data format' });
        }

        let newGalleryItems = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                const base64 = file.buffer.toString('base64');
                const url = `data:${file.mimetype};base64,${base64}`;
                newGalleryItems.push({ url, color: (variants && variants[index] && variants[index].color) || null });
                if (variants && variants[index]) variants[index].url = url;
            });
        }

        const imageUrl = newGalleryItems.length > 0 ? newGalleryItems[0].url : (variants?.[0]?.url || item.image_url);
        const numericPrice = price ? parseFloat(price) : item.price;
        const numericPromoPrice = promo_price !== undefined ? (promo_price ? parseFloat(promo_price) : null) : item.promo_price;

        const updatedItem = await pool.query(
            `UPDATE market 
             SET title = COALESCE($1, title), 
                 description = COALESCE($2, description), 
                 price = COALESCE($3, price), 
                 promo_price = $4,
                 category = COALESCE($5, category), 
                 sub_category = COALESCE($6, sub_category),
                 level3_category = COALESCE($7, level3_category),
                 manual_category = COALESCE($8, manual_category),
                 stock = COALESCE($9, stock),
                 image_url = COALESCE($10, image_url),
                 variants = COALESCE($11, variants),
                 shipping_info = COALESCE($12, shipping_info),
                 payment_methods = COALESCE($13, payment_methods),
                 warranty_info = COALESCE($14, warranty_info),
                 return_policy = COALESCE($15, return_policy),
                 delivery_info = COALESCE($16, delivery_info),
                 commission_info = COALESCE($17, commission_info),
                 links_data = COALESCE($18, links_data),
                 status = 'reviewing',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $19 RETURNING *`,
            [
                title, description, isNaN(numericPrice) ? item.price : numericPrice,
                numericPromoPrice,
                category, sub_category, level3_category, manual_category, 
                isNaN(parseInt(stock)) ? item.stock : parseInt(stock),
                imageUrl,
                variants ? JSON.stringify(variants) : null,
                shipping_info ? JSON.stringify(shipping_info) : null,
                payment_methods ? JSON.stringify(payment_methods) : null,
                warranty_info ? JSON.stringify(warranty_info) : null,
                return_policy ? JSON.stringify(return_policy) : null,
                delivery_info ? JSON.stringify(delivery_info) : null,
                commission_info ? JSON.stringify(commission_info) : null,
                links_info ? JSON.stringify(links_info) : null,
                id
            ]
        );

        res.status(200).json({ success: true, data: updatedItem.rows[0] });
    } catch (error) {
        console.error('Error updating market item:', error);
        res.status(500).json({ success: false, message: 'Server error while updating item', error: error.message });
    }
};

// Delete an item (Soft delete for 7 days)
exports.deleteMarketItem = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const itemResult = await pool.query('SELECT * FROM market WHERE id = $1', [id]);
        if (itemResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Item not found' });
        const item = itemResult.rows[0];
        if (parseInt(item.user_id) !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });

        // Soft delete: Change status and update updated_at for tracking
        await pool.query("UPDATE market SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);

        res.status(200).json({ success: true, message: 'Item moved to Inactive Products' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting item' });
    }
};

// Get all market items
exports.getMarketItems = async (req, res) => {
    try {
        const { category, user_id, status } = req.query;
        let query = `SELECT m.*, u.username as owner_username, u.profile_picture 
                     FROM market m 
                     LEFT JOIN users u ON m.user_id = u.id 
                     WHERE 1=1`;
        const params = [];

        if (category) {
            params.push(category);
            query += ` AND m.category = $${params.length}`;
        }
        if (user_id) {
            params.push(user_id);
            query += ` AND m.user_id = $${params.length}`;
        }
        if (status) {
            const statusArray = status.split(',');
            params.push(statusArray);
            query += ` AND m.status = ANY($${params.length})`;
        } else {
            // Default filter: hide deleted items from public market
            // Hide items in 'deleted' status that are older than 7 days based on updated_at
            query += " AND (m.status != 'deleted' OR m.updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days')";
        }

        if (req.query.order_status) {
            params.push(req.query.order_status);
            query += ` AND m.order_status = $${params.length}`;
        }

        query += ` ORDER BY m.created_at DESC`;

        const result = await pool.query(query, params);
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get single item by ID
exports.getMarketItemById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT m.*, u.username as owner_username, u.profile_picture 
             FROM market m 
             LEFT JOIN users u ON m.user_id = u.id 
             WHERE m.id = $1`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update item status (e.g., for admin review)
exports.updateMarketItemStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await pool.query('UPDATE market SET status = $1 WHERE id = $2', [status, id]);
        res.status(200).json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ success: false, message: 'Server error while updating status' });
    }
};

// Toggle like on an item
exports.toggleLike = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const checkLike = await pool.query('SELECT id FROM market_likes WHERE market_id = $1 AND user_id = $2', [id, userId]);

        if (checkLike.rows.length > 0) {
            await pool.query('DELETE FROM market_likes WHERE market_id = $1 AND user_id = $2', [id, userId]);
            res.status(200).json({ success: true, liked: false });
        } else {
            await pool.query('INSERT INTO market_likes (market_id, user_id) VALUES ($1, $2)', [id, userId]);
            res.status(200).json({ success: true, liked: true });
        }
    } catch (error) {
        console.error('Error toggling like:', error);
        res.status(500).json({ success: false, message: 'Server error toggling like' });
    }
};

// Add a comment to an item
exports.addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        const userId = req.user.id;

        if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });

        const result = await pool.query(
            'INSERT INTO market_comments (market_id, user_id, text) VALUES ($1, $2, $3) RETURNING *',
            [id, userId, text]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ success: false, message: 'Server error adding comment' });
    }
};

// Get all comments for an item
exports.getComments = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT c.*, u.username, u.profile_picture 
             FROM market_comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.market_id = $1 
             ORDER BY c.created_at DESC`,
            [id]
        );
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ success: false, message: 'Server error fetching comments' });
    }
};
