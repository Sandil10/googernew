const express = require('express');

const internalOpsAuth = require('../../../../shared/utils/internalOpsAuth');
const { loadEnv } = require('../../shared/runtime/loadEnv');
const chatController = require('../../../backend/src/controllers/chatController');
const chatRuntimeService = require('../../../backend/src/modules/chat/chatRuntimeService');
const chatRoutes = require('../../../backend/src/routes/chat');

loadEnv();

const app = express();
app.use(express.json({ limit: '20mb' }));

const invokeController = (handler, { body = {}, params = {}, query = {}, userId }) => new Promise((resolve, reject) => {
    const req = {
        app: { get: () => undefined },
        body,
        params,
        query,
        user: { id: Number(userId) },
    };
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            resolve({
                payload,
                statusCode: this.statusCode || 200,
            });
            return this;
        },
    };

    Promise.resolve(handler(req, res)).catch(reject);
});

app.get('/health', async (req, res) => {
    await chatRuntimeService.ensureChatTables().catch(() => {});
    res.json({ service: 'chat-service', success: true });
});

app.use('/internal', internalOpsAuth);

app.post('/internal/chat/messages', async (req, res) => {
    try {
        const senderId = Number(req.body?.senderId);
        if (!senderId) {
            return res.status(400).json({ success: false, message: 'senderId is required' });
        }

        await chatRuntimeService.ensureChatTables();
        const message = await chatRuntimeService.createChatMessage(senderId, req.body?.payload || {});
        return res.status(201).json({
            success: true,
            data: message,
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
});

app.get('/internal/chat/conversations', async (req, res) => {
    try {
        const result = await invokeController(chatController.getConversations, {
            query: req.query,
            userId: req.query.userId,
        });
        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/internal/chat/messages/:participantId', async (req, res) => {
    try {
        const result = await invokeController(chatController.getMessages, {
            params: req.params,
            query: req.query,
            userId: req.query.userId,
        });
        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/internal/chat/conversations/hide', async (req, res) => {
    try {
        const result = await invokeController(chatController.hideConversation, {
            body: { participantId: req.body?.participantId },
            userId: req.body?.userId,
        });
        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/internal/chat/conversations/unhide', async (req, res) => {
    try {
        const result = await invokeController(chatController.unhideConversation, {
            body: { participantId: req.body?.participantId },
            userId: req.body?.userId,
        });
        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/internal/chat/conversations/:participantId', async (req, res) => {
    try {
        const result = await invokeController(chatController.deleteConversation, {
            params: req.params,
            query: req.query,
            userId: req.query.userId,
        });
        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/internal/chat/block', async (req, res) => {
    try {
        const result = await invokeController(chatController.blockUser, {
            body: { userId: req.body?.blockedUserId },
            userId: req.body?.userId,
        });
        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/internal/chat/unblock', async (req, res) => {
    try {
        const result = await invokeController(chatController.unblockUser, {
            body: { userId: req.body?.blockedUserId },
            userId: req.body?.userId,
        });
        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/internal/chat/blocked-users', async (req, res) => {
    try {
        const result = await invokeController(chatController.getBlockedUsers, {
            query: req.query,
            userId: req.query.userId,
        });
        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.use('/api/chat', chatRoutes);
app.use('/chat', chatRoutes);

const port = Number(process.env.CHAT_SERVICE_PORT || 5005);
app.listen(port, () => {
    console.log(`[chat-service] listening on ${port}`);
});
