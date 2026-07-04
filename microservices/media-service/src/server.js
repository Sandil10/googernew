const express = require('express');
const multer = require('multer');

const internalOpsAuth = require('../../../../shared/utils/internalOpsAuth');
const { loadEnv } = require('../../shared/runtime/loadEnv');
const mediaStorageService = require('./lib/storage');

loadEnv();

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 35 * 1024 * 1024, files: 10 },
});

app.use(express.json({ limit: '35mb' }));

app.get('/health', (req, res) => {
    res.json({ service: 'media-service', success: true });
});

app.use('/internal', internalOpsAuth);

app.post('/internal/media/upload', upload.single('file'), async (req, res) => {
    try {
        const url = await mediaStorageService.saveUploadedFile(req.file, req.body?.folder || 'media');
        res.status(201).json({ success: true, url });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/internal/media/upload-many', upload.array('files', 10), async (req, res) => {
    try {
        const urls = await mediaStorageService.saveUploadedFiles(req.files || [], req.body?.folder || 'media');
        res.status(201).json({ success: true, urls });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/internal/media/data-url', async (req, res) => {
    try {
        const url = await mediaStorageService.saveDataUrl(req.body?.dataUrl, req.body?.folder || 'media');
        res.status(201).json({ success: true, url });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const port = Number(process.env.MEDIA_SERVICE_PORT || 5003);
app.listen(port, () => {
    console.log(`[media-service] listening on ${port}`);
});
