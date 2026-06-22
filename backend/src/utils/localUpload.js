const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PUBLIC_UPLOAD_ROOT = path.resolve(__dirname, '../../../public/uploads');
let sharp = null;
try {
    sharp = require('sharp');
} catch {
    sharp = null;
}
let ffmpegPath = 'ffmpeg';
try {
    ffmpegPath = require('ffmpeg-static') || ffmpegPath;
} catch {
    ffmpegPath = 'ffmpeg';
}

const hasCloudinaryCredentials = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);
const forceLocalUploads = ['1', 'true', 'yes'].includes(String(process.env.FORCE_LOCAL_UPLOADS || '').toLowerCase());
const useCloudinary = hasCloudinaryCredentials && !forceLocalUploads;

let cloudinary = null;
if (useCloudinary) {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

const getSafeExtension = (file = {}) => {
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    if (['.jfif', '.jpe', '.pjpeg', '.pjp'].includes(originalExt)) return '.jpg';
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

const isImageUpload = (file = {}) => String(file.mimetype || '').startsWith('image/');
const isVideoUpload = (file = {}) => String(file.mimetype || '').startsWith('video/');

const runFfmpeg = (args, timeoutMs = 90000) => new Promise((resolve, reject) => {
    const child = execFile(ffmpegPath, args, { timeout: timeoutMs, windowsHide: true }, (error) => {
        if (error) reject(error);
        else resolve();
    });
    child.stdin?.end?.();
});

const compressImageFile = async (file) => {
    if (!sharp || !isImageUpload(file) || String(file.mimetype || '').toLowerCase() === 'image/gif') {
        return { buffer: file.buffer, extension: getSafeExtension(file), mimetype: file.mimetype };
    }

    try {
        const compressed = await sharp(file.buffer, { animated: false })
            .rotate()
            .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 72, effort: 4 })
            .toBuffer();

        if (compressed.length > 0 && compressed.length < file.buffer.length) {
            return { buffer: compressed, extension: '.webp', mimetype: 'image/webp' };
        }
    } catch (error) {
        console.warn('Image compression skipped:', error.message);
    }

    return { buffer: file.buffer, extension: getSafeExtension(file), mimetype: file.mimetype };
};

const compressVideoFile = async (file) => {
    if (!isVideoUpload(file)) {
        return { buffer: file.buffer, extension: getSafeExtension(file), mimetype: file.mimetype };
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'googer-video-'));
    const inputPath = path.join(tempDir, `input${getSafeExtension(file)}`);
    const outputPath = path.join(tempDir, 'output.mp4');

    try {
        await fs.writeFile(inputPath, file.buffer);
        await runFfmpeg([
            '-y',
            '-i', inputPath,
            '-vf', 'scale=if(gt(ih\\,480)\\,-2\\,iw):if(gt(ih\\,480)\\,480\\,ih)',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '30',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            '-b:a', '96k',
            '-ac', '2',
            outputPath,
        ]);

        const compressed = await fs.readFile(outputPath);
        if (compressed.length > 0 && compressed.length < file.buffer.length) {
            return { buffer: compressed, extension: '.mp4', mimetype: 'video/mp4' };
        }
    } catch (error) {
        console.warn('Video compression skipped:', error.message);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    return { buffer: file.buffer, extension: getSafeExtension(file), mimetype: file.mimetype };
};

const processUploadFile = async (file) => {
    if (isImageUpload(file)) return compressImageFile(file);
    if (isVideoUpload(file)) return compressVideoFile(file);
    return { buffer: file.buffer, extension: getSafeExtension(file), mimetype: file.mimetype };
};

const uploadToCloudinary = (file, folder) => {
    return new Promise((resolve, reject) => {
        const resourceType = String(file.mimetype || '').startsWith('video/') ? 'video' : 'image';
        const uploadOptions = {
            folder,
            resource_type: resourceType,
            ...(resourceType === 'image'
                ? { transformation: [{ width: 1280, height: 1280, crop: 'limit', quality: 'auto:eco', fetch_format: 'auto' }] }
                : { transformation: [{ height: 480, crop: 'limit', quality: 'auto:eco' }] }),
        };
        const stream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        stream.end(file.buffer);
    });
};

const saveUploadedFile = async (file, folder = 'media') => {
    if (!file?.buffer) return '';

    if (useCloudinary) {
        return uploadToCloudinary(file, folder);
    }

    const safeFolder = String(folder || 'media').replace(/[^a-z0-9-_]/gi, '').toLowerCase() || 'media';
    const uploadDir = path.join(PUBLIC_UPLOAD_ROOT, safeFolder);
    await fs.mkdir(uploadDir, { recursive: true });

    const processed = await processUploadFile(file);
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${processed.extension}`;
    const absolutePath = path.join(uploadDir, filename);
    await fs.writeFile(absolutePath, processed.buffer);

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
