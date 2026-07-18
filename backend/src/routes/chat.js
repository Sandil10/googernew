const express = require('express');
const router = express.Router();
const { chatController } = require('../modules/chat');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/presence', chatController.updatePresence);
router.post('/typing', chatController.updateTyping);
router.get('/typing/:participantId', chatController.getTyping);
router.get('/conversations', chatController.getConversations);
router.get('/support-assignment', chatController.getSupportAssignment);
router.post('/conversations/hide', chatController.hideConversation);
router.post('/conversations/unhide', chatController.unhideConversation);
router.delete('/conversations/:participantId', chatController.deleteConversation);
router.get('/product-status/assignments', chatController.listAssignedProductStatusChats);
router.get('/product-status/:productStatusId/assignment', chatController.getProductStatusAssignment);
router.put('/product-status/:productStatusId/assignment', chatController.assignProductStatusAdmin);
router.get('/topup-request/assignments', chatController.listAssignedTopupRequestChats);
router.get('/topup-request/:topupRequestId/assignment', chatController.getTopupRequestAssignment);
router.put('/topup-request/:topupRequestId/assignment', chatController.assignTopupRequestAdmin);
router.post('/block', chatController.blockUser);
router.post('/unblock', chatController.unblockUser);
router.get('/blocked-users', chatController.getBlockedUsers);
router.get('/messages/:participantId', chatController.getMessages);
router.post('/messages', chatController.sendMessage);
router.delete('/messages', chatController.deleteMessages);

router.post('/calls/start', chatController.startCall);
router.get('/calls/incoming', chatController.getIncomingCalls);
router.get('/calls/summaries', chatController.getCallSummaries);
router.get('/calls/history/:participantId', chatController.getCallHistory);
router.get('/calls/:callId', chatController.getCall);
router.post('/calls/:callId/accept', chatController.acceptCall);
router.post('/calls/:callId/reject', chatController.rejectCall);
router.post('/calls/:callId/complete', chatController.completeCall);
router.post('/calls/:callId/signal', chatController.sendSignal);
router.get('/calls/:callId/signals', chatController.getSignals);

module.exports = router;
