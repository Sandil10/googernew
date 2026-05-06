const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Googer',
    password: 'Admin@1234',
    port: 5432,
});

pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'market'").then(res => {
    console.log(res.rows.map(r => r.column_name));
    pool.end();
});
