const mediaConfig = require('./mediaConfig');
const mediaAssetPolicy = require('./mediaAssetPolicy');
const publicMediaRuntime = require('./publicMediaRuntime');
const mediaService = require('./mediaService');
const mediaStorageService = require('./mediaStorageService');

module.exports = {
    ...mediaAssetPolicy,
    ...publicMediaRuntime,
    ...mediaService,
    mediaAssetPolicy,
    mediaConfig,
    publicMediaRuntime,
    mediaService,
    mediaStorageService,
};
