const app = require('../../backend/src/server');

// Disable Next.js body parser to allow Express to handle it
export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
    },
};

export default app;
