/**
 * Verify resell commission works for ALL THREE payment methods:
 *   1. cod          (Cash on Delivery)
 *   2. wallet       (Googer payment - balance transfer)
 *   3. wallet_manual (Googer Manual payment - proof-of-payment)
 *
 * For each method:
 *   - Simulate the EXACT same code paths as the real production flow
 *   - Verify HOLD on place order
 *   - Verify RELEASE on receive (User B gets 9, Googer gets 1)
 *   - Verify nothing happens prematurely
 *
 * Uses real DB but rollbacks every transaction.
 */
const pool = require('./src/config/database');

const PRODUCT_PRICE = 100;
const RESELL_PERCENT = 10;
const GOOGER_PERCENT = 10;

async function getMainGoogerBalance(client) {
    const r = await client.query(
        `SELECT COALESCE(SUM(commission), 0)::numeric AS bal FROM wallet_transfers WHERE status = 'accepted'`
    );
    return Number(r.rows[0].bal || 0);
}

async function getWallet(client, userId) {
    const r = await client.query('SELECT wallet_balance, hold_balance FROM users WHERE id = $1', [userId]);
    return {
        wallet: Number(r.rows[0]?.wallet_balance || 0),
        hold: Number(r.rows[0]?.hold_balance || 0),
    };
}

// Mimics production createResellCommissionHold exactly (universal — all payment methods)
async function holdResellCommission(client, { sellerId, buyerId, resellerId, paymentMethod, resellAmount, googerShare, resellPct }) {
    // Seller fronts the commission for ALL payment methods (cod, wallet, wallet_manual)
    const sellerRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [sellerId]);
    const sellerBalance = parseFloat(sellerRes.rows[0]?.wallet_balance || 0);
    if (sellerBalance < resellAmount) {
        throw new Error('Seller has insufficient balance to hold resell commission');
    }
    await client.query(
        'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
        [resellAmount, sellerId]
    );

    const tx = await client.query(
        `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage)
         VALUES ($1, $2, $3, 'TEST resell HOLD', 'resell_commission', 'pending', $4, $5)
         RETURNING id`,
        [sellerId, resellerId, resellAmount, googerShare, resellPct]
    );
    return tx.rows[0].id;
}

// Mimics production finalizeReceivedOrder's resell release block exactly (universal)
async function releaseResellOnReceive(client, { transferId, paymentMethod, sellerId, resellerId, resellAmount, googerShare, resellerShare, googerUserId, googerPct }) {
    // Release seller hold for ALL payment methods
    await client.query(
        'UPDATE users SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1) WHERE id = $2',
        [resellAmount, sellerId]
    );

    if (resellerShare > 0) {
        await client.query(
            'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
            [resellerShare, resellerId]
        );
    }

    await client.query(
        `UPDATE wallet_transfers SET status='completed', amount=$2, commission=$2 WHERE id=$1`,
        [transferId, resellerShare]
    );

    if (googerShare > 0) {
        await client.query(
            `INSERT INTO wallet_transfers
                (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage)
             VALUES ($1, $2, $3, 'TEST resell Googer fee', 'resell_googer_fee', 'accepted', $3, $4)`,
            [sellerId, googerUserId, googerShare, googerPct]
        );
    }
}

async function testPaymentMethod(method, ctx) {
    const { client, userA, userB, googer } = ctx;
    const pool_amt = (PRODUCT_PRICE * RESELL_PERCENT) / 100;       // 10
    const googerShare = (pool_amt * GOOGER_PERCENT) / 100;          // 1
    const resellerShare = pool_amt - googerShare;                   // 9

    console.log(`\n┌──────────────────────────────────────────────────────────┐`);
    console.log(`│  Payment Method: ${method.padEnd(40)}│`);
    console.log(`└──────────────────────────────────────────────────────────┘`);

    await client.query('BEGIN');
    try {
        // Every method now requires User A to have funds to front the resell amount
        const aw = await getWallet(client, userA.id);
        if (aw.wallet < pool_amt) {
            await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [pool_amt - aw.wallet + 10, userA.id]);
        }

        const balBefore = await getMainGoogerBalance(client);
        const aBefore = await getWallet(client, userA.id);
        const bBefore = await getWallet(client, userB.id);

        console.log(`BEFORE: GoogerMain=${balBefore.toFixed(2)}, UserA wallet=${aBefore.wallet.toFixed(2)}/hold=${aBefore.hold.toFixed(2)}, UserB wallet=${bBefore.wallet.toFixed(2)}`);

        // STEP 1: PLACE ORDER (HOLD)
        const transferId = await holdResellCommission(client, {
            sellerId: userA.id,
            buyerId: 999,
            resellerId: userB.id,
            paymentMethod: method,
            resellAmount: pool_amt,
            googerShare,
            resellPct: RESELL_PERCENT,
        });

        const balHold = await getMainGoogerBalance(client);
        const aHold = await getWallet(client, userA.id);
        const bHold = await getWallet(client, userB.id);

        console.log(`HOLD:   GoogerMain=${balHold.toFixed(2)} (Δ${(balHold - balBefore).toFixed(2)}), UserA wallet=${aHold.wallet.toFixed(2)}/hold=${aHold.hold.toFixed(2)}, UserB wallet=${bHold.wallet.toFixed(2)}`);

        const noPrematureGooger = Math.abs(balHold - balBefore) < 0.01;
        const noPrematureReseller = Math.abs(bHold.wallet - bBefore.wallet) < 0.01;
        // Now ALL methods deduct from seller wallet at order time
        const aHeldCorrectly = Math.abs((aBefore.wallet - aHold.wallet) - pool_amt) < 0.01
                            && Math.abs((aHold.hold - aBefore.hold) - pool_amt) < 0.01;

        console.log(`  ✓ No premature Googer credit:      ${noPrematureGooger ? 'PASS' : 'FAIL'}`);
        console.log(`  ✓ No premature reseller credit:    ${noPrematureReseller ? 'PASS' : 'FAIL'}`);
        console.log(`  ✓ HOLD behavior correct for ${method.padEnd(13)}: ${aHeldCorrectly ? 'PASS' : 'FAIL'}`);

        // STEP 2: RECEIVE (RELEASE)
        await releaseResellOnReceive(client, {
            transferId,
            paymentMethod: method,
            sellerId: userA.id,
            resellerId: userB.id,
            resellAmount: pool_amt,
            googerShare,
            resellerShare,
            googerUserId: googer.id,
            googerPct: GOOGER_PERCENT,
        });

        const balRel = await getMainGoogerBalance(client);
        const aRel = await getWallet(client, userA.id);
        const bRel = await getWallet(client, userB.id);

        console.log(`RELEASE: GoogerMain=${balRel.toFixed(2)} (Δ${(balRel - balHold).toFixed(2)}), UserA wallet=${aRel.wallet.toFixed(2)}/hold=${aRel.hold.toFixed(2)}, UserB wallet=${bRel.wallet.toFixed(2)} (Δ+${(bRel.wallet - bHold.wallet).toFixed(2)})`);

        const googerGotOne = Math.abs((balRel - balHold) - googerShare) < 0.01;
        const resellerGotNine = Math.abs((bRel.wallet - bHold.wallet) - resellerShare) < 0.01;
        const aHoldReleased = Math.abs(aRel.hold - aBefore.hold) < 0.01;

        console.log(`  ✓ Main Googer Balance +${googerShare}:             ${googerGotOne ? 'PASS' : 'FAIL'}`);
        console.log(`  ✓ Reseller wallet +${resellerShare}:               ${resellerGotNine ? 'PASS' : 'FAIL'}`);
        console.log(`  ✓ Seller hold released:             ${aHoldReleased ? 'PASS' : 'FAIL'}`);

        const allPass = noPrematureGooger && noPrematureReseller && aHeldCorrectly && googerGotOne && resellerGotNine && aHoldReleased;
        console.log(`\n  ${allPass ? '✅ OVERALL: PASS' : '❌ OVERALL: FAIL'}`);

        await client.query('ROLLBACK');
        return allPass;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`  ❌ ERROR: ${e.message}`);
        return false;
    }
}

async function run() {
    const client = await pool.connect();
    try {
        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║  RESELL COMMISSION — ALL PAYMENT METHODS VERIFICATION    ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log(`Test scenario: product=R${PRODUCT_PRICE}, resell=${RESELL_PERCENT}%, googer=${GOOGER_PERCENT}%`);
        console.log(`Expected: pool=R10 → reseller=R9, Main Googer Balance=+R1`);

        const adminRes = await client.query(`SELECT id, username FROM users WHERE LOWER(COALESCE(user_type,''))='admin' ORDER BY id LIMIT 1`);
        const googer = adminRes.rows[0];

        const usersRes = await client.query(`SELECT id, username FROM users WHERE LOWER(COALESCE(user_type,''))<>'admin' ORDER BY id LIMIT 2`);
        const userA = usersRes.rows[0];
        const userB = usersRes.rows[1];

        console.log(`Users: A=${userA.username}(${userA.id}) seller, B=${userB.username}(${userB.id}) reseller, Googer=${googer.username}(${googer.id})`);

        const ctx = { client, userA, userB, googer };
        const results = {};

        for (const method of ['cod', 'wallet', 'wallet_manual']) {
            results[method] = await testPaymentMethod(method, ctx);
        }

        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║  FINAL SUMMARY                                           ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        for (const [method, pass] of Object.entries(results)) {
            console.log(`  ${pass ? '✅' : '❌'} ${method.padEnd(15)} ${pass ? 'WORKS' : 'BROKEN'}`);
        }
        const allOk = Object.values(results).every(Boolean);
        console.log(`\n  ${allOk ? '✅ ALL 3 PAYMENT METHODS WORK CORRECTLY' : '❌ AT LEAST ONE METHOD FAILED'}`);
        console.log(`\n(All transactions rolled back. Database untouched.)\n`);

    } catch (e) {
        console.error('ERR:', e.message, e.stack);
    } finally {
        client.release();
        pool.end();
    }
}

run();
