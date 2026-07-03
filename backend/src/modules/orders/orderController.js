const orderService = require('./orderService');

const handleError = (res, error, context, fallbackMessage) => {
    if (error.statusCode && error.statusCode < 500) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }

    console.error(`[ordersModule] ${context} error:`, error);
    return res.status(500).json({ success: false, message: fallbackMessage });
};

const createOrder = async (req, res) => {
    try {
        return res.status(201).json(await orderService.createOrder({
            buyerId: req.user.id,
            color: req.body.color,
            itemId: req.body.item_id,
            paymentMethod: req.body.payment_method || 'wallet',
            quantity: req.body.quantity,
            resellerRef: req.body.reseller_ref,
            shippingAddress: req.body.shipping_address,
            shippingFee: req.body.shipping_fee,
            size: req.body.size,
            variantIndex: req.body.variant_index,
            walletTransferId: req.body.wallet_transfer_id,
        }));
    } catch (error) {
        return handleError(res, error, 'createOrder', 'Server error');
    }
};

const createBulkOrder = async (req, res) => {
    try {
        return res.status(201).json(await orderService.createBulkOrder({
            buyerId: req.user.id,
            items: req.body.items || [],
            paymentMethod: req.body.payment_method || 'wallet',
            shippingAddress: req.body.shipping_address,
            walletTransferId: req.body.wallet_transfer_id,
        }));
    } catch (error) {
        return handleError(res, error, 'createBulkOrder', 'Server error during bulk order');
    }
};

const submitOrderReport = async (req, res) => {
    try {
        return res.status(200).json(await orderService.submitOrderReport({
            customText: req.body.custom_text,
            id: req.params.id,
            reason: req.body.reason,
            side: req.body.side,
            userId: req.user.id,
        }));
    } catch (error) {
        return handleError(res, error, 'submitOrderReport', 'Server error');
    }
};

const getOrderBadgeCounts = async (req, res) => {
    try {
        return res.status(200).json(await orderService.getOrderBadgeCounts(req.user.id));
    } catch (error) {
        return handleError(res, error, 'getOrderBadgeCounts', 'Server error');
    }
};

const getBuyerOrders = async (req, res) => {
    try {
        return res.status(200).json(await orderService.getBuyerOrders({
            status: req.query.status,
            userId: req.user.id,
        }));
    } catch (error) {
        return handleError(res, error, 'getBuyerOrders', 'Server error');
    }
};

const getSellerOrders = async (req, res) => {
    try {
        return res.status(200).json(await orderService.getSellerOrders({
            status: req.query.status,
            userId: req.user.id,
        }));
    } catch (error) {
        return handleError(res, error, 'getSellerOrders', 'Server error');
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        return res.status(200).json(await orderService.updateOrderStatus({
            id: req.params.id,
            status: req.body.status,
            userId: req.user.id,
        }));
    } catch (error) {
        return handleError(res, error, 'updateOrderStatus', 'Server error');
    }
};

const cancelOrderGroup = async (req, res) => {
    try {
        return res.status(200).json(await orderService.cancelOrderGroup({
            orderNumber: req.params.orderNumber,
            userId: req.user.id,
        }));
    } catch (error) {
        return handleError(res, error, 'cancelOrderGroup', 'Server error');
    }
};

const updateOrderGroupStatus = async (req, res) => {
    try {
        return res.status(200).json(await orderService.updateOrderGroupStatus({
            orderNumber: req.params.orderNumber,
            status: req.body.status,
            userId: req.user.id,
        }));
    } catch (error) {
        return handleError(res, error, 'updateOrderGroupStatus', 'Server error');
    }
};

module.exports = {
    cancelOrderGroup,
    createBulkOrder,
    createOrder,
    getBuyerOrders,
    getOrderBadgeCounts,
    getSellerOrders,
    submitOrderReport,
    updateOrderGroupStatus,
    updateOrderStatus,
};
