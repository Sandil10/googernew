#!/usr/bin/env node

const path = require('path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const LEVEL_COUNTS = String(process.env.LOADTEST_LEVEL_COUNTS || '40,120,240,160,40')
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

const ROOT_EMAIL = String(process.env.LOADTEST_ROOT_EMAIL || 'auth-loadtest-scale@example.com').trim().toLowerCase();
const ROOT_USERNAME = String(process.env.LOADTEST_ROOT_USERNAME || 'auth_load_scale').trim().toLowerCase();
const ROOT_PASSWORD = String(process.env.LOADTEST_ROOT_PASSWORD || 'Pass123!').trim();
const ROOT_FULL_NAME = String(process.env.LOADTEST_ROOT_FULL_NAME || 'Auth Load Test Scale').trim();
const CART_ITEM_COUNT = Number.parseInt(process.env.LOADTEST_CART_ITEMS || '120', 10) || 120;
const AD_SAVE_COUNT = Number.parseInt(process.env.LOADTEST_AD_SAVES || '240', 10) || 240;
const PAYOUTS_PER_REFERRAL = Number.parseInt(process.env.LOADTEST_PAYOUTS_PER_REFERRAL || '2', 10) || 2;
const SUBSCRIPTION_HISTORY_COUNT = Number.parseInt(process.env.LOADTEST_SUB_HISTORY || '24', 10) || 24;

const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'Googer',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: ['1', 'true', 'require'].includes(String(process.env.DB_SSL || '').toLowerCase())
        ? { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true' }
        : false,
});

function chunk(items, size) {
    const groups = [];
    for (let i = 0; i < items.length; i += size) {
        groups.push(items.slice(i, i + size));
    }
    return groups;
}

function buildUserId(index) {
    return String(900000 + index);
}

function buildReferralCode(index) {
    return `LT${String(index).padStart(6, '0')}`;
}

function buildSeedUsers(rootId) {
    const users = [];
    const levels = [];
    let cursor = 0;

    for (let levelIndex = 0; levelIndex < LEVEL_COUNTS.length; levelIndex += 1) {
        const level = levelIndex + 1;
        const count = LEVEL_COUNTS[levelIndex];
        const nodes = [];
        for (let i = 0; i < count; i += 1) {
            const ordinal = cursor + i + 1;
            nodes.push({
                ordinal,
                email: `lt-scale-${rootId}-${ordinal}@example.com`,
                username: `lt_scale_${rootId}_${ordinal}`,
                fullName: `LT Scale ${rootId} ${ordinal}`,
                userId: buildUserId(rootId * 1000 + ordinal),
                referralCode: buildReferralCode(rootId * 1000 + ordinal),
                level,
            });
        }
        users.push(...nodes);
        levels.push(nodes);
        cursor += count;
    }

    return { users, levels };
}

function buildParentRelationships(rootId, levelGroups, userIdByEmail) {
    const rows = [];
    let previous = [{ id: rootId }];

    for (let i = 0; i < levelGroups.length; i += 1) {
        const level = i + 1;
        const current = levelGroups[i];
        current.forEach((user, index) => {
            const userId = userIdByEmail.get(user.email);
            const parent = previous[index % previous.length];
            rows.push({
                userId,
                referredBy: parent.id,
                referralCodeUsed: `LT-ROOT-${rootId}`,
                level,
                commissionPercentage: level === 1 ? 40 : level === 2 ? 30 : level === 3 ? 12.5 : level === 4 ? 12.5 : 5,
            });
        });
        previous = current.map((user) => ({ id: userIdByEmail.get(user.email) }));
    }

    return rows;
}

async function ensureRootUser(client) {
    const passwordHash = await bcrypt.hash(ROOT_PASSWORD, 10);
    const existing = await client.query(
        `SELECT id
         FROM users
         WHERE email = $1
         LIMIT 1`,
        [ROOT_EMAIL]
    );

    if (existing.rows[0]) {
        const updated = await client.query(
            `UPDATE users
             SET username = $1,
                 full_name = $2,
                 password = $3,
                 referral_code = COALESCE(referral_code, $4),
                 wallet_balance = COALESCE(wallet_balance, 0) + 1000
             WHERE id = $5
             RETURNING id, email, username`,
            [ROOT_USERNAME, ROOT_FULL_NAME, passwordHash, `ROOT${buildReferralCode(existing.rows[0].id)}`, existing.rows[0].id]
        );
        return updated.rows[0];
    }

    const inserted = await client.query(
        `INSERT INTO users (user_id, username, full_name, email, password, user_type, referral_code, wallet_balance)
         VALUES ($1, $2, $3, $4, $5, 'user', $6, 1000.00)
         RETURNING id, email, username`,
        [buildUserId(1), ROOT_USERNAME, ROOT_FULL_NAME, ROOT_EMAIL, passwordHash, `ROOT${buildReferralCode(1)}`]
    );
    return inserted.rows[0];
}

async function upsertSeedUsers(client, seedUsers) {
    const passwordHash = await bcrypt.hash('Pass123!', 4);
    for (const group of chunk(seedUsers, 100)) {
        const values = [];
        const placeholders = [];
        group.forEach((user, index) => {
            const base = index * 7;
            placeholders.push(
                `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'user', $${base + 6}, $${base + 7})`
            );
            values.push(
                user.userId,
                user.username,
                user.fullName,
                user.email,
                passwordHash,
                user.referralCode,
                0
            );
        });

        await client.query(
            `INSERT INTO users (user_id, username, full_name, email, password, user_type, referral_code, wallet_balance)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (email) DO UPDATE
             SET username = EXCLUDED.username,
                 full_name = EXCLUDED.full_name,
                 password = EXCLUDED.password,
                 referral_code = COALESCE(users.referral_code, EXCLUDED.referral_code)`,
            values
        );
    }
}

async function loadSeedUserIdMap(client, rootId) {
    const result = await client.query(
        `SELECT id, email
         FROM users
         WHERE email = $1
            OR email LIKE $2`,
        [ROOT_EMAIL, `lt-scale-${rootId}-%@example.com`]
    );
    return new Map(result.rows.map((row) => [row.email, row.id]));
}

async function upsertRelationships(client, relationships) {
    for (const group of chunk(relationships, 200)) {
        const values = [];
        const placeholders = [];
        group.forEach((row, index) => {
            const base = index * 5;
            placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
            values.push(row.userId, row.referredBy, row.referralCodeUsed, row.level, row.commissionPercentage);
        });

        await client.query(
            `INSERT INTO referral_relationships (user_id, referred_by, referral_code_used, level, commission_percentage)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (user_id) DO UPDATE
             SET referred_by = EXCLUDED.referred_by,
                 referral_code_used = EXCLUDED.referral_code_used,
                 level = EXCLUDED.level,
                 commission_percentage = EXCLUDED.commission_percentage`,
            values
        );
    }
}

async function resetSyntheticPayouts(client, rootId, relationships) {
    await client.query(
        `DELETE FROM referral_commission_payouts
         WHERE earner_id = $1
           AND source_id LIKE $2`,
        [rootId, `LT-PAYOUT-${rootId}-%`]
    );

    const rows = [];
    const sourceTypes = ['wallet_discount', 'product_discount', 'ad_coin'];
    relationships.forEach((relationship, relIndex) => {
        for (let i = 0; i < PAYOUTS_PER_REFERRAL; i += 1) {
            rows.push({
                sourceType: sourceTypes[(relIndex + i) % sourceTypes.length],
                sourceId: `LT-PAYOUT-${rootId}-${relationship.userId}-${i + 1}`,
                buyerId: relationship.userId,
                earnerId: rootId,
                level: relationship.level,
                poolAmount: 25 + ((relIndex + i) % 10),
                commissionPercentage: relationship.commissionPercentage,
                amount: Number((((25 + ((relIndex + i) % 10)) * relationship.commissionPercentage) / 100).toFixed(2)),
            });
        }
    });

    for (const group of chunk(rows, 200)) {
        const values = [];
        const placeholders = [];
        group.forEach((row, index) => {
            const base = index * 8;
            placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, NOW())`);
            values.push(
                row.sourceType,
                row.sourceId,
                row.buyerId,
                row.earnerId,
                row.level,
                row.poolAmount,
                row.commissionPercentage,
                row.amount
            );
        });

        await client.query(
            `INSERT INTO referral_commission_payouts
                (source_type, source_id, buyer_id, earner_id, level, pool_amount, commission_percentage, amount, created_at)
             VALUES ${placeholders.join(', ')}`,
            values
        );
    }
}

async function seedCartItems(client, rootId) {
    await client.query(
        `DELETE FROM cart_items
         WHERE user_id = $1
           AND title LIKE 'LT Seed Item %'`,
        [rootId]
    );

    const rows = [];
    for (let i = 1; i <= CART_ITEM_COUNT; i += 1) {
        rows.push({
            productId: 800000 + i,
            title: `LT Seed Item ${i}`,
            price: 100 + i,
            promoPrice: 80 + i,
            imageUrl: `/uploads/loadtest/item-${i}.jpg`,
            size: i % 2 === 0 ? 'M' : 'L',
            color: i % 3 === 0 ? 'Black' : 'Blue',
            variantIndex: i % 5,
        });
    }

    for (const group of chunk(rows, 100)) {
        const values = [];
        const placeholders = [];
        group.forEach((row, index) => {
            const base = index * 10;
            placeholders.push(
                `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 1, $${base + 6}, $${base + 7}, $${base + 8}, TRUE, 'seed-seller', $${base + 9}::jsonb, 5.00, NULL, $${base + 10}::jsonb, NULL, 0)`
            );
            values.push(
                rootId,
                row.productId,
                row.title,
                row.price,
                row.promoPrice,
                row.size,
                row.color,
                row.variantIndex,
                JSON.stringify({ charge: '0', date: '1-3 days', rates: [{ country: 'Sri Lanka', charge: '0', date: '1-3 days', customDate: '' }], unified: true }),
                JSON.stringify(['wallet']),
            );
        });

        await client.query(
            `INSERT INTO cart_items
                (user_id, product_id, title, price, promo_price, quantity, size, color, variant_index, selected, seller_id, shipping_info, product_discount, selected_shipping_country, payment_methods, reseller_ref, resell_commission_percentage)
             VALUES ${placeholders.join(', ')}`,
            values
        );
    }
}

async function seedAdSaves(client, rootId) {
    await client.query(
        `DELETE FROM ad_saves
         WHERE user_id = $1
           AND ad_id LIKE $2`,
        [rootId, `LTSEED-${rootId}-%`]
    );

    const rows = [];
    for (let i = 1; i <= AD_SAVE_COUNT; i += 1) {
        rows.push({
            adId: `LTSEED-${rootId}-${String(i).padStart(4, '0')}`,
            mediaType: i % 4 === 0 ? 'video' : 'photo',
        });
    }

    for (const group of chunk(rows, 200)) {
        const values = [];
        const placeholders = [];
        group.forEach((row, index) => {
            const base = index * 3;
            placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'upload')`);
            values.push(rootId, row.adId, row.mediaType);
        });
        await client.query(
            `INSERT INTO ad_saves (user_id, ad_id, ad_media_type, ad_source_type)
             VALUES ${placeholders.join(', ')}`,
            values
        );
    }
}

async function seedSubscriptionHistory(client, rootId) {
    const planResult = await client.query(
        `SELECT id, slug, name, duration_days, price
         FROM subscription_plans
         WHERE is_active = TRUE
         ORDER BY is_default DESC, sort_order ASC, id ASC
         LIMIT 1`
    );
    const plan = planResult.rows[0];
    if (!plan) return;

    await client.query(
        `DELETE FROM user_plan_subscriptions
         WHERE user_id = $1
           AND (plan_name LIKE 'Load Test Seed %' OR plan_slug LIKE 'lt-seed-%')`,
        [rootId]
    );

    const historicalRows = [];
    for (let i = 0; i < SUBSCRIPTION_HISTORY_COUNT; i += 1) {
        historicalRows.push({
            slug: `lt-seed-${i + 1}`,
            name: `Load Test Seed ${i + 1}`,
            daysAgo: SUBSCRIPTION_HISTORY_COUNT - i + 10,
        });
    }

    for (const row of historicalRows) {
        await client.query(
            `INSERT INTO user_plan_subscriptions
                (user_id, plan_id, plan_slug, plan_name, price_paid, duration_days, status, auto_renew, started_at, expires_at, cancelled_at, created_at)
             VALUES
                ($1, $2, $3, $4, $5, $6, 'cancelled', FALSE, NOW() - ($7::text || ' days')::interval, NOW() - ($8::text || ' days')::interval, NOW() - ($8::text || ' days')::interval, NOW() - ($7::text || ' days')::interval)`,
            [rootId, plan.id, row.slug, row.name, plan.price, plan.duration_days, row.daysAgo, row.daysAgo - 1]
        );
    }

    const activeExisting = await client.query(
        `SELECT id
         FROM user_plan_subscriptions
         WHERE user_id = $1
           AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1`,
        [rootId]
    );

    if (!activeExisting.rows[0]) {
        await client.query(
            `INSERT INTO user_plan_subscriptions
                (user_id, plan_id, plan_slug, plan_name, price_paid, duration_days, status, auto_renew, started_at, expires_at, created_at)
             VALUES
                ($1, $2, $3, $4, $5, $6, 'active', TRUE, NOW() - interval '1 day', NOW() + interval '29 day', NOW() - interval '1 day')`,
            [rootId, plan.id, plan.slug, plan.name, plan.price, plan.duration_days]
        );
    }
}

async function collectSummary(client, rootId) {
    const queries = {
        descendants: `SELECT COUNT(*)::int AS c FROM referral_relationships WHERE referred_by = $1 OR user_id IN (SELECT user_id FROM referral_relationships WHERE referred_by = $1)`,
        totalReferrals: `WITH RECURSIVE referral_tree AS (
            SELECT user_id FROM referral_relationships WHERE referred_by = $1
            UNION ALL
            SELECT child.user_id
            FROM referral_relationships child
            JOIN referral_tree parent ON child.referred_by = parent.user_id
        ) SELECT COUNT(*)::int AS c FROM referral_tree`,
        payouts: `SELECT COUNT(*)::int AS c FROM referral_commission_payouts WHERE earner_id = $1 AND source_id LIKE $2`,
        cartItems: `SELECT COUNT(*)::int AS c FROM cart_items WHERE user_id = $1 AND title LIKE 'LT Seed Item %'`,
        adSaves: `SELECT COUNT(*)::int AS c FROM ad_saves WHERE user_id = $1 AND ad_id LIKE $2`,
        subscriptionHistory: `SELECT COUNT(*)::int AS c FROM user_plan_subscriptions WHERE user_id = $1`,
    };

    const results = {};
    results.totalReferrals = Number((await client.query(queries.totalReferrals, [rootId])).rows[0].c || 0);
    results.syntheticPayouts = Number((await client.query(queries.payouts, [rootId, `LT-PAYOUT-${rootId}-%`])).rows[0].c || 0);
    results.syntheticCartItems = Number((await client.query(queries.cartItems, [rootId])).rows[0].c || 0);
    results.syntheticAdSaves = Number((await client.query(queries.adSaves, [rootId, `LTSEED-${rootId}-%`])).rows[0].c || 0);
    results.subscriptionHistoryRows = Number((await client.query(queries.subscriptionHistory, [rootId])).rows[0].c || 0);
    return results;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const root = await ensureRootUser(client);
        const { users, levels } = buildSeedUsers(root.id);

        await upsertSeedUsers(client, users);
        const idMap = await loadSeedUserIdMap(client, root.id);
        const relationships = buildParentRelationships(root.id, levels, idMap);

        await upsertRelationships(client, relationships);
        await resetSyntheticPayouts(client, root.id, relationships);
        await seedCartItems(client, root.id);
        await seedAdSaves(client, root.id);
        await seedSubscriptionHistory(client, root.id);

        const summary = await collectSummary(client, root.id);
        await client.query('COMMIT');

        console.log(JSON.stringify({
            success: true,
            rootUser: {
                email: ROOT_EMAIL,
                password: ROOT_PASSWORD,
                userId: root.id,
                username: ROOT_USERNAME,
            },
            summary,
        }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(JSON.stringify({
            success: false,
            message: error.message,
            stack: error.stack,
        }, null, 2));
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
