let adminWalletGuardEnsured = false;

async function ensureAdminWalletGuard(client) {
    if (adminWalletGuardEnsured) return;

    await client.query(`
        CREATE OR REPLACE FUNCTION protect_admin_wallet_balance()
        RETURNS trigger AS $$
        BEGIN
            IF LOWER(COALESCE(NEW.user_type, '')) = 'admin'
               AND COALESCE(current_setting('googer.allow_admin_wallet_capital', true), '') <> 'true'
            THEN
                NEW.wallet_balance := COALESCE(OLD.wallet_balance, 0);
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    await client.query(`
        DROP TRIGGER IF EXISTS trg_protect_admin_wallet_balance ON users;
        CREATE TRIGGER trg_protect_admin_wallet_balance
        BEFORE UPDATE OF wallet_balance ON users
        FOR EACH ROW
        EXECUTE FUNCTION protect_admin_wallet_balance();
    `);

    adminWalletGuardEnsured = true;
}

async function isAdminUser(client, userId) {
    const result = await client.query(
        `SELECT LOWER(COALESCE(user_type, '')) = 'admin' AS is_admin
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId]
    );

    return result.rows[0]?.is_admin === true;
}

module.exports = {
    ensureAdminWalletGuard,
    isAdminUser,
};
