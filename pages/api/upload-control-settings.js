const DEFAULT_ADMIN_PANEL_ORIGIN = 'http://localhost:3001';
const DEFAULT_ADMIN_BACKEND_ORIGIN = 'http://localhost:3002';

function trimOrigin(value) {
    return String(value || '').replace(/\/+$/, '');
}

function unique(values) {
    return values.filter(Boolean).filter((value, index, array) => array.indexOf(value) === index);
}

export default async function handler(_req, res) {
    const explicitUrl = process.env.ADMIN_UPLOAD_CONTROL_PUBLIC_URL;
    const adminApiOrigin = trimOrigin(process.env.ADMIN_API_URL || process.env.NEXT_PUBLIC_ADMIN_API_URL);
    const adminPanelOrigin = trimOrigin(process.env.ADMIN_PANEL_URL || process.env.NEXT_PUBLIC_ADMIN_PANEL_URL || DEFAULT_ADMIN_PANEL_ORIGIN);
    const adminBackendOrigin = trimOrigin(process.env.ADMIN_BACKEND_URL || DEFAULT_ADMIN_BACKEND_ORIGIN);

    const urls = unique([
        explicitUrl,
        adminApiOrigin ? `${adminApiOrigin}/admin/customization/upload-control/public` : '',
        adminPanelOrigin ? `${adminPanelOrigin}/api/admin/customization/upload-control/public` : '',
        adminBackendOrigin ? `${adminBackendOrigin}/api/admin/customization/upload-control/public` : '',
    ]);

    for (const url of urls) {
        try {
            const upstream = await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            });

            if (!upstream.ok) continue;
            const contentType = upstream.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) continue;

            const body = await upstream.json();
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(body);
        } catch {
            // Try the next configured admin origin.
        }
    }

    return res.status(502).json({
        success: false,
        message: 'Upload control settings are unavailable',
    });
}
