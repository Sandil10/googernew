# 05 — Ads and Campaigns

| Layer | File |
| --- | --- |
| Campaign builders | `app/dashboard/ad-campaign/**/page.tsx` (5 types) |
| Ad cards | `app/components/ads/**` |
| Client ad logic | `app/lib/ads/**` (11 modules) |
| Service | `services/adsService.ts` |
| Backend | `controllers/adsController.js` (115 KB), `utils/adDelivery.js` |
| Tables | `ads`, `ad_likes`, `ad_views`, `ad_impressions`, `ad_click_events`, `ad_comments`, `ad_shares`, `ad_saves`, `ad_reports`, `ad_coin_collections`, `ad_like_coin_rewards`, `ad_coin_reward_settings`, `ad_video_watch_eligibility` |

## 1. The five campaign types

Each has its own builder page under both `/ad-campaign/*` and `/dashboard/ad-campaign/*`:

| Campaign type | Renders as | Reach-first? |
| --- | --- | --- |
| **Photo and Video** | media card in feed | **yes** |
| **Product Promote** | product card → opens shop second view | **yes** |
| **Profile Promote** | carousel row, not an inline card | no |
| **Flash Content** | flash upload card | no |
| **Upload Content** | long-form content card | no |

`normalizeCampaignType` lowercases and collapses `_`/`-`/whitespace, so
`Photo_Promote`, `photo promote` and `Photo  Promote` are one type.

### Reach-first vs duration-first — the key distinction

`REACH_FIRST_CAMPAIGN_TYPES` (`adDelivery.js:5`):
```
product promote · photo promote · video promote · photo and video · photo & video
```

**Rule:** a reach-first campaign ends when its **reach target** is met. Elapsed days
do **not** stop delivery — `adIsWithinDeliveryRules` skips the duration check
entirely for these (`adDelivery.js:515`). Everything else expires on time.

**Rule:** Profile Promote is exempt from the budget check — it keeps delivering with
`remaining_budget <= 0` (`adDelivery.js:522`). It is detected by
`campaign_type ∈ {profile promote, profile promote ad}` **or** `media_type === 'profile'`.

## 2. Delivery gate

An ad is served only if `adIsWithinDeliveryRules(row) && adMatchesViewer(row, viewer)`.
Both are documented in detail in `02-HOME-FEED.md` §2. Summary:

**Ad-side** — status `Active`; `impressions < max_reach_cap`; duration not expired
(non-reach-first only); `remaining_budget > 0` unless Profile Promote or a promo
code is attached.

**Viewer-side** — anonymous viewers bypass all targeting. Otherwise gender
(prefix-match, empty = match-all), country (ISO ↔ English-name aliasing via
`Intl.DisplayNames`), interests (substring, either direction).

## 3. Duration accounting — pausable campaigns

`calculateAdDurationState` (`adDelivery.js:93`) does **not** measure wall-clock time
from the start date. It sums active segments:

```
elapsed = min(totalMs, accumulated_active_ms + liveSegment)
liveSegment = status === 'Active' && last_resumed_at ? now − last_resumed_at : 0
remaining = max(0, totalMs − elapsed)
totalMs = duration_days × 86 400 000
```

**Rule:** paused time does not burn duration. `accumulated_active_ms` banks time
already served; `last_resumed_at` opens the current segment. A 7-day campaign paused
for a month still has its remaining days.

`syncExpiredAds` (`adDelivery.js:132`) sweeps ads past their duration, with a grace
interval (`getGraceDurationSeconds()`). It is invoked from `recordAdImpression`, so
expiry is evaluated lazily on delivery rather than by a scheduler.

## 4. Impressions and reach

`recordAdImpression(pool, adId, amount)` (`adDelivery.js:531`):

```sql
UPDATE ads
SET impressions = CASE
      WHEN max_reach_cap IS NOT NULL AND max_reach_cap > 0
      THEN LEAST(max_reach_cap, COALESCE(impressions,0) + $1)
      ELSE COALESCE(impressions,0) + $1
    END
WHERE ad_id = $2 AND status = 'Active'
  AND (max_reach_cap IS NULL OR COALESCE(impressions,0) < max_reach_cap)
```

**Rule:** impressions are clamped with `LEAST` — they can never exceed the cap even
if a batch increment would overshoot.

**Rule:** on reaching the cap the ad is immediately flipped to `Completed`, with
`completed_at` set and — **for reach-first types only** — `remaining_budget` zeroed
(`adDelivery.js:550`). Duration-first campaigns keep their leftover budget.

`recordAdClick` mirrors this for clicks. `ad_click_events` and `ad_impressions`
hold the per-event rows; the counters on `ads` are the rollup.

Frontend triggers: `components/ads/AdImpressionTrigger.tsx` (viewport-based),
`app/lib/ads/adClickTracking.ts`, `POST /market/:id/impression`,
`POST /market/:id/click`.

See also `docs/ad-view-impression-counting-contract.md` and
`docs/feed-view-count-rule.md` for the counting rules these implement.

## 5. Ad coins

A viewer can earn coins from ads. Gate — `canShowCollectCoinButton`, mirrored in the
Flutter port and in `ShopProductSecondViewModal.tsx:261`:

```
reward enabled  AND  ad is sponsored  AND  signed in
AND viewer has liked the ad  AND  not already collected  AND  viewer ≠ ad owner
```

**Rule:** liking the ad is a precondition for collecting.

| Concern | Where |
| --- | --- |
| Settings | `ad_coin_reward_settings`, `GET/PUT /market/ad-coin-settings`, `/admin/customization/ad-coin-settings` |
| One-per-user claim | `ad_like_coin_rewards` — `UNIQUE(ad_id, user_id)` |
| Ledger | `ad_coin_collections` |
| Video gate | `ad_video_watch_eligibility`, `POST /market/:id/video-watch-eligible` |
| Collect | `POST /market/:id/collect-coin`, `POST /market/collect-coin` |

**Rule:** the `UNIQUE(ad_id, user_id)` constraint on `ad_like_coin_rewards` is what
makes double-collection impossible — it is enforced in the schema, not just in the
handler. The table is created by the **home feed** (`ensureFeedAdEngagementSchema`).

See `docs/ad-coin-db-flow.md`.

## 6. Ad endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/ads` | create campaign |
| `PUT` | `/ads/:adId` | edit (see budget refund below) |
| `GET` | `/ads/my`, `/ads/all` | owner / admin lists |
| `GET` | `/ads/:adId` | detail |
| `GET` | `/ads/:adId/analytics` | analytics modal |
| `POST` | `/ads/:adId/reach` | reach purchase/extension |
| `POST` | `/ads/:adId/save`, `GET /ads/saves`, `/saves/ids`, `/saves/counts` | saves |
| `GET` | `/ads/saved-public/:userId` | public saved list |
| `POST` | `/ads/:adId/report` | moderation |
| `GET` | `/ads/active-public` | **the feed's real ad source** (see `02-HOME-FEED.md` §3) |
| `GET` | `/ads/public/:adId` | unauthenticated single-ad fetch (share landing pages) |

Budget edits refund through the wallet: `POST /wallet/refund-ad-budget-edit`.
Ad spend is recorded via `POST /wallet/record-promo-ad`, and Profile Promote has its
own payment path `POST /wallet/pay-profile-promote`.

## 7. Client-side ad infrastructure

`app/lib/ads/`:

| Module | Role |
| --- | --- |
| `adIdentity.ts` | `getAdInteractionId()` — the key everything else is keyed on |
| `adStore.ts` | live counter overlay shared across every surface showing an ad |
| `adNormalizer.ts` | server row → uniform client ad shape |
| `adVisibility.ts` | `filterAdsForViewer` — **client-side re-implementation of targeting** |
| `useAdActions.ts` | like/save/report/collect hooks |
| `promoteAgain.ts` | re-run a finished campaign |
| `resolveProductPromoteProduct.ts` | ad → linked `market` row |
| `adClickTracking.ts` | `logSponsoredAdClick` |
| `market/adProductAdapter.ts` | ad → product shape for the shop modal |

**Rule:** `adStore` keyed by `getAdInteractionId()` is why a like in the feed shows
in the second view without a refetch.

**Gap:** targeting exists in two places — `filterDeliverableAds` (server) and
`filterAdsForViewer` (client). They can disagree, and the client one runs on data
the server already filtered.

## 8. Reach settings and tiers (admin-tunable)

| Endpoint | Table |
| --- | --- |
| `GET /admin/customization/reach-settings/public`, `POST .../reach-settings` | `reach_settings` |
| `GET .../reach-tiers/public`, `GET/POST/PUT/DELETE .../reach-tiers[/:id]` | `reach_tiers` |
| `GET/POST/PUT .../ad-allowed-countries` | `admin_customization_settings` |

Client-side reach maths: `utils/reachCalc.ts`. Controllers:
`reachSettingsController.js`, `reachTiersController.js`.

Promo codes apply to campaigns: `POST /promo-codes/validate`, `POST /promo-codes/redeem`,
table `promo_codes`. **A promo code keeps an out-of-budget ad deliverable**
(`adDelivery.js:522`).

## 9. Ad UI components

| Component | Role |
| --- | --- |
| `PromotedAdCard.tsx` | generic in-feed ad card |
| `SharedPhotoVideoAdCard.tsx` | Photo/Video |
| `SharedProductPromoteAdCard.tsx` | Product Promote (thin — delegates to the shop modal) |
| `SharedProfilePromoteAdCard.tsx` | Profile Promote |
| `ProfilePromoteCarousel.tsx` | the carousel row |
| `SharedAdSecondViewModal.tsx` | second view for non-product ads |
| `AdAnalyticsModal.tsx` | owner analytics |
| `AdExpiryWarning.tsx` | expiry banner |
| `AdInteractionButton.tsx`, `AdImpressionTrigger.tsx` | telemetry |

## 10. Reference docs already in the repo

- `docs/AD_ENGINE_RULES.md`
- `docs/current-ad-logic-lock.md`
- `docs/PRODUCT_PROMOTE_RULES.md`
- `docs/ad-view-impression-counting-contract.md`
- `docs/ad-coin-db-flow.md`
- `docs/feed-view-count-rule.md`

These predate this map and describe intended rules; the sections above describe
what the code currently does. Where they conflict, verify against source.
