# 02 — Home Feed

The home feed is `app/dashboard/page.tsx` (230 KB). Its backend is
`GET /feed/home` → `backend/src/controllers/feedController.js`, plus a second,
independent ad fetch from `GET /ads/active-public`.

## 1. The most important thing to know

**The backend composes a feed. The dashboard page throws that composition away and
composes its own.**

`GET /feed/home` returns four things:

```json
{ "success": true, "items": [...], "posts": [...], "ads": [...], "pagination": {...} }
```

`items` is a fully interleaved feed built by `interleaveHomeFeed()`
(`feedController.js:374`) — posts with ads injected every 4th slot and a profile
promote carousel spliced in. The dashboard page **does not render `items`**. It reads
`posts` and `ads` as raw arrays and rebuilds the feed client-side in the
`homeFeedItems` memo (`app/dashboard/page.tsx:1416`).

Consequences, all of which matter when porting:

- The server's ad placement is dead code *for the dashboard*. Any other client
  (a mobile app, a share page) that renders `items` gets **different placement**
  than the web dashboard shows.
- Upload content never appears in `items` at all. The backend feed has no concept
  of it. The dashboard merges `uploadContents` in client-side (§4).
- The ad ratio of 4 is implemented **twice** — `HOME_AD_RATIO = 4`
  (`feedController.js:8`) and the literal `4` passed to
  `interleaveHomeOrganicItemsWithAds` (`page.tsx:1476`). Changing one does not
  change the other.

Treat `items` as a legacy/simple-client path and the client memo as the real feed.

## 2. Backend: `GET /feed/home`

`routes/feed.js` wraps the handler in `createPublicResponseCache({ ttlMs: 5000,
anonymousOnly: true })`, and the controller has a *second* in-process cache on top.

### Parameters

| Param | Rule |
| --- | --- |
| `limit` | default 20, hard ceiling **50** |
| `offset` | default 0, negatives coerced to 0 |

Auth is optional (`getOptionalUserId`). Anonymous and signed-in take different
code paths throughout.

### Anonymous caching (three states)

`feedController.js:641`. Signed-in requests are never cached.

| Header `X-Home-Feed-Cache` | Meaning |
| --- | --- |
| `HIT` | within `ANONYMOUS_HOME_FEED_CACHE_TTL_MS` (default **5000 ms**) — served from memory |
| `STALE` | past TTL but within `ANONYMOUS_HOME_FEED_STALE_TTL_MS` (default **15000 ms**) — stale payload returned immediately, refresh kicked off in background |
| `WAIT` | a refresh for this key is already in flight — the request awaits it instead of starting a second one |

**Rule:** this is stale-while-revalidate with request coalescing. The cache Map is
capped at 100 keys; on exceeding it, entries past `staleAt` are swept.

**Gap:** it is an in-process `Map`. Under the clustered server
(`backend/clusterServer.js`) each worker has its own cache, so anonymous users can
see up to *N workers* different feeds within the same 5-second window.

### Post selection

Identical for both paths apart from the `user_liked` subquery:

```sql
FROM goog_posts gp JOIN users u ON u.id = gp.user_id
WHERE COALESCE(gp.is_active, true) = true
  AND COALESCE(u.is_deactivated, false) = false
  AND COALESCE(u.status, 'Active') <> 'Deactivated'
ORDER BY gp.created_at DESC
LIMIT $n OFFSET $n
```

**Rule:** the feed is strictly reverse-chronological. There is no ranking,
scoring, or personalisation on the post side.

**Rule:** it selects `limit + 1` rows. The extra row is not returned — it only sets
`pagination.hasMore`.

**Rule:** deactivated owners' posts vanish from the feed, but the post rows
themselves are untouched. Reactivating a user restores their feed presence.

### Ad selection and targeting

Ads are fetched with a deliberately oversized limit so post-filtering still leaves
enough to place:

| Path | Ad fetch limit |
| --- | --- |
| Anonymous | `clamp(ceil(limit/4 + 1) * 4, 24, 48)` |
| Signed-in | `clamp(limit * 3, 40, 120)` |

SQL-level filter (both paths):

```sql
WHERE a.status = 'Active'
  AND owner not deactivated
  AND (a.max_reach_cap IS NULL OR COALESCE(a.impressions,0) < a.max_reach_cap)
ORDER BY COALESCE(a.active_start_time, a.created_at) DESC
```

Then, **for signed-in viewers only**, `filterDeliverableAds()`
(`utils/adDelivery.js:527`) applies two more gates in JS:

**`adIsWithinDeliveryRules`** (`adDelivery.js:506`) — the ad itself:
- status must be `active`
- impressions must be below `max_reach_cap`
- duration expiry is checked **only for non-reach-first campaigns**. Product Promote
  and Photo/Video are *reach-first*: they end when target reach is met, and elapsed
  days do not stop delivery.
- budget: if `budget > 0` and `remaining_budget <= 0` the ad stops — **unless** it
  is a Profile Promote campaign, or it carries a promo code.

**`adMatchesViewer`** (`adDelivery.js:496`) — the viewer:
- **anonymous viewers bypass targeting entirely** (`if (viewerProfile?.isAnonymous) return true`)
- gender: empty / `all` / `any` targets match everyone; an empty viewer gender also
  matches everything; otherwise prefix matching either direction
- country: matched through `expandCountryValues`, which builds an ISO-code ↔
  English-name alias map from `Intl.DisplayNames` so `LK` and `Sri Lanka` match
- interests: substring match either direction against the viewer's interest set

The viewer profile (`loadViewerAdProfile`, `adDelivery.js:377`) is assembled from
`users.gender`, `users.country`, `shipping_address->>'country'`, `users.interests`,
`users.bio`, plus recent `market_views` activity and any `?search`/`?keyword`/`?q`
on the request. Every column is probed with `getCachedColumnCheck` first and
substituted with `NULL::type` if absent — the feature degrades instead of erroring
on a database missing those columns.

**Rule (worth flagging):** because anonymous viewers skip targeting *and* anonymous
responses are cached, an ad targeted at one country is still served to every logged-out
visitor worldwide.

### Product Promote hydration

`hydrateProductPromoteAds` (`feedController.js:427`) re-reads the linked `market`
row for ads whose `campaign_type = 'Product Promote'` and that carry
`linked_product_id` or `linked_product_share_code`, then `normalizeProductPromotePriceFields`
resolves price with this precedence:

```
linkedProduct.price → .main_price → .product_price → ad.price → ad.main_price → ad.product_price → 0
promo_price: linkedProduct.promo_price → ad.promo_price → null  (empty string counts as null)
```

**Rule:** the product record wins over the ad's own copy. An ad created before a
price change shows the *current* price.

### Server-side interleave (the path the dashboard ignores)

`interleaveHomeFeed(posts, ads, offset)` — `feedController.js:374`:

1. Ads split into Profile Promote vs everything else, each `sort(() => Math.random() - 0.5)`.
2. Walk posts, emitting `{type:'write'}`. After each post where
   `(index + 1 + offset) % 4 === 0`, emit `{type:'ad'}`, cycling `standardAds`
   from a start index of `offset % standardAds.length`.
3. If there are no posts at all but at least one ad, emit that one ad — so the
   feed is never completely empty while ads exist.
4. If any Profile Promote ads exist, splice one `{type:'profilePromoteCarousel'}`
   at a random index between 2 and 4.

**Note:** `sort(() => Math.random() - 0.5)` is a biased shuffle, not a uniform one.
Fine for ad rotation; do not copy it anywhere correctness matters.

### Schema side effect

The first call to `getHomeFeed` runs `ensureFeedAdEngagementSchema()`
(`feedController.js:22`), which creates `ad_likes`, `ad_like_coin_rewards`,
`ad_views` and adds columns to `ads` (`linked_product_id`,
`linked_product_share_code`, `current_reach`, `max_reach_cap`, …). It is guarded by
a module-level promise so it runs once per process. **The home feed bootstraps part
of the ad schema.**

## 3. Frontend: the second ad pipeline

Alongside `/feed/home`, the dashboard runs `getPublicActiveAds()`
(`page.tsx:1563`) which **pages through `/api/ads/active-public` until exhausted**
(`limit=50`, following `pagination.nextOffset` while `hasMore`), accumulating every
active ad into `staticHomeAds`.

- Fetched with `cache: "no-store"` and a `shuffle` seed parameter.
- Each page is passed through `filterAdsForViewer(rawPageAds, currentUser)` —
  a *client-side* re-implementation of viewer targeting.
- Result mapped by `mapPublicActiveAdToHomeAd` and filtered by `isHomeSponsoredAd`.
- Non-JSON responses throw with a logged 200-char preview — a guard against the
  tunnel returning an HTML error page.

**Rule:** when `staticHomeAds` is non-empty it **replaces** the ads from
`/feed/home` entirely (`page.tsx:1417`). The feed endpoint's ads are only a
fallback.

**Gap:** this loop has no page ceiling. Ad inventory growth turns first paint into
an unbounded number of sequential round-trips.

## 4. Frontend feed composition

`homeFeedItems` memo, `page.tsx:1416`. Order of operations:

1. **Choose ad source** — `staticHomeAds` if present, else `dedupeAdsByIdentity(ads)`.
2. **Split Profile Promote out** of the ad pool (unless searching — while searching,
   profile promotes stay in the main pool).
3. **Rotate** the non-profile ads by `homeAdRotation % length`, persisted so the
   rotation advances between visits rather than resetting.
4. **Filter posts** by, in order: hidden ids → blocked owners → Subscriptions
   filter (followed owners only) → search text → category.
5. **Filter upload content** — must be `status === "Approved"`, not hidden, owner
   not blocked; under the Subscriptions filter also must be a followed owner and
   not `visibility === "private"`.
6. **Seeded shuffle** posts via `shuffleItemsWithSeed(..., homeGoogShuffleSeed)`.
7. **Mix** posts and upload content into one organic stream (`mixHomeOrganicItems`,
   `page.tsx:725`) — also seeded, so the order is stable across re-renders but
   varies per session.
8. **Insert Profile Promote rows** (`insertHomeProfilePromoteRows`) — cadence is
   documented inline at `page.tsx:1468`: **first after 3 organic cards, then after
   every 8**. Counts only Googs, vault uploads and flash uploads.
9. **Interleave ads** every **4** organic items.

Rendering is windowed: `visibleHomeFeedItems = homeFeedItems.slice(0, visibleHomeFeedCount)`
(`page.tsx:1480`), and is forced empty while `isLoadingFeed` — so the feed does not
flash a partial list during refresh.

### Category filter matching

Category matching is text-based, not a column. The post text is normalised
(`&`→`and`, non-alphanumerics→spaces) and matched against either the normalised
category name or `#categorynamewithoutspaces`. A "category" is therefore whatever
the poster happened to type or hashtag.

## 5. Card types

| `item.type` | Rendered by | Source |
| --- | --- | --- |
| `write` | goog card (`page.tsx:3435`) | `goog_posts` |
| `uploadContent` | `UploadContentFeedCard.tsx` (72 KB) | `upload_contents` |
| `ad` | `PromotedAdCard.tsx` / shared ad cards | `ads` |
| `profilePromoteCarousel` | `ProfilePromoteCarousel.tsx` | `ads` where `campaign_type = 'Profile Promote'` |

Ad cards vary by `campaign_type` — see `05-ADS-AND-CAMPAIGNS.md`. Product Promote
cards open the **shop second view modal**, the same component the shop grid uses
(`openProductAdInShopSecondView`, `page.tsx:3427`) — see `03-SHOP-AND-PRODUCT.md`.

## 6. Interactions

All feed interactions go through the shared bottom sheet
(`components/InteractionBottomSheet.tsx`, 42 KB) with four tabs: **likes,
comments, views, shares**.

| Action | Endpoint |
| --- | --- |
| Like goog | `POST /googs/:id/like` |
| Comment | `POST /googs/:id/comments`, `GET /googs/:id/comments` |
| Comment like/dislike/report | `POST /googs/comments/:commentId/{like,dislike,report}` |
| Delete comment | `DELETE /googs/comments/:commentId` |
| Share | `POST /googs/:id/share` |
| View | `POST /googs/:id/view` |
| Save | `POST /googs/:id/save` |
| Report | `POST /googs/:id/report` |
| Subscribe to poster | `POST /googs/:id/subscribe` |
| Lists | `GET /googs/:id/{likes,shares,views}` |

Ad-side equivalents live under `/market/:id/*` and `/ads/:adId/*`; upload content
under `/upload-content/:contentId/*`.

**Live counter consistency:** ad interactions write into `adStore`
(`app/lib/ads/adStore.ts`) keyed by `getAdInteractionId()`. Any surface showing the
same ad reads that overlay, so a like in the feed is reflected in the second view
modal without a refetch.

**"Not interested":** hides client-side via `hiddenHomeGoogIds` /
`hiddenHomeUploadIds`, persisted through `app/lib/feedHidePreferences.ts`. It is a
local preference — nothing is sent to the server, and it does not affect what the
feed query returns.

## 7. Known gaps

- **No ranking.** Purely reverse-chronological, then client-shuffled by seed.
- **Feed pagination and the ad loop are unrelated.** Posts page 20 at a time;
  ads are fully drained up front.
- **Targeting is implemented twice** — `filterDeliverableAds` on the server and
  `filterAdsForViewer` on the client. They can disagree.
- **Anonymous viewers receive untargeted ads**, and those responses are cached.
- **Category filtering is substring matching on post text**, with no backing column.
