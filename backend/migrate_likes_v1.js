
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'Googer',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Admin@1234',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🚀 Starting Like System Migration...');

        // 1. Clean up duplicate likes
        console.log('🧹 Cleaning up duplicate likes...');
        await client.query(`
            DELETE FROM market_likes a
            USING market_likes b
            WHERE a.ctid < b.ctid
              AND a.user_id = b.user_id
              AND a.market_id = b.market_id;
        `);

        // 2. Add Unique Constraint
        console.log('🔒 Adding unique constraint to market_likes...');
        // First check if constraint exists
        const checkConstraint = await client.query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'market_likes' AND constraint_name = 'unique_user_market_like';
        `);

        if (checkConstraint.rows.length === 0) {
            await client.query(`
                ALTER TABLE market_likes ADD CONSTRAINT unique_user_market_like UNIQUE (user_id, market_id);
            `);
            console.log('✅ Unique constraint added.');
        } else {
            console.log('ℹ️ Unique constraint already exists.');
        }

        // 3. Recalculate likes_count in market table
        console.log('📊 Recalculating likes_count for all products...');
        await client.query(`
            UPDATE market m
            SET likes_count = (
                SELECT count(*) 
                FROM market_likes ml 
                WHERE ml.market_id = m.id
            );
        `);
        console.log('✅ likes_count synchronized.');

        console.log('🎊 Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
