const pool = require('./src/config/database');
const fs = require('fs');

async function exportDatabase() {
    try {
        let sql = '-- Googer Database Export\n\n';

        // 1. Export Users Schema & Data
        console.log('📦 Exporting users...');
        const usersSchema = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(4) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    user_type VARCHAR(20) DEFAULT 'user',
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    profile_picture VARCHAR(255) DEFAULT '/assets/images/avatars/avatar-default.jpg',
    bio TEXT,
    referral_code VARCHAR(20) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_referral_code ON users(referral_code);
`;
        sql += usersSchema + '\n';

        const usersData = await pool.query('SELECT * FROM users');
        usersData.rows.forEach(row => {
            const columns = Object.keys(row).join(', ');
            const values = Object.values(row).map(val => {
                if (val === null) return 'NULL';
                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                if (val instanceof Date) return `'${val.toISOString()}'`;
                return val;
            }).join(', ');
            sql += `INSERT INTO users (${columns}) VALUES (${values}) ON CONFLICT (id) DO NOTHING;\n`;
        });

        // 2. Export Wallet Schema & Data
        console.log('📦 Exporting wallet...');
        const walletSchema = `
CREATE TABLE IF NOT EXISTS wallet (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER REFERENCES users(id),
    referred_user_id INTEGER REFERENCES users(id),
    referred_username VARCHAR(50),
    referral_link_used VARCHAR(50),
    amount DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wallet_referrer ON wallet(referrer_id);
`;
        sql += '\n' + walletSchema + '\n';

        const walletData = await pool.query('SELECT * FROM wallet');
        walletData.rows.forEach(row => {
            const columns = Object.keys(row).join(', ');
            const values = Object.values(row).map(val => {
                if (val === null) return 'NULL';
                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                if (val instanceof Date) return `'${val.toISOString()}'`;
                return val;
            }).join(', ');
            sql += `INSERT INTO wallet (${columns}) VALUES (${values}) ON CONFLICT (id) DO NOTHING;\n`;
        });

        fs.writeFileSync('full_db_export.sql', sql);
        console.log('✅ Database exported successfully to full_db_export.sql');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error exporting database:', err);
        process.exit(1);
    }
}

exportDatabase();
