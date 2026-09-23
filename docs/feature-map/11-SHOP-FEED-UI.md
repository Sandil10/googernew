# 11 — Shop Feed: UI and Ranking (Next.js)

Companion to `03-SHOP-AND-PRODUCT.md`, which covers the **product second view**.
This document covers the **shop feed itself** — the grid, its tabs, the ranking
model and ad placement — at the level of detail needed to reproduce it.

Source: `app/dashboard/shop/page.tsx` (412 KB).

## 1. Tab structure

Three main tabs, persisted to storage and restored on mount (invalid stored values
fall back to defaults):

```
validMainTabs    = { market, my-products, orders }
validListingTabs = { active, all, reviewing, deleted }     // my-products sub-tabs
validOrderTabs   = { all, processing, shipped, delivered, returns }
```

Three independent sub-tab states are kept: `myListingsTab`, `myListingsSubTab`
and `myOrdersTab`. **Rule:** the seller's order view and the buyer's order view
have separate tab state — switching one does not move the other.

**Rule:** `activeTab === "my-products" && myListingsTab === "reviewing"` filters to
`status === "reviewing" || status === "rejected"` — rejected listings live in the
Reviewing tab, not a tab of their own.

## 2. The grid pipeline

`visibleMarketplaceProducts` memo (`page.tsx:2031`). Order is load-bearing:

```
products
  → drop hiddenProductIds                        (per-product "not interested")
  → drop hidden shop ads by ad interaction id
  → drop blocked owners
  → drop sponsored rows  (they re-enter later as ads)
  → [market only] country filter
  → [market only] attach _local_time_spent        (personalisation signal)
  → [market only] rankMarketProducts(algorithm, query)
  → [optional]    explicit sort override
  → interleave ads every 6th product
  → insert Profile Promote carousel rows
```

**Rule:** on `my-products` and `orders` the pipeline short-circuits at
`return filteredProducts` (`:2083`) — no ranking, no country filter, no ads.

### Country filter

```js
const countries = getProductCountryValues(product);
return countries.has(selected) || countries.has("worldwide");
```

**Rule:** a product shipping "worldwide" always passes any country filter.

### Personalisation signal

`_local_time_spent` is read from `productTimeSpentMap[getProductRankingKey(product)]`
— dwell time measured **client-side** and never sent to the server. The ranking key
is `product_id || linked_product_id || id || product_code`, so a promoted product
and its underlying listing share one dwell record.

## 3. The ranking model

Six algorithms (`MARKET_ALGORITHM_OPTIONS`), default `recommended`:

| id | Label | Score |
| --- | --- | --- |
| `trending` | Trending Now | `getProductTrendingScore` |
| `recommended` | Recommended For You | `getProductLTRScore(q) + trending × 0.18` |
| `best-sellers` | Best Sellers | `getProductSalesScore` |
| `new-arrivals` | New Arrivals | `freshness × 100 − ageHours` |
| `most-viewed` | Most Viewed | `views_count` |
| `popular-week` | Popular This Week | `getProductPopularWeekScore` |

**Rule:** ties break on `created_at` descending (`:2060`).

### Base signals

```js
ageHours   = (now − created_at) / 3.6e6,  or 9999 when unparseable

freshness  = ≤24h → 100 | ≤72h → 70 | ≤168h → 45 | ≤720h → 20 | else 5

engagement = views
           + likes    × 3
           + comments × 4
           + shares   × 5
           + addToCart× 8
           + purchases× 15
           + min(180, timeSpent) × 0.2

sales      = purchases × 1000 + addToCart × 50 + likes × 5 + views
```

### Composite scores

```js
trending     = engagement / sqrt(max(ageHours, 6))      // velocity, not volume
             + freshness × 0.35
             + search_count × 6

popularWeek  = engagement × (ageHours ≤ 168 ? 1.4 : 0.65)
             + sales × 0.12
```

**Rule:** `trending` divides by `sqrt(age)` with a **6-hour floor**, so a brand-new
product cannot divide by ~0 and dominate the board.

### The `recommended` learning-to-rank score

`getProductLTRScore` — a weighted blend summing to 1.00:

| Weight | Component | Definition |
| --- | --- | --- |
| 0.22 | text match | `min(100, matchedKeywords × 35)` over title, description, category, sub_category, manual_category, username, owner_username; keywords are ≥2 chars |
| 0.15 | CTR | `views>0 ? min(100, clicks/views × 300) : (clicks>0 ? 40 : 0)`; clicks falls back to `likes_count` |
| 0.18 | conversion | `views>0 ? min(100, (purchases×4 + carts)/views × 100) : min(100, purchases×25 + carts×8)` |
| 0.14 | sales | `min(100, sales / 10)` |
| 0.10 | price competitiveness | promo below original → `min(100, 55 + discount% × 150)`; else 45; no price → 0 |
| 0.10 | stock | `0` if none, `100` if ≥20, else `45 + stock × 2.75` |
| 0.08 | seller performance | base 50, +20 verified, +`min(20, rating×4)`, +10 fast response, −`min(35, cancelRate)`, −45 if reported, clamped 0–100 |
| 0.03 | dwell | `min(100, _local_time_spent)` |

**Rule:** out-of-stock products score **0** on the stock component but are not
removed — they rank lower, they do not disappear.

**Rule:** the text-match component means the `recommended` algorithm doubles as
search relevance; there is no separate search ranking path.

### Explicit sort override

`SHOP_SORT_OPTIONS` = `top-sales` | `price-low-high` | `price-high-low`. When set,
it re-sorts **after** the algorithm, overriding it. Price sorts use
`getProductPromoPrice` (the effective price), not the list price.

## 4. Ad placement in the grid

`interleaveShopProductsWithAds(products, ads, storageKey, seed, ratio = 6, rotation)`
(`page.tsx:1542`):

1. Keep only `ad.is_sponsored`, deduped by `getShopAdRotationKey` — with
   `shouldPreferShopAdCandidate` picking the better duplicate: a Profile Promote
   with more featured items wins, then one carrying an edit draft.
2. Shuffle by seed, then rotate by `abs(displayRotation) % length`.
3. **No products** → return `[firstAd]`.
4. **Fewer products than the ratio** → append one ad at the end.
5. Otherwise → insert an ad after every 6th product.

**Rule:** the grid ad ratio is **6**, not the home feed's 4.

**Rule:** each algorithm section gets `shopAdRotation + index` as its rotation, so
adjacent sections do not open with the same ad.

### Profile Promote carousel rows

`insertProfilePromoteCarouselRows(items, ads)` (`page.tsx`, documented inline):

```js
const intervals = [4, 24];
```

**Rule:** the first carousel appears after **4** grid slots, every later one after
**24**. The comment explains the intent on a 4-column desktop grid: row 1 topic,
row 2 four cards, row 3 profile promotes — then another after six more rows.
Carousel rows do not count toward their own interval.

**Rule:** with no items at all, the carousel is returned as the only row, so
Profile Promote inventory still shows on an empty shop.

## 5. Algorithm sections

`marketAlgorithmSections` (`page.tsx:4689`) renders **all six** algorithms as
horizontal rows on the market tab:

- Each takes the top **10** by that algorithm, then seed-shuffles them
  (`{productShuffleSeed}:{section.id}`).
- **Padding rule:** a section with 1–3 products is padded by repeating items
  (`ranked[i % ranked.length]`) up to 4 — so a thin section still fills a row,
  with visible duplicates.
- Ads interleaved at ratio 6 with per-section rotation.
- Empty sections are dropped.
- `recommended` is forced first (`orderedMarketAlgorithmSections`), the rest keep
  declaration order.

Below the sections, `remainingMarketplaceProducts` renders the full grid.

## 6. Search and filters

| Control | State | Behaviour |
| --- | --- | --- |
| Search | `searchDraft` → `marketSearchQuery` | draft updates live; committed on submit. Ranking uses `marketSearchQuery \|\| searchDraft`, so results re-rank **while typing** |
| Category | `selectedCategory`, `selectedSubCategory`, `selectedLevel3` | **three-level** tree from `GET /categories/admin/tree` |
| Country | `selectedFilterCountry` | searchable list, worldwide always passes |
| Sort | `marketSortOption` | overrides the algorithm |
| Algorithm | `activeMarketAlgorithm` | default `recommended` |

**Rule:** search is only wired on the market tab — the input is cleared and ignored
elsewhere (`page.tsx:4769`).

## 7. Orders

`orderBadgeCounts` holds `{ buyer: {all, processing, shipped, total}, seller: {...} }`
from `GET /orders/badge-counts`, which counts **distinct order numbers**, not lines.

Order-tab surfaces: report modal (buyer/seller side, reason + free text), receive
confirmation modal, report viewer, and `OrderChatPopup` for order-scoped chat.

## 8. Flutter parity checklist

What the mobile shop feed needs to match this document:

- [ ] Six ranking algorithms with the exact formulas in §3
- [ ] `recommended` LTR blend as the default
- [ ] Explicit sort override (3 options) applied after ranking
- [ ] Ad interleave at ratio **6** (mobile currently has no grid ad injection)
- [ ] Profile Promote carousel at intervals `[4, 24]`
- [ ] Six algorithm sections, top-10, seed-shuffled, padded to 4
- [ ] Country filter with worldwide pass-through
- [ ] Three-level category tree
- [ ] Client-side dwell tracking feeding `_local_time_spent`
- [ ] Hidden products / hidden shop ads
- [ ] Blocked-owner filtering
- [ ] `reviewing` tab includes `rejected`
- [ ] Live re-rank while typing
