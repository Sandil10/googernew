const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const PUBLIC_UPLOAD_ROOT = path.resolve(__dirname, '../../../public/uploads');

const getSafeExtension = (file = {}) => {
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    if (originalExt && originalExt.length <= 10) return originalExt;

    const mimeExt = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov',
    }[file.mimetype];

    return mimeExt || '.bin';
};

const saveUploadedFile = async (file, folder = 'media') => {
    if (!file?.buffer) return '';

    const safeFolder = String(folder || 'media').replace(/[^a-z0-9-_]/gi, '').toLowerCase() || 'media';
    const uploadDir = path.join(PUBLIC_UPLOAD_ROOT, safeFolder);
    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${getSafeExtension(file)}`;
    const absolutePath = path.join(uploadDir, filename);
    await fs.writeFile(absolutePath, file.buffer);

    return `/uploads/${safeFolder}/${filename}`;
};

const saveUploadedFiles = async (files = [], folder = 'media') => {
    const urls = [];
    for (const file of files || []) {
        const url = await saveUploadedFile(file, folder);
        if (url) urls.push(url);
    }
    return urls;
};

const saveDataUrl = async (dataUrl, folder = 'media') => {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return '';

    const [, mimetype, payload] = match;
    return saveUploadedFile({
        buffer: Buffer.from(payload, 'base64'),
        mimetype,
        originalname: `legacy-${Date.now()}${getSafeExtension({ mimetype })}`,
    }, folder);
};

module.exports = {
    saveDataUrl,
    saveUploadedFile,
    saveUploadedFiles,
};
