// Aggregate the existing handlers; their authorization, visibility and read-receipt rules remain authoritative.
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
    const [messages, typing, peer] = await Promise.all([
        invoke(chat.getMessages, req, { participantId }, { ...req.query, markSeen: '1' }),
        invoke(chat.getTyping, req, { participantId }),
        invoke(auth.getUserById, req, { id: participantId }),
    ]);
    if (messages.status >= 400) return res.status(messages.status).json(messages.body);
    return res.json({ success: true, messages: messages.body?.messages ?? messages.body?.data ?? [],
        typing: typing.status < 400 ? Boolean(typing.body?.typing ?? typing.body?.isTyping) : null,
        peer: peer.status < 400 ? (peer.body?.user ?? peer.body?.data ?? peer.body) : null });
}
module.exports = { chatSnapshot, invoke };
