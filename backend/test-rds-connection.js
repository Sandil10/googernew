require('dotenv').config({ path: '../.env.local' });
const pool = require('./src/config/database');

pool.query('SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = \'public\'')
  .then(r => { 
    console.log('✅ RDS Connected! Tables in database:', r.rows[0].table_count); 
    process.exit(0); 
  })
  .catch(err => { 
    console.error('❌ RDS Connection Failed:', err.message); 
    process.exit(1); 
  });
