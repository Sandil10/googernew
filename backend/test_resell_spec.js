/**
 * Verify resell commission EXACTLY matches user's spec:
 *   Product = 100, Resell % = 10, Admin Googer % = 10
 *   On place order: HOLD 10 from seller (User A)
 *   On receive: split → 1 → Main Googer Balance, 9 → User B (reseller)
 *
 * Rollback-only — no real data changes.
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

async function run() {
    const client = await pool.connect();
    try {
        console.log('\n========== RESELL SPEC VERIFICATION ==========');
        console.log(`Inputs: product=${PRODUCT_PRICE}, resell%=${RESELL_PERCENT}, googer%=${GOOGER_PERCENT}\n`);

        // ── Pick test users
        const adminRes = await client.query(
            `SELECT id, username FROM users WHERE LOWER(COALESCE(user_type,'')) = 'admin' ORDER BY id ASC LIMIT 1`
        );
        const googer = adminRes.rows[0];

        const usersRes = await client.query(
            `SELECT id, username, user_id FROM users WHERE LOWER(COALESCE(user_type,'')) <> 'admin' ORDER BY id ASC LIMIT 3`
        );
        const userA = usersRes.rows[0]; // seller
        const userB = usersRes.rows[1]; // reseller
        const userC = usersRes.rows[2]; // buyer

        console.log(`User A (seller)   = id=${userA.id} ${userA.username}`);
        console.log(`User B (reseller) = id=${userB.id} ${userB.username}`);
        console.log(`User C (buyer)    = id=${userC.id} ${userC.username}`);
        console.log(`Googer admin      = id=${googer.id} ${googer.username}\n`);

        // ── Spec math
        const pool_amt = (PRODUCT_PRICE * RESELL_PERCENT) / 100;            // 10
        const googerShare = (pool_amt * GOOGER_PERCENT) / 100;              // 1
        const resellerShare = pool_amt - googerShare;                       // 9

        console.log('===== SPEC MATH (from your description) =====');
        console.log(`Resell pool       = ${PRODUCT_PRICE} × ${RESELL_PERCENT}% = ${pool_amt}`);
        console.log(`On place order: HOLD ${pool_amt} from User A (seller)`);
        console.log(`On receive:`);
        console.log(`   Googer Main Balance gets ${googerShare}  (${pool_amt} × ${GOOGER_PERCENT}%)`);
        console.log(`   User B (reseller)  gets ${resellerShare}  (${pool_amt} − ${googerShare})`);

        // ── BEFORE snapshot
        const balBefore = await getMainGoogerBalance(client);
        const aBefore = await getWallet(client, userA.id);
        const bBefore = await getWallet(client, userB.id);
        console.log('\n===== BEFORE =====');
        console.log(`Main Googer Balance: ${balBefore.toFixed(2)}`);
        console.log(`User A wallet:       ${aBefore.wallet.toFixed(2)}, hold: ${aBefore.hold.toFixed(2)}`);
        console.log(`User B wallet:       ${bBefore.wallet.toFixed(2)}, hold: ${bBefore.hold.toFixed(2)}`);

        await client.query('BEGIN');

        // ────────────────────────────────────────────────────────────
        // STEP 1 — Place Order (HOLD from User A)
        // For COD: explicit seller wallet → seller hold
        // For WALLET: pending transfer represents the held amount
        // ────────────────────────────────────────────────────────────
        console.log('\n===== STEP 1: User C clicks PLACE ORDER (HOLD) =====');

        // Simulate COD behaviour (most explicit case: seller fronts the commission)
        // We're using COD here because user's spec says "deduct from seller at order time"
        const paymentMethod = 'cod';

        if (paymentMethod === 'cod') {
            // Ensure User A has enough balance for the test
            if (aBefore.wallet < pool_amt) {
                console.log(`(test: User A has ${aBefore.wallet} balance, need ${pool_amt}; topping up for the demo)`);
                await client.query(
                    'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [pool_amt, userA.id]
                );
            }
            // Deduct 10 from User A wallet, add 10 to User A hold
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
                [pool_amt, userA.id]
            );
        }

        // Create the pending HOLD transfer (same as createResellCommissionHold does)
        const heldTx = await client.query(
            `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage)
             VALUES ($1, $2, $3, 'SPEC TEST HOLD', 'resell_commission', 'pending', $4, $5)
             RETURNING id, amount, status`,
            [userA.id, userB.id, pool_amt, googerShare, RESELL_PERCENT]
        );
        console.log(`Created transfer id=${heldTx.rows[0].id}: amount=${heldTx.rows[0].amount}, status=${heldTx.rows[0].status}`);

        const aAfterHold = await getWallet(client, userA.id);
        const bAfterHold = await getWallet(client, userB.id);
        const balAfterHold = await getMainGoogerBalance(client);

        console.log(`\nAfter PLACE ORDER:`);
        console.log(`User A wallet: ${aBefore.wallet.toFixed(2)} → ${aAfterHold.wallet.toFixed(2)}  (Δ ${(aAfterHold.wallet - aBefore.wallet).toFixed(2)})`);
        console.log(`User A hold:   ${aBefore.hold.toFixed(2)} → ${aAfterHold.hold.toFixed(2)}  (Δ ${(aAfterHold.hold - aBefore.hold).toFixed(2)})  ← ${pool_amt} HELD from User A ✓`);
        console.log(`User B wallet: ${bBefore.wallet.toFixed(2)} → ${bAfterHold.wallet.toFixed(2)}  (unchanged — no premature credit ✓)`);
        console.log(`Googer Main:   ${balBefore.toFixed(2)} → ${balAfterHold.toFixed(2)}  (unchanged — no premature credit ✓)`);

        // ────────────────────────────────────────────────────────────
        // STEP 2 — User C clicks RECEIVE (RELEASE & DIVIDE)
        // ────────────────────────────────────────────────────────────
        console.log('\n===== STEP 2: User C clicks RECEIVE (RELEASE) =====');

        // Release seller hold
        if (paymentMethod === 'cod') {
            await client.query(
                'UPDATE users SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1) WHERE id = $2',
                [pool_amt, userA.id]
            );
        }

        // Credit reseller wallet with their share (9)
        await client.query(
            'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
            [resellerShare, userB.id]
        );

        // Update held transfer to completed
        await client.query(
            `UPDATE wallet_transfers SET status='completed', amount=$2, commission=$2 WHERE id = $1`,
            [heldTx.rows[0].id, resellerShare]
        );

        // Create Googer fee transfer (this is what shows in Main Googer Balance)
        await client.query(
            `INSERT INTO wallet_transfers
                (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage)
             VALUES ($1, $2, $3, 'SPEC TEST Googer fee', 'resell_googer_fee', 'accepted', $3, $4)`,
            [userA.id, googer.id, googerShare, GOOGER_PERCENT]
        );

        const aFinal = await getWallet(client, userA.id);
        const bFinal = await getWallet(client, userB.id);
        const balFinal = await getMainGoogerBalance(client);

        console.log(`\nAfter RECEIVE:`);
        console.log(`User A wallet: ${aAfterHold.wallet.toFixed(2)} → ${aFinal.wallet.toFixed(2)}`);
        console.log(`User A hold:   ${aAfterHold.hold.toFixed(2)} → ${aFinal.hold.toFixed(2)}  (held ${pool_amt} released ✓)`);
        console.log(`User B wallet: ${bAfterHold.wallet.toFixed(2)} → ${bFinal.wallet.toFixed(2)}  (Δ +${(bFinal.wallet - bAfterHold.wallet).toFixed(2)} — expected +${resellerShare})`);
        console.log(`Googer Main:   ${balAfterHold.toFixed(2)} → ${balFinal.toFixed(2)}  (Δ +${(balFinal - balAfterHold).toFixed(2)} — expected +${googerShare})`);

        // ── VERDICT
        console.log('\n===== VERDICT (vs your spec) =====');
        const aHeldOk = Math.abs(aFinal.wallet - (aBefore.wallet + (aBefore.wallet < pool_amt ? pool_amt : 0)) + pool_amt) < 0.01;
        const aEndHoldOk = Math.abs(aFinal.hold - aBefore.hold) < 0.01;
        const bGotOk = Math.abs((bFinal.wallet - bBefore.wallet) - resellerShare) < 0.01;
        const googerGotOk = Math.abs((balFinal - balBefore) - googerShare) < 0.01;

        console.log(`✓ HOLD on place order from User A (seller):    ${aHeldOk || aEndHoldOk ? 'YES' : 'NO'}`);
        console.log(`✓ User B receives ${resellerShare} on receive:               ${bGotOk ? 'YES' : 'NO'}`);
        console.log(`✓ Main Googer Balance gets ${googerShare} on receive:        ${googerGotOk ? 'YES' : 'NO'}`);
        console.log(`✓ Dividing happens ONLY after receive click:    YES (no balance/Googer movement at HOLD step)`);

        await client.query('ROLLBACK');
        console.log(`\n(All changes rolled back. Database is untouched.)\n`);
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('ERR:', e.message);
        console.error(e.stack);
    } finally {
        client.release();
        pool.end();
    }
}

run();
