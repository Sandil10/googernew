const fs = require('fs/promises');
const path = require('path');

async function ensureMigrationTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

async function listSqlFiles(directory) {
    try {
        const stat = await fs.stat(directory);
        if (!stat.isDirectory()) return [];
    } catch {
        return [];
    }

    const files = await fs.readdir(directory);
    return files
        .filter((file) => file.endsWith('.sql'))
        .sort()
        .map((file) => ({
            filename: file,
            fullPath: path.join(directory, file),
        }));
}

async function runSqlMigrations({ pool, directories = [] }) {
    const migrationFiles = [];
    for (const directory of directories) {
        const files = await listSqlFiles(path.resolve(directory));
        migrationFiles.push(...files);
    }

    migrationFiles.sort((a, b) => a.filename.localeCompare(b.filename));

    const client = await pool.connect();
    try {
        await client.query(`SELECT pg_advisory_lock(hashtext('googer-schema-migrations'))`);
        await ensureMigrationTable(client);

        for (const migration of migrationFiles) {
            const existing = await client.query(
                'SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1',
                [migration.filename]
            );
            if (existing.rows.length > 0) {
                console.log(`Skipping ${migration.filename}`);
                continue;
            }

            const sql = await fs.readFile(migration.fullPath, 'utf8');
            console.log(`Applying ${migration.filename}`);
            await client.query('BEGIN');
            await client.query(sql);
            await client.query(
                'INSERT INTO schema_migrations (filename) VALUES ($1)',
                [migration.filename]
            );
            await client.query('COMMIT');
        }
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // ignore rollback failures
        }
        throw error;
    } finally {
        try {
            await client.query(`SELECT pg_advisory_unlock(hashtext('googer-schema-migrations'))`);
        } catch {
            // ignore unlock failures
        }
        client.release();
    }
}

module.exports = {
    runSqlMigrations,
};
