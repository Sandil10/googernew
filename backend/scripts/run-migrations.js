const fs = require('fs/promises');
const path = require('path');
const pool = require('../src/config/database');

async function ensureMigrationTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

async function run() {
    const migrationsDir = path.resolve(__dirname, '../migrations');
    const files = (await fs.readdir(migrationsDir))
        .filter((file) => file.endsWith('.sql'))
        .sort();

    const client = await pool.connect();
    try {
        await ensureMigrationTable(client);

        for (const file of files) {
            const existing = await client.query(
                'SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1',
                [file]
            );
            if (existing.rows.length > 0) {
                console.log(`Skipping ${file}`);
                continue;
            }

            const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
            console.log(`Applying ${file}`);
            await client.query('BEGIN');
            await client.query(sql);
            await client.query(
                'INSERT INTO schema_migrations (filename) VALUES ($1)',
                [file]
            );
            await client.query('COMMIT');
        }
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // ignore rollback failures
        }
        console.error('Migration failed:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

run();
