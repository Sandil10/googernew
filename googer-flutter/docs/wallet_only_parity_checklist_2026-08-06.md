# Wallet-Only Parity Checklist

Date: August 6, 2026

Scope: compare the web wallet in `googernew-main` against the current Flutter mobile wallet in `googer-flutter`, using the same backend and database. This file is wallet-only. It excludes home feed, shop, chats, and profile unless they directly affect wallet behavior.

Status labels:

- `same` = mobile feature is present and wired to the same backend flow
- `partial` = mobile has the feature, but behavior, UI flow, or backend wiring is incomplete
- `missing` = no real mobile equivalent yet

## Summary

The mobile wallet is strong on the main user path:

- wallet home and shortcuts
- my wallet balance/history/request flow
- direct transfer and request/respond
- transaction cancel
- referral/reward/affiliate wallet sections
- admin coin request page
- P2P buy/sell ads marketplace
- withdrawal and KYC basic wiring

The biggest remaining parity gaps are:

- top-up flow completeness
- wallet-pay standalone route parity
- subscription feature completeness
- support/admin-linked wallet subflows
- some deeper P2P live-update and assignment flows

## Master Checklist

| Web surface | Web route / endpoint | Mobile surface | Status | Notes |
| --- | --- | --- | --- | --- |
| Wallet hub | `/wallet`, `GET /auth/profile`, `GET /wallet/history`, `GET /verification/status` | `wallet_screen.dart` | `same` | Balance, Googer ID, verification-aware wallet entry cards are wired. |
| My Wallet main page | `/wallet/my-wallet` | `my_wallet_screen.dart` | `same` | Core balance, tabs, recent activity, statement-backed sections are wired. |
| Wallet transaction history | `GET /wallet/history` | `transactions_screen.dart`, `my_wallet_screen.dart` | `same` | Uses live wallet history and cancel flow. |
| Cancel pending transaction | `POST /wallet/cancel` | `transactions_screen.dart`, `my_wallet_screen.dart` | `same` | Wired for eligible outgoing pending rows. |
| Recipient search | `GET /wallet/search-users` | `my_wallet_screen.dart` | `same` | User suggestions and selection are wired. |
| Direct wallet transfer | `POST /wallet/transfer` | `my_wallet_screen.dart` | `same` | Password-gated transfer flow is wired. |
| Request money from user | `POST /wallet/request` | `my_wallet_screen.dart` | `same` | Request/send discount flows are wired. |
| Pending request inbox | `GET /wallet/pending-requests` | `my_wallet_screen.dart` | `same` | Request list loads from backend. |
| Respond to request | `POST /wallet/respond` | `my_wallet_screen.dart` | `same` | Accept/reject flow is wired; accept uses password confirmation. |
| Referral wallet data | `GET /auth/wallet` | `my_wallet_screen.dart` | `same` | Referrals/rewards/affiliate sections read live backend wallet/referral data. |
| Wallet receipt modal/download | statement row + local PDF generation | `wallet_receipt.dart`, `wallet_receipt_dialog.dart` | `partial` | Implemented and deployed, but receipt eligibility rules are still being refined to match business intent exactly. |
| Coins management / admin coin requests | `/wallet/coins-management`, `POST /coin-requests`, `GET /coin-requests/my`, `GET /coin-requests/active-topup-methods` | `coins_management_screen.dart`, `request_screen.dart` | `same` | Request history, verified/pending/rejected states, and verified payment method selection are wired. |
| Wallet top-up shell | `/wallet/topup` | `top_up_screen.dart` | `partial` | UI and active-topup-method loading exist, but the flow is still a shell around bank transfer / request / P2P entry points rather than a full web-equivalent transaction lifecycle. |
| Bank transfer top-up | `/wallet/topup/bank-transfer` | `bank_transfer_screen.dart` | `partial` | Receipt upload UX exists, but full backend-reviewed top-up lifecycle parity is not fully verified here. |
| Wallet withdrawal | `/wallet/withdrawal`, `GET /withdrawals/payment-methods`, `GET /withdrawals/my-requests`, `GET /withdrawal-admin/settings`, `POST /withdrawals/request`, `DELETE /withdrawals/cancel/:id` | `withdrawal_screen.dart` | `same` | The screen is wired to live withdrawal methods, limits, history, submit, and cancel. Needs device-level QA, not core implementation work. |
| Wallet verification / KYC | `/wallet/verification`, `GET /verification/status`, `POST /verification/submit` | `wallet_verification_screen.dart` | `same` | Status and submit flow are wired. Needs end-to-end submission QA. |
| Subscription page | `/wallet/subscription`, `GET /admin/customization/subscription-plans/public`, `GET /subscriptions/me`, `POST /subscriptions/subscribe`, `PATCH /subscriptions/auto-renew` | `subscription_screen.dart` | `partial` | Plans/current subscription/subscribe are wired; full parity for every web subscription control still needs confirmation. |
| Subscription cancel | `POST /subscriptions/cancel` | `subscription_screen.dart` | `partial` | Screen references cancel handling, but this needs parity verification against full web behavior. |
| Wallet pay order backend leg | `POST /wallet/pay-order` | `cart_screen.dart`, `campaign_editor.dart`, `Api.walletPayOrder` | `same` | Actual wallet payment for orders is wired through live backend calls. |
| Wallet-pay standalone page | `/wallet-pay` | `wallet_pay_screen.dart` | `partial` | Separate route screen is still mostly static/placeholder, even though real wallet pay happens elsewhere. |
| P2P buy ads | `/p2p-ads/*` | `sell_screen.dart` in buy mode | `same` | Listing ads, filtering, starting trade, transaction views, and reporting are wired. |
| P2P sell ads | `/p2p-sell-ads/*` | `sell_screen.dart` in sell mode | `same` | Listing, posting, editing, deleting, transaction actions, and reporting are wired. |
| P2P ad posting | `POST /p2p-ads`, `POST /p2p-sell-ads` | `sell_screen.dart` | `same` | Publish/edit/delete is wired to backend. |
| P2P trade start | `POST /:id/start` | `sell_screen.dart` | `same` | Start-trade flow is wired. |
| P2P trade actions | `/transactions/:id/confirm`, `/cancel`, `/report`, `/submit-details` | `sell_screen.dart` | `partial` | Main actions are wired, but parity for every web-side detail/proof/live-state nuance needs a final compare pass. |
| P2P SSE live updates | `GET /p2p-ads/events`, `GET /p2p-sell-ads/events` | none | `missing` | Mobile refreshes and reloads data; no SSE parity yet. |
| Manual payment hold verification | `POST /wallet/verify-manual-payment-hold` | cart/manual payment-related flow | `partial` | Pieces exist in order/cart flows, but the exact web escrow-support sequence still needs line-by-line parity confirmation. |
| Top-up support chat assignment | `GET/PUT /chat/topup-request/:id/assignment` | none | `missing` | No matching mobile support-assignment flow. |
| Admin wallet ledger views | `/admin/all-transactions`, admin wallet reporting routes | no mobile user-wallet equivalent | `missing` | Out of normal user scope; still absent on mobile. |
| Ad center wallet spend view | `/wallet/ad-center` and related ads wallet endpoints | `ad_center_screen.dart` | `partial` | Wallet entry exists, but parity of full ad-spend and wallet-ledger behavior is not complete. |
| Promo ad record/refund wallet endpoints | `POST /wallet/record-promo-ad`, `POST /wallet/refund-ad-budget-edit`, `POST /wallet/pay-profile-promote` | indirect/mobile ads flow only | `partial` | Some ad wallet outcomes surface in history, but the whole web admin/editor flow is not fully represented inside wallet screens. |

## Step-by-Step Wiring Status

### 1. Wallet Home

- `same`
- Screen: `lib/screens/wallet_screen.dart`
- Live data:
  - `Api.refreshProfile()`
  - `Api.walletHistoryRaw()`
  - `Api.verificationStatus()`
- What matches:
  - wallet balance
  - Googer ID
  - wallet shortcuts
  - verification-aware navigation

### 2. My Wallet

- `same`
- Screen: `lib/screens/my_wallet_screen.dart`
- Live data:
  - `Api.walletHistoryRaw()`
  - `Api.pendingRequests()`
  - `Api.walletReferralData()`
- Wired actions:
  - transfer
  - request
  - request accept/reject
  - cancel eligible transactions
  - user search/suggestions
  - recent transactions
  - referrals / rewards / affiliate sections

### 3. Transaction History

- `same`
- Screen: `lib/screens/transactions_screen.dart`
- Live data:
  - `Api.walletHistoryRaw()`
  - `Api.cancelTransaction()`
- What matches:
  - statement list
  - outgoing/incoming display
  - cancel action
  - receipt trigger for eligible rows

### 4. Coin Requests / Coins Management

- `same`
- Screen: `lib/screens/coins_management_screen.dart`
- Live data:
  - `Api.myCoinRequests()`
  - `Api.coinRequestMethods()` / active top-up methods flow
  - `Api.createCoinRequest()`
- What matches:
  - send request
  - pending gate
  - approved/verified/rejected status handling
  - method selection after approval

### 5. Top Up

- `partial`
- Screens:
  - `lib/screens/top_up_screen.dart`
  - `lib/screens/bank_transfer_screen.dart`
- Live data:
  - `Api.activeTopupMethods()`
- Completed in this step:
  - top-up page loads live active payment methods
  - bank-transfer page now receives the selected method and renders live admin-configured payment fields instead of only hardcoded account details
- Missing or still needing parity confirmation:
  - full end-to-end top-up transaction lifecycle
  - support-assignment parity
  - stronger link between top-up history and review state

### 6. Withdrawal

- `same`
- Screen: `lib/screens/withdrawal_screen.dart`
- Live data:
  - `Api.withdrawalPaymentMethods()`
  - `Api.withdrawalRequests()`
  - `Api.withdrawalSettings()`
  - `Api.verificationStatus()`
  - `Api.createWithdrawalRequest()`
  - `Api.cancelWithdrawalRequest()`
- What matches:
  - methods
  - limits
  - KYC gate
  - request submit
  - request history
  - cancel pending request

### 7. Verification / KYC

- `same`
- Screen: `lib/screens/wallet_verification_screen.dart`
- Live data:
  - `Api.verificationStatus()`
  - `Api.submitVerification()`
- What matches:
  - status loading
  - submit documents / details
  - withdrawal unlock relationship

### 8. Subscription

- `partial`
- Screen: `lib/screens/subscription_screen.dart`
- Live data:
  - public plans
  - current subscription
  - subscribe
  - auto-renew handling
- Still to verify:
  - cancel behavior parity
  - every plan state edge case
  - every web-side entitlement/usage presentation

### 9. Wallet Pay

- Backend order-payment flow: `same`
- Standalone `/wallet-pay` screen parity: `partial`

Actual live payment is already wired from:

- `lib/screens/cart_screen.dart`
- `Api.walletPayOrder()`

But:

- `lib/screens/wallet_pay_screen.dart` is still mostly static
- this route should either be fully wired or treated as a non-parity helper screen

### 10. P2P Buy / Sell Ads

- `same` for core flow
- `partial` for advanced parity
- Screen: `lib/screens/sell_screen.dart`
- Live data:
  - buy ads
  - sell ads
  - transactions
  - create/update/delete ads
  - trade start
  - report/action flows

Still not fully matched:

- server-sent live event parity
- every proof/locking/admin-recovery nuance from the web

## Immediate Work Order

If the goal is full wallet parity step by step, the next implementation order should be:

1. Finish top-up parity
   - bank transfer lifecycle
   - request/review/history parity
   - support assignment parity if required on mobile

2. Finish wallet-pay route parity
   - either fully wire `wallet_pay_screen.dart`
   - or remove it as a separate parity target and keep the real flow inside cart/order payment

3. Finish subscription parity
   - verify cancel
   - verify auto-renew behavior and display
   - verify current-plan edge states

4. Finish advanced P2P parity
   - SSE live updates
   - proof/detail parity
   - exact transaction-state behavior against web

5. Finish ad-center wallet parity
   - align wallet-related ad spend/history behavior with web

## Files Used For This Checklist

Web reference:

- `googernew-main/docs/feature-map/06-WALLET-AND-PAYMENTS.md`

Flutter reference:

- `googer-flutter/lib/screens/wallet_screen.dart`
- `googer-flutter/lib/screens/my_wallet_screen.dart`
- `googer-flutter/lib/screens/transactions_screen.dart`
- `googer-flutter/lib/screens/coins_management_screen.dart`
- `googer-flutter/lib/screens/top_up_screen.dart`
- `googer-flutter/lib/screens/bank_transfer_screen.dart`
- `googer-flutter/lib/screens/withdrawal_screen.dart`
- `googer-flutter/lib/screens/wallet_verification_screen.dart`
- `googer-flutter/lib/screens/subscription_screen.dart`
- `googer-flutter/lib/screens/sell_screen.dart`
- `googer-flutter/lib/screens/wallet_pay_screen.dart`
- `googer-flutter/lib/api/api.dart`
