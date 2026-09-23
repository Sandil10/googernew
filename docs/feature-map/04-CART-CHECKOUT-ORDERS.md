# 04 — Cart, Checkout and Orders

| Layer | File |
| --- | --- |
| State | `app/context/CartContext.tsx` (23 KB) |
| UI | `app/components/CartSidebar.tsx` (140 KB) |
| Service | `services/cartService.ts`, `services/orderService.ts` |
| Backend | `controllers/cartController.js` (9 KB), `controllers/orderController.js` (64 KB) |
| Tables | `cart_items`, `orders` |

## 1. The cart line and its identity

```ts
interface CartItem {
  id, productId, title, price, promo_price, image_url, quantity,
  size, color, variantIndex, selected, seller_id, shipping_info,
  product_discount, selected_shipping_country,
  payment_methods, reseller_ref, resell_commission_percentage
}
```

**Merge key** — `addToCart` (`CartContext.tsx:362`) merges into an existing line
only when **all six** match:

```
productId · size · color · variantIndex · selected_shipping_country · reseller_ref
```

**Rule:** the same product in two sizes, two colours, or shipped to two countries
is two separate lines with independent quantities. A reseller-attributed add is
also a separate line from a direct one.

The backend uses the same key — `cartController.js:31` matches on six columns with
`IS NOT DISTINCT FROM` so `NULL` compares equal (a plain `=` would never match a
sizeless product).

**Rule:** merging **adds** quantities. There is no stock ceiling here — see
`03-SHOP-AND-PRODUCT.md` §5.

### Normalisation

`normalizeCartItems` (`:65`) accepts both camelCase and snake_case from either
source, and applies:

- `quantity: Math.max(1, Number(item.quantity || 1))` — never below 1
- `selected: item.selected !== false` — **defaults to selected**
- `promo_price` stays `null` when absent (not coerced to 0)
- `reseller_ref` accepts `reseller_ref | resell_ref | resellerRef`

## 2. Persistence and sync

Three storage layers:

| Key | Holds |
| --- | --- |
| `googer_cart` | cart mirror, so the badge survives reload while signed out |
| `googer-cart-address-1` | delivery address |
| `googer:resell-attribution` | reseller referral attribution |
| `googer-manual-payment-lock`, `googer-payment-lock` | in-flight payment guards |

**Rule:** every mutation is **optimistic** — local state updates first, then the
server call. On failure the previous array is restored and `syncCartFromServer()`
runs (`:412`, `:428`).

**Rule:** when not authenticated (`hasAuthenticatedSession()` false) mutations stop
at localStorage. The cart works signed-out and is pushed on sign-in.

**Rule:** the cart polls the server every **15 s** (`CART_POLL_INTERVAL_MS`).

## 3. Money

All computed in `CartContext`, all over **selected** items only (except `cartCount`/`cartTotal`):

| Value | Formula |
| --- | --- |
| `cartCount` | Σ quantity over **all** items |
| `cartTotal` | Σ `(promo_price \|\| price) × qty` over **all** items |
| `selectedCount` | Σ quantity over selected |
| `selectedTotal` | Σ `(promo_price \|\| price) × qty` over selected |
| `originalSelectedTotal` | Σ `price × qty` over selected — pre-promo, for strike-through |
| `totalDiscount` | Σ `((promo_price \|\| price) × product_discount / 100) × qty` |
| `deliveryTotal` | see below |

**Rule:** `promo_price || price` — a promo of `0` falls through to `price`. Free
items are not expressible this way.

**Rule:** `product_discount` is a **percentage** applied on top of the already
promo-adjusted price. It is the seller-staked discount, separate from the promo.

### Delivery grouping — the non-obvious one

`deliveryTotal` (`:592`):

```
group key = seller_id ? `seller_${seller_id}` : `prod_${productId}`
per group: keep the MAXIMUM fee among its items
total     = Σ of those maxima
```

**Rule:** items from one seller share **one** delivery charge, and that charge is
the **highest** among them — not the sum, not the first. Items with no `seller_id`
group per-product, so each is charged separately.

**Rule:** unavailable items (`isAvailable === false`) contribute no fee at all.

### Fee resolution — `getProductDeliveryInfo` (`:549`)

1. no `shipping_info` → `{ fee: 0, isAvailable: true }`
2. `parsed.unified` → `{ fee: parsed.charge, isAvailable: true }`
3. `rates` array → exact case-insensitive country match on the line's
   `selected_shipping_country`, falling back to `userCountry`
4. else a rate whose country contains `"world"` or `"global"`, or has `isDefault`
5. else **`{ fee: 0, isAvailable: false }`** — the seller does not ship there
6. parse error → `{ fee: 0, isAvailable: true }`

**Rule:** step 5 is the only path that marks an item unavailable, and it drives
`isItemAvailable()` in the sidebar.

**Note:** this is a *third* shipping parser, alongside `parseShippingData` in the
product modal and the Flutter port. They differ — this one accepts `isDefault` and
`"global"`, `parseShippingData` does not. Reconciling them is a real cleanup.

## 4. Cart endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/cart` | list |
| `POST` | `/cart/items` | insert or merge on the six-column key |
| `PUT` | `/cart/items/:id` | quantity/selection |
| `DELETE` | `/cart/items/:id` | remove one |
| `DELETE` | `/cart` | clear |

`cart_items` is created at runtime by `modules/cart/cartRuntimeRepository.js:28` —
it is **not** in the SQL dump.

## 5. Order creation

`POST /orders/create` — `orderController.js:571`. Runs inside a transaction.

Accepted body:
```
item_id, quantity, size, color, variant_index, total_price,
shipping_address, wallet_transfer_id, reseller_ref,
payment_method, shipping_fee
```

**Rule:** there is no `shipping_country` field. The country only ever lives on the
cart line; the order records a fee and an address.

Sequence:

1. `BEGIN`, then `ensureOrderResellCommissionColumns` (twice — a duplicated call at
   `:579-580`, harmless but redundant).
2. `SELECT * FROM market WHERE id = $1 FOR UPDATE` — row lock. 404 if missing.
3. **Stock decrement** — `adjustOrderItemStock(client, item, {quantity, size, color, variant_index}, 'decrease')`.
   On throw: `ROLLBACK` + **400 `Insufficient stock`**. This is the *only* real
   stock enforcement in the whole buy flow.
4. **Funds hold**, only when `payment_method === 'wallet'`:
   `totalRequired = (item.promo_price || item.price || 0) × quantity + shipping_fee`
   checked against `users.wallet_balance` under `FOR UPDATE`. Insufficient → rollback + 400.
   `wallet_manual` skips the hold.
5. **Order number** — generated and re-rolled until `SELECT 1 FROM orders WHERE order_number = $1`
   returns nothing (`:716`). Uniqueness by retry loop, not a constraint.
6. `createOrderRecord` inserts, carrying the full resell-commission column set
   (`reseller_user_id`, `reseller_ref`, `resell_commission_percentage`,
   `resell_commission_amount`, `resell_googer_commission_percentage`,
   `resell_commission_transfer_id`).
7. `COMMIT`.

**Rule:** the server recomputes the amount to hold from the `market` row. A
tampered `total_price` does not change what is charged.

`POST /orders/create-bulk` is the multi-line checkout path; lines sharing an
`order_number` form one logical order.

## 6. Order lifecycle

```
pending → processing → shipped → delivered → received
   └────→ cancelled (refunded)
```

| Endpoint | Purpose |
| --- | --- |
| `PUT /orders/:id/status` | single line |
| `PUT /orders/group/:orderNumber/status` | whole order |
| `POST /orders/group/:orderNumber/cancel` | cancel + refund |
| `GET /orders/buyer`, `GET /orders/seller` | the two inboxes |
| `GET /orders/badge-counts` | topbar counters |
| `POST /orders/:id/report` | dispute |

**Rule:** badge counts use `COUNT(DISTINCT COALESCE(order_number, 'order-item-' || id::text))`
(`:788`) — a multi-line order counts **once**, and legacy rows without an
`order_number` fall back to a synthetic per-id key.

Seller-side transitions are driven from the product modal footer when
`activeTab === "my-products" && myListingsTab === "all"` — see
`03-SHOP-AND-PRODUCT.md` §7.

## 7. Related surfaces

- `components/CartSidebar.tsx` (140 KB) — the bag drawer: per-line select, quantity,
  delivery grouping display, address, payment method, checkout.
- `components/ReceiptModal.tsx` + `utils/transactionReceipt.ts` + `utils/pdfGenerator.ts` — receipts.
- `components/wallet/OrderChatPopup.tsx` — buyer/seller chat scoped to an order.
- `POST /wallet/pay-order` — the wallet-side leg of payment (see `06-WALLET-AND-PAYMENTS.md`).

## 8. Gaps

1. **Stock is only enforced at order creation.** The bag freely exceeds it; the
   buyer discovers the problem at checkout with a 400.
2. **No cart-level stock revalidation** on load or poll — a line can sit in the bag
   after the product sells out, and nothing marks it.
3. **Order number uniqueness by retry loop**, not a unique constraint — racy under
   concurrency.
4. **Three shipping parsers** that disagree in their fallbacks.
5. **`promo_price || price`** makes a genuine zero promo price unrepresentable.
