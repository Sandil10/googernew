const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

process.env.FORCE_LOCAL_UPLOADS = 'true';

const tempUploads = path.join(os.tmpdir(), `googer-media-smoke-${Date.now()}`);
process.env.UPLOADS_DIR = tempUploads;

const media = require('../src/modules/media');
const legacyUpload = require('../src/utils/localUpload');

const run = async () => {
    const textFile = {
        buffer: Buffer.from('googer-media-smoke'),
        mimetype: 'text/plain',
        originalname: 'sample.txt',
    };

    const serviceUrl = await media.uploadFile(textFile, { folder: 'smoke-test' });
    assert.match(serviceUrl, /^\/uploads\/smoke-test\/\d+-[a-f0-9]+\.txt$/);

    const legacyUrl = await legacyUpload.saveUploadedFile(textFile, 'legacy-smoke');
    assert.match(legacyUrl, /^\/uploads\/legacy-smoke\/\d+-[a-f0-9]+\.txt$/);

    const dataUrl = await media.uploadDataUrl('data:text/plain;base64,Z29vZ2Vy', { folder: 'data-smoke' });
    assert.match(dataUrl, /^\/uploads\/data-smoke\/\d+-[a-f0-9]+\.bin$/);

    const provider = media.getMediaStorageProvider();
    assert.strictEqual(provider, 'local');

    await fs.rm(tempUploads, { recursive: true, force: true });
    console.log('media module smoke ok');
};

run().catch(async (error) => {
    await fs.rm(tempUploads, { recursive: true, force: true }).catch(() => {});
    console.error(error);
    process.exit(1);
});
