import app from '../../backend/src/server';

export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
    },
};

export default function handler(req, res) {
    // This allows Express to handle the request properly within Next.js API route
    return app(req, res);
}
