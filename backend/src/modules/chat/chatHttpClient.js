const SERVICE_URL = () => String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');

const getInternalHeaders = (extra = {}) => {
    const headers = { ...extra };
    const token = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
    if (token) headers['x-internal-service-token'] = token;
    return headers;
};

const isRemoteChatServiceEnabled = () => Boolean(SERVICE_URL());

const assertOk = async (response) => {
    if (response.ok) return;
    const text = await response.text().catch(() => '');
    throw new Error(`Chat service request failed (${response.status}): ${text || response.statusText}`);
};

const createChatMessage = async (senderId, payload = {}) => {
    const response = await fetch(`${SERVICE_URL()}/internal/chat/messages`, {
        method: 'POST',
        headers: getInternalHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
            senderId,
            payload,
        }),
    });
    await assertOk(response);
    const result = await response.json();
    return result?.data || null;
};

const buildUrl = (pathname, query = {}) => {
    const url = new URL(`${SERVICE_URL()}${pathname}`);
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
    });
    return url.toString();
};

const requestJson = async (pathname, { body, method = 'GET', query } = {}) => {
    const headers = getInternalHeaders();
    const options = { method, headers };
    if (body !== undefined) {
        options.headers = getInternalHeaders({ 'content-type': 'application/json' });
        options.body = JSON.stringify(body);
    }

    const response = await fetch(buildUrl(pathname, query), options);
    const payload = await response.json().catch(() => ({}));
    return {
        payload,
        statusCode: response.status,
    };
};

const getConversations = (userId) => requestJson('/internal/chat/conversations', {
    query: { userId },
});

const getMessages = ({ participantId, query, userId }) => requestJson(`/internal/chat/messages/${participantId}`, {
    query: { ...query, userId },
});

const hideConversation = ({ participantId, userId }) => requestJson('/internal/chat/conversations/hide', {
    body: { participantId, userId },
    method: 'POST',
});

const unhideConversation = ({ participantId, userId }) => requestJson('/internal/chat/conversations/unhide', {
    body: { participantId, userId },
    method: 'POST',
});

const deleteConversation = ({ participantId, userId }) => requestJson(`/internal/chat/conversations/${participantId}`, {
    method: 'DELETE',
    query: { userId },
});

const blockUser = ({ blockedUserId, userId }) => requestJson('/internal/chat/block', {
    body: { blockedUserId, userId },
    method: 'POST',
});

const unblockUser = ({ blockedUserId, userId }) => requestJson('/internal/chat/unblock', {
    body: { blockedUserId, userId },
    method: 'POST',
});

const getBlockedUsers = (userId) => requestJson('/internal/chat/blocked-users', {
    query: { userId },
});

module.exports = {
    blockUser,
    createChatMessage,
    deleteConversation,
    getBlockedUsers,
    getConversations,
    getMessages,
    hideConversation,
    isRemoteChatServiceEnabled,
    unblockUser,
    unhideConversation,
};
