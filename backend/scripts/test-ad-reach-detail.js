const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

// Dedicated local test database; temporary tables never touch application rows.
const client = new Client({ host: '127.0.0.1', port: 55432, user: 'safety_test', database: 'googer_safety_tests' });
const databaseId = require.resolve('../src/config/database');
require.cache[databaseId] = { id: databaseId, filename: databaseId, loaded: true, exports: client };
const { syncAdsReachCaps } = require('../src/modules/ads/adsRuntimeRepository');

before(async () => {
    await client.connect();
    await client.query(`CREATE TEMP TABLE reach_tiers(id integer, ad_type text, budget_from numeric, budget_to numeric, max_reach_multiplier numeric);
        CREATE TEMP TABLE ads(ad_id text, campaign_type text, budget numeric, max_reach_cap integer,
            current_reach integer DEFAULT 0, impressions integer DEFAULT 0, updated_at timestamptz,
            status text DEFAULT 'Under Review', completed_at timestamptz, last_resumed_at timestamptz,
            paused_at timestamptz, remaining_budget numeric);
        INSERT INTO reach_tiers VALUES(1,'photo_video_ad',0,1000,3);
        INSERT INTO ads(ad_id,campaign_type,budget,impressions) VALUES
            ('detail-ad','Photo and Video',300,12),('other-ad','Photo and Video',500,20);`);
});
after(() => client.end());

test('loading one ad calculates its reach cap without changing other ads', async () => {
    await syncAdsReachCaps('detail-ad');
    const { rows } = await client.query('SELECT * FROM ads ORDER BY ad_id');
    assert.equal(rows[0].max_reach_cap, 900);
    assert.equal(rows[0].current_reach, 12);
    assert.equal(rows[1].max_reach_cap, null);
});

test('list refresh still calculates reach caps for all ads', async () => {
    await syncAdsReachCaps();
    const { rows } = await client.query("SELECT max_reach_cap FROM ads WHERE ad_id='other-ad'");
    assert.equal(rows[0].max_reach_cap, 1500);
});

test('unlimited reach tier supports an individual ad filter', async () => {
    await client.query('UPDATE reach_tiers SET max_reach_multiplier=NULL');
    await syncAdsReachCaps('detail-ad');
    const { rows } = await client.query('SELECT * FROM ads ORDER BY ad_id');
    assert.equal(rows[0].max_reach_cap, null);
    assert.equal(rows[1].max_reach_cap, 1500);
});
