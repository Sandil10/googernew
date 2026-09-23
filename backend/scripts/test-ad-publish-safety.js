// Integration tests only against the dedicated loopback test cluster. Never uses backend .env.
const assert = require('node:assert/strict');
const { test, before, beforeEach, after } = require('node:test');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const config = { host: '127.0.0.1', port: 55432, user: 'safety_test', database: 'googer_safety_tests' };
const pool = new Pool(config);
process.env.GOOGER_MAIN_USER_ID = '99';
function stub(name, exports) { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../src/config/database', pool);
stub('../src/modules/ads/mutationAdsRepository', { ensureAdsTable: async () => {} });
const { refundBudgetReduction, readRefundReceipt } = require('../src/modules/ads/adBudgetRefund');
// Inject a minimal ad persistence adapter to isolate transaction orchestration from unrelated product schemas.
stub('../src/modules/ads/mutationAdsService', {
    async createAd(req, client) {
        if (req.body.failSave) throw new Error('Injected save failure');
        const p = req.body;
        const row = (await client.query(`INSERT INTO ads(ad_id,user_id,budget,status,wallet_transfer_id,spend)
            VALUES($1,$2,$3,'Under Review',$4,0) RETURNING *`, [p.adId,req.user.id,p.budget,p.walletTransferId])).rows[0];
        return { success:true, ad:row, statusCode:201 };
    },
    async updateAd(req, client) {
        const old = (await client.query('SELECT * FROM ads WHERE ad_id=$1 FOR UPDATE',[req.params.adId])).rows[0];
        await refundBudgetReduction(client, old, {...req.body,status:'Under Review'},req.user.id);
        if (req.body.failSave) throw new Error('Injected update failure');
        const row = (await client.query('UPDATE ads SET budget=$1,wallet_transfer_id=$2,updated_at=clock_timestamp() WHERE ad_id=$3 RETURNING *',
            [req.body.budget,req.body.walletTransferId,req.params.adId])).rows[0];
        return {success:true,ad:row,statusCode:200};
    },
});
stub('../src/modules/media', { saveUploadedFiles: async () => [] });
const { publishAd, paymentAmount } = require('../src/modules/ads/publishAdService');
const request = (extra={}, userId=1) => ({user:{id:userId},body:{adId:'1234567890',campaignType:'Photo and Video',budget:500,publishOperationId:'create-1',...extra},files:[],get:()=>null});
const balance = async () => Number((await pool.query('SELECT wallet_balance FROM users WHERE id=1')).rows[0].wallet_balance);
const count = async table => Number((await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
before(async()=>{
    const control = new Pool({...config,database:'postgres'});
    if (!(await control.query("SELECT 1 FROM pg_database WHERE datname='googer_safety_tests'")).rows.length) await control.query('CREATE DATABASE googer_safety_tests');
    await control.end();
    await pool.query(`CREATE TABLE IF NOT EXISTS users(id BIGINT PRIMARY KEY,username TEXT,user_type TEXT,wallet_balance NUMERIC,hold_balance NUMERIC DEFAULT 0);
        CREATE TABLE IF NOT EXISTS wallet_transfers(id BIGSERIAL PRIMARY KEY,sender_id BIGINT,receiver_id BIGINT,amount NUMERIC,note TEXT,type TEXT,status TEXT,commission NUMERIC DEFAULT 0,commission_percentage NUMERIC,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
        CREATE TABLE IF NOT EXISTS ads(ad_id TEXT PRIMARY KEY,user_id BIGINT,budget NUMERIC,status TEXT,wallet_transfer_id BIGINT,spend NUMERIC,promo_code TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE IF NOT EXISTS promo_codes(id BIGSERIAL PRIMARY KEY,code TEXT UNIQUE,ad_type TEXT,is_active BOOLEAN DEFAULT TRUE,discount_type TEXT,discount_value NUMERIC,uses_count INT DEFAULT 0,max_uses INT,expires_at TIMESTAMPTZ);`);
    await pool.query(fs.readFileSync(path.resolve(__dirname,'../../shared/migrations/20260906_ad_publish_safety.sql'),'utf8'));
});
beforeEach(async()=>{
    await pool.query('TRUNCATE ad_publish_operations,ad_budget_refunds,ad_funding,ads,wallet_transfers,promo_codes,users RESTART IDENTITY');
    await pool.query("INSERT INTO users VALUES(1,'buyer','user',10000,0),(2,'other','user',10000,0),(99,'googer','admin',0,0)");
});
after(()=>pool.end());

test('same paid publish concurrently retries once',async()=>{
    const [a,b] = await Promise.all([publishAd(request()),publishAd(request())]);
    assert.equal(a.transferId,b.transferId); assert.equal(await balance(),9500);
    assert.equal(await count('ads'),1);assert.equal(await count('wallet_transfers'),1);assert.equal(await count('ad_publish_operations'),1);
});
test('save failure rolls back payment, funding, and receipt',async()=>{
    await assert.rejects(publishAd(request({failSave:true})),/Injected/);
    assert.equal(await balance(),10000); assert.equal(await count('wallet_transfers'),0);assert.equal(await count('ad_funding'),0);assert.equal(await count('ad_publish_operations'),0);
});
test('changed payload cannot replay a completed operation',async()=>{
    await publishAd(request());await assert.rejects(publishAd(request({budget:600})),e=>e.statusCode===409);assert.equal(await balance(),9500);
});
test('budget reduction and refund commit once; arbitrary receipt amount fails',async()=>{
    await publishAd(request());
    const edit = request({publishMode:'update',publishOperationId:'edit-1',expectedBudget:500,budget:300});
    await Promise.all([publishAd(edit),publishAd(edit)]);
    assert.equal(await balance(),9700);assert.equal(await count('ad_budget_refunds'),1);
    const receipt = await readRefundReceipt(pool,{userId:1,adId:'1234567890',amount:200});assert.equal(receipt.currentBalance,9700);
    await assert.rejects(readRefundReceipt(pool,{userId:1,adId:'1234567890',amount:999}),e=>e.statusCode===409);
    await assert.rejects(readRefundReceipt(pool,{userId:2,adId:'1234567890',amount:200}),e=>e.statusCode===409);
    assert.equal(await balance(),9700);
});
test('unauthorized and approved edits never move money',async()=>{
    await publishAd(request());
    await assert.rejects(publishAd(request({publishMode:'update',publishOperationId:'edit',budget:300},2)),e=>e.statusCode===404);
    await pool.query("UPDATE ads SET status='Active'");
    await assert.rejects(publishAd(request({publishMode:'update',publishOperationId:'edit',budget:300})),e=>e.statusCode===403);
    assert.equal(await balance(),9500);
});
test('failed update rolls back both refund and reduced budget',async()=>{
    await publishAd(request());
    await assert.rejects(publishAd(request({publishMode:'update',publishOperationId:'edit',budget:300,failSave:true})),/Injected/);
    assert.equal(await balance(),9500);assert.equal(await count('ad_budget_refunds'),0);
    assert.equal(Number((await pool.query('SELECT budget FROM ads')).rows[0].budget),500);
});

test('paused campaign cannot be edited or charged',async()=>{
    await publishAd(request());
    await pool.query("UPDATE ads SET status='Paused',spend=100");
    const edit=request({publishMode:'update',publishOperationId:'paused-edit',expectedBudget:500,budget:700});
    await assert.rejects(publishAd(edit),e=>e.statusCode===403);
    assert.equal(await balance(),9500);
    assert.equal(Number((await pool.query('SELECT spend FROM ads')).rows[0].spend),100);
});

test('paused budget reduction is rejected without a refund',async()=>{
    await publishAd(request());
    await pool.query("UPDATE ads SET status='Paused',spend=100");
    await assert.rejects(publishAd(request({publishMode:'update',publishOperationId:'paused-reduce',budget:300})),e=>e.statusCode===403);
    assert.equal(await balance(),9500);
    assert.equal(await count('ad_budget_refunds'),0);
});

test('completed campaigns cannot be edited or charged',async()=>{
    await publishAd(request());
    await pool.query("UPDATE ads SET status='Completed'");
    await assert.rejects(publishAd(request({publishMode:'update',publishOperationId:'completed-edit',budget:1000})),e=>e.statusCode===403);
    assert.equal(await balance(),9500);
});
test('fabricated budget cannot refund more than verified funding',async()=>{
    await publishAd(request());await pool.query('UPDATE ads SET budget=5000');
    await assert.rejects(publishAd(request({publishMode:'update',publishOperationId:'edit',budget:1000})),/verified/);
    assert.equal(await balance(),9500);
});
test('a client-linked legacy transfer is not automatically trusted as ad funding',async()=>{
    await pool.query("INSERT INTO wallet_transfers(id,sender_id,receiver_id,amount,type,status,commission) VALUES(500,1,99,500,'transfer','accepted',500)");
    await pool.query("INSERT INTO ads(ad_id,user_id,budget,status,wallet_transfer_id,spend) VALUES('1234567890',1,500,'Under Review',500,0)");
    await assert.rejects(publishAd(request({publishMode:'update',publishOperationId:'legacy-refund',budget:300})),/verified/);
    assert.equal(await balance(),10000);assert.equal(await count('ad_budget_refunds'),0);assert.equal(await count('ad_funding'),0);
});

test('stale concurrent budget edits cannot both charge',async()=>{
    await publishAd(request());
    const results = await Promise.allSettled([600,700].map(budget=>publishAd(request({publishMode:'update',publishOperationId:`edit-${budget}`,expectedBudget:500,budget}))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await count('wallet_transfers'),2);
});
test('days promo preserves payment and increments usage exactly once',async()=>{
    await pool.query("INSERT INTO promo_codes(code,ad_type,discount_type,discount_value,max_uses) VALUES('DAYS','photo_video_ad','days',2,1)");
    await Promise.all([publishAd(request({promoCode:'DAYS'})),publishAd(request({promoCode:'DAYS'}))]);
    assert.equal(await balance(),9500);assert.equal((await pool.query('SELECT uses_count FROM promo_codes')).rows[0].uses_count,1);
});
test('free profile promo produces one zero ledger row, no debit',async()=>{
    await pool.query("INSERT INTO promo_codes(code,ad_type,discount_type,discount_value) VALUES('PROFILE','profile_promote_ad','rupee',100)");
    await publishAd(request({campaignType:'Profile Promote',promoCode:'PROFILE'}));
    assert.equal(await balance(),10000);assert.equal(await count('wallet_transfers'),1);
    assert.equal(Number((await pool.query('SELECT amount FROM wallet_transfers')).rows[0].amount),0);
});
test('invalid/expired promo never debits',async()=>{
    await pool.query("INSERT INTO promo_codes(code,ad_type,discount_type,discount_value,expires_at) VALUES('EXPIRED','photo_video_ad','rupee',100,NOW()-INTERVAL '1 day')");
    await assert.rejects(publishAd(request({promoCode:'EXPIRED'})),/expired/);assert.equal(await balance(),10000);
});
test('payment rules retain each category and discount behavior',()=>{
    assert.equal(paymentAmount(500,null,'photo_video_ad'),500);
    assert.equal(paymentAmount(500,{discount_type:'rupee',discount_value:100},'product_promote_ad'),400);
    assert.equal(paymentAmount(500,{discount_type:'days',discount_value:2},'profile_promote_ad'),0);
    assert.equal(paymentAmount(500,{discount_type:'reach'},'photo_video_ad'),0);
    assert.equal(paymentAmount(700,null,'photo_video_ad',500),200);
});
