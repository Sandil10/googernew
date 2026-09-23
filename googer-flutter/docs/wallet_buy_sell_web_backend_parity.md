# Wallet Buy/Sell Web + Backend Parity Notes

Scope: this document is read-only analysis of the current Googer web app and backend, then the Flutter/mobile parity target. Do not change the web app or backend for this work.

## Source of truth files

- Web Buy Coins page: `googernew-main/app/dashboard/wallet/topup/page.tsx`
- Web Sell Coins page: `googernew-main/app/dashboard/wallet/sell/page.tsx`
- Backend Buy routes: `googernew-main/backend/src/routes/p2pAds.js`
- Backend Sell routes: `googernew-main/backend/src/routes/p2pSellAds.js`
- Flutter/mobile page: `googer-flutter/lib/screens/sell_screen.dart`
- Flutter/mobile API wrapper: `googer-flutter/lib/api/api.dart`

## Two separate backend systems

Buy and Sell look similar in UI, but backend keeps them separate:

| Flow | Ads endpoint | Transactions table | Active lock table |
| --- | --- | --- | --- |
| Buy Coins | `/p2p-ads` | `p2p_transactions` | `p2p_active_buyers` |
| Sell Coins | `/p2p-sell-ads` | `p2p_sell_transactions` | `p2p_sell_active_buyers` |

Flutter must not merge these into one endpoint. The current mobile screen switches endpoints with `_buyMode`.

## Ad create/edit contract

Both web pages create/update ads with this payload shape:

```json
{
  "catalog_id": "paypal",
  "name": "PayPal",
  "category": "WALLET",
  "svg_file": "optional",
  "clearbit_domain": "optional",
  "admin_fields": [
    { "key": "email", "label": "Add your email", "value": "..." },
    { "key": "number", "label": "Add your number", "value": "..." },
    { "key": "country", "label": "Country", "value": "Sri Lanka" }
  ],
  "lkr_rate": "1",
  "crypto_currency": "LKR",
  "min_amount": 10,
  "max_amount": 100,
  "release_value": "1",
  "release_unit": "h",
  "description": "optional guide note"
}
```

Backend create routes reject duplicate ads per user + payment method. Backend update/delete routes reject changes when the ad has any pending transaction.

Mobile parity requirement:

- Edit button on own Buy and own Sell ads opens the same black bottom-sheet style popup.
- Existing values must prefill from `admin_fields`, `lkr_rate`, `crypto_currency`, min/max, `release_value/unit`, and `description`.
- Update payload must keep the same fields so web/mobile see the same data.

## Buy Coins order flow

Web behavior:

1. User taps another user’s Buy button.
2. Web opens amount popup; it does not immediately create a backend transaction.
3. Input amount is in the ad currency.
4. Receive amount is calculated as:
   - `receive_amount = input_amount * lkr_rate`
5. Validation is against Rupieer receive amount:
   - `receive_amount >= min_amount`
   - `receive_amount <= min(max_amount, available_amount)`
   - no buyer wallet balance check in this Buy flow
6. User clicks Make Payment.
7. Web calls `POST /p2p-ads/:id/start` with:
   - `amount`
   - `receive_amount`
8. Backend checks:
   - ad exists
   - user cannot buy own ad
   - requested receive amount is inside ad limits
   - seller has enough wallet balance
9. Backend moves seller Rupieer from `wallet_balance` to `hold_balance`.
10. Backend inserts a `p2p_transactions` row with `status='pending'`.
11. Web shows Pending after start, because a real pending transaction now exists.
12. Buyer submits transaction ID or screenshot to `/p2p-ads/transactions/:transactionId/submit-details`.
13. Seller confirms through `/p2p-ads/transactions/:transactionId/confirm`.
14. Confirm releases seller hold to buyer wallet and marks transaction completed.
15. Cancel releases hold back to seller and marks transaction cancelled.

Mobile parity requirement:

- Button click only opens the trade popup.
- Pending must start only after Make Payment / equivalent confirm action.
- Mobile payload must send `amount` and `receive_amount` with the same formula.
- Pending/completed/cancelled tabs should display transaction rows, not ads.

## Sell Coins order flow

Web behavior:

1. User taps another user’s Sell button.
2. Web opens amount popup; it does not immediately create a backend transaction.
3. Input amount is in Rupieer.
4. Receive amount is calculated as:
   - `receive_amount = input_amount / lkr_rate`
5. Validation is against Rupieer input amount:
   - `amount >= min_amount`
   - `amount <= min(max_amount, available_amount)`
   - `amount <= buyer wallet_balance`
6. User fills required seller payment-method fields shown from admin method definitions.
7. User clicks Sell Now.
8. Web calls `POST /p2p-sell-ads/:id/start` with:
   - `amount`
   - `receive_amount`
   - `receive_currency`
   - `buyer_fields`
9. Backend checks:
   - ad exists
   - user cannot buy own ad
   - requested Rupieer amount is inside ad limits
   - buyer has enough wallet balance
   - seller has enough available backing balance
10. Backend moves buyer Rupieer from `wallet_balance` to `hold_balance`.
11. Backend inserts a `p2p_sell_transactions` row with `status='pending'`.
12. Seller submits proof/details to `/p2p-sell-ads/transactions/:transactionId/submit-details`.
13. Buyer confirms through `/p2p-sell-ads/transactions/:transactionId/confirm`.
14. Confirm releases buyer hold to seller wallet and marks completed.
15. Cancel releases hold back to buyer and marks cancelled.

Mobile parity requirement:

- Sell popup must collect payment method fields and send `buyer_fields`.
- Formula and validation must mirror web.
- Confirm/cancel/report/detail endpoints must use `/p2p-sell-ads`.

## Transaction tabs and card rules

Web card rules:

- `ALL` tab shows live ads after currency/country filtering.
- `PENDING`, `COMPLETE`, and `CANCEL` tabs show one synthetic card per transaction, newest first.
- A missing/deleted ad must not hide its old transaction; web creates synthetic card data from transaction row.
- Own ads show Edit/Delete unless locked.
- Locked own ads show “Locked · transaction in progress”.
- Non-own locked ads do not allow starting a new trade.

## Transaction popup presentation matrix

The backend field meaning is fixed; Flutter must not infer it from the current
user or swap it ad hoc.

| Flow | Backend `amount` | Backend `receive_amount` |
| --- | --- | --- |
| Buy Coins (`p2p_transactions`) | Payment/ad currency such as USDT or LKR | Rupieer |
| Sell Coins (`p2p_sell_transactions`) | Rupieer | Payment/ad currency from `receive_currency` |

The popup then presents those values as follows:

| Flow and role | Left summary | Right summary | Proof owner | Confirm owner |
| --- | --- | --- | --- | --- |
| Buy buyer | Amount in ad currency | Rupieer received | Buyer | Seller |
| Buy seller/ad owner | Amount in ad currency | Rupieer released | Buyer | Seller |
| Sell buyer | Rupieer paid | Payment currency received | Seller | Buyer |
| Sell seller/ad owner | Payment currency paid | Rupieer received | Seller | Buyer |

Pending, completed, and cancelled rows keep the same currency direction. Only
the labels and available actions change with status. Buy pending uses `Enter
Amount / You Receive` for the buyer and `Amount / Receive` for the seller. Buy
completed uses `Amount / Received`. Sell uses `You Pay / You Receive` because
the direction is role-specific.

Popup detail sources are intentionally separate:

- `SEND PAYMENT TO` reads the ad owner destination (`admin_fields`, explicit
  seller fields, or payment details).
- `BUYER DETAILS` reads only `buyer_fields`, `buyer_details`, and explicit buyer
  contact fields.
- Usernames, full names, and generic nested user objects are not payment rows.
- Transaction ID comes from `tx_id`; proof comes from `screenshot_data` and
  `screenshot_name`.
- A submitted Sell proof does not keep showing the editable buyer-details card;
  it shows transaction ID, proof, status, and the role-appropriate action.

## Authentication and JSON mapping

- Flutter restores the same bearer token through `TokenStore`/`Api` and sends
  `Authorization: Bearer <token>` on both endpoint families.
- Role is determined from `buyer_id` and `seller_id`; `is_own` identifies the ad
  owner but is not a substitute for transaction role.
- Ads normalize `admin_fields`, currency, limits, country, release time, logos,
  owner identity, and lock state in `_Ad`.
- Transactions remain backend rows so `buyer_fields`, proof paths, report
  reasons, and timestamps are not lost before popup presentation.

Mobile parity status:

- Flutter already uses one screen with `_buyMode` to switch `/p2p-ads` vs `/p2p-sell-ads`.
- Flutter already maps non-ALL tabs from transaction rows and falls back to synthetic transaction cards.
- Flutter card Buy/Sell button opens `_openTradeSheet(ad)`; it does not directly create pending.
- Flutter starts pending only inside `_startTrade(...)` after the trade popup action.
- Flutter now carries `adminFields`, `releaseValue`, `releaseUnit`, and `description` into the ad model and update payload.

## Current Flutter fixes applied in this pass

- Added normalized ad metadata:
  - `adminFields`
  - `description`
  - existing `releaseValue` / `releaseUnit` are now used by edit UI
- Added method-field lookup by method name so create/edit can show fields before an `_Ad` exists.
- Reworked the mobile create/edit bottom sheet toward the web modal:
  - black sheet
  - method logo/name header
  - method fields like email/number
  - `YOUR SETTINGS`
  - compact currency selector + rate
  - min/max amount
  - wallet balance text
  - available amount
  - bank country picker
  - coin release time + unit selector
  - description
  - `UPDATE` button for edit
- Save payload now includes the same backend fields web sends.

## Remaining parity checks after deploy

- Buy ad Edit opens the new modal and preserves method fields.
- Sell ad Edit opens the same modal and preserves available backend fields.
- Buy button opens popup only; no pending order until Make Payment.
- Sell button opens popup only; no pending order until Sell Now.
- Pending cards appear only after backend start succeeds.
- Locked own ad cannot update/delete; backend should return the lock message.
- Cancel from pending moves card to Cancel tab and restores correct balance/available values after refresh.
