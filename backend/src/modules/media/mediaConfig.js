const path = require('path');

const PUBLIC_UPLOAD_ROOT = path.resolve(__dirname, '../../../../public/uploads');

const isTruthy = (value) => ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());

const hasCloudinaryCredentials = () => !!(
    process.env.CLOUDINARY_CLOUD_NAME
    && process.env.CLOUDINARY_API_KEY
    && process.env.CLOUDINARY_API_SECRET
);

const hasS3Config = () => !!(
    process.env.AWS_S3_BUCKET
    && (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION)
);

const getMediaStorageProvider = () => {
    if (isTruthy(process.env.FORCE_LOCAL_UPLOADS)) return 'local';
    if (hasS3Config()) return 's3';
    if (hasCloudinaryCredentials()) return 'cloudinary';
    return 'local';
};

const getMediaStorageConfig = () => ({
    provider: getMediaStorageProvider(),
    publicUploadRoot: process.env.UPLOADS_DIR || PUBLIC_UPLOAD_ROOT,
    s3: {
        bucket: process.env.AWS_S3_BUCKET || '',
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-1',
        publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL || '',
    },
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
    hasS3Config,
};
