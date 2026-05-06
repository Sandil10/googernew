const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Googer',
    password: 'Admin@1234',
    port: 5432,
});

pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'market'").then(res => {
    console.log(JSON.stringify(res.rows, null, 2));
    pool.end();
});
