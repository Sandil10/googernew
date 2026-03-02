import app from '../../backend/src/server';

export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
    },
};

export default app;
