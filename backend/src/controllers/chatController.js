const pool = require('../config/database');
const { success, error } = require('../utils/responseHandler');

const ACTIVE_SIGNAL_TYPES = new Set(['offer', 'answer', 'ice-candidate']);
const CALL_TYPES = new Set(['voice', 'video']);
const CALL_STATUSES = new Set(['ringing', 'active', 'missed', 'completed', 'rejected']);
const MESSAGE_TYPES = new Set(['text', 'image']);
const MESSAGE_STATUSES = new Set(['sending', 'sent', 'delivered', 'read']);

let tablesReadyPromise = null;

const ensureChatTables = async () => {
    if (!tablesReadyPromise) {
        tablesReadyPromise = (async () => {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id SERIAL PRIMARY KEY,
                    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
                    message_text TEXT,
                    image_url TEXT,
                    file_name TEXT,
                    status VARCHAR(20) NOT NULL DEFAULT 'sent',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    delivered_at TIMESTAMP,
                    read_at TIMESTAMP,
                    deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
                    CHECK (message_type IN ('text', 'image')),
                    CHECK (status IN ('sending', 'sent', 'delivered', 'read'))
                );
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_presence (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    active_participant_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_call_sessions (
                    id SERIAL PRIMARY KEY,
                    caller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    call_type VARCHAR(10) NOT NULL,
                    call_status VARCHAR(20) NOT NULL DEFAULT 'ringing',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    answered_at TIMESTAMP,
                    ended_at TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CHECK (call_type IN ('voice', 'video')),
                    CHECK (call_status IN ('ringing', 'active', 'missed', 'completed', 'rejected'))
                );
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_call_signals (
                    id SERIAL PRIMARY KEY,
                    call_id INTEGER NOT NULL REFERENCES chat_call_sessions(id) ON DELETE CASCADE,
                    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    signal_type VARCHAR(30) NOT NULL,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_messages_pair_created
                ON chat_messages(sender_id, receiver_id, created_at DESC);
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_status
                ON chat_messages(receiver_id, status, created_at DESC);
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_presence_last_seen
                ON chat_presence(last_seen_at DESC);
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_caller
                ON chat_call_sessions(caller_id, created_at DESC);
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_receiver
                ON chat_call_sessions(receiver_id, created_at DESC);
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_call_signals_call_receiver
                ON chat_call_signals(call_id, receiver_id, id ASC);
            `);
        })().catch((tableError) => {
            tablesReadyPromise = null;
            throw tableError;
        });
    }

    return tablesReadyPromise;
};

const mapMessageRow = (row) => ({
    id: Number(row.id),
    sender_id: Number(row.sender_id),
    receiver_id: Number(row.receiver_id),
    type: row.message_type,
    text: row.message_text,
    image_url: row.image_url,
    file_name: row.file_name,
    status: row.status,
    created_at: row.created_at,
    delivered_at: row.delivered_at,
    read_at: row.read_at,
    sender_name: row.sender_name || null,
    receiver_name: row.receiver_name || null,
});

const getPresenceStatus = (lastSeenAt) => {
    if (!lastSeenAt) {
        return { status: 'offline', last_seen_at: null };
    }

    const lastSeenTime = new Date(lastSeenAt).getTime();
    const isOnline = Date.now() - lastSeenTime < 20000;

    return {
        status: isOnline ? 'online' : 'offline',
        last_seen_at: lastSeenAt,
    };
};

const mapCallRow = (row, userId) => {
    const currentUserId = Number(userId);
    const isCaller = Number(row.caller_id) === currentUserId;
    const participant = {
        id: isCaller ? Number(row.receiver_id) : Number(row.caller_id),
        name: isCaller ? row.receiver_name : row.caller_name,
        username: isCaller ? row.receiver_username : row.caller_username,
        profile_picture: isCaller ? row.receiver_profile_picture : row.caller_profile_picture,
    };

    return {
        id: Number(row.id),
        caller_id: Number(row.caller_id),
        receiver_id: Number(row.receiver_id),
        call_type: row.call_type,
        call_status: row.call_status,
        created_at: row.created_at,
        answered_at: row.answered_at,
        ended_at: row.ended_at,
        participant,
    };
};

const normalizeExpiredCalls = async (userId) => {
    await ensureChatTables();

    const params = [35];
    let userFilter = '';

    if (userId) {
        params.push(Number(userId));
        userFilter = 'AND (caller_id = $2 OR receiver_id = $2)';
    }

    await pool.query(
        `
            UPDATE chat_call_sessions
            SET call_status = 'missed',
                ended_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE call_status = 'ringing'
              AND created_at < CURRENT_TIMESTAMP - ($1::text || ' seconds')::interval
              ${userFilter}
        `,
        params
    );
};

const getCallWithUsers = async (callId) => {
    await ensureChatTables();

    const result = await pool.query(
        `
            SELECT
                s.*,
                caller.full_name AS caller_name,
                caller.username AS caller_username,
                caller.profile_picture AS caller_profile_picture,
                receiver.full_name AS receiver_name,
                receiver.username AS receiver_username,
                receiver.profile_picture AS receiver_profile_picture
            FROM chat_call_sessions s
            JOIN users caller ON caller.id = s.caller_id
            JOIN users receiver ON receiver.id = s.receiver_id
            WHERE s.id = $1
            LIMIT 1
        `,
        [callId]
    );

    return result.rows[0] || null;
};

const getLatestOfferPayload = async (callId) => {
    const signalResult = await pool.query(
        `
            SELECT payload
            FROM chat_call_signals
            WHERE call_id = $1 AND signal_type = 'offer'
            ORDER BY id DESC
            LIMIT 1
        `,
        [callId]
    );

    return signalResult.rows[0]?.payload || null;
};

exports.updatePresence = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const activeParticipantId = req.body.activeParticipantId ? Number(req.body.activeParticipantId) : null;

        await pool.query(
            `
                INSERT INTO chat_presence (user_id, active_participant_id, last_seen_at, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    active_participant_id = EXCLUDED.active_participant_id,
                    last_seen_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [userId, activeParticipantId || null]
        );

        await pool.query(
            `
                UPDATE chat_messages
                SET status = 'delivered',
                    delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
                WHERE receiver_id = $1
                  AND status = 'sent'
            `,
            [userId]
        );

        if (activeParticipantId) {
            await pool.query(
                `
                    UPDATE chat_messages
                    SET status = 'read',
                        delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
                        read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                    WHERE receiver_id = $1
                      AND sender_id = $2
                      AND status IN ('sent', 'delivered')
                `,
                [userId, activeParticipantId]
            );
        }

        return success(res, { user_id: userId, active_participant_id: activeParticipantId }, 'Presence updated');
    } catch (err) {
        console.error('updatePresence error:', err);
        return error(res, 'Server error updating chat presence', 500);
    }
};

exports.getConversations = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const result = await pool.query(
            `
                WITH user_conversations AS (
                    SELECT
                        CASE
                            WHEN sender_id = $1 THEN receiver_id
                            ELSE sender_id
                        END AS participant_id,
                        id,
                        sender_id,
                        receiver_id,
                        message_type,
                        message_text,
                        image_url,
                        file_name,
                        status,
                        created_at,
                        delivered_at,
                        read_at
                    FROM chat_messages
                    WHERE sender_id = $1 OR receiver_id = $1
                ),
                latest_messages AS (
                    SELECT DISTINCT ON (participant_id)
                        participant_id,
                        id,
                        sender_id,
                        receiver_id,
                        message_type,
                        message_text,
                        image_url,
                        file_name,
                        status,
                        created_at,
                        delivered_at,
                        read_at
                    FROM user_conversations
                    ORDER BY participant_id, created_at DESC, id DESC
                ),
                unread_counts AS (
                    SELECT
                        sender_id AS participant_id,
                        COUNT(*)::int AS unread_count
                    FROM chat_messages
                    WHERE receiver_id = $1
                      AND status IN ('sent', 'delivered')
                    GROUP BY sender_id
                )
                SELECT
                    participant.id AS participant_id,
                    participant.full_name AS participant_name,
                    participant.username AS participant_username,
                    participant.profile_picture AS participant_profile_picture,
                    participant.user_type AS participant_role,
                    presence.last_seen_at AS participant_last_seen_at,
                    lm.id,
                    lm.sender_id,
                    lm.receiver_id,
                    lm.message_type,
                    lm.message_text,
                    lm.image_url,
                    lm.file_name,
                    lm.status,
                    lm.created_at,
                    lm.delivered_at,
                    lm.read_at,
                    COALESCE(uc.unread_count, 0) AS unread_count
                FROM latest_messages lm
                JOIN users participant ON participant.id = lm.participant_id
                LEFT JOIN unread_counts uc ON uc.participant_id = lm.participant_id
                LEFT JOIN chat_presence presence ON presence.user_id = lm.participant_id
                ORDER BY lm.created_at DESC, lm.id DESC
            `,
            [userId]
        );

        const conversations = result.rows.map((row) => ({
            participant: {
                id: Number(row.participant_id),
                name: row.participant_name || row.participant_username || 'User',
                username: row.participant_username,
                profile_picture: row.participant_profile_picture,
                roleLabel: row.participant_role === 'seller' ? 'Seller' : 'Buyer',
                ...getPresenceStatus(row.participant_last_seen_at),
            },
            unread_count: Number(row.unread_count || 0),
            lastMessage: mapMessageRow(row),
        }));

        return success(res, conversations, 'Conversations fetched');
    } catch (err) {
        console.error('getConversations error:', err);
        return error(res, 'Server error fetching chat conversations', 500);
    }
};

exports.getMessages = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const participantId = Number(req.params.participantId);
        const markSeen = String(req.query.markSeen || '') === '1';

        if (!participantId || participantId === userId) {
            return error(res, 'Invalid participant selected.', 400);
        }

        if (markSeen) {
            await pool.query(
                `
                    UPDATE chat_messages
                    SET status = 'read',
                        delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
                        read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                    WHERE receiver_id = $1
                      AND sender_id = $2
                      AND status IN ('sent', 'delivered')
                `,
                [userId, participantId]
            );
        } else {
            await pool.query(
                `
                    UPDATE chat_messages
                    SET status = 'delivered',
                        delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
                    WHERE receiver_id = $1
                      AND sender_id = $2
                      AND status = 'sent'
                `,
                [userId, participantId]
            );
        }

        const result = await pool.query(
            `
                SELECT
                    m.*,
                    sender.full_name AS sender_name,
                    receiver.full_name AS receiver_name
                FROM chat_messages m
                JOIN users sender ON sender.id = m.sender_id
                JOIN users receiver ON receiver.id = m.receiver_id
                WHERE ((m.sender_id = $1 AND m.receiver_id = $2)
                    OR (m.sender_id = $2 AND m.receiver_id = $1))
                  AND m.deleted_for_everyone = FALSE
                ORDER BY m.created_at ASC, m.id ASC
            `,
            [userId, participantId]
        );

        return success(res, result.rows.map(mapMessageRow), 'Messages fetched');
    } catch (err) {
        console.error('getMessages error:', err);
        return error(res, 'Server error fetching messages', 500);
    }
};

exports.sendMessage = async (req, res) => {
    try {
        await ensureChatTables();

        const senderId = Number(req.user.id);
        const receiverId = Number(req.body.receiverId);
        const type = req.body.type === 'image' ? 'image' : 'text';
        const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
        const imageUrl = typeof req.body.image_url === 'string' ? req.body.image_url : null;
        const fileName = typeof req.body.file_name === 'string' ? req.body.file_name : null;

        if (!receiverId || receiverId === senderId) {
            return error(res, 'Invalid receiver selected.', 400);
        }

        if (!MESSAGE_TYPES.has(type)) {
            return error(res, 'Invalid message type.', 400);
        }

        if (type === 'text' && !text) {
            return error(res, 'Message text is required.', 400);
        }

        if (type === 'image' && !imageUrl) {
            return error(res, 'Image message data is required.', 400);
        }

        const presenceResult = await pool.query(
            `
                SELECT last_seen_at
                FROM chat_presence
                WHERE user_id = $1
                LIMIT 1
            `,
            [receiverId]
        );

        const receiverPresence = presenceResult.rows[0];
        const isReceiverOnline = receiverPresence?.last_seen_at
            ? Date.now() - new Date(receiverPresence.last_seen_at).getTime() < 20000
            : false;

        const initialStatus = isReceiverOnline ? 'delivered' : 'sent';

        const result = await pool.query(
            `
                INSERT INTO chat_messages (
                    sender_id, receiver_id, message_type, message_text,
                    image_url, file_name, status, delivered_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `,
            [
                senderId,
                receiverId,
                type,
                type === 'text' ? text : null,
                imageUrl,
                fileName,
                initialStatus,
                initialStatus === 'delivered' ? new Date() : null,
            ]
        );

        const senderNameResult = await pool.query(
            'SELECT full_name FROM users WHERE id = $1 LIMIT 1',
            [senderId]
        );

        const mapped = mapMessageRow({
            ...result.rows[0],
            sender_name: senderNameResult.rows[0]?.full_name || null,
        });

        return success(res, mapped, 'Message sent');
    } catch (err) {
        console.error('sendMessage error:', err);
        return error(res, 'Server error sending message', 500);
    }
};

exports.startCall = async (req, res) => {
    try {
        await ensureChatTables();

        const callerId = Number(req.user.id);
        const receiverId = Number(req.body.receiverId);
        const callType = req.body.callType;
        const offer = req.body.offer;

        if (!receiverId || receiverId === callerId) {
            return error(res, 'Invalid receiver selected for this call.', 400);
        }

        if (!CALL_TYPES.has(callType)) {
            return error(res, 'Invalid call type.', 400);
        }

        if (!offer || typeof offer !== 'object') {
            return error(res, 'WebRTC offer is required to start a call.', 400);
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const callResult = await client.query(
                `
                    INSERT INTO chat_call_sessions (
                        caller_id, receiver_id, call_type, call_status
                    )
                    VALUES ($1, $2, $3, 'ringing')
                    RETURNING *
                `,
                [callerId, receiverId, callType]
            );

            const call = callResult.rows[0];

            const signalResult = await client.query(
                `
                    INSERT INTO chat_call_signals (
                        call_id, sender_id, receiver_id, signal_type, payload
                    )
                    VALUES ($1, $2, $3, 'offer', $4::jsonb)
                    RETURNING id
                `,
                [call.id, callerId, receiverId, JSON.stringify(offer)]
            );

            await client.query('COMMIT');

            const detailedCall = await getCallWithUsers(call.id);

            return success(
                res,
                {
                    call: mapCallRow(detailedCall, callerId),
                    offer_signal_id: Number(signalResult.rows[0].id),
                },
                'Call started successfully'
            );
        } catch (transactionError) {
            await client.query('ROLLBACK');
            throw transactionError;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('startCall error:', err);
        return error(res, 'Server error starting call', 500);
    }
};

exports.getIncomingCalls = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        await normalizeExpiredCalls(userId);

        const result = await pool.query(
            `
                SELECT
                    s.*,
                    caller.full_name AS caller_name,
                    caller.username AS caller_username,
                    caller.profile_picture AS caller_profile_picture,
                    receiver.full_name AS receiver_name,
                    receiver.username AS receiver_username,
                    receiver.profile_picture AS receiver_profile_picture
                FROM chat_call_sessions s
                JOIN users caller ON caller.id = s.caller_id
                JOIN users receiver ON receiver.id = s.receiver_id
                WHERE s.receiver_id = $1
                  AND s.call_status = 'ringing'
                ORDER BY s.created_at DESC
            `,
            [userId]
        );

        const calls = await Promise.all(result.rows.map(async (row) => ({
            ...mapCallRow(row, userId),
            offer: await getLatestOfferPayload(row.id),
        })));

        return success(res, calls, 'Incoming calls fetched');
    } catch (err) {
        console.error('getIncomingCalls error:', err);
        return error(res, 'Server error fetching incoming calls', 500);
    }
};

exports.getCall = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        await normalizeExpiredCalls(userId);

        const call = await getCallWithUsers(Number(req.params.callId));

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.caller_id) !== userId && Number(call.receiver_id) !== userId) {
            return error(res, 'Not authorized to view this call', 403);
        }

        return success(res, mapCallRow(call, userId), 'Call fetched');
    } catch (err) {
        console.error('getCall error:', err);
        return error(res, 'Server error fetching call', 500);
    }
};

exports.acceptCall = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const userId = Number(req.user.id);
        const answer = req.body.answer;

        if (!answer || typeof answer !== 'object') {
            return error(res, 'WebRTC answer is required to accept a call.', 400);
        }

        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== userId) {
            return error(res, 'Only the receiver can accept this call.', 403);
        }

        if (call.call_status !== 'ringing') {
            return error(res, `This call is already ${call.call_status}.`, 400);
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            await client.query(
                `
                    UPDATE chat_call_sessions
                    SET call_status = 'active',
                        answered_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `,
                [callId]
            );

            await client.query(
                `
                    INSERT INTO chat_call_signals (
                        call_id, sender_id, receiver_id, signal_type, payload
                    )
                    VALUES ($1, $2, $3, 'answer', $4::jsonb)
                `,
                [callId, userId, call.caller_id, JSON.stringify(answer)]
            );

            await client.query('COMMIT');

            const updatedCall = await getCallWithUsers(callId);
            return success(res, mapCallRow(updatedCall, userId), 'Call accepted');
        } catch (transactionError) {
            await client.query('ROLLBACK');
            throw transactionError;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('acceptCall error:', err);
        return error(res, 'Server error accepting call', 500);
    }
};

exports.rejectCall = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const userId = Number(req.user.id);
        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== userId && Number(call.caller_id) !== userId) {
            return error(res, 'Not authorized to reject this call', 403);
        }

        if (!['ringing', 'active'].includes(call.call_status)) {
            return success(res, mapCallRow(call, userId), 'Call already closed');
        }

        await pool.query(
            `
                UPDATE chat_call_sessions
                SET call_status = 'rejected',
                    ended_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `,
            [callId]
        );

        const updatedCall = await getCallWithUsers(callId);
        return success(res, mapCallRow(updatedCall, userId), 'Call rejected');
    } catch (err) {
        console.error('rejectCall error:', err);
        return error(res, 'Server error rejecting call', 500);
    }
};

exports.completeCall = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const userId = Number(req.user.id);
        const requestedStatus = req.body.status;
        const finalStatus = CALL_STATUSES.has(requestedStatus) ? requestedStatus : 'completed';

        if (!['completed', 'missed', 'rejected'].includes(finalStatus)) {
            return error(res, 'Invalid final call status.', 400);
        }

        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== userId && Number(call.caller_id) !== userId) {
            return error(res, 'Not authorized to end this call', 403);
        }

        await pool.query(
            `
                UPDATE chat_call_sessions
                SET call_status = $2,
                    ended_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `,
            [callId, finalStatus]
        );

        const updatedCall = await getCallWithUsers(callId);
        return success(res, mapCallRow(updatedCall, userId), 'Call updated');
    } catch (err) {
        console.error('completeCall error:', err);
        return error(res, 'Server error updating call', 500);
    }
};

exports.sendSignal = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const senderId = Number(req.user.id);
        const receiverId = Number(req.body.receiverId);
        const signalType = req.body.signalType;
        const payload = req.body.payload;

        if (!receiverId) {
            return error(res, 'Signal receiver is required.', 400);
        }

        if (!ACTIVE_SIGNAL_TYPES.has(signalType)) {
            return error(res, 'Unsupported signal type.', 400);
        }

        if (!payload || typeof payload !== 'object') {
            return error(res, 'Signal payload is required.', 400);
        }

        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== senderId && Number(call.caller_id) !== senderId) {
            return error(res, 'Not authorized to signal this call', 403);
        }

        const signalResult = await pool.query(
            `
                INSERT INTO chat_call_signals (
                    call_id, sender_id, receiver_id, signal_type, payload
                )
                VALUES ($1, $2, $3, $4, $5::jsonb)
                RETURNING id, created_at
            `,
            [callId, senderId, receiverId, signalType, JSON.stringify(payload)]
        );

        return success(res, signalResult.rows[0], 'Signal sent');
    } catch (err) {
        console.error('sendSignal error:', err);
        return error(res, 'Server error sending call signal', 500);
    }
};

exports.getSignals = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const userId = Number(req.user.id);
        const since = Number(req.query.since || 0);
        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== userId && Number(call.caller_id) !== userId) {
            return error(res, 'Not authorized to view this call', 403);
        }

        const result = await pool.query(
            `
                SELECT id, sender_id, receiver_id, signal_type, payload, created_at
                FROM chat_call_signals
                WHERE call_id = $1
                  AND receiver_id = $2
                  AND id > $3
                ORDER BY id ASC
            `,
            [callId, userId, since]
        );

        return success(
            res,
            result.rows.map((row) => ({
                id: Number(row.id),
                sender_id: Number(row.sender_id),
                receiver_id: Number(row.receiver_id),
                signal_type: row.signal_type,
                payload: row.payload,
                created_at: row.created_at,
            })),
            'Signals fetched'
        );
    } catch (err) {
        console.error('getSignals error:', err);
        return error(res, 'Server error fetching call signals', 500);
    }
};

exports.getCallHistory = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        const participantId = Number(req.params.participantId);

        await normalizeExpiredCalls(userId);

        const result = await pool.query(
            `
                SELECT
                    s.*,
                    caller.full_name AS caller_name,
                    caller.username AS caller_username,
                    caller.profile_picture AS caller_profile_picture,
                    receiver.full_name AS receiver_name,
                    receiver.username AS receiver_username,
                    receiver.profile_picture AS receiver_profile_picture
                FROM chat_call_sessions s
                JOIN users caller ON caller.id = s.caller_id
                JOIN users receiver ON receiver.id = s.receiver_id
                WHERE (s.caller_id = $1 AND s.receiver_id = $2)
                   OR (s.caller_id = $2 AND s.receiver_id = $1)
                ORDER BY s.created_at ASC, s.id ASC
            `,
            [userId, participantId]
        );

        return success(
            res,
            result.rows.map((row) => mapCallRow(row, userId)),
            'Call history fetched'
        );
    } catch (err) {
        console.error('getCallHistory error:', err);
        return error(res, 'Server error fetching call history', 500);
    }
};

exports.getCallSummaries = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        await normalizeExpiredCalls(userId);

        const result = await pool.query(
            `
                WITH conversation_calls AS (
                    SELECT
                        s.*,
                        CASE
                            WHEN s.caller_id = $1 THEN s.receiver_id
                            ELSE s.caller_id
                        END AS participant_id
                    FROM chat_call_sessions s
                    WHERE s.caller_id = $1 OR s.receiver_id = $1
                )
                SELECT DISTINCT ON (cc.participant_id)
                    cc.*,
                    caller.full_name AS caller_name,
                    caller.username AS caller_username,
                    caller.profile_picture AS caller_profile_picture,
                    receiver.full_name AS receiver_name,
                    receiver.username AS receiver_username,
                    receiver.profile_picture AS receiver_profile_picture,
                    participant.full_name AS participant_name,
                    participant.username AS participant_username,
                    participant.profile_picture AS participant_profile_picture
                FROM conversation_calls cc
                JOIN users caller ON caller.id = cc.caller_id
                JOIN users receiver ON receiver.id = cc.receiver_id
                JOIN users participant ON participant.id = cc.participant_id
                ORDER BY cc.participant_id, cc.created_at DESC, cc.id DESC
            `,
            [userId]
        );

        const summaries = result.rows.map((row) => ({
            participant: {
                id: Number(row.participant_id),
                name: row.participant_name,
                username: row.participant_username,
                profile_picture: row.participant_profile_picture,
            },
            last_call: mapCallRow(row, userId),
        }));

        return success(res, summaries, 'Call summaries fetched');
    } catch (err) {
        console.error('getCallSummaries error:', err);
        return error(res, 'Server error fetching call summaries', 500);
    }
};
