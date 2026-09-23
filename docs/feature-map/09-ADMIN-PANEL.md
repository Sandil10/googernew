# 09 — Admin Surface

Two distinct things are called "admin":

1. **In-app admin pages** under `app/dashboard/admin/*` — part of this Next.js app.
2. **`googeradminpanel/`** — a **separate application** in the repo root, served at
   `admin.googer.site` (tunnel → `127.0.0.1:6001`, its own API on `:3001`). It is
   outside the scope of this feature map, which covers the main web app.

Both authenticate against the same `shared/api/authToken` helpers.

## 1. In-app admin pages

| Page | Purpose |
| --- | --- |
| `app/dashboard/admin/ads/page.tsx` | ad moderation |
| `app/dashboard/admin/verification/page.tsx` | KYC review |
| `app/dashboard/admin/subscription/page.tsx` (40 KB) | plan management |

## 2. `/admin/customization` — the settings surface

`routes/adminCustomization.js` (14 KB) is the single largest admin route file and
controls most tunable platform behaviour.

**Rule:** endpoints ending in `/public` are the **unauthenticated read** counterparts
that the main app calls to learn current settings. Each pairs with an
admin-only writer. When porting, remember the app reads the `/public` variant.

| Setting | Read (public) | Write (admin) | Table |
| --- | --- | --- | --- |
| Ad allowed countries | `GET /ad-allowed-countries` | `POST`, `PUT` | `admin_customization_settings` |
| Chat assignment | `GET /chat-assignment` | `PUT` | — |
| Reach settings | `GET /reach-settings/public` | `POST /reach-settings` | `reach_settings` |
| Reach tiers | `GET /reach-tiers/public` | `GET/POST/PUT/DELETE /reach-tiers[/:id]` | `reach_tiers` |
| Promo codes | — | `GET/POST/PUT/DELETE /promo-codes[/:id]` | `promo_codes` |
| Ad coin settings | `GET /ad-coin-settings/public` | `POST /ad-coin-settings` | `ad_coin_reward_settings` |
| Referral commission | — | `GET/PUT/POST /referral-commission-settings` | `referral_commission_settings` |
| Referral levels | — | `GET/POST /referral-level-settings`, `PUT/POST .../bulk`, `PUT/DELETE .../:level` | `referral_level_settings` |
| Subscription plans | `GET /subscription-plans/public` | `GET/POST/PUT/DELETE /subscription-plans[/:id]` | `subscription_plans` |
| Upload control | `GET /upload-control/public` | `PUT /upload-control` | `upload_control_settings` |

Controllers: `reachSettingsController.js`, `reachTiersController.js`,
`promoCodesController.js`, `referralCommissionController.js`,
`subscriptionPlansController.js`, `uploadControlController.js`.

**Note:** referral level settings expose `/bulk` under **both** `PUT` and `POST`, and
`/referral-level-settings` itself under both `GET` and `POST` — the same operation is
reachable two ways, likely for client compatibility.

## 3. `/admin` — reporting and history

`routes/adminHistory.js` + `modules/adminHistory`:

| Endpoint | Reports on |
| --- | --- |
| `GET /admin/all-transactions` | full wallet ledger |
| `GET /admin/coin-collect-detail` | ad coin claims |
| `GET /admin/profile-promote-detail` | Profile Promote spend |
| `GET /admin/ad-promote-collection-detail` | ad promotion collections |
| `GET /admin/product-commission-history` | marketplace commission |
| `GET /admin/capital-transfer-history` | admin capital injections |
| `GET /admin/withdrawal-transactions` | payouts |

These are read-only reporting views over `wallet_transfers`, `ad_coin_collections`,
`referral_commission_payouts` and `withdrawal_requests`.

## 4. Moderation queues

| Domain | List | Action |
| --- | --- | --- |
| Ads | `GET /ads/all` | `POST /ads/:adId/report`, status via ad edit |
| Upload content | `GET /upload-content/admin/all` | `PATCH /upload-content/admin/:contentId/status` |
| Googs | — | `PATCH /googs/:id/admin-toggle` |
| Verification | `GET /verification/admin/all` | `PUT /verification/admin/:id/review` |
| Withdrawals | `GET /withdrawal-admin/requests` | `PUT /withdrawal-admin/requests/:id/review` |
| Coin requests | `GET /coin-requests/admin` | `PUT /coin-requests/admin/:id/review` |

Report intake tables: `ad_reports`, `user_reports`, `goog_reports`,
`goog_comment_reports`, `market_reports`, `market_comment_reports`,
`upload_content_reports`, `upload_content_comment_reports`.

**Rule:** every content type has both a **content** report table and a separate
**comment** report table. Reporting a comment is a distinct record from reporting
the thing it is attached to.

## 5. Categories and commission

`routes/categories.js` → `categoryController.js` (34 KB):

| Endpoint | Purpose |
| --- | --- |
| `GET /categories/admin/tree` | category hierarchy (`category_nodes`, `managed_categories`) |
| `POST /categories`, `PUT /categories/:id`, `DELETE /categories/:id` | CRUD |
| `PUT /categories/commission/global` | platform-wide commission rate |
| `PUT /categories/commission/manual-enabled` | toggle per-product manual commission |

Table `commission_settings`. UI: `app/dashboard/categories/page.tsx`.

**Rule:** commission is global with an opt-in manual override, and the flag enabling
manual override is itself an admin setting.

## 6. Capital

`POST /wallet/admin/add-capital` (`addAdminCapital`) injects platform capital;
history at `GET /admin/capital-transfer-history`. See
`docs/Main googer balance.md`.

## 7. Access control caveat

Admin authorisation is applied **per route**, the same as user auth. There is no
global admin guard — each admin route file attaches its own check. Add a route, and
it is unprotected until you wire the middleware. Worth an audit before shipping new
admin endpoints.
