/**
 * Commission distribution test
 * Tests both product and wallet discount distribution for a 100-unit pool
 */
const pool = require('./src/config/database');
const { distributeProductDiscountCommission } = require('./src/utils/referralCommission');

async function getBalance(client, userId) {
    const r = await client.query('SELECT username, wallet_balance FROM users WHERE id = $1', [userId]);
    return r.rows[0];
}

async function resolveGooger(client) {
    const r = await client.query(
        `SELECT id, username, wallet_balance FROM users
         WHERE LOWER(COALESCE(user_type,'')) = 'admin'
         ORDER BY id ASC LIMIT 1`
    );
    return r.rows[0];
}

async function runTest() {
    const client = await pool.connect();
    try {
        // ── Find a real buyer (non-admin user)
        const buyerRes = await client.query(
            `SELECT id, username, wallet_balance FROM users
             WHERE LOWER(COALESCE(user_type,'')) <> 'admin'
             ORDER BY id ASC LIMIT 1`
        );
        if (!buyerRes.rows.length) { console.log('No non-admin user found'); return; }
        const buyer = buyerRes.rows[0];

        // ── Find Googer
        const googer = await resolveGooger(client);
        if (!googer) { console.log('No admin/Googer user found'); return; }

        console.log('\n===== BEFORE =====');
        console.log('Googer:', googer.username, '| balance:', googer.wallet_balance);
        console.log('Buyer:', buyer.username, '| balance:', buyer.wallet_balance);

        // ── Check referral chain
        const chainRes = await client.query(
            `WITH RECURSIVE uplines AS (
                SELECT referred_by AS earner_id, 1 AS level FROM referral_relationships WHERE user_id = $1
                UNION ALL
                SELECT rr.referred_by, u.level + 1 FROM referral_relationships rr JOIN uplines u ON rr.user_id = u.earner_id WHERE u.level < 6
             )
             SELECT earner_id, level FROM uplines ORDER BY level ASC`,
            [buyer.id]
        );
        console.log('\nReferral chain for buyer:', chainRes.rows.length === 0 ? 'NONE (no referrals)' : chainRes.rows);

        // ── Level settings
        const levelsRes = await client.query(
            'SELECT level, name, commission_percentage, ad_commission_percentage, is_active FROM referral_level_settings ORDER BY level ASC'
        );
        console.log('\nLevel settings:');
        console.table(levelsRes.rows);

        console.log('\n===== SIMULATING: Product discount pool = 100, buyer ID =', buyer.id, '=====');
        console.log('Expected: Googer gets', levelsRes.rows.find(l=>l.level===0)?.commission_percentage, '% of 100 =', Number(levelsRes.rows.find(l=>l.level===0)?.commission_percentage || 0) * 100 / 100, 'coins');

        await client.query('BEGIN');

        const payouts = await distributeProductDiscountCommission(client, {
            buyerId: buyer.id,
            payerId: buyer.id,
            discountAmount: 100,
            sourceId: `test-product-${Date.now()}`,
            description: 'TEST Product Discount',
            sourceType: 'test_product',
            notePrefix: 'TEST Product',
            commissionField: 'commission_percentage',
        });

        console.log('\n--- Product commission payouts ---');
        for (const p of payouts) {
            const earnerRes = await client.query('SELECT username FROM users WHERE id = $1', [p.earnerId]);
            const username = earnerRes.rows[0]?.username || 'unknown';
            console.log(`  Level ${p.level} | ${username} | amount: ${p.amount} | pct: ${p.commissionPercentage}%`);
        }
        if (payouts.length === 0) console.log('  (no payouts distributed)');

        await client.query('ROLLBACK'); // Don't actually save the test

        // ── Now test wallet
        console.log('\n===== SIMULATING: Wallet discount pool = 100, buyer ID =', buyer.id, '(uses ad_commission_percentage) =====');
        console.log('Expected: Googer gets', levelsRes.rows.find(l=>l.level===0)?.ad_commission_percentage, '% of 100 =', Number(levelsRes.rows.find(l=>l.level===0)?.ad_commission_percentage || 0) * 100 / 100, 'coins');

        await client.query('BEGIN');

        const walletPayouts = await distributeProductDiscountCommission(client, {
            buyerId: buyer.id,
            payerId: buyer.id,
            discountAmount: 100,
            sourceId: `test-wallet-${Date.now()}`,
            description: 'TEST Wallet Discount',
            sourceType: 'test_wallet',
            notePrefix: 'TEST Wallet',
            commissionField: 'ad_commission_percentage',
        });

        console.log('\n--- Wallet commission payouts ---');
        for (const p of walletPayouts) {
            const earnerRes = await client.query('SELECT username FROM users WHERE id = $1', [p.earnerId]);
            const username = earnerRes.rows[0]?.username || 'unknown';
            console.log(`  Level ${p.level} | ${username} | amount: ${p.amount} | pct: ${p.commissionPercentage}%`);
        }
        if (walletPayouts.length === 0) console.log('  (no payouts distributed — all wallet commission percentages are 0%)');

        await client.query('ROLLBACK');

        console.log('\n===== CONCLUSION =====');
        console.log('For wallet transfers to distribute commission, set ad_commission_percentage > 0 in admin panel.');
        console.log('For product discounts, commission_percentage is used (Googer =', levelsRes.rows.find(l=>l.level===0)?.commission_percentage, '%).');
        console.log('Test complete — all changes rolled back, no real data modified.\n');

    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Test error:', err.message);
        console.error(err.stack);
    } finally {
        client.release();
        pool.end();
    }
}

runTest();
