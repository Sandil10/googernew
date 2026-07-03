const { saveUploadedFile } = require('../media');
const mutationRepository = require('./mutationRepository');
const productReadRepository = require('./productReadRepository');
const { getUserPlanLimits } = require('../../utils/planLimits');

const BASE64_IMAGE_DATA_URL_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;

const parseJsonField = (value, fallback, invalidMessage) => {
    if (!value || value === 'undefined') return fallback;
    try {
        return JSON.parse(value);
    } catch {
        const error = new Error(invalidMessage);
        error.statusCode = 400;
        throw error;
    }
};

const parseMarketPayload = (body, { allowNull = false } = {}) => ({
    commissionInfo: parseJsonField(body.commission_data, allowNull ? null : {}, 'Invalid data format provided'),
    deliveryInfo: parseJsonField(body.delivery_data, allowNull ? null : {}, 'Invalid data format provided'),
    linksInfo: parseJsonField(body.links_data, allowNull ? null : [], 'Invalid data format provided'),
    paymentMethods: parseJsonField(body.payment_data, allowNull ? null : [], 'Invalid data format provided'),
    returnPolicy: parseJsonField(body.return_data, allowNull ? null : {}, 'Invalid data format provided'),
    shippingInfo: parseJsonField(body.shipping_data, allowNull ? null : {}, 'Invalid data format provided'),
    variants: parseJsonField(body.variants_data, allowNull ? null : [], 'Invalid data format provided'),
    warrantyInfo: parseJsonField(body.warranty_data, allowNull ? null : {}, 'Invalid data format provided'),
});

const aggregateVariantStock = (variants = []) => variants.reduce((acc, variant) => {
    const subSelections = variant?.selections || [];
    if (subSelections.length > 0) {
        return acc + subSelections.reduce((sum, selection) => sum + (parseInt(selection.stock, 10) || 0), 0);
    }
    return acc + (parseInt(variant?.stock || variant?.quantity, 10) || 0);
}, 0);

const normalizeVariantUploads = async (variants = [], files = []) => {
    let fileIndex = 0;
    const gallery = [];
    const normalizedVariants = [];

    for (const variant of variants || []) {
        const needsUploadedImage = variant.image_url
            && (variant.image_url.startsWith('blob:') || BASE64_IMAGE_DATA_URL_PATTERN.test(variant.image_url));
        const needsUploadedVideo = variant.media_type === 'video'
            && variant.video_url
            && variant.video_url.startsWith('blob:');

        if ((needsUploadedImage || needsUploadedVideo) && files[fileIndex]) {
            const file = files[fileIndex];
            const url = await saveUploadedFile(file, needsUploadedVideo ? 'product-videos' : 'products');
            const updatedVariant = {
                ...variant,
                ...(needsUploadedImage ? { url, image_url: url } : {}),
                ...(needsUploadedVideo ? { video_url: url } : {}),
            };
            gallery.push({ color: variant.color || null, url: updatedVariant.image_url || url });
            fileIndex += 1;
            normalizedVariants.push(updatedVariant);
            continue;
        }

        if (variant.image_url) {
            const persistedImage = BASE64_IMAGE_DATA_URL_PATTERN.test(variant.image_url) ? '' : variant.image_url;
            if (persistedImage) {
                gallery.push({ color: variant.color || null, url: persistedImage });
            }
        }

        normalizedVariants.push(variant);
    }

    return { gallery, variants: normalizedVariants };
};

const getImageIdentity = (url) => {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('data:')) return `DATA_URL_${url.length}`;
    const parts = url.split(/[\\/]/);
    return parts[parts.length - 1].split('?')[0] || '';
};

const createMarketItem = async (req, res) => {
    try {
        const {
            title, description, price, promo_price, category, sub_category, level3_category, manual_category, stock,
        } = req.body;
        const userId = req.user.id;
        const limits = await getUserPlanLimits(userId);
        const productCountRes = await mutationRepository.countUserActiveMarketItems(userId);
        if (productCountRes.rows[0].c >= limits.productUploadLimit) {
            return res.status(403).json({
                success: false,
                message: 'Product upload limit reached. Subscribe to a higher plan to upload more products.',
                code: 'PRODUCT_UPLOAD_LIMIT',
                limit: limits.productUploadLimit,
            });
        }

        const userResult = await mutationRepository.getUserMarketIdentity(userId);
        const username = userResult.rows[0]?.username || 'Unknown User';
        const ownerUserId = userResult.rows[0]?.user_id || null;
        const parsed = parseMarketPayload(req.body);
        const normalized = await normalizeVariantUploads(parsed.variants, req.files || []);
        const imageUrl = normalized.gallery.length > 0 ? normalized.gallery[0].url : (normalized.variants[0]?.image_url || null);

        if (!title || !price || !category) {
            return res.status(400).json({ success: false, message: 'Title, price, and category are required' });
        }
        if (!imageUrl) {
            return res.status(400).json({ success: false, message: 'At least one image is required' });
        }

        await productReadRepository.ensureMarketProductCodeColumn();
        const parsedVariants = Array.isArray(normalized.variants) ? normalized.variants : [];
        const aggregateStock = aggregateVariantStock(parsedVariants);
        const productCode = await productReadRepository.generateUniqueProductCode();
        const numericPrice = parseFloat(price);
        const numericPromoPrice = promo_price ? parseFloat(promo_price) : null;

        const newItem = await mutationRepository.insertMarketItem([
            userId,
            ownerUserId,
            username,
            title,
            description,
            numericPrice,
            numericPromoPrice,
            category,
            sub_category,
            level3_category,
            manual_category,
            parsedVariants.length > 0 ? aggregateStock : (parseInt(stock, 10) || 0),
            imageUrl,
            JSON.stringify(normalized.variants),
            JSON.stringify(parsed.shippingInfo),
            JSON.stringify(parsed.paymentMethods),
            JSON.stringify(parsed.warrantyInfo),
            JSON.stringify(parsed.returnPolicy),
            JSON.stringify(parsed.deliveryInfo),
            JSON.stringify(parsed.commissionInfo),
            JSON.stringify(parsed.linksInfo),
            productCode,
        ]);

        return res.status(201).json({
            success: true,
            message: 'Market item created successfully and is under review',
            data: newItem.rows[0],
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ success: false, message: error.message });
        }
        console.error('[marketplace] createMarketItem error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while creating market item',
            error: error.message,
        });
    }
};

const updateMarketItem = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, description, price, promo_price, category, sub_category, level3_category, manual_category, stock,
        } = req.body;
        const userId = req.user.id;
        const itemResult = await mutationRepository.getMarketItemById(id);
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        const item = itemResult.rows[0];
        if (parseInt(item.user_id, 10) !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const parsed = parseMarketPayload(req.body, { allowNull: true });
        const normalized = parsed.variants
            ? await normalizeVariantUploads(parsed.variants, req.files || [])
            : { gallery: [], variants: null };

        const imageUrl = normalized.gallery.length > 0 ? normalized.gallery[0].url : (normalized.variants?.[0]?.image_url || item.image_url);
        const numericPrice = price ? parseFloat(price) : item.price;
        const numericPromoPrice = promo_price !== undefined ? (promo_price ? parseFloat(promo_price) : null) : item.promo_price;
        const parsedVariants = normalized.variants || [];
        const aggregateStock = aggregateVariantStock(parsedVariants);

        const hasNewPhotos = Boolean(req.files && req.files.length > 0);
        const currentImgId = getImageIdentity(item.image_url);
        const proposedImgUrl = normalized.variants?.[0]?.image_url ? normalized.variants[0].image_url : null;
        const newImgId = normalized.gallery.length > 0
            ? getImageIdentity(normalized.gallery[0].url)
            : (proposedImgUrl ? getImageIdentity(proposedImgUrl) : currentImgId);
        const mainImageChanged = newImgId !== currentImgId;

        const oldCommissionInfo = productReadRepository.safeJsonParse(item.commission_info, {});
        const oldGoogerComm = oldCommissionInfo ? parseFloat(oldCommissionInfo.googer_commission ?? oldCommissionInfo.googerCommission ?? 0) : 0;
        const newGoogerComm = parsed.commissionInfo
            ? parseFloat(parsed.commissionInfo.googer_commission ?? parsed.commissionInfo.googerCommission ?? 0)
            : 0;
        const googerCommChanged = Math.abs(newGoogerComm - oldGoogerComm) > 0.01;
        const requiresReview = hasNewPhotos || mainImageChanged || googerCommChanged;
        const newStatus = requiresReview && (item.status === 'approved' || item.status === 'active')
            ? 'reviewing'
            : item.status;

        const updatedItem = await mutationRepository.updateMarketItemDetails([
            title,
            description,
            Number.isNaN(numericPrice) ? item.price : numericPrice,
            numericPromoPrice,
            category,
            sub_category,
            level3_category,
            manual_category,
            normalized.variants ? aggregateStock : (Number.isNaN(parseInt(stock, 10)) ? item.stock : parseInt(stock, 10)),
            imageUrl,
            normalized.variants ? JSON.stringify(normalized.variants) : null,
            parsed.shippingInfo ? JSON.stringify(parsed.shippingInfo) : null,
            parsed.paymentMethods ? JSON.stringify(parsed.paymentMethods) : null,
            parsed.warrantyInfo ? JSON.stringify(parsed.warrantyInfo) : null,
            parsed.returnPolicy ? JSON.stringify(parsed.returnPolicy) : null,
            parsed.deliveryInfo ? JSON.stringify(parsed.deliveryInfo) : null,
            parsed.commissionInfo ? JSON.stringify(parsed.commissionInfo) : null,
            parsed.linksInfo ? JSON.stringify(parsed.linksInfo) : null,
            newStatus,
            id,
        ]);

        return res.status(200).json({
            success: true,
            data: updatedItem.rows[0],
            wentToReview: requiresReview,
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ success: false, message: error.message });
        }
        console.error('[marketplace] updateMarketItem error:', error);
        return res.status(500).json({ success: false, message: 'Server error while updating item', error: error.message });
    }
};

const deleteMarketItem = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const itemResult = await mutationRepository.getMarketItemById(id);
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        const item = itemResult.rows[0];
        if (parseInt(item.user_id, 10) !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        await mutationRepository.softDeleteMarketItem(id);
        return res.status(200).json({ success: true, message: 'Item moved to Inactive Products' });
    } catch (error) {
        console.error('Delete error:', error);
        return res.status(500).json({ success: false, message: 'Server error while deleting item' });
    }
};

const updateMarketItemStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await mutationRepository.updateMarketItemStatus({ id, status });
        return res.status(200).json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error('Error updating status:', error);
        return res.status(500).json({ success: false, message: 'Server error while updating status' });
    }
};

module.exports = {
    createMarketItem,
    deleteMarketItem,
    updateMarketItem,
    updateMarketItemStatus,
};
