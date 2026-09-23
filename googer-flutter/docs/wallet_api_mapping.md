# Wallet Buy/Sell API Mapping

Use this as the implementation checklist before changing wallet Flutter UI.

## Step 1 - Backend API inventory

Buy Coins web uses `/p2p-ads`.

- `GET /p2p-ads`
- `GET /p2p-ads/transactions?status=all`
- `POST /p2p-ads`
- `PUT /p2p-ads/:id`
- `DELETE /p2p-ads/:id`
- `POST /p2p-ads/:id/start`
- `POST /p2p-ads/transactions/:transactionId/submit-details`
- `POST /p2p-ads/transactions/:transactionId/confirm`
- `POST /p2p-ads/transactions/:transactionId/cancel`
- `POST /p2p-ads/transactions/:transactionId/report`

Sell Coins web uses `/p2p-sell-ads`.

- `GET /p2p-sell-ads`
- `GET /p2p-sell-ads/transactions?status=all`
- `POST /p2p-sell-ads`
- `PUT /p2p-sell-ads/:id`
- `DELETE /p2p-sell-ads/:id`
- `POST /p2p-sell-ads/:id/start`
- `POST /p2p-sell-ads/transactions/:transactionId/submit-details`
- `POST /p2p-sell-ads/transactions/:transactionId/confirm`
- `POST /p2p-sell-ads/transactions/:transactionId/cancel`
- `POST /p2p-sell-ads/transactions/:transactionId/report`

## Step 2 - Request/response documentation

Ad responses include:

- `id`, `catalog_id`, `name`, `category`
- `svg_file`, `clearbit_domain`, payment logo fields
- `admin_fields`
- `lkr_rate`, `crypto_currency`, `min_amount`, `max_amount`
- `available_amount`
- `release_value`, `release_unit`, `description`
- `user_id`, `username`, `profile_picture`, `is_own`
- `is_locked`, `is_inactive`

Transaction responses include:

- `id`, `ad_id`, `buyer_id`, `seller_id`
- `amount`, `receive_amount`, `receive_currency`
- `tx_id`, `screenshot_data`, `screenshot_name`
- `status`, `created_at`, `completed_at`
- `buyer_report_reason`, `seller_report_reason`
- buy/sell ad snapshot fields such as `ad_name`, `ad_currency`, `ad_country`, `ad_svg_file`

## Step 3 - Authentication / token mapping

Web uses authenticated fetches with the same backend token. Flutter must send the same bearer token through `Api` for every wallet request.

- Current user identity must map from `Api.currentUserIds`.
- Own ad detection must use backend `is_own` first, then compare `user_id` against current user IDs.
- Profile images must use backend `profile_picture` resolved through the same avatar resolver.

## Step 4 - Models / JSON mapping

Web maps backend ad state as:

```ts
adStatus: row.is_inactive ? 'inactive' : (row.is_locked ? 'locked' : 'active')
```

Flutter must map the same fields:

- `is_locked` or `adStatus == locked` -> `_Ad.serverLocked`
- `is_inactive` or `adStatus == inactive` -> `_Ad.inactive`
- `available_amount` -> `_Ad.available`
- `profile_picture` -> `_Ad.avatar`
- `svg_file` / `clearbit_domain` -> payment method icon

## Step 5 - API service layer

Flutter service calls must not invent local-only wallet state. The source of truth is:

- ads list for exact ad lock/inactive/available state
- transactions list for pending/completed/cancelled cards and report state
- profile endpoint for wallet balance and user identity

## Step 6 - Flutter UI to API connection

All-tab owner ads:

- inactive owner ad shows `Inactive · wallet below balance`, with Edit/Delete enabled.
- locked owner ad shows `Locked · transaction in progress`, with Edit/Delete disabled.
- inactive and locked are not the same state.

All-tab non-owner ads:

- active tradeable ad shows Buy/Sell.
- if user already has an open pending transaction, clicking another ad shows the web locked-pending popup.
- backend exact-ad lock must still be visible for the locked ad.

Pending tab:

- one card per pending transaction from `/transactions?status=all`.
- order ID must come from the same frontend formatting rule as web.
- report button hides after the same role has already reported.

Completed/Cancelled tabs:

- one card per transaction.
- completed popup shows proof and report boxes exactly from transaction fields.
- cancelled list is display-only like web.

## Step 7 - Regression testing

Before deploy, verify:

- buy all-tab locked count matches web for the same account.
- sell all-tab locked count and Sell button visibility match web.
- inactive ads can still Edit/Delete.
- pending buyer popup and pending seller popup match web state messages.
- report popup role label and hidden-after-report rule match web.
- payment method logo and user avatar render for every card.
