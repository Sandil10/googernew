const express = require('express');
const { getMediaStorageConfig } = require('./mediaConfig');

const PUBLIC_UPLOAD_MOUNT_PATH = '/uploads';

const getPublicUploadMountPath = () => PUBLIC_UPLOAD_MOUNT_PATH;

const buildPublicUploadUrl = (folder, filename) => {
    const safeFolder = String(folder || 'media').replace(/[^a-z0-9-_]/gi, '').toLowerCase() || 'media';
    const safeFilename = String(filename || '').replace(/\\/g, '/').split('/').pop();
    return `${PUBLIC_UPLOAD_MOUNT_PATH}/${safeFolder}/${safeFilename}`;
};

const mountPublicUploads = (app) => {
    const mediaStorageConfig = getMediaStorageConfig();
    app.use(PUBLIC_UPLOAD_MOUNT_PATH, express.static(mediaStorageConfig.publicUploadRoot, {
        immutable: true,
        maxAge: '30d',
    }));
};

module.exports = {
    buildPublicUploadUrl,
    getPublicUploadMountPath,
    mountPublicUploads,
};
