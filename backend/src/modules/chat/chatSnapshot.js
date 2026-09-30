// Aggregate the existing handlers; their authorization, visibility and read-receipt rules remain authoritative.
const pool = require('../../config/database');

async function invoke(handler, req, params, query = req.query) {
    let status = 200, body;
    const child = Object.assign(Object.create(req), { params, query });
    const response = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
    await handler(child, response);
    return { status, body };
}
async function chatSnapshot(req, res) {
    const chat = require('../../controllers/chatController');
    const auth = require('../../controllers/authController');
    const participantId = req.params.participantId;
    const [messages, typing, peer, presence] = await Promise.all([
        invoke(chat.getMessages, req, { participantId }, { ...req.query, markSeen: '1' }),
        invoke(chat.getTyping, req, { participantId }),
        invoke(auth.getUserById, req, { id: participantId }),
        pool.query('SELECT last_seen_at FROM chat_presence WHERE user_id = $1 LIMIT 1', [participantId])
            .then((result) => result.rows[0] || null)
            .catch(() => null),
    ]);
    if (messages.status >= 400) return res.status(messages.status).json(messages.body);
    const rawPeer = peer.status < 400 ? (peer.body?.user ?? peer.body?.data ?? peer.body) : null;
    const lastSeenAt = presence?.last_seen_at || null;
    const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
    const peerWithPresence = rawPeer ? {
        ...rawPeer,
        status: lastSeenMs && Date.now() - lastSeenMs < 20000 ? 'online' : 'offline',
        last_seen_at: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
    } : null;
    return res.json({ success: true, messages: messages.body?.messages ?? messages.body?.data ?? [],
        typing: typing.status < 400 ? Boolean(typing.body?.typing ?? typing.body?.isTyping) : null,
        peer: peerWithPresence });
}
module.exports = { chatSnapshot, invoke };
