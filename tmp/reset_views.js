const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Googer',
    password: 'Admin@1234',
    port: 5432,
});

async function resetViews() {
    try {
        console.log('--- Resetting all product view counts ---');
        
        // 1. Reset the views_count column in market table
        await pool.query('UPDATE market SET views_count = 0');
        
        // 2. Clear the market_views history table to start fresh
        await pool.query('DELETE FROM market_views');
        
        console.log('--- Successfully reset all views to 0 ---');
    } catch (err) {
        console.error('Reset failed:', err);
    } finally {
        await pool.end();
    }
}

resetViews();
