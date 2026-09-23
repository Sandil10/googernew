# 06 — Wallet, Payments, P2P and Subscriptions

Every money surface lives under `/wallet/*` (and a mirrored `/dashboard/wallet/*`).

| Page | Size | Purpose |
| --- | --- | --- |
| `wallet/sell/page.tsx` | 215 KB | P2P sell ads |
| `wallet/topup/page.tsx` | 211 KB | P2P buy / top-up |
| `wallet/my-wallet/page.tsx` | 110 KB | balance, history |
| `wallet/ad-center/page.tsx` | 82 KB | campaign spend |
| `wallet/withdrawal/page.tsx` | 46 KB | payouts |
| `wallet/verification/page.tsx` | 45 KB | KYC |
| `wallet/subscription/page.tsx` | 43 KB | plans |
| `wallet/coins-management/page.tsx` | 31 KB | coin requests |
| `wallet/transactions/page.tsx`, `request/`, `topup/bank-transfer/` | | |

Backend: `controllers/walletController.js` (51 KB), `routes/wallet.js`.
Tables: `wallet`, `wallet_transfers`, `withdrawal_requests`, `withdrawal_settings`,
`withdrawal_payment_methods`, `coin_requests`, `topup_payment_methods`,
`p2p_*`, `subscription_plans`, `user_plan_subscriptions`,
`referral_*`, `commission_settings`.

## 1. Wallet controller surface

| Export | Route | Purpose |
| --- | --- | --- |
| `searchUsers` | `GET /wallet/search-users` | transfer recipient picker |
| `initiateTransferRequest` | `POST /wallet/request` | request money from a user |
| `verifyManualPaymentHold` | `POST /wallet/verify-manual-payment-hold` | manual-payment escrow check |
| `getPendingRequests` | `GET /wallet/pending-requests` | inbox |
| `respondToRequest` | `POST /wallet/respond` | accept / reject |
| `cancelTransaction` | `POST /wallet/cancel` | requester cancels |
| `directTransfer` | `POST /wallet/transfer` | immediate send |
| `payOrder` | `POST /wallet/pay-order` | marketplace payment leg |
| `payProfilePromote` | `POST /wallet/pay-profile-promote` | Profile Promote billing |
| `recordPromoAd` | `POST /wallet/record-promo-ad` | ad spend ledger |
| `refundAdBudgetEdit` | `POST /wallet/refund-ad-budget-edit` | refund on budget reduction |
| `addAdminCapital` | `POST /wallet/admin/add-capital` | platform capital injection |
| `getTransactionHistory` | `GET /wallet/history` | user statement |
| `getAllTransactionsAdmin` | `GET /admin/all-transactions` | admin ledger |

**Rule:** transfer requests are a three-state flow — `pending` → `completed` |
`cancelled`, with `respondToRequest` also able to reject. Order-linked payment
statuses are the order lifecycle (`pending`/`processing`/`shipped`/`delivered`/
`received`/`cancelled`/`accepted`/`rejected`), because `walletController` also
touches order rows when settling.

**Rule:** payments are **escrowed, not transferred immediately**. `createOrder`
holds funds (checking `users.wallet_balance FOR UPDATE`), and release happens on
order progression. `wallet_transfers` rows carry the transfer ids that orders
reference (`wallet_transfer_id`, `seller_commission_transfer_id`,
`seller_discount_transfer_id`, `resell_commission_transfer_id`) — one order can
spawn four distinct money movements.

## 2. Top-up (P2P buy)

`wallet/topup/page.tsx` (211 KB) + `routes/p2pAds.js` (34 KB) + `routes/coinRequests.js`.

Two mechanisms:

**A. Coin requests** — user submits a request against an admin-configured payment
method; an admin reviews it.

| Endpoint | Purpose |
| --- | --- |
| `POST /coin-requests` | submit |
| `GET /coin-requests/my` | own history |
| `GET /coin-requests/active-topup-methods` | available methods (`topup_payment_methods`) |
| `GET /coin-requests/admin`, `PUT /coin-requests/admin/:id/review` | moderation |

A chat thread can be attached to a request:
`GET/PUT /chat/topup-request/:topupRequestId/assignment` — the review conversation is
routed to an assigned staff member (`topup_request_chat_assignments`).

**B. P2P buy ads** — buy coins from another user.

## 3. P2P buy and sell

`routes/p2pAds.js` and `routes/p2pSellAds.js` are **34 KB each and near-identical**
— buy side and sell side of the same machine. Tables: `p2p_buy_ads`,
`p2p_transactions`, `p2p_active_buyers` / `p2p_sell_ads`, `p2p_sell_transactions`,
`p2p_sell_active_buyers`.

Identical endpoint set on both:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/events` | **SSE stream** — live ad/transaction updates |
| `GET` | `/` | list ads |
| `POST` | `/` , `PUT /:id`, `DELETE /:id` | manage own ad |
| `POST` | `/:id/start` | open a transaction against an ad |
| `POST` | `/:id/lock`, `/unlock`, `/force-unlock` | concurrency control |
| `POST` | `/:id/cancel`, `/:id/complete` | ad lifecycle |
| `GET` | `/transactions`, `/transactions/:transactionId` | transaction views |
| `POST` | `/transactions/:transactionId/submit-details` | payment proof |
| `POST` | `/transactions/:transactionId/confirm` | release |
| `POST` | `/transactions/:transactionId/cancel` | abort |
| `POST` | `/transactions/:transactionId/report` | dispute |

**Rule:** ads are **locked** while a transaction is in flight, which is what
`p2p_active_buyers` tracks — it stops two buyers claiming the same offer.
`force-unlock` is the admin escape hatch for a stuck lock.

**Rule:** transaction states are `pending` → `completed` | `cancelled`.

**Rule:** `/events` is Server-Sent Events — the P2P pages are the only surfaces
outside chat with live server push. Feed and wallet balance are poll/refetch.

## 4. Withdrawals

| Endpoint | Purpose |
| --- | --- |
| `GET /withdrawals/payment-methods` | user-visible methods (`withdrawal_payment_methods`) |
| `POST /withdrawals/request` | submit |
| `GET /withdrawals/my-requests` | own history |
| `DELETE /withdrawals/cancel/:id` | cancel while pending |
| `GET /withdrawal-admin/requests`, `PUT /withdrawal-admin/requests/:id/review` | moderation |
| `GET/PUT /withdrawal-admin/settings` | limits/fees (`withdrawal_settings`) |
| `GET /withdrawal-admin/exchange-rates` | FX |
| `GET /admin/withdrawal-transactions` | admin ledger |

## 5. Verification (KYC)

| Endpoint | Purpose |
| --- | --- |
| `GET /verification/status` | own state |
| `POST /verification/submit` | submit documents |
| `GET /verification/admin/all`, `PUT /verification/admin/:id/review` | moderation |

Table `user_verifications`. UI: `wallet/verification/page.tsx`,
`dashboard/admin/verification/page.tsx`, badge via `components/VerifiedBadge.tsx`.

## 6. Subscriptions

Two distinct concepts share the word "subscription" — do not conflate them:

1. **Paid plans** — `user_plan_subscriptions` + `subscription_plans`. This section.
2. **Following a user** — `user_subscriptions`. See `07-PROFILE-SOCIAL-CHAT.md`.

| Endpoint | Purpose |
| --- | --- |
| `GET /subscriptions/me` | current plan |
| `POST /subscriptions/subscribe` | purchase |
| `POST /subscriptions/cancel` | cancel |
| `PATCH /subscriptions/auto-renew` | toggle renewal |
| `GET /subscriptions/features` | entitlements |
| `GET /subscriptions/my-usage` | quota consumption |
| `GET /subscriptions/badge/:userId` | plan badge |
| `GET/POST/PUT/DELETE /subscription-plans[/:id]` | admin plan CRUD |
| `GET /admin/customization/subscription-plans/public` | public plan list |

Client entitlement gate: `app/lib/subscriptionFeatures.ts`.
Expiry warning: `components/subscriptions/SubscriptionExpiryWarning.tsx`.

**Rule (important):** renewal is **lazy**. `processDueSubscriptionsForUser(userId)`
runs inside the auth middleware on every authenticated request
(`middleware/auth.js:67`). There is no cron. A user who does not open the app is not
renewed until they do, and any failure is logged and swallowed.

## 7. Referral commission

| Endpoint | Table |
| --- | --- |
| `GET/PUT/POST /admin/customization/referral-commission-settings` | `referral_commission_settings` |
| `GET/POST /admin/customization/referral-level-settings` (+ `/bulk`, `/:level`) | `referral_level_settings` |

Plus `referral_relationships`, `referral_levels`, `referral_commission_payouts`.
Controller: `referralCommissionController.js`.

**Multi-level:** commission is configured per referral *level*, with bulk editing —
so this is a tiered structure, not a flat percentage.

### Resell commission

Separate from referral. A product share link can carry a `resellerRef`
(`/product/[shareCode]/[resellerRef]`, `/share/[shareCode]/[resellerRef]`,
`/reel/[shareCode]/[resellerRef]`). Attribution is persisted client-side under
`googer:resell-attribution` and rides the cart line as `reseller_ref` +
`resell_commission_percentage`, ending on the order as
`reseller_user_id` / `resell_commission_amount` /
`resell_googer_commission_percentage` / `resell_commission_transfer_id`.

**Rule:** `reseller_ref` is part of the cart merge key — an attributed add never
merges into an unattributed line, so attribution cannot be lost by re-adding.

See `docs/resell-commission-flow.md` (13 KB) for the intended calculation.

## 8. Payment locks

`CartContext` holds two localStorage guards:

- `googer-manual-payment-lock`
- `googer-payment-lock`

These prevent double-submitting a payment across reloads/tabs — a client-side
idempotency guard. Server-side idempotency: `backend/src/shared/idempotency/` and
`docs/IDEMPOTENT_WRITE_BOUNDARIES.md`.

## 9. Reference docs already in the repo

- `docs/wallet-sell-buy-flow.md` (7 KB)
- `docs/resell-commission-flow.md` (13 KB)
- `docs/Main googer balance.md`

## 10. Gaps

1. **Subscription renewal has no scheduler** — it is traffic-driven.
2. **`p2pAds.js` and `p2pSellAds.js` are duplicated logic** (34 KB × 2); a fix to
   one will not reach the other.
3. **Lock recovery is manual** — `force-unlock` exists because locks get stuck.
4. Wallet balance is **polled**, not pushed, despite P2P having an SSE channel.
