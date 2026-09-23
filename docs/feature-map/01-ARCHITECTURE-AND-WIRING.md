# 01 — Architecture and Wiring

How a click in the browser becomes a row in PostgreSQL.

## 1. The request path

```
React page/component  (app/**/page.tsx, app/components/**)
        │  calls a typed service function
        ▼
Service layer         (services/*.ts)          ← the ONLY place fetch() should live
        │  fetch(`${API_URL}/market/...`, { headers: { Authorization: Bearer <jwt> } })
        ▼
API_URL resolution    (services/apiConfig.ts)
        │  localhost      → http://127.0.0.1:5000   (direct)
        │  anything else  → /api                    (relative, through Cloudflare tunnel)
        ▼
Express               (backend/src/server.js)
        │  app.use('/api', apiRoutes) + per-domain mounts
        ▼
Route file            (backend/src/routes/*.js)     ← auth middleware attaches here
        ▼
Controller            (backend/src/controllers/*.js)
        ▼
Module / repository   (backend/src/modules/<domain>/*)
        ▼
PostgreSQL            (backend/src/config/database.js — pg Pool)
```

**Rule:** `API_URL` is computed once at module load from `window.location.hostname`
(`services/apiConfig.ts:7`). It returns `/api` during SSR. This is why the app works
identically behind the Cloudflare tunnel and on localhost without a build flag —
but it also means an explicitly-set `NEXT_PUBLIC_API_URL` wins over both, and any
value equal to `/api` or `http://127.0.0.1:5000` is treated as "not set".

## 2. Mount table

From `backend/src/server.js`. Every path below is prefixed by `/api` in production
(the tunnel maps `googer.site/api/*` → `127.0.0.1:5000`).

| Mount | Route file | Domain |
| --- | --- | --- |
| `/auth` | `routes/auth.js` | registration, login, OTP, sessions, profile, follows, blocks |
| `/wallet` | `routes/wallet.js` | balance, transfers, order payment, capital |
| `/ads` | `routes/ads.js` | campaign CRUD, saves, analytics, reach |
| `/market` | `routes/market.js` | products, likes, comments, shares, views, coins |
| `/upload-content` | `routes/uploadContent.js` | long-form/paid content, reposts, purchases |
| `/categories` | `routes/categories.js` | category tree, commission settings |
| `/googs` | `routes/googs.js` | short social posts + their interactions |
| `/orders` | `routes/order.js` | order creation and lifecycle |
| `/chat` | `routes/chat.js` | messaging, presence, typing, calls |
| `/cart` | `routes/cart.js` | bag CRUD |
| `/feed` | `routes/feed.js` | composed home feed |
| `/notifications` | `routes/notifications.js` | in-app notifications |
| `/promo-codes` | `routes/promoCodes.js` | validate + redeem |
| `/admin/customization` | `routes/adminCustomization.js` | all admin-tunable settings |
| `/admin` | `routes/adminHistory.js` | admin reporting/history views |
| `/verification` | `routes/verification.js` | identity verification + review |
| `/withdrawals`, `/withdrawal-admin` | `routes/withdrawals.js`, `withdrawalAdmin.js` | payouts |
| `/coin-requests` | `routes/coinRequests.js` | coin top-up requests |
| `/p2p-ads`, `/p2p-sell-ads` | `routes/p2pAds.js`, `p2pSellAds.js` | peer-to-peer buy/sell |
| `/subscriptions`, `/subscription-plans` | `routes/subscriptions.js`, `subscriptionPlans.js` | plans and entitlements |

Two non-route mounts matter:

- `app.use('/api/', limiter)` — rate limiting applies to the whole API surface.
- `app.use('/assets', express.static(...public/assets))` — static assets are served
  by Express, not Next.

**Note:** `/p2p-ads` and `/p2p-sell-ads` are 34 KB route files each and are near
mirror images of one another (buy side vs sell side). They are documented once in
`06-WALLET-AND-PAYMENTS.md` with the differences called out.

## 3. Authentication

`backend/src/middleware/auth.js`. Applied per-route, not globally.

The middleware does four things, in order:

1. **Extract** the bearer token via the shared helper `extractAuthToken`
   (`shared/api/authToken`) — shared with the admin panel so both parse the header
   identically.
2. **Verify** the JWT signature against `getJwtSecret()`.
3. **Check `token_version`.** The decoded `tokenVersion` claim is compared to
   `users.token_version`. A mismatch returns 401 `Session has been invalidated`.
   This is the global revocation lever — bumping the column logs a user out of
   every device at once, and it is what a password change triggers.
4. **Check the session row.** If the token carries a `sessionId`, `auth_sessions`
   is consulted; the request is rejected unless `status = 'active'` and
   `logout_at IS NULL`. This is per-device revocation ("log out this device").

**Rule:** if `auth_sessions` does not exist yet (Postgres error `42P01`) the check
is skipped rather than failing. Session revocation degrades to token-version-only
revocation on a fresh database instead of locking everyone out.

**Side effect worth knowing:** every authenticated request calls
`processDueSubscriptionsForUser(decoded.id)` (`auth.js:67`). Subscription renewal is
lazy and piggybacks on user traffic — there is no cron guaranteeing it. A user who
never opens the app does not get renewed until they do. Failures are logged and
swallowed, so a renewal bug is silent.

`token_version` is added by the middleware itself on boot via
`ALTER TABLE users ADD COLUMN IF NOT EXISTS` — a pattern used widely across this
backend (see §6).

## 4. Frontend state that outlives a page

| Concern | Where | Notes |
| --- | --- | --- |
| Bag contents | `app/context/CartContext.tsx` | React context + localStorage mirror + `/cart` sync |
| Live ad state | `app/lib/ads/adStore.ts` | Zustand-style store keyed by ad interaction id |
| Theme | `app/lib/themeMode.ts`, `components/ThemeController.tsx` | |
| Feed hide prefs | `app/lib/feedHidePreferences.ts` | "not interested" persistence |
| Badge counts | `app/lib/badgeCache.ts` | topbar counters |

**`adStore` is the reason ad counters stay consistent.** A like on an ad card in
the feed and the same ad opened in its second view are the same entity; both read
`adStates[interactionId]` and overlay it on the server payload. `adIdentity.ts`
computes that id. Without it the two surfaces drift.

## 5. Realtime

One socket server: `backend/src/realtime/chatSocket.js`. The tunnel forwards
`/socket.io/*` to the backend alongside `/api/*`.

Realtime carries chat messages, presence, typing indicators and WebRTC call
signalling. Call signalling is *also* exposed over plain HTTP
(`POST /chat/calls/:callId/signal`, `GET /chat/calls/:callId/signals`) so the call
flow survives a dropped socket.

Feed, wallet and order updates are **not** realtime — they are refetched.

## 6. Two patterns that will surprise you

**Runtime schema creation.** Many tables are created on demand by the module that
owns them rather than by a migration (`cartRuntimeRepository.js` creates
`cart_items`; the upload-content module creates its whole family). Consequences:

- The SQL dump is not the schema.
- A table appears the first time its feature is exercised.
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guards are scattered through
  controllers (`ensureOrderResellCommissionColumns`, `ensureTokenVersionColumn`)
  and run on the hot path.

**Public response caching.** `middleware/publicResponseCache.js` fronts public
read endpoints. When debugging "the API returns stale data", check this before
the database.

## 7. Where the weight is

Largest files, as a guide to where behaviour actually lives:

| Frontend | KB | Backend | KB |
| --- | --- | --- | --- |
| `app/dashboard/shop/page.tsx` | 412 | `controllers/marketController.js` | 216 |
| `app/dashboard/chats/page.tsx` | 387 | `controllers/uploadContentController.js` | 173 |
| `app/dashboard/page.tsx` (home feed) | 230 | `controllers/authController.js` | 131 |
| `app/dashboard/wallet/sell/page.tsx` | 215 | `controllers/chatController.js` | 123 |
| `app/dashboard/wallet/topup/page.tsx` | 211 | `controllers/adsController.js` | 115 |
| `app/dashboard/profile/page.tsx` | 204 | `controllers/orderController.js` | 64 |
| `app/components/AddProductModal.tsx` | 201 | `controllers/walletController.js` | 51 |
| `app/components/CartSidebar.tsx` | 140 | `controllers/googController.js` | 50 |

These are single files. `shop/page.tsx` holds the shop grid, the product modal
host, the seller's own-listings tabs, the order management tabs and the add-to-bag
orchestration in one component tree.
