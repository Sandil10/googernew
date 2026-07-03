const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const pool = require('../../config/database');
const chatRuntimeService = require('./chatRuntimeService');
const chatService = require('./chatService');
const { attachSocketRedisAdapter } = require('../../shared/redis/runtime');

const userRoom = (userId) => `user:${userId}`;

const authenticateSocket = async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
        if (!token) return next(new Error('Authentication required.'));

        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        if (!secret) return next(new Error('Server configuration error.'));

        const decoded = jwt.verify(token, secret);
        const userResult = await pool.query(
            'SELECT token_version FROM users WHERE id = $1 LIMIT 1',
            [decoded.id]
        );
        const dbTokenVersion = userResult.rows[0]?.token_version ?? 0;
        if (decoded.tokenVersion !== dbTokenVersion) {
            return next(new Error('Session has been invalidated. Please log in again.'));
        }

        socket.user = decoded;
        return next();
    } catch (error) {
        return next(new Error(error.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid authentication token.'));
    }
};

const attachChatSocket = (server, corsOptions) => {
    const io = new Server(server, {
        cors: corsOptions,
        path: '/socket.io',
    });

    attachSocketRedisAdapter(io).catch((error) => {
        console.error('[socket] Redis adapter startup failed:', error.message);
    });

    io.use(authenticateSocket);

    io.on('connection', async (socket) => {
        const userId = Number(socket.user?.id);
        if (!userId) {
            socket.disconnect(true);
            return;
        }

        socket.join(userRoom(userId));

        try {
            await chatRuntimeService.ensureChatTables();
            await pool.query(
                `
                    INSERT INTO chat_presence (user_id, last_seen_at, updated_at)
                    VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id)
                    DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                `,
                [userId]
            );
            io.emit('chat:presence', {
                user_id: userId,
                active_participant_id: null,
                status: 'online',
                last_seen_at: new Date().toISOString(),
            });
        } catch (error) {
            console.error('[socket] presence update failed:', error.message);
        }

        socket.on('chat:send_message', async (payload = {}, ack) => {
            try {
                const message = await chatService.createChatMessage(userId, payload);
                const receiverId = Number(message.receiver_id);

                io.to(userRoom(userId)).emit('chat:message', message);
                if (receiverId && receiverId !== userId) {
                    io.to(userRoom(receiverId)).emit('chat:message', message);
                }

                if (typeof ack === 'function') ack({ success: true, data: message });
            } catch (error) {
                console.error('[socket] chat:send_message failed:', error.message);
                if (typeof ack === 'function') {
                    ack({ success: false, message: error.message || 'Unable to send message.' });
                }
            }
        });

        socket.on('chat:typing', async (payload = {}) => {
            const receiverId = Number(payload.receiverId);
            if (!receiverId || receiverId === userId) return;
            socket.to(userRoom(receiverId)).emit('chat:typing', {
                sender_id: userId,
                receiver_id: receiverId,
                is_typing: true,
            });
        });
    });

    return io;
};

module.exports = {
    attachChatSocket,
};
