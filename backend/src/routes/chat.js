const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/presence', chatController.updatePresence);
router.get('/conversations', chatController.getConversations);
router.get('/messages/:participantId', chatController.getMessages);
router.post('/messages', chatController.sendMessage);

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
