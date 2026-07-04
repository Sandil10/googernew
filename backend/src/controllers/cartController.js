const pool = require('../config/database');
const { ensureCartSchema } = require('../modules/cart/cartRuntimeRepository');
const { success, error } = require('../utils/responseHandler');

const normalizeCartItem = (row) => ({
    ...row,
    productId: Number(row.product_id),
    promo_price: row.promo_price !== null ? Number(row.promo_price) : null,
    price: Number(row.price || 0),
    quantity: Number(row.quantity || 1),
    variantIndex: row.variant_index,
    selected: row.selected !== false,
    seller_id: row.seller_id || undefined,
    shipping_info: row.shipping_info || null,
    product_discount: row.product_discount !== null ? Number(row.product_discount || 0) : 0,
    selected_shipping_country: row.selected_shipping_country || null,
    payment_methods: Array.isArray(row.payment_methods) ? row.payment_methods : (row.payment_methods || []),
    reseller_ref: row.reseller_ref || null,
    resell_commission_percentage: row.resell_commission_percentage !== null ? Number(row.resell_commission_percentage || 0) : 0,
});

const findMatchingCartItem = async (userId, item) => {
    const result = await pool.query(
        `SELECT *
         FROM cart_items
         WHERE user_id = $1
           AND product_id = $2
           AND size IS NOT DISTINCT FROM $3
           AND color IS NOT DISTINCT FROM $4
           AND variant_index IS NOT DISTINCT FROM $5
           AND selected_shipping_country IS NOT DISTINCT FROM $6
           AND reseller_ref IS NOT DISTINCT FROM $7
         LIMIT 1`,
        [
            userId,
            Number(item.productId),
            item.size ?? null,
            item.color ?? null,
            item.variantIndex ?? null,
            item.selected_shipping_country ?? null,
            item.reseller_ref ?? null,
        ]
    );

    return result.rows[0] || null;
};

exports.getCart = async (req, res) => {
    try {
        await ensureCartSchema();

        const result = await pool.query(
            `SELECT *
             FROM cart_items
             WHERE user_id = $1
             ORDER BY created_at ASC, id ASC`,
            [req.user.id]
        );

        return success(res, result.rows.map(normalizeCartItem), 'Cart fetched successfully');
    } catch (err) {
        console.error('getCart error:', err);
        return error(res, 'Failed to fetch cart', 500);
    }
};

exports.addCartItem = async (req, res) => {
    try {
        await ensureCartSchema();

        const {
            productId,
            title,
            price,
            promo_price = null,
            image_url = null,
            quantity = 1,
            size = null,
            color = null,
            variantIndex = null,
            selected = true,
            seller_id = null,
            shipping_info = null,
            product_discount = 0,
            selected_shipping_country = null,
            payment_methods = [],
            reseller_ref = null,
            resell_commission_percentage = 0,
        } = req.body || {};

        if (!productId || !title) {
            return error(res, 'Product id and title are required', 400);
        }

        const safeQuantity = Math.max(1, Number(quantity) || 1);
        const itemPayload = {
            productId,
            size,
            color,
            variantIndex,
            selected_shipping_country,
            reseller_ref,
        };

        const existing = await findMatchingCartItem(req.user.id, itemPayload);

        if (existing) {
            const updated = await pool.query(
                `UPDATE cart_items
                 SET quantity = quantity + $1,
                     title = $2,
                     price = $3,
                     promo_price = $4,
                     image_url = $5,
                     selected = $6,
                     seller_id = $7,
                     shipping_info = $8,
                     product_discount = $9,
                     payment_methods = $10,
                     reseller_ref = $11,
                     resell_commission_percentage = $12,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $13
                 RETURNING *`,
                [
                    safeQuantity,
                    title,
                    Number(price || 0),
                    promo_price !== null ? Number(promo_price) : null,
                    image_url,
                    selected !== false,
                    seller_id,
                    shipping_info,
                    Number(product_discount || 0),
                    JSON.stringify(payment_methods || []),
                    reseller_ref ? String(reseller_ref) : null,
                    Number(resell_commission_percentage || 0),
                    existing.id,
                ]
            );

            return success(res, normalizeCartItem(updated.rows[0]), 'Cart item updated successfully');
        }

        const inserted = await pool.query(
            `INSERT INTO cart_items (
                user_id,
                product_id,
                title,
                price,
                promo_price,
                image_url,
                quantity,
                size,
                color,
                variant_index,
                selected,
                seller_id,
                shipping_info,
                product_discount,
                selected_shipping_country,
                payment_methods,
                reseller_ref,
                resell_commission_percentage
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
             )
             RETURNING *`,
            [
                req.user.id,
                Number(productId),
                title,
                Number(price || 0),
                promo_price !== null ? Number(promo_price) : null,
                image_url,
                safeQuantity,
                size,
                color,
                variantIndex,
                selected !== false,
                seller_id,
                shipping_info,
                Number(product_discount || 0),
                selected_shipping_country,
                JSON.stringify(payment_methods || []),
                reseller_ref ? String(reseller_ref) : null,
                Number(resell_commission_percentage || 0),
            ]
        );

        return success(res, normalizeCartItem(inserted.rows[0]), 'Cart item added successfully', 201);
    } catch (err) {
        console.error('addCartItem error:', err);
        return error(res, 'Failed to add item to cart', 500);
    }
};

exports.updateCartItem = async (req, res) => {
    try {
        await ensureCartSchema();

        const itemId = Number(req.params.id);
        if (!itemId) {
            return error(res, 'Valid cart item id is required', 400);
        }

        const fields = [];
        const values = [];
        let index = 1;

        if (req.body.quantity !== undefined) {
            const quantity = Math.max(1, Number(req.body.quantity) || 1);
            fields.push(`quantity = $${index++}`);
            values.push(quantity);
        }

        if (req.body.selected !== undefined) {
            fields.push(`selected = $${index++}`);
            values.push(req.body.selected !== false);
        }

        if (!fields.length) {
            return error(res, 'No cart item updates provided', 400);
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(itemId, req.user.id);

        const result = await pool.query(
            `UPDATE cart_items
             SET ${fields.join(', ')}
             WHERE id = $${index++}
               AND user_id = $${index}
             RETURNING *`,
            values
        );

        if (!result.rows.length) {
            return error(res, 'Cart item not found', 404);
        }

        return success(res, normalizeCartItem(result.rows[0]), 'Cart item updated successfully');
    } catch (err) {
        console.error('updateCartItem error:', err);
        return error(res, 'Failed to update cart item', 500);
    }
};

exports.deleteCartItem = async (req, res) => {
    try {
        await ensureCartSchema();

        const itemId = Number(req.params.id);
        if (!itemId) {
            return error(res, 'Valid cart item id is required', 400);
        }

        const result = await pool.query(
            `DELETE FROM cart_items
             WHERE id = $1
               AND user_id = $2
             RETURNING id`,
            [itemId, req.user.id]
        );

        if (!result.rows.length) {
            return error(res, 'Cart item not found', 404);
        }

        return success(res, { id: itemId }, 'Cart item removed successfully');
    } catch (err) {
        console.error('deleteCartItem error:', err);
        return error(res, 'Failed to delete cart item', 500);
    }
};

exports.clearCart = async (req, res) => {
    try {
        await ensureCartSchema();

        await pool.query(
            `DELETE FROM cart_items
             WHERE user_id = $1`,
            [req.user.id]
        );

        return success(res, [], 'Cart cleared successfully');
    } catch (err) {
        console.error('clearCart error:', err);
        return error(res, 'Failed to clear cart', 500);
    }
};
