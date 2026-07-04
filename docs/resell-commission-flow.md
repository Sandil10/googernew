# Resell Commission Flow

Complete reference for the Googer resell commission system: how a buyer's purchase through a reseller's link results in commission credited to the reseller's wallet and the Main Googer Balance — held on order placement and released on receive.

---

## Roles

| Role | Description |
|------|-------------|
| **User A** | Seller / Product Owner — creates the product and sets the resell commission % |
| **User B** | Reseller — generates a personal resell link for the product |
| **User C** | Buyer — clicks the resell link and purchases the product |
| **Googer Admin** | System operator — sets the Googer cut % in admin panel |

---

## High-Level Flow

```
User A creates product (resell %)
        │
        ▼
User B opens product → Share modal → Resell view
        │
        │ (Resell ID auto-fills with User B's 6-digit Googer ID)
        ▼
User B generates link:  /share/product/<shareCode>/<resellerRef>
        │
        ▼
User B shares link to User C (WhatsApp, FB, etc.)
        │
        ▼
User C opens link → reseller attribution saved (localStorage + cart)
        │
        ▼
User C places order → resell_commission transfer created as 'pending' (HOLD)
        │
        ▼
User C clicks RECEIVE
        │
        ▼
finalizeReceivedOrder runs:
   • reseller wallet +90
   • Main Googer Balance +10
   • transfer status → 'completed'
```

---

## Admin Panel Setting

Path: **Admin Panel → Collect Coin Rewards → Resell Googer Commission %**

| Field | Default | Table | Column |
|-------|---------|-------|--------|
| Resell Googer Commission % | `10.00` | `ad_coin_reward_settings` | `resell_googer_commission_percentage` |

This is the **percentage of the resell pool** that goes to Googer. It is NOT a percentage of the full product price.

---

## Math (with R1000 product example)

```
Product Price:          R1000
Resell Commission %:    10%      (set on product by User A)
Resell Pool:            R100     (1000 × 10%)

Resell Googer % (admin): 10%     (set in admin panel)
Googer Share:           R10      (100 × 10%)
Reseller Share:         R90      (100 − 10)
```

**Summary:**

| Receiver | Amount |
|----------|--------|
| User B (reseller) wallet | +R90 |
| Main Googer Balance | +R10 |
| User A (seller) | Still receives normal product payment (minus the R100 that was redirected) |

---

## Database Schema (Relevant Columns)

### `market.commission_info` (JSONB)
Per-product resell config. Set when User A creates/edits the product.
```json
{
  "discount": "0",
  "resell_percentage": "10",
  "resell_amount": "100"
}
```

### `ad_coin_reward_settings`
Single-row table with admin-controlled Googer cut.
```
id | resell_googer_commission_percentage | is_active
1  | 10.00                                | true
```

### `cart_items` (per-buyer cart row)
Stores reseller attribution after click.
```
reseller_ref TEXT                              -- e.g. "895591" or "john_doe"
resell_commission_percentage DECIMAL(10,2)
```

### `orders` (order row)
Locked-in resell facts at order placement.
```
reseller_user_id INTEGER                            -- resolved User B id
reseller_ref TEXT
resell_commission_percentage NUMERIC(8,2)           -- product-level (e.g. 10)
resell_commission_amount NUMERIC(15,2)              -- the pool (e.g. 100)
resell_googer_commission_percentage NUMERIC(8,2)    -- admin panel value (e.g. 10)
resell_commission_transfer_id INTEGER               -- FK to wallet_transfers
```

### `wallet_transfers` (the actual money record)
Two row types are created during the resell flow:

| `type` | Created When | Initial Status | Final Status |
|--------|--------------|----------------|--------------|
| `resell_commission` | At order placement (HOLD) | `pending` | `completed` after RECEIVE, or `cancelled` after cancel |
| `resell_googer_fee` | At RECEIVE (RELEASE) | `accepted` | `accepted` |

**Main Googer Balance formula:**
```sql
SELECT SUM(commission) FROM wallet_transfers WHERE status = 'accepted'
```

The `resell_googer_fee` row counts toward this because:
- `status = 'accepted'`
- `commission = googerShare` (e.g. 10)

---

## STEP-BY-STEP DETAIL

### STEP 1 — User A Creates Product

In **AddProductModal**, the seller sets:
- **Resell Commission %** input field
- This saves as `commission_info.resell_percentage` in the `market` table

If this field is **blank or 0**, no resell commission can ever be paid — `createResellCommissionHold` returns null silently with this log line:
```
[resell] SKIP item=X: product has no resell_percentage configured
```

### STEP 2 — Product Published

Product appears in the shop feed. The 3-dot menu offers:
- Share Link (regular share)
- **Resell & Earn** (opens ShareModal with `initialView="resell"`)

### STEP 3 — User B Generates Resell Link

In **ShareModal** Resell view:
1. The input is **auto-populated** with User B's 6-digit Googer `user_id` (this prevents typo failures — the #1 silent failure cause)
2. User B clicks **Generate** → URL format: `/share/product/<shareCode>/<resellerRef>`

> Note: This system uses **URL-based attribution**, not a separate `resell_codes` table. The reseller identifier is embedded directly in the URL path.

### STEP 4 — User C Clicks Resell Link

In `app/share/product/[shareCode]/[resellerRef]/page.tsx`:
1. `params.resellerRef` is extracted from URL
2. `rememberResellAttribution()` writes to `localStorage`:
   ```json
   {
     "<productId>": {
       "reseller_ref": "895591",
       "share_code": "ABCD123",
       "saved_at": 1735200000000
     }
   }
   ```
3. When User C clicks **Add to Bag**, the `reseller_ref` is attached to the cart item

### STEP 5 — User C Places Order (HOLD)

`createBulkOrder` → `createResellCommissionHold()` runs:

**For Wallet payment:**
- No buyer hold tampering (the resell amount stays inside the main `order_hold` for the buyer's total)
- Creates `resell_commission` transfer with:
  - `amount = resellAmount` (full pool, e.g. 100)
  - `commission = googerShare` (e.g. 10)
  - `status = 'pending'`

**For COD payment:**
- Seller's `wallet_balance` -100 → seller's `hold_balance` +100 (seller fronts the commission)
- Creates `resell_commission` transfer with `status = 'pending'`

At this point:
- **Reseller wallet: unchanged** (no instant credit)
- **Main Googer Balance: unchanged** (no instant credit)
- Pending transfer represents the held money

Log line:
```
[resell] HELD item=28: pending transferId=899, reseller=1 (test), pool=100, willPay reseller=90 + Googer=10 on receive
```

### STEP 6 — Commission Calculation (Reference)

Calculated inside `finalizeReceivedOrder` at receive time:
```js
const resellAmount = order.resell_commission_amount;       // 100
const googerPct = order.resell_googer_commission_percentage; // 10
const googerShare = (resellAmount * googerPct) / 100;        // 10
const resellerShare = resellAmount - googerShare;             // 90
```

### STEP 7 — User C Clicks RECEIVE (RELEASE)

Status transitions to `'received'`. All three paths trigger `finalizeReceivedOrder`:
1. `updateOrderStatus` (single order)
2. `updateOrderGroupStatus` (Googer manual payment grouped order)
3. `autoReceiveExpiredCodOrders` (COD auto-receive after 48h)

Inside `finalizeReceivedOrder` (existing release block, lines 996–1044):

```sql
-- 1. For COD: release the held commission from seller
UPDATE users SET hold_balance = hold_balance - 100 WHERE id = sellerId;

-- 2. Credit reseller wallet
UPDATE users SET wallet_balance = wallet_balance + 90 WHERE id = resellerId;

-- 3. Mark the resell_commission transfer as completed
UPDATE wallet_transfers
   SET status = 'completed', amount = 90, commission = 90
 WHERE id = resell_commission_transfer_id;

-- 4. Insert the Googer fee transfer (this credits Main Googer Balance)
INSERT INTO wallet_transfers
  (sender_id, receiver_id, amount, type, status, commission, commission_percentage)
VALUES (sellerId, googerUserId, 10, 'resell_googer_fee', 'accepted', 10, 10);
```

**Main Googer Balance now reflects +10** because the new row matches the formula.

---

## Cancel / Refund

If the order is cancelled before RECEIVE, `refundCancelledOrder` handles cleanup:

| Payment | Action |
|---------|--------|
| Wallet | Main wallet refund returns full order price to buyer (includes resell amount) |
| COD | Decrement seller `hold_balance` by 100, credit seller `wallet_balance` by 100, mark transfer `cancelled` |

Since the `resell_commission` transfer is still `pending` at cancel time, no commission ever reached anyone. Money is conserved.

---

## Why Resell Commission Can Silently Fail

`createResellCommissionHold` returns `null` (no error, no commission) in these cases. Each is logged with `console.warn`:

| Cause | Log Line | Fix |
|-------|----------|-----|
| No `reseller_ref` in order item | `no reseller_ref provided` | Buyer's cart must have `reseller_ref` set (came from resell link) |
| `reseller_ref` matches no user | `resellerRef="X" does not match any user` | Use exact `user_id`, `username`, or numeric `id` — Resell modal now auto-fills correctly |
| Buyer is same as reseller | `buyer is the same as the reseller` | Use a different account to buy (self-purchase blocked by design) |
| Seller is the reseller | `seller is the same as the reseller` | Owner cannot resell own product |
| No resell_percentage on product | `product has no resell_percentage configured` | Seller must set it in product form |
| Computed resell amount is 0 | `computed resell amount is 0` | Product price or quantity must be > 0 |

If `createResellCommissionHold` THROWS (e.g. COD seller insufficient balance), the entire order is rolled back with an HTTP 400 error to the frontend.

---

## Verification Queries

### Current Main Googer Balance
```sql
SELECT COALESCE(SUM(commission), 0)::numeric AS main_googer_balance
FROM wallet_transfers
WHERE status = 'accepted';
```

### All resell-related transfers
```sql
SELECT id, sender_id, receiver_id, amount, commission, type, status, note, created_at
FROM wallet_transfers
WHERE type IN ('resell_commission', 'resell_googer_fee')
ORDER BY created_at DESC
LIMIT 20;
```

### Orders with resell attribution
```sql
SELECT id, order_number, buyer_id, seller_id, reseller_user_id, reseller_ref,
       resell_commission_amount, resell_googer_commission_percentage,
       resell_commission_transfer_id, status
FROM orders
WHERE reseller_user_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

### Total resell commission earned by a specific reseller
```sql
SELECT
  COALESCE(SUM(amount), 0) AS total_resell_earned
FROM wallet_transfers
WHERE type = 'resell_commission'
  AND status = 'completed'
  AND receiver_id = <RESELLER_USER_ID>;
```

### Total resell Googer fees collected
```sql
SELECT
  COALESCE(SUM(commission), 0) AS total_resell_googer_fees
FROM wallet_transfers
WHERE type = 'resell_googer_fee'
  AND status = 'accepted';
```

---

## Key Code Locations

| File | Function | What it does |
|------|----------|--------------|
| `backend/src/controllers/orderController.js` | `createResellCommissionHold` | Creates pending HOLD transfer at order placement |
| `backend/src/controllers/orderController.js` | `resolveResellerUser` | Looks up reseller by `id`, `user_id`, or `username` |
| `backend/src/controllers/orderController.js` | `getResellCommissionPercentage` | Reads `resell_percentage` from product's `commission_info` |
| `backend/src/controllers/orderController.js` | `getResellGoogerCommissionPercentage` | Reads admin panel setting |
| `backend/src/controllers/orderController.js` | `finalizeReceivedOrder` (lines 996-1044) | Releases the held commission to reseller + Googer on RECEIVE |
| `backend/src/controllers/orderController.js` | `refundCancelledOrder` | Refunds COD seller's held commission on cancel |
| `app/components/ShareModal.tsx` | `handleGenerateResellLink` | Builds the resell URL; auto-fills with user's Googer ID |
| `app/share/product/[shareCode]/[resellerRef]/page.tsx` | `rememberResellAttribution` | Saves reseller info to localStorage |
| `app/context/CartContext.tsx` | `buildCartItemFromProduct` | Attaches `reseller_ref` to cart items |
| `app/components/CartSidebar.tsx` | bulk-order builder | Sends `reseller_ref` per item to backend |

---

## HOLD vs RELEASE — Why This Design

**Why HOLD on order placement?**
- Buyer may cancel
- Buyer may dispute / refund
- COD: package may not be delivered
- Without HOLD, commission would have to be clawed back from reseller's wallet, which is awkward and error-prone

**Why RELEASE only on RECEIVE?**
- RECEIVE is the buyer's explicit confirmation the transaction is complete
- After RECEIVE, the order cannot be cancelled — safe to distribute commission permanently
- Matches the same release point as seller's product payment (consistent UX)

---

## Test / Demo

A rollback-only demo lives at `backend/test_resell_demo.js`. It:
1. Reads admin panel `Resell Googer Commission %`
2. Finds a product with `resell_percentage > 0`
3. Simulates HOLD → RELEASE on real DB inside a transaction
4. Verifies Main Googer Balance increased by the expected Googer share
5. Verifies reseller wallet increased by the expected reseller share
6. `ROLLBACK` — no data is saved

Run it with:
```bash
cd backend && node test_resell_demo.js
```

Last verified result (product #25 "watch", R1500, 5% resell, 10% Googer):
- Pool: R75 → Googer +R7.50 ✅ → Reseller +R67.50 ✅
- Both verifications PASSED

---

*Last updated: 2026-05-26*
