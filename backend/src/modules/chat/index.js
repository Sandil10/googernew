const chatSocketService = require('./chatSocketService');
const chatRuntimeService = require('./chatRuntimeService');
const chatService = require('./chatService');
const chatController = require('../../controllers/chatController');

module.exports = {
    attachChatSocket: chatSocketService.attachChatSocket,
    chatController,
    chatService,
    chatSocketService,
    chatRuntimeService,
    createChatMessage: chatService.createChatMessage,
    ensureChatTables: chatRuntimeService.ensureChatTables,
};
