export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
    },
};

const BACKEND_ORIGIN = (process.env.BACKEND_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const DROP_RESPONSE_HEADERS = new Set([
    'connection',
    'content-encoding',
    'content-length',
    'keep-alive',
    'transfer-encoding',
]);

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    const slug = Array.isArray(req.query.slug) ? req.query.slug.join('/') : req.query.slug;
    const queryIndex = req.url.indexOf('?');
    const search = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    const targetUrl = `${BACKEND_ORIGIN}/api/${slug || ''}${search}`;

    try {
        const method = req.method || 'GET';
        const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase());
        const body = hasBody ? await readRequestBody(req) : undefined;

        const upstream = await fetch(targetUrl, {
            method,
            headers: req.headers,
            body,
        });

        res.status(upstream.status);
        upstream.headers.forEach((value, key) => {
            if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });

        const responseBody = Buffer.from(await upstream.arrayBuffer());
        res.send(responseBody);
    } catch (error) {
        console.error(`[API Proxy] Failed to reach ${targetUrl}:`, error.message);
        res.status(502).json({
            success: false,
            message: 'Backend proxy failed',
            error: error.message,
        });
    }
}
