const pool = require('../../config/database');
const { publishInternalEvent } = require('../../shared/events/internalEventBus');
const { ensureCoreInternalEventHandlersRegistered } = require('../../shared/events/coreInternalEventHandlers');
const { DOMAIN_EVENTS } = require('../../shared/contracts/serviceContracts');
const withdrawalService = require('./withdrawalService');

const handleError = (res, error, context, fallbackMessage) => {
    if (error.statusCode && error.statusCode < 500) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }

    console.error(`[withdrawalsModule] ${context} error:`, error);
    return res.status(500).json({ success: false, message: fallbackMessage });
};

const getPaymentMethods = async (req, res) => {
    try {
        return res.json(await withdrawalService.getPaymentMethods());
    } catch (error) {
        return handleError(res, error, 'getPaymentMethods', 'Failed to fetch payment methods.');
    }
};

const getMyRequests = async (req, res) => {
    try {
        return res.json(await withdrawalService.getMyRequests(req.user.id));
    } catch (error) {
        return handleError(res, error, 'getMyRequests', 'Failed to fetch withdrawal requests.');
    }
};

const cancelRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await withdrawalService.cancelRequest({
            client,
            id: req.params.id,
            userId: req.user.id,
        });
        await client.query('COMMIT');

        ensureCoreInternalEventHandlersRegistered();
        publishInternalEvent(DOMAIN_EVENTS.WITHDRAWAL_CANCELLED, {
            amount: result.amount,
            requestId: result.requestId,
            userId: result.userId,
            walletTransferId: result.walletTransferId,
        });

        return res.json({
            success: true,
            message: 'Withdrawal cancelled and amount refunded to your wallet.',
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return handleError(res, error, 'cancelRequest', 'Failed to cancel withdrawal.');
    } finally {
        client.release();
    }
};

const createRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await withdrawalService.createRequest({
            client,
            amount: req.body.amount,
            paymentDetails: req.body.payment_details,
            paymentMethodId: req.body.payment_method_id,
            userId: req.user.id,
        });
        await client.query('COMMIT');

        if (result.duplicateSuppressed) {
            return res.status(200).json(result);
        }

        ensureCoreInternalEventHandlersRegistered();
        publishInternalEvent(DOMAIN_EVENTS.WITHDRAWAL_REQUESTED, {
            amount: result.amount,
            methodName: result.methodName,
            requestId: result.requestId,
            userId: result.userId,
            walletTransferId: result.walletTransferId,
        });

        return res.json({ success: true, message: 'Withdrawal request submitted successfully.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return handleError(res, error, 'createRequest', 'Failed to submit withdrawal request.');
    } finally {
        client.release();
    }
};

const getExchangeRates = async (req, res) => {
    try {
        return res.json(await withdrawalService.getExchangeRates());
    } catch (error) {
        return handleError(res, error, 'getExchangeRates', 'Failed to fetch exchange rates.');
    }
};

const getSettings = async (req, res) => {
    try {
        return res.json(await withdrawalService.getSettings());
    } catch (error) {
        return handleError(res, error, 'getSettings', 'Failed to fetch withdrawal settings.');
    }
};

const updateSettings = async (req, res) => {
    try {
        return res.json(await withdrawalService.updateSettings({
            adminUserId: req.user.id,
            coinRate: req.body.coin_rate,
            maxAmount: req.body.max_amount,
            minAmount: req.body.min_amount,
        }));
    } catch (error) {
        return handleError(res, error, 'updateSettings', 'Failed to update withdrawal settings.');
    }
};

const getAdminRequests = async (req, res) => {
    try {
        return res.json(await withdrawalService.getAdminRequests({
            adminUserId: req.user.id,
            status: req.query.status,
        }));
    } catch (error) {
        return handleError(res, error, 'getAdminRequests', 'Failed to fetch withdrawal requests.');
    }
};

const reviewRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await withdrawalService.reviewRequest({
            action: req.body.action,
            adminUserId: req.user.id,
            client,
            rejectionReason: req.body.rejection_reason,
            requestId: parseInt(req.params.id, 10),
        });
        await client.query('COMMIT');

        return res.json({
            success: true,
            message: result.action === 'approve' ? 'Withdrawal approved.' : 'Withdrawal rejected and refunded.',
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return handleError(res, error, 'reviewRequest', 'Failed to review withdrawal request.');
    } finally {
        client.release();
    }
};

module.exports = {
    cancelRequest,
    createRequest,
    getAdminRequests,
    getExchangeRates,
    getMyRequests,
    getPaymentMethods,
    getSettings,
    reviewRequest,
    updateSettings,
};
