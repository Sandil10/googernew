const DEFAULT_PRODUCT_POOL_PERCENTAGE = 20;
const DEFAULT_AD_POOL_PERCENTAGE = 20;
const REFERRAL_TRANSFER_TYPE = 'referral_commission';

const SETTING_KEYS = {
    product: 'product_purchase_pool_percentage',
    ad: 'ad_purchase_pool_percentage',
};

async function resolveGoogerMainWalletUserId(client) {
    const configuredId = Number.parseInt(String(process.env.GOOGER_MAIN_USER_ID || '').trim(), 10);
    if (Number.isFinite(configuredId) && configuredId > 0) {
        const configuredResult = await client.query(
            'SELECT id FROM users WHERE id = $1 LIMIT 1',
            [configuredId]
        );
        if (configuredResult.rows.length > 0) return configuredResult.rows[0].id;
    }

    const adminResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(COALESCE(user_type, '')) = 'admin'
         ORDER BY id ASC
         LIMIT 1`
    );
    if (adminResult.rows.length > 0) return adminResult.rows[0].id;

    const googerResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(username) = 'googer'
         ORDER BY id ASC
         LIMIT 1`
    );
    if (googerResult.rows.length > 0) return googerResult.rows[0].id;

    return null;
}

async function ensureReferralCommissionTables(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS referral_level_settings (
            id SERIAL PRIMARY KEY,
            level INTEGER UNIQUE NOT NULL,
            name VARCHAR(80) NOT NULL,
            commission_percentage NUMERIC(8,2) NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS referral_commission_settings (
            setting_key VARCHAR(80) PRIMARY KEY,
            setting_value NUMERIC(8,2) NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await client.query(`
        ALTER TABLE referral_commission_settings
        ADD COLUMN IF NOT EXISTS setting_key VARCHAR(80),
        ADD COLUMN IF NOT EXISTS setting_value NUMERIC(8,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    await client.query(`
        INSERT INTO referral_level_settings
            (level, name, commission_percentage, is_active, sort_order)
        VALUES
            (0, 'Googer', 0, TRUE, 0),
            (1, 'Direct', 40, TRUE, 1),
            (2, 'Team', 30, TRUE, 2),
            (3, 'Network', 12.5, TRUE, 3),
            (4, 'Extended', 12.5, TRUE, 4),
            (5, 'Global', 5, TRUE, 5)
        ON CONFLICT (level) DO NOTHING;
    `);

    await client.query(`
        DO $$
        DECLARE
            product_pool NUMERIC(8,2) := $do$${DEFAULT_PRODUCT_POOL_PERCENTAGE}$do$::numeric;
            ad_pool NUMERIC(8,2) := $do$${DEFAULT_AD_POOL_PERCENTAGE}$do$::numeric;
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'referral_commission_settings'
                  AND column_name = 'product_purchase_pool_percentage'
            ) THEN
                SELECT
                    COALESCE(product_purchase_pool_percentage, product_pool),
                    COALESCE(ad_purchase_pool_percentage, ad_pool)
                INTO product_pool, ad_pool
                FROM referral_commission_settings
                ORDER BY id ASC NULLS LAST
                LIMIT 1;
            END IF;

            UPDATE referral_commission_settings
            SET setting_value = product_pool,
                updated_at = CURRENT_TIMESTAMP
            WHERE setting_key = '${SETTING_KEYS.product}';

            IF NOT FOUND THEN
                INSERT INTO referral_commission_settings (setting_key, setting_value, updated_at)
                VALUES ('${SETTING_KEYS.product}', product_pool, CURRENT_TIMESTAMP);
            END IF;

            UPDATE referral_commission_settings
            SET setting_value = ad_pool,
                updated_at = CURRENT_TIMESTAMP
            WHERE setting_key = '${SETTING_KEYS.ad}';

            IF NOT FOUND THEN
                INSERT INTO referral_commission_settings (setting_key, setting_value, updated_at)
                VALUES ('${SETTING_KEYS.ad}', ad_pool, CURRENT_TIMESTAMP);
            END IF;
        END $$;
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS referral_commission_payouts (
            id SERIAL PRIMARY KEY,
            source_type VARCHAR(40) NOT NULL,
            source_id VARCHAR(120) NOT NULL,
            buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            earner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            level INTEGER NOT NULL,
            pool_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            commission_percentage NUMERIC(8,2) NOT NULL DEFAULT 0,
            amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            wallet_transfer_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(source_type, source_id, earner_id, level)
        );
    `);

    await client.query(`
        ALTER TABLE referral_commission_payouts
        ADD COLUMN IF NOT EXISTS source_type VARCHAR(40),
        ADD COLUMN IF NOT EXISTS source_id VARCHAR(120),
        ADD COLUMN IF NOT EXISTS buyer_id INTEGER,
        ADD COLUMN IF NOT EXISTS earner_id INTEGER,
        ADD COLUMN IF NOT EXISTS level INTEGER,
        ADD COLUMN IF NOT EXISTS pool_amount NUMERIC(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(8,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS wallet_transfer_id INTEGER,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    await client.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'referral_commission_payouts'
                  AND column_name = 'amount_paid'
            ) THEN
                UPDATE referral_commission_payouts
                SET amount = COALESCE(amount, amount_paid, 0)
                WHERE amount IS NULL;
            END IF;
        END $$;
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS referral_relationships (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            referred_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            referral_code_used VARCHAR(80),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id)
        );
    `);

    await client.query(`
        ALTER TABLE referral_relationships
        ADD COLUMN IF NOT EXISTS level INTEGER,
        ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(8,2);
    `);
}

function normalizePercentage(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(100, Math.max(0, number));
}

async function getReferralCommissionSettings(client) {
    await ensureReferralCommissionTables(client);
    const result = await client.query(
        `SELECT setting_key, setting_value
         FROM referral_commission_settings
         WHERE setting_key = ANY($1::text[])`,
        [[SETTING_KEYS.product, SETTING_KEYS.ad]]
    );

    const values = Object.fromEntries(result.rows.map((row) => [row.setting_key, Number(row.setting_value || 0)]));
    return {
        productPurchasePoolPercentage: normalizePercentage(
            values[SETTING_KEYS.product],
            DEFAULT_PRODUCT_POOL_PERCENTAGE
        ),
        adPurchasePoolPercentage: normalizePercentage(
            values[SETTING_KEYS.ad],
            DEFAULT_AD_POOL_PERCENTAGE
        ),
    };
}

async function updateReferralCommissionSettings(client, settings = {}) {
    await ensureReferralCommissionTables(client);
    const productPool = normalizePercentage(
        settings.productPurchasePoolPercentage ?? settings.product_pool_percentage,
        DEFAULT_PRODUCT_POOL_PERCENTAGE
    );
    const adPool = normalizePercentage(
        settings.adPurchasePoolPercentage ?? settings.ad_pool_percentage,
        DEFAULT_AD_POOL_PERCENTAGE
    );

    await client.query(
        `UPDATE referral_commission_settings
         SET setting_value = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE setting_key = $1`,
        [SETTING_KEYS.product, productPool]
    );
    await client.query(
        `INSERT INTO referral_commission_settings (setting_key, setting_value, updated_at)
         SELECT $1, $2, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (
             SELECT 1 FROM referral_commission_settings WHERE setting_key = $1
         )`,
        [SETTING_KEYS.product, productPool]
    );
    await client.query(
        `UPDATE referral_commission_settings
         SET setting_value = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE setting_key = $1`,
        [SETTING_KEYS.ad, adPool]
    );
    await client.query(
        `INSERT INTO referral_commission_settings (setting_key, setting_value, updated_at)
         SELECT $1, $2, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (
             SELECT 1 FROM referral_commission_settings WHERE setting_key = $1
         )`,
        [SETTING_KEYS.ad, adPool]
    );

    return {
        productPurchasePoolPercentage: productPool,
        adPurchasePoolPercentage: adPool,
    };
}

async function syncReferralRelationshipCommissionFields(client) {
    await ensureReferralCommissionTables(client);
    await client.query(`
        WITH RECURSIVE referral_tree AS (
            SELECT
                rr.id,
                rr.user_id,
                rr.referred_by,
                1 AS level
            FROM referral_relationships rr
            LEFT JOIN referral_relationships parent_rel ON parent_rel.user_id = rr.referred_by
            WHERE parent_rel.user_id IS NULL

            UNION ALL

            SELECT
                child.id,
                child.user_id,
                child.referred_by,
                referral_tree.level + 1 AS level
            FROM referral_relationships child
            JOIN referral_tree ON child.referred_by = referral_tree.user_id
            WHERE referral_tree.level < (
                SELECT GREATEST(1, COALESCE(MAX(level), 5))
                FROM referral_level_settings
            )
        )
        UPDATE referral_relationships rr
        SET level = referral_tree.level,
            commission_percentage = CASE
                WHEN rls.is_active = TRUE THEN rls.commission_percentage
                ELSE 0
            END
        FROM referral_tree
        LEFT JOIN referral_level_settings rls ON rls.level = referral_tree.level
        WHERE rr.id = referral_tree.id;
    `);
}

async function distributeReferralCommission(client, {
    buyerId,
    grossAmount,
    sourceType,
    sourceId,
    description,
}) {
    await ensureReferralCommissionTables(client);

    const buyer = Number(buyerId);
    const gross = Number(grossAmount);
    if (!Number.isFinite(buyer) || buyer <= 0 || !Number.isFinite(gross) || gross <= 0 || !sourceType || !sourceId) {
        return [];
    }

    const settings = await getReferralCommissionSettings(client);
    const poolPercentage = sourceType === 'ad'
        ? settings.adPurchasePoolPercentage
        : settings.productPurchasePoolPercentage;
    const poolAmount = Number(((gross * poolPercentage) / 100).toFixed(2));
    if (poolAmount <= 0) return [];

    const insertPayoutIfMissing = async ({
        sourceType,
        sourceId,
        buyerId,
        earnerId,
        level,
        poolAmount,
        commissionPercentage,
        amount,
    }) => {
        const existing = await client.query(
            `SELECT id
             FROM referral_commission_payouts
             WHERE source_type = $1
               AND source_id::text = $2
               AND earner_id = $3
               AND level = $4
             LIMIT 1`,
            [sourceType, String(sourceId), earnerId, level]
        );

        if (existing.rows.length > 0) return null;

        const inserted = await client.query(
            `INSERT INTO referral_commission_payouts
                (source_type, source_id, buyer_id, earner_id, level, pool_amount, commission_percentage, amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
                sourceType,
                String(sourceId),
                buyerId,
                earnerId,
                level,
                poolAmount,
                commissionPercentage,
                amount,
            ]
        );

        return inserted.rows[0];
    };

    const payouts = [];
    const googerLevel = await client.query(
        `SELECT level, name AS level_name, commission_percentage
         FROM referral_level_settings
         WHERE level = 0 AND is_active = TRUE
         LIMIT 1`
    );

    if (googerLevel.rows.length > 0) {
        const googerUserId = await resolveGoogerMainWalletUserId(client);
        const googerPercentage = normalizePercentage(googerLevel.rows[0].commission_percentage);
        const googerAmount = Number(((poolAmount * googerPercentage) / 100).toFixed(2));

        if (googerUserId && googerUserId !== buyer && googerAmount > 0) {
            const payout = await insertPayoutIfMissing({
                sourceType,
                sourceId,
                buyerId: buyer,
                earnerId: googerUserId,
                level: 0,
                poolAmount,
                commissionPercentage: googerPercentage,
                amount: googerAmount,
            });

            if (payout) {
                await client.query(
                    'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
                    [googerAmount, googerUserId]
                );

                const note = `Referral Purchase Commission - Googer Level - ${description}`;
                const transfer = await client.query(
                    `INSERT INTO wallet_transfers
                        (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $6, 'completed', $3, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                     RETURNING id`,
                    [buyer, googerUserId, googerAmount, note, googerPercentage, REFERRAL_TRANSFER_TYPE]
                );

                await client.query(
                    'UPDATE referral_commission_payouts SET wallet_transfer_id = $1 WHERE id = $2',
                    [transfer.rows[0].id, payout.id]
                );

                payouts.push({
                    level: 0,
                    earnerId: Number(googerUserId),
                    amount: googerAmount,
                    commissionPercentage: googerPercentage,
                    poolAmount,
                    walletTransferId: transfer.rows[0].id,
                });
            }
        }
    }

    const uplines = await client.query(
        `WITH RECURSIVE uplines AS (
            SELECT
                rr.referred_by AS earner_id,
                1 AS level
            FROM referral_relationships rr
            WHERE rr.user_id = $1

            UNION ALL

            SELECT
                rr.referred_by AS earner_id,
                uplines.level + 1 AS level
            FROM referral_relationships rr
            JOIN uplines ON rr.user_id = uplines.earner_id
            WHERE uplines.level < (
                SELECT GREATEST(1, COALESCE(MAX(level), 5))
                FROM referral_level_settings
            )
        )
        SELECT
            uplines.earner_id,
            uplines.level,
            rls.name AS level_name,
            COALESCE(rls.commission_percentage, 0)::numeric AS commission_percentage
        FROM uplines
        JOIN referral_level_settings rls
          ON rls.level = uplines.level
         AND rls.is_active = TRUE
        WHERE uplines.earner_id <> $1
        ORDER BY uplines.level ASC`,
        [buyer]
    );

    for (const row of uplines.rows) {
        const commissionPercentage = normalizePercentage(row.commission_percentage);
        const amount = Number(((poolAmount * commissionPercentage) / 100).toFixed(2));
        if (amount <= 0) continue;

        const payout = await insertPayoutIfMissing({
            sourceType,
            sourceId,
            buyerId: buyer,
            earnerId: row.earner_id,
            level: row.level,
            poolAmount,
            commissionPercentage,
            amount,
        });

        if (!payout) continue;

        await client.query(
            'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
            [amount, row.earner_id]
        );

        const note = `Referral Purchase Commission - Level ${row.level}${row.level_name ? ` ${row.level_name}` : ''} - ${description}`;
        const transfer = await client.query(
            `INSERT INTO wallet_transfers
                (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $6, 'completed', $3, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id`,
            [buyer, row.earner_id, amount, note, commissionPercentage, REFERRAL_TRANSFER_TYPE]
        );

        await client.query(
            'UPDATE referral_commission_payouts SET wallet_transfer_id = $1 WHERE id = $2',
            [transfer.rows[0].id, payout.id]
        );

        payouts.push({
            level: Number(row.level),
            earnerId: Number(row.earner_id),
            amount,
            commissionPercentage,
            poolAmount,
            walletTransferId: transfer.rows[0].id,
        });
    }

    return payouts;
}

module.exports = {
    ensureReferralCommissionTables,
    getReferralCommissionSettings,
    updateReferralCommissionSettings,
    syncReferralRelationshipCommissionFields,
    distributeReferralCommission,
};
