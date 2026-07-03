const chatHttpClient = require('./chatHttpClient');
const chatRuntimeService = require('./chatRuntimeService');

const createChatMessage = (senderId, payload = {}) => {
    if (chatHttpClient.isRemoteChatServiceEnabled()) {
        return chatHttpClient.createChatMessage(senderId, payload);
    }
    return chatRuntimeService.createChatMessage(senderId, payload);
};

module.exports = {
    createChatMessage,
    ensureChatTables: chatRuntimeService.ensureChatTables,
    blockUser: chatHttpClient.blockUser,
    deleteConversation: chatHttpClient.deleteConversation,
    getBlockedUsers: chatHttpClient.getBlockedUsers,
    getConversations: chatHttpClient.getConversations,
    getMessages: chatHttpClient.getMessages,
    hideConversation: chatHttpClient.hideConversation,
    isRemoteChatServiceEnabled: chatHttpClient.isRemoteChatServiceEnabled,
    unblockUser: chatHttpClient.unblockUser,
    unhideConversation: chatHttpClient.unhideConversation,
};
