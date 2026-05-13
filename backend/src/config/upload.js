const multer = require('multer');

// Vercel and other serverless environments have a read-only file system (EROFS).
// To handle image uploads without persistent cloud storage (like Cloudinary),
// we switch to MemoryStorage and store images as Base64 strings in the database.

const storage = multer.memoryStorage();
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
]);

const upload = multer({
    storage: storage,
    // 50MB per file to accommodate short videos. Express body parsers are
    // bypassed for multipart uploads, but multer still enforces this.
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 5,
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error('Unsupported upload file type'));
    },
});

module.exports = upload;
