const cluster = require('node:cluster');
const os = require('node:os');
const path = require('node:path');
const pool = require('./config/database');
const { assertFinanceSchemaReady } = require('../../../shared/utils/financeSchemaGuard');
const { ensureAdminWalletGuard } = require('./utils/adminWalletGuard');

const parseWorkerCount = () => {
    const configured = Number.parseInt(String(process.env.CLUSTER_WORKERS || ''), 10);
    if (Number.isFinite(configured) && configured > 0) return configured;

    if (typeof os.availableParallelism === 'function') {
        return Math.max(2, Math.min(os.availableParallelism(), 4));
    }

    return Math.max(2, Math.min(os.cpus().length || 2, 4));
};

const workerCount = parseWorkerCount();
const serverEntry = path.resolve(__dirname, 'server.js');

if (cluster.isPrimary) {
    const start = async () => {
        await assertFinanceSchemaReady(pool);
        await ensureAdminWalletGuard(pool);

        cluster.setupPrimary({
            exec: serverEntry,
        });

        console.log(`[cluster] starting ${workerCount} workers for ${serverEntry}`);

        for (let index = 0; index < workerCount; index += 1) {
            cluster.fork({
                ...process.env,
                SKIP_STARTUP_PREFLIGHT: '1',
            });
        }

        cluster.on('online', (worker) => {
            console.log(`[cluster] worker ${worker.process.pid} online`);
        });

        cluster.on('exit', (worker, code, signal) => {
            console.error(`[cluster] worker ${worker.process.pid} exited (code=${code} signal=${signal || 'none'})`);
            if (!worker.exitedAfterDisconnect) {
                console.log('[cluster] replacing worker');
                cluster.fork({
                    ...process.env,
                    SKIP_STARTUP_PREFLIGHT: '1',
                });
            }
        });

        const shutdown = (signal) => {
            console.log(`[cluster] ${signal} received, shutting down workers`);
            for (const worker of Object.values(cluster.workers || {})) {
                worker.disconnect();
            }
            setTimeout(() => process.exit(0), 5000).unref();
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    };

    start().catch((error) => {
        console.error('[cluster] failed startup preflight:', error);
        process.exit(1);
    });
} else {
    require(serverEntry);
}
