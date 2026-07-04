const express = require('express');
const router = express.Router();
const { verificationController } = require('../modules/verification');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: (req, file, cb) => {
        const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']);
        cb(allowed.has(file.mimetype) ? null : new Error('Only images and PDF files are allowed'), allowed.has(file.mimetype));
    },
});

const docFields = upload.fields([
    { name: 'docFront', maxCount: 1 },
    { name: 'docBack', maxCount: 1 },
    { name: 'brandProof', maxCount: 1 },
    { name: 'businessReg', maxCount: 1 },
    { name: 'companyDocs', maxCount: 1 },
]);

router.use(authMiddleware);

router.get('/status', verificationController.getVerificationStatus);
router.post('/submit', docFields, verificationController.submitVerification);
router.get('/admin/all', verificationController.adminGetAll);
router.put('/admin/:id/review', verificationController.adminReview);

module.exports = router;
