# 03 — Shop and Product

Primary files:

| File | Size | Role |
| --- | --- | --- |
| `app/dashboard/shop/page.tsx` | 412 KB | shop grid, tabs, own listings, orders, add-to-bag orchestration |
| `app/components/market/ShopProductSecondViewModal.tsx` | 53 KB | **the product second view** |
| `app/components/AddProductModal.tsx` | 201 KB | seller product creation/edit form |
| `app/components/market/ProductSecondViewModal.tsx` | 17 KB | lighter variant used on share pages |
| `backend/src/controllers/marketController.js` | 216 KB | all product endpoints |

`shop/page.tsx` is too large to have been read exhaustively; this covers its
feature surface and the flows that leave it.

## 1. Shop tabs

`activeTab` ∈ `market` | `my-products` | `orders` (`page.tsx:1833`).
Under `my-products`, `myListingsTab` ∈ `all` | `active` | `reviewing` | `deleted`.

**Rule:** `activeTab === "my-products" && myListingsTab === "reviewing"` sets
`isReviewMode` in the product modal — which hides every buying control and swaps
the footer for Edit/Delete. This exact pair is the only thing that produces review
mode; it is not a product status check.

**Rule:** `activeTab === "my-products" && myListingsTab === "all" && product.status`
turns the modal footer into **order status controls** instead of price. See §7.

## 2. Market ranking

`rankMarketProducts(products, algorithm, searchQuery)` — `page.tsx:386`.

| Algorithm | Score |
| --- | --- |
| `trending` | `getProductTrendingScore` |
| `best-sellers` | `getProductSalesScore` |
| `new-arrivals` | `getProductFreshnessScore * 100 − getProductAgeHours` |
| `most-viewed` | `views_count` |
| `popular-week` | `getProductPopularWeekScore` |

The market tab pipeline is: country filter → personalisation → algorithm ranking →
optional explicit sort → ad injection. Ranking applies **only** on the `market`
tab; own listings and orders are unranked.

Unlike the home feed, this ranking is entirely client-side over an already-fetched
product array.

## 3. The product second view modal — anatomy

`ShopProductSecondViewModal.tsx`. This is the component the user sees when tapping
any product **and** any Product Promote ad. One component, several modes.

Layout: image panel (45% on desktop, 42% height on mobile) | detail column, with
a bottom footer bar carrying the running total.

### State

```
activePreviewIndex        selectedVariantIndex   selectedSize
selectedShippingCountry   quantity               sizeError
isSizeDropdownOpen        isColorDropdownOpen    isFullscreenPreviewOpen
```

`activeVariant = selectedVariantIndex !== null ? productVariants[selectedVariantIndex]
: productVariants[0] || product` (`:256`). **There is always an active variant** —
it falls back to the product itself, which is why stock lookups work on products
with no variants at all.

## 4. Sizes — the details that get lost

### Where the size list comes from

`sizeList` (`:268`) has a two-step fallback:

1. `activeVariant.selections[].value` — if any are non-empty, use these.
2. otherwise `safeParse(product.sizes)`, mapping strings directly or `.value` off objects.

**Rule:** sizes are **per-variant**. Switching colour can change the whole size list.

### Stock per size — `getAvailableCountForSize(size)` (`:273`)

Resolution order, first hit wins:

1. **`activeVariant.selections`** — entry whose `.value` trims-equal to the size →
   `parseInt(selection.stock || selection.quantity || 0)`
2. **`productVariants`** — a variant whose `.size` trims-equal to the size **and**
   whose colour matches the active colour (or where either colour is empty) →
   `parseInt(variant.stock || variant.quantity || 0)`
3. **fallback** — `activeVariant.stock || activeVariant.quantity || product.stock || 0`

Everything is `|| 0`, so a missing figure and a genuine zero are indistinguishable.

### The dropdown itself (`:687`)

Each row renders:

```
{trimmedSize} ({availableCount})        e.g.  "MEDIUM (3)"
```

**Rule:** the remaining stock is printed in parentheses next to every size.

**Rule:** `disabled={isOutOfStock}` where `isOutOfStock = availableCount <= 0`.
Sold-out sizes are styled `opacity-30 cursor-not-allowed text-white/50` and cannot
be selected.

**Rule:** selecting a size runs `if (quantity > availableCount) setQuantity(Math.max(1, availableCount))`
— the quantity is pulled down to fit the newly selected size immediately.

**Rule:** selecting a size clears `sizeError`.

The closed button shows `selectedSize` — or, when the selection carries a `detail`
field, `"{size} ({detail})"` (`:678`). It shows the literal string `Sizes` when
nothing is picked.

### "Select Size" — the hard gate

`handleAddToBag` (`:288`) begins:

```js
if (sizeList.length > 0 && (!selectedSize || selectedSize === "Select Size" || selectedSize === "None")) {
  setSizeError(true);
  onSizeRequired?.();
  return;                      // ← nothing reaches the bag
}
```

**Rule:** on a product that has sizes, a size is mandatory. The three sentinel
values `null`, `"Select Size"` and `"None"` all count as unselected.

**Rule:** the error state is visible in two places at once — the dropdown button
gets `border-red-500 ring-2 ring-red-500/40`, and the text **`Select Size`** appears
below it in red (`:701`).

**Rule:** the same validation is repeated independently in the shop page's
`handleBuyItem` (`page.tsx:4133`), which rebuilds the size list from *all* sources
(`sizeOptions` + variant `.size` + variant `.selections[].value`, excluding `None`
and `Default`) and raises a `Size is required` notification. The modal and the page
each enforce it.

## 5. Quantity stepper

Footer row `:606-608`.

| Control | Behaviour |
| --- | --- |
| `−` | `setQuantity(Math.max(1, quantity - 1))` — floor of 1, never removes |
| value | plain span, not editable |
| `+` | `setQuantity(Math.min(currentVariantStock, quantity + 1))` |

**Rule:** `+` is `disabled` when `currentVariantStock <= 0 || quantity >= currentVariantStock`,
and styled `opacity-20 cursor-not-allowed` in that state. The ceiling is the
selected size's stock once a size is chosen, otherwise the active variant's.

`currentVariantStock` (`:286`):

```js
selectedSize ? getAvailableCountForSize(selectedSize)
             : parseInt(activeVariant?.stock || activeVariant?.quantity || product.stock || 0) || 0
```

Displayed beside the stepper as `{n} IN STOCK` or `OUT OF STOCK` (`:603`).

**Rule:** changing colour resets quantity to 1 (`:664`), as does the variant
dropdown row (`:630`).

**Gap — the bag can still exceed stock.** The stepper caps a *single* add. Nothing
checks the merged total: `CartContext.addToCart` accumulates quantity onto a
matching line, and neither it nor `POST /cart/items` re-checks stock. Adding 3 of a
3-stock item twice leaves 6 in the bag. The **order** endpoint is the first place
this is caught — `adjustOrderItemStock` throws and `POST /orders/create` returns
400 `Insufficient stock` (`orderController.js:595`). So the failure surfaces at
checkout, not at add-to-bag.

**Gap:** ADD TO BAG is never disabled on stock grounds. It is a plain button
(`:744`) with no `disabled` attribute.

## 6. Pricing display — two different numbers

This trips people up: the modal shows the price **twice**, and they mean different
things.

| Position | Value | Line |
| --- | --- | --- |
| Detail body | **unit** price, plus struck-through original when a promo exists | `:591-592` |
| Footer bar | **`unit price × quantity`** — the running total | `:775` |

Body (`:586`):
```js
price     = activeVariant.promo_price || activeVariant.price || product.promo_price || product.price || 0
mainPrice = activeVariant.price || product.price || 0
hasPromo  = price < mainPrice        // strike-through only when strictly lower
```

Footer: the same `price` expression `* quantity`, `.toFixed(2)`, labelled `Rupieer`.

**Rule:** the struck-through original appears only when the effective price is
*strictly* less than the main price. Equal prices show no strike.

## 7. Footer modes

The footer bar (`:752`) is a four-way branch:

1. **`my-products` + `all` + `product.status`** → order status controls:
   - `pending` → **Approve Order** (`processing`) and **Cancel Order** (`cancelled`)
   - `processing` → **Mark as Shipped**
   - `shipped` → **Mark as Delivered**
   - `cancelled` → static "Order Cancelled & Refunded"
   - `received` → static "Order Completed"
2. **`my-products` + `reviewing`** → **Edit Product** / **Delete**
3. **otherwise** → `Rupieer` + running total

ADD TO BAG is separate from the footer — a centred text button above it (`:743`),
hidden entirely in review mode.

## 8. Shipping — SHIPS TO

`parseShippingData(product)` (`:55`) normalises `shipping_info || shipping_data ||
shipping_rates` into `{ country, price, days }[]`, handling three encodings:

| Shape | Handling |
| --- | --- |
| `{ unified: true, charge, days, rates? }` | one charge applied to every listed country; `[{country:"Worldwide"}]` when no list |
| `{ rates: [...] }` or a bare array | per-country `charge \|\| price`, `days \|\| date`, falling back to the parent's `days` |
| `{ available_countries \| countries \| region }` | comma-split string, or array of strings/objects, all sharing `shipping_cost \| price \| charge` |

**Rule:** never returns empty — falls back to `[{ country: "Worldwide", price: 0, days: "3-5 Business Days" }]`.

`ShippingSection` (`:144`) renders it as a dropdown:

- Current country = `selectedCountry || savedAddress?.country || standardized[0].country`
  — **the buyer's saved address country is the default**, not the seller's first row.
- Rate lookup is case-insensitive; if the country is not listed it falls back to
  any row whose name contains `"world"`.
- Price text: `"N/A"` when no rate matched, **`"FREE"`** when the charge is 0,
  otherwise `R {n.toFixed(2)}`.
- The dropdown lists every destination with its price, same FREE/amount rule.

The chosen country flows into `addToCart(..., selectedShippingCountry)` and is
stored per cart line as `selected_shipping_country`.

### Delivery time

`getDeliveryDateText(days)` (`:90`) takes the **last** number in a `"3-5"` style
range, adds that many days to today, and renders
`"{today} - {end} Delivery"` with `en-US` short month + numeric day —
e.g. `Jul 30 - Aug 13 Delivery`. Non-numeric input is passed through unchanged;
empty input yields `"3-5 Business Days"`.

**Rule:** the days value comes from the **currently selected shipping country's**
row, so changing country can change the quoted delivery window.

## 9. Returns and warranty

Two stacked values in one tile (`:721-728`):

- Returns: `safeParse(product.return_policy)?.text || safeParse(product.return_data)?.return_days || "14 Days Return"`, uppercased.
- Warranty: `safeParse(product.warranty_info)?.warranty || "No Warranty"`, in a pill.

Both are free-form JSON columns with string fallbacks — there is no enum.

## 10. Media

- `getProductImages` (`:114`) = `Set([image_url, media_preview, ...variants.map(v => v.url || v.image_url || v.image)])`, falsy removed. Deduped, order preserved.
- `normalizeImageSrc` (`:101`) passes through `/uploads/`, `http(s)://` and `data:`
  URIs untouched; anything else containing `uploads` or a backslash is rewritten to
  `/uploads/{basename}`. Fallback is `https://picsum.photos/400/400`.
- Fullscreen preview via `isFullscreenPreviewOpen`, object-contain with a close button.

## 11. Product Promote mode

When the modal is opened from a Product Promote ad:

- `isProductPromoteSecondView` is true when the product carries `isProductPromoteSecondView`,
  or `campaign_type`/`campaignType` equals `"product promote"` — **and** an
  `adId`/`ad_id` is present (`:258`).
- `showAdCoinButton = isProductPromoteSecondView && canShowCollectCoin?.(displayProduct)` (`:261`)
- `trackProductPromoteClick()` fires `logSponsoredAdClick(displayProduct, "visit")`
  on add-to-bag (`:262`), so a bag action counts as an ad click.
- `displayProduct` overlays live counters from `adStore` on top of the server row
  (`:227`) — likes, coin-collected, views, comments, shares.

## 12. Backend endpoints

`routes/market.js` → `marketController.js`:

| Endpoint | Purpose |
| --- | --- |
| `GET /market` | product list |
| `POST /market/create` | create |
| `PUT /market/:id`, `DELETE /market/:id`, `PUT /market/:id/status` | manage |
| `GET /market/:id`, `GET /market/public/:id`, `GET /market/code/:code` | fetch |
| `GET /market/product/:shareCode`, `/product/public/:shareCode`, `/share-unified/:shareCode` | share-link resolution |
| `POST /market/:id/like`, `GET /market/:id/likes` | likes |
| `POST /market/:id/comments`, `GET /market/:id/comments` | comments |
| `DELETE /market/comments/:commentId`, `POST /market/comments/:commentId/{like,dislike,report}` | comment actions |
| `POST /market/:id/share`, `GET /market/:id/shares` | shares |
| `POST /market/:id/view`, `GET /market/:id/views` | views |
| `POST /market/:id/click`, `POST /market/:id/impression` | ad telemetry |
| `POST /market/:id/collect-coin`, `POST /market/collect-coin`, `POST /market/:id/video-watch-eligible` | ad coins |
| `GET/PUT /market/ad-coin-settings` | admin |
| `POST /market/:id/report` | moderation |

Tables: `market`, `market_likes`, `market_comments`, `market_comment_reports`,
`market_shares`, `market_views`, `market_reports`, `product_share_aliases`.

## 13. Summary of behaviours easy to lose in a port

1. Stock printed next to every size in the dropdown: `MEDIUM (3)`.
2. Sold-out sizes disabled and dimmed to 30%.
3. Picking a size clamps an already-too-high quantity down to it.
4. `+` disabled and dimmed to 20% at the stock ceiling.
5. `−` floors at 1 — it never removes the item.
6. Size mandatory when sizes exist; red ring **and** red `Select Size` text.
7. `None` and `Select Size` count as "no size chosen".
8. Colour change resets quantity to 1 and clears the size.
9. Body price is per-unit; footer price is × quantity.
10. Strike-through only when promo is *strictly* below main price.
11. `FREE` rather than `R 0`; `N/A` when the country is unlisted.
12. Ships-to defaults to the buyer's **saved address country**.
13. Delivery window is computed from the **selected country's** day range.
14. Review mode is a tab-pair check, not a status check.
15. Add-to-bag on a promoted product also logs an ad click.
