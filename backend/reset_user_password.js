const bcrypt = require('bcryptjs');
const pool = require('./src/config/database');

const email = 'sandildilmith12@gmail.com';
const newPassword = '1234';

async function resetPassword() {
    try {
        console.log(`Attempting to reset password for: ${email}`);
        
        // 1. Hash the new password using the same method as authController
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // 2. Update the user record
        const res = await pool.query(
            'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, username',
            [hashedPassword, email]
        );
        
        if (res.rowCount === 0) {
            console.error('User not found with that email.');
        } else {
            console.log(`Success! Password for ${res.rows[0].username} has been updated.`);
        }
    } catch (err) {
        console.error('Error resetting password:', err);
    } finally {
        process.exit();
    }
}

resetPassword();
