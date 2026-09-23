const express = require('express');
const { pipeline } = require('stream');
const { getMediaStorageConfig } = require('./mediaConfig');

const PUBLIC_UPLOAD_MOUNT_PATH = '/uploads';

const getPublicUploadMountPath = () => PUBLIC_UPLOAD_MOUNT_PATH;

const buildPublicUploadUrl = (folder, filename) => {
    const safeFolder = String(folder || 'media').replace(/[^a-z0-9-_]/gi, '').toLowerCase() || 'media';
    const safeFilename = String(filename || '').replace(/\\/g, '/').split('/').pop();
    return `${PUBLIC_UPLOAD_MOUNT_PATH}/${safeFolder}/${safeFilename}`;
};

const getUploadContentType = (filePath = '') => {
    const ext = String(filePath).toLowerCase().split('?')[0].split('.').pop();
    if (['jpg', 'jpeg', 'jfif', 'jpe', 'pjpeg', 'pjp'].includes(ext)) return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'mp4') return 'video/mp4';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'mov') return 'video/quicktime';
    return '';
};

const mountPublicUploads = (app) => {
    const mediaStorageConfig = getMediaStorageConfig();
    if (mediaStorageConfig.provider === 's3' && process.env.S3_SERVE_THROUGH_BACKEND === 'true') {
        const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
        const client = new S3Client({ region: mediaStorageConfig.s3.region });
        app.use(PUBLIC_UPLOAD_MOUNT_PATH, async (req, res, next) => {
            if (!['GET', 'HEAD'].includes(req.method)) return next();
            let key;
            try { key = decodeURIComponent(req.path).replace(/^\/+/, ''); }
            catch { return res.sendStatus(400); }
            if (!key || key.includes('\\') || key.split('/').some(part => part === '..' || part === '.')) return res.sendStatus(400);
            // Optional CDN origin for the same public S3 objects. Off until deployment
            // provisions and verifies the distribution; existing URLs keep working.
            const cdn = String(process.env.PUBLIC_MEDIA_CDN_BASE_URL || '').replace(/\/+$/, '');
            if (cdn) {
                const base = new URL(cdn);
                if (base.protocol !== 'https:') return res.sendStatus(503);
                return res.redirect(307, `${cdn}/${key.split('/').map(encodeURIComponent).join('/')}`);
            }
            try {
                const input = { Bucket: mediaStorageConfig.s3.bucket, Key: key };
                if (req.headers.range) input.Range = req.headers.range;
                const result = await client.send(req.method === 'HEAD' ? new HeadObjectCommand(input) : new GetObjectCommand(input));
                res.status(result.ContentRange ? 206 : 200);
                res.set('Content-Type', result.ContentType || getUploadContentType(key) || 'application/octet-stream');
                res.set('Accept-Ranges', 'bytes');
                res.set('Cache-Control', 'public, max-age=86400');
                if (result.ContentLength != null) res.set('Content-Length', String(result.ContentLength));
                if (result.ContentRange) res.set('Content-Range', result.ContentRange);
                if (result.ETag) res.set('ETag', result.ETag);
                if (req.method === 'HEAD') return res.end();
                pipeline(result.Body, res, error => { if (error && !res.destroyed) res.destroy(); });
            } catch (error) {
                const status = error.$metadata?.httpStatusCode;
                if (status === 404 || error.name === 'NoSuchKey') return res.sendStatus(404);
                if (status === 416) return res.sendStatus(416);
                console.error('S3 media read failed:', error.name);
                return res.sendStatus(502);
            }
        });
        return;
    }
    app.use(PUBLIC_UPLOAD_MOUNT_PATH, express.static(mediaStorageConfig.publicUploadRoot, {
        immutable: true,
        maxAge: '30d',
        setHeaders: (res, filePath) => {
            const contentType = getUploadContentType(filePath);
            if (contentType) res.setHeader('Content-Type', contentType);
        },
    }));
};

module.exports = {
    getUploadContentType,
    buildPublicUploadUrl,
    getPublicUploadMountPath,
    mountPublicUploads,
};
