const path = require('path');

const PUBLIC_UPLOAD_ROOT = path.resolve(__dirname, '../../../public/uploads');

const isTruthy = (value) => ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());

const hasCloudinaryCredentials = () => !!(
    process.env.CLOUDINARY_CLOUD_NAME
    && process.env.CLOUDINARY_API_KEY
    && process.env.CLOUDINARY_API_SECRET
);

const getMediaStorageProvider = () => {
    if (isTruthy(process.env.FORCE_LOCAL_UPLOADS)) return 'local';
    if (hasCloudinaryCredentials()) return 'cloudinary';
    return 'local';
};

const getMediaStorageConfig = () => ({
    provider: getMediaStorageProvider(),
    publicUploadRoot: process.env.UPLOADS_DIR || PUBLIC_UPLOAD_ROOT,
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
        apiKey: process.env.CLOUDINARY_API_KEY || '',
        apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    },
});

module.exports = {
    getMediaStorageConfig,
    getMediaStorageProvider,
    hasCloudinaryCredentials,
};
