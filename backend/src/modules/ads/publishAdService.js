const crypto = require('crypto');
const pool = require('../../config/database');
const mutations = require('./mutationAdsService');
const repository = require('./mutationAdsRepository');
const { saveUploadedFiles } = require('../media');
const { recordGoogerRevenuePayment } = require('../../../../shared/utils/financeCommands');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const money = value => Math.round(Number(value) * 100) / 100;
const category = type => {
    const name = String(type || '').toLowerCase();
    if (name === 'profile promote') return 'profile_promote_ad';
    if (name === 'product promote') return 'product_promote_ad';
    if (['photo and video', 'photo & video', 'photo promote', 'video promote'].includes(name)) return 'photo_video_ad';
    throw fail('Unsupported campaign type.');
};
function paymentAmount(budget, promo, adType, existingBudget = null) {
    if (existingBudget !== null) return money(Math.max(0, budget - existingBudget));
    if (!promo) return budget;
    if (adType === 'profile_promote_ad' || promo.discount_type === 'reach') return 0;
    return promo.discount_type === 'rupee' ? money(Math.max(0, budget - Number(promo.discount_value))) : budget;
}
function validatePromo(promo, adType, now = Date.now()) {
    if (!promo || !promo.is_active) throw fail('Invalid or inactive promo code.');
    if (promo.ad_type !== adType) throw fail('Promo code is not valid for this ad type.');
    if (promo.expires_at && new Date(promo.expires_at).getTime() < now) throw fail('Promo code has expired.');
    if (promo.max_uses != null && Number(promo.uses_count) >= Number(promo.max_uses)) throw fail('Promo code usage limit reached.');
}

// Mutation validation also performs pool reads. Reserve connections for those
// reads instead of allowing every connection to wait inside a money transaction.
const publishLimit = Math.max(1, Math.min(4, Math.floor(Number(pool.options?.max || 10) / 2)));
let activePublishes = 0;
const publishWaiters = [];
async function publishAd(req) {
    if (activePublishes >= publishLimit) {
        if (publishWaiters.length >= 100) throw fail('Publishing is busy. Please retry with the same operation.', 503);
        await new Promise(resolve => publishWaiters.push(resolve));
    } else activePublishes++;
    try { return await executePublishAd(req); }
    finally {
        const next = publishWaiters.shift();
        if (next) next();
        else activePublishes--;
    }
}

async function executePublishAd(req) {
    const body = typeof req.body?.data === 'string' ? JSON.parse(req.body.data) : { ...req.body };
    const userId = req.user.id;
    const adId = String(body.adId || '').replace(/^ad-/i, '');
    const key = String(req.get('Idempotency-Key') || body.publishOperationId || '').trim();
    if (!/^\d{10,12}$/.test(adId) || !key || key.length > 160) throw fail('Valid adId and publish operation ID are required.');
    const hash = crypto.createHash('sha256').update(JSON.stringify(body));
    for (const file of req.files || []) {
        if (file.buffer) hash.update(file.buffer);
        else if (file.path) for await (const chunk of require('node:fs').createReadStream(file.path)) hash.update(chunk);
        hash.update(file.originalname || '');
    }
    const requestHash = hash.digest('hex');
    const adType = category(body.campaignType);
    let budget = money(body.budget);
    if (!Number.isFinite(budget) || budget < 0) throw fail('Invalid budget.');
    const findOperation = async executor => (await executor.query(
        'SELECT request_hash, response FROM ad_publish_operations WHERE user_id=$1 AND operation_key=$2', [userId, key])).rows[0];
    const replay = record => {
        if (record.request_hash !== requestHash) throw fail('This publish operation was already used with different details.', 409);
        return record.response;
    };
    const previous = await findOperation(pool);
    if (previous) return replay(previous);
    await repository.ensureAdsTable();
    // S3 cannot join a DB transaction. Upload first; no money has moved yet.
    if (req.files?.length) {
        const media = await saveUploadedFiles(req.files, 'ads');
        body.mediaGallery = [...media, ...(body.mediaGallery || [])].slice(0, 10);
        if (media.length) body.mediaPreview = media[0];
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ad-publish:${userId}:${key}`]);
        const completed = await findOperation(client);
        if (completed) { await client.query('COMMIT'); return replay(completed); }
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ad:${adId}`]);
        const existing = (await client.query('SELECT * FROM ads WHERE ad_id=$1 FOR UPDATE', [adId])).rows[0];
        const editing = body.publishMode === 'update';
        if (editing && (!existing || Number(existing.user_id) !== Number(userId))) throw fail('Ad not found.', 404);
        if (editing && !['Under Review', 'Pending Approval'].includes(existing.status)) throw fail('Only ads under review can be edited.', 403);
        if (!editing && existing) throw fail('Ad already exists. Please reopen it.', 409);
        if (editing && body.expectedBudget != null && money(existing.budget) !== money(body.expectedBudget)) throw fail('Ad budget changed. Please reopen the ad.', 409);
        const replacingExistingPromo = editing
            && Boolean(String(existing.promo_code || '').trim())
            && String(body.promoCode || '').trim().toUpperCase() !== String(existing.promo_code || '').trim().toUpperCase();
        let promo = null;
        if (!editing && body.promoCode) {
            promo = (await client.query('SELECT * FROM promo_codes WHERE code=$1 FOR UPDATE', [String(body.promoCode).trim().toUpperCase()])).rows[0];
            validatePromo(promo, adType);
            const used = await client.query('SELECT 1 FROM ads WHERE user_id=$1 AND promo_code=$2 LIMIT 1', [userId, promo.code]);
            if (used.rows.length) throw fail('You have already used this promo code.');
            if (promo.discount_type === 'reach') budget = money(promo.discount_value);
            body.promoCode = promo.code;
            body.promoDiscount = promo.discount_type === 'reach' ? Number(promo.discount_value) : null;
            body.editDraft = { ...body.editDraft, promoDiscount: {
                discount_type: promo.discount_type, discount_value: Number(promo.discount_value),
                reach_cap: promo.reach_cap, min_reach_bonus: promo.min_reach_bonus,
                max_reach_bonus: promo.max_reach_bonus, promo_max_days: promo.promo_max_days,
            }, hasPromoCodeAdded: true };
        }
        if (budget <= 0 && !(promo && adType === 'profile_promote_ad')) throw fail('Please select a valid budget.');
        // Replacing a promo updates its campaign entitlement, but must never
        // create a second wallet charge or refund for an already settled ad.
        const payable = replacingExistingPromo
            ? 0
            : paymentAmount(budget, promo, adType, editing ? Number(existing.budget) : null);
        let transferId = editing ? existing.wallet_transfer_id : null;
        if (payable > 0) {
            const profile = adType === 'profile_promote_ad';
            const payment = await recordGoogerRevenuePayment(client, {
                payerUserId: userId, amount: payable,
                note: `Ad Promote${editing ? ' Update' : ''} - ${adId} - ${body.campaignType}`,
                transferType: profile ? 'profile_promote' : 'transfer', commissionPercentage: profile ? 0 : 100,
            });
            transferId = payment.walletTransferId;
            await client.query('INSERT INTO ad_funding(transfer_id,ad_id,user_id,amount) VALUES ($1,$2,$3,$4)', [transferId, adId, userId, payable]);
        } else if (!editing && promo) {
            transferId = (await client.query(`INSERT INTO wallet_transfers
                (sender_id,receiver_id,amount,note,type,status,created_at,updated_at)
                VALUES ($1,$1,0,$2,'promo_ad','completed',NOW(),NOW()) RETURNING id`,
                [userId, `Ad Hold Summary - ${body.campaignType} - Ad ID: ${adId} - Status: Free - Hold Amount: Free - Deducted Amount: Free`])).rows[0].id;
        }
        body.budget = budget;
        body.walletTransferId = transferId;
        if (editing) {
            // Counter/ledger state comes from the locked row, never the client.
            body.spend = Number(existing.spend || 0);
            body.reach = Number(existing.reach || 0);
            body.impressions = Number(existing.impressions || 0);
            body.clicks = Number(existing.clicks || 0);
        }
        body.remainingBudget = Math.max(0, budget - Number(existing?.spend || 0));
        if (!editing) body.editDraft = { ...body.editDraft, effectivePaymentAmount: payable, isFreePromoAd: Boolean(promo && payable === 0) };
        const mutationReq = { ...req, user: req.user, body, files: [], params: { adId } };
        const result = editing ? await mutations.updateAd(mutationReq, client) : await mutations.createAd(mutationReq, client);
        if (promo) await client.query('UPDATE promo_codes SET uses_count=uses_count+1 WHERE id=$1', [promo.id]);
        const balance = (await client.query('SELECT wallet_balance FROM users WHERE id=$1', [userId])).rows[0];
        const response = { ...result, currentBalance: Number(balance.wallet_balance), transferId };
        await client.query('INSERT INTO ad_publish_operations(user_id,operation_key,request_hash,ad_id,response) VALUES ($1,$2,$3,$4,$5::jsonb)',
            [userId, key, requestHash, adId, JSON.stringify(response)]);
        await client.query('COMMIT');
        return response;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === 'INSUFFICIENT_WALLET_BALANCE') error.statusCode = 400;
        throw error;
    } finally { client.release(); }
}
module.exports = { publishAd, paymentAmount, validatePromo };
