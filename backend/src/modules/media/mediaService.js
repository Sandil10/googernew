const mediaStorageService = require('./mediaStorageService');
const mediaHttpClient = require('./mediaHttpClient');
const { getMediaStorageConfig, getMediaStorageProvider } = require('./mediaConfig');

const uploadFile = (file, options = {}) => {
    const folder = typeof options === 'string' ? options : options.folder;
    if (mediaHttpClient.isRemoteMediaServiceEnabled()) {
        return mediaHttpClient.uploadFile(file, folder);
    }
    return mediaStorageService.saveUploadedFile(file, folder);
};

const uploadFiles = (files = [], options = {}) => {
    const folder = typeof options === 'string' ? options : options.folder;
    if (mediaHttpClient.isRemoteMediaServiceEnabled()) {
        return mediaHttpClient.uploadFiles(files, folder);
    }
    return mediaStorageService.saveUploadedFiles(files, folder);
};

const uploadDataUrl = (dataUrl, options = {}) => {
    const folder = typeof options === 'string' ? options : options.folder;
    if (mediaHttpClient.isRemoteMediaServiceEnabled()) {
        return mediaHttpClient.uploadDataUrl(dataUrl, folder);
    }
    return mediaStorageService.saveDataUrl(dataUrl, folder);
};

module.exports = {
    getMediaStorageConfig,
    getMediaStorageProvider,
    uploadDataUrl,
    uploadFile,
    uploadFiles,
    // Backward-compatible names used by existing controllers.
    saveDataUrl: uploadDataUrl,
    saveUploadedFile: uploadFile,
    saveUploadedFiles: uploadFiles,
};
