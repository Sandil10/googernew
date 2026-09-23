const multer = require('multer');

// Multipart bodies spool to OS temporary storage. Processing loads at most the
// configured number of files into memory; response completion removes temp files.

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const temporaryRoot = path.resolve(os.tmpdir(), 'googer-uploads');
const storage = multer.diskStorage({
    destination: (req, file, done) => {
        if (!req.uploadDirectoryPromise) req.uploadDirectoryPromise = (async () => {
            await fs.mkdir(temporaryRoot, { recursive: true });
            return fs.mkdtemp(path.join(temporaryRoot, 'request-'));
        })();
        req.uploadDirectoryPromise.then(dir => done(null, dir), done);
    },
    filename: (req, file, done) => done(null, crypto.randomUUID()),
});
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/jfif',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'video/x-msvideo',
    'video/x-matroska',
    'video/avi',
    'video/mpeg',
]);

const upload = multer({
    storage: storage,
    // 50MB per file to accommodate short videos. Express body parsers are
    // bypassed for multipart uploads, but multer still enforces this.
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 7,
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error('Unsupported upload file type'));
    },
});

// Keep the existing multer API and field/size rules. Clean only server-created paths.
for (const method of ['single', 'array', 'fields', 'any', 'none']) {
    const original = upload[method].bind(upload);
    upload[method] = (...args) => {
        const parse = original(...args);
        return (req, res, next) => {
            let cleaned = false;
            const cleanup = async () => {
                if (cleaned || !req.uploadDirectoryPromise) return;
                cleaned = true;
                const directory = await req.uploadDirectoryPromise.catch(() => null);
                if (directory && path.resolve(directory).startsWith(temporaryRoot + path.sep)) {
                    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
                }
            };
            res.once('finish', cleanup);
            res.once('close', cleanup);
            parse(req, res, error => { if (error) void cleanup(); next(error); });
        };
    };
}
module.exports = upload;
