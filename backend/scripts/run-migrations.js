const path = require('path');
const pool = require('../src/config/database');
const { runSqlMigrations } = require('../../../shared/utils/sqlMigrationRunner');

async function run() {
    try {
        await runSqlMigrations({
            pool,
            directories: [
                path.resolve(__dirname, '../migrations'),
                path.resolve(__dirname, '../../../shared/migrations'),
            ],
        });
    } catch (error) {
        console.error('Migration failed:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

run();
