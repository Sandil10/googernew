const SERVICE_URL = () => String(process.env.MEDIA_SERVICE_URL || '').trim().replace(/\/+$/, '');

const getInternalHeaders = (extra = {}) => {
    const headers = { ...extra };
    const token = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
    if (token) headers['x-internal-service-token'] = token;
    return headers;
};

const isRemoteMediaServiceEnabled = () => Boolean(SERVICE_URL());

const assertOk = async (response) => {
    if (response.ok) return;
    const text = await response.text().catch(() => '');
    throw new Error(`Media service request failed (${response.status}): ${text || response.statusText}`);
};

const uploadFile = async (file, folder) => {
    const form = new FormData();
    form.append('folder', folder || 'media');
    form.append(
        'file',
        new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }),
        file.originalname || 'upload.bin'
    );

    const response = await fetch(`${SERVICE_URL()}/internal/media/upload`, {
        method: 'POST',
        headers: getInternalHeaders(),
        body: form,
    });
    await assertOk(response);
    const payload = await response.json();
    return payload.url || '';
};

const uploadFiles = async (files = [], folder) => {
    const form = new FormData();
    form.append('folder', folder || 'media');
    for (const file of files || []) {
        form.append(
            'files',
            new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }),
            file.originalname || 'upload.bin'
        );
    }

    const response = await fetch(`${SERVICE_URL()}/internal/media/upload-many`, {
        method: 'POST',
        headers: getInternalHeaders(),
        body: form,
    });
    await assertOk(response);
    const payload = await response.json();
    return Array.isArray(payload.urls) ? payload.urls : [];
};

const uploadDataUrl = async (dataUrl, folder) => {
    const response = await fetch(`${SERVICE_URL()}/internal/media/data-url`, {
        method: 'POST',
        headers: getInternalHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
            dataUrl,
            folder: folder || 'media',
        }),
    });
    await assertOk(response);
    const payload = await response.json();
    return payload.url || '';
};

module.exports = {
    isRemoteMediaServiceEnabled,
    uploadDataUrl,
    uploadFile,
    uploadFiles,
};
