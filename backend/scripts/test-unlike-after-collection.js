const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/controllers/marketController.js'), 'utf8');
const start = source.indexOf('exports.toggleLike =');
const end = source.indexOf('\nexports.', source.indexOf('exports.collectAdLikeCoin =') + 10);
let liked = true;
const queries = [];
const client = {
 release() {},
 async query(sql) {
  queries.push(sql);
  if (sql.includes('SELECT 1 FROM ad_likes') || sql.includes('SELECT 1 FROM market_likes')) return {rows: liked ? [{}] : []};
  if (sql.startsWith('DELETE FROM ad_likes') || sql.startsWith('DELETE FROM market_likes')) {liked=false;return {rows:[]};}
  if (sql.startsWith('INSERT INTO ad_likes') || sql.startsWith('INSERT INTO market_likes')) {liked=true;return {rows:[]};}
  if (sql.startsWith('UPDATE ads') || sql.startsWith('UPDATE market')) return {rows:[{likes_count:liked?6:5}]};
  if (sql.includes('FROM ad_coin_collections')) return {rows:[{id:9}]};
  if (sql.includes('SELECT a.ad_id')) return {rows:[{ad_id:'55',user_id:2,campaign_type:'Ads',edit_draft:{},remaining_budget:100}]};
  if (sql.includes('SELECT id FROM users') || sql.includes('SELECT id, wallet_balance')) return {rows:[{id:2,wallet_balance:100}]};
  if (sql.includes('SELECT 1 FROM ads') || sql.includes('SELECT id FROM market')) return {rows:[{id:55}]};
  if (/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory)/.test(sql)) return {rows:[]};
  throw Error('Unexpected query: '+sql);
 }
};
const context={exports:{},console,pool:{connect:async()=>client},ensureSponsoredAdsEngagementSchema:async()=>{},isSponsoredFeedItemId:id=>id.startsWith('ad-'),normalizeSponsoredAdId:id=>id.replace(/^ad-/,''),normalizeAdType:x=>x,safeJsonParse:x=>x,getActiveAdCoinRewardSettings:async()=>({}),isWatchTimedSponsoredAd:()=>false,isFreeSponsoredAdForCoinReward:()=>true,DEFAULT_AD_COIN_REWARD_SETTINGS:{}};
vm.runInNewContext(source.slice(start,end),context);
const response=()=>({code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
(async()=>{
 for(const id of ['ad-55','55']) {
  liked=true;let res=response();await context.exports.toggleLike({params:{id},user:{id:3}},res);assert.equal(res.code,200);assert.equal(res.data.liked,false);assert.equal(res.data.likes_count,5);
  res=response();await context.exports.toggleLike({params:{id},user:{id:3}},res);assert.equal(res.data.liked,true);assert.equal(res.data.likes_count,6);
 }
 const res=response();await context.exports.collectAdLikeCoin({params:{id:'ad-55'},body:{},user:{id:3}},res);assert.equal(res.code,409);assert.match(res.data.message,/already collected/);
 assert.equal(queries.some(sql=>/DELETE FROM ad_coin_collections|UPDATE users|INSERT INTO ad_coin_collections/.test(sql)),false);
 console.log('PASS: collected ad and product unlike/re-like; duplicate reward remains blocked; collection and wallets untouched.');
})().catch(e=>{console.error(e);process.exitCode=1;});
