# Wallet Page Contract

Scope: the Flutter wallet landing page and the eight destinations shown in the attached web reference. Backend behavior is authoritative for data and permissions; `app/dashboard/wallet/page.tsx` and the attached screenshot are authoritative for wallet-page UI rules.

Status: all seven workflow steps are applied to this page.

## Step 1 - Backend API inventory

The landing page loads these five authenticated reads in parallel:

| Endpoint | Wallet-page use |
|---|---|
| `GET /api/auth/profile` | Googer ID and current wallet balance |
| `GET /api/wallet/history` | Total transaction count |
| `GET /api/ads/my` | Owned-ad count for Ad Center |
| `GET /api/verification/status` | Verified/Get Verified state |
| `GET /api/subscriptions/me` | Current plan name |

The eight wallet actions navigate to:

| Screenshot action | Flutter destination | Primary backend group |
|---|---|---|
| Wallet | `MyWalletScreen` | `/api/wallet`, `/api/auth/wallet` |
| Top Up | `SellScreen(startOnBuy: true)` | `/api/p2p-ads` |
| Withdraw | `WithdrawalScreen` | `/api/withdrawals`, `/api/withdrawal-admin/settings` |
| History | `TransactionsScreen` | `/api/wallet/history` |
| Buy & Sell | `SellScreen(startOnBuy: true)` | `/api/p2p-ads`, `/api/p2p-sell-ads` |
| Verify | `WalletVerificationScreen` | `/api/verification` |
| Plans | `SubscriptionScreen` | `/api/subscriptions`, public plan catalog |
| Ad Center | `AdCenterScreen` | `/api/ads` |

The detailed P2P route inventory remains in `docs/wallet_api_mapping.md` and `docs/wallet_buy_sell_web_backend_parity.md`.

## Step 2 - Request and response contracts

All landing-page requests are `GET` requests with no request body.

`GET /api/auth/profile` success contains a user envelope. Fields consumed here:

```json
{
  "success": true,
  "user": {
    "id": 7,
    "user_id": "312495",
    "googer_id": "optional alias",
    "wallet_balance": "99.20"
  }
}
```

Googer ID precedence is `user_id`, `googer_id`, then `id`. Invalid balance values map to `0`, but a failed profile request is an error and must not map to a zero-balance wallet.

`GET /api/wallet/history` success:

```json
{
  "success": true,
  "transactions": []
}
```

The page displays `transactions.length`. Transaction rows are documented separately for the History/My Wallet pages.

`GET /api/ads/my` success: `{ "success": true, "ads": [] }`. The page displays `ads.length`.

`GET /api/verification/status` success:

```json
{
  "success": true,
  "verification": {
    "status": "Verified"
  }
}
```

Both `Verified` and legacy `approved` map to the verified UI. Missing verification maps to Get Verified.

`GET /api/subscriptions/me` success:

```json
{
  "success": true,
  "subscription": {
    "plan_name": "Basic"
  }
}
```

No active plan may return `subscription: null`; the UI displays Choose.

Common failures:

- `401`: missing, expired, or invalid Bearer token; clear the invalid local session and show the login-required wallet state.
- `403`: suspended/deactivated/forbidden state; display the backend message without retry loops.
- `500`: display the backend message and Retry.
- Timeout, DNS, offline, invalid JSON, or HTML gateway response: display a connection/service error and Retry.
- Failed refresh after successful load: keep existing wallet data visible and show a non-blocking retry banner.

## Step 3 - Authentication and token mapping

- Every landing-page endpoint requires `Authorization: Bearer <token>`.
- Flutter uses the same persisted token restored by `Api.init()` and sent by the central API client.
- A `401` from the wallet dashboard invalidates the local session through `Api.logout()`.
- The dashboard never sends `user_id` from the client to select another wallet; the backend derives wallet ownership from `req.user.id`.
- Linked wallet mutations retain their backend idempotency requirements. The landing page itself performs no mutation except local clipboard actions.

## Step 4 - Typed model and JSON mapping

`WalletDashboardSnapshot` is the page model:

```text
googerId
balance
transactionCount
adCount
isVerified
planName
```

It accepts current backend envelopes and isolates dynamic JSON from widgets. The corrected verification mapper reads `verification.status`; the previous page read the outer envelope and could incorrectly show a verified account as unverified.

## Step 5 - API service layer

`Api.loadWalletDashboardRaw()` performs the five reads and preserves failures. `ApiWalletDashboardRepository` converts the raw envelopes into `WalletDashboardSnapshot`.

This page must not use the older pattern where each request catches every exception and returns an empty list/map. That pattern makes backend failures look like a real `0.00` balance, zero transactions, no ads, and no verification.

The repository is injectable so widget tests do not call production HTTP and future caching can be added without coupling the UI to transport code.

## Step 6 - Flutter UI connection

The attached wallet reference is represented by:

- White Googer ID card with referral URL, copy, share sheet, and wallet QR.
- Black estimated-balance card with visibility toggle and RPR label.
- Two rows of four quick actions in this exact order: Wallet, Top Up, Withdraw, History, Buy & Sell, Verify, Plans, Ad Center.
- Wallet Details rows with live balance, transaction count, verification, plan, and ad count.
- Responsive layouts verified at 430, 360, and 320 logical pixels.

Required states now implemented:

- Initial loading.
- Populated wallet.
- Hidden/visible balance.
- Signed-out/unauthorized message with Retry.
- Backend/offline/invalid-response error with Retry.
- Pull-to-refresh.
- Failed refresh that retains the last successful wallet.
- Verified and unverified identity states.
- Plan and no-plan states.
- Referral copied state, share sheet, QR loaded, and QR unavailable fallback.

## Step 7 - Regression testing

Automated wallet coverage includes:

- Dashboard model envelope mapping and ID fallback.
- `Verified` and `approved` status mapping.
- Initial loading, error, retry, and retained-data refresh failure.
- Screenshot layout/service order at 430, 360, and 320 widths.
- Referral copy/share controls and balance visibility.
- My Wallet, top-up, withdrawal, P2P, verification, plans, ad center, history/receipt behavior, and narrow-screen overflow checks.

Run:

```powershell
& '..\tools\flutter\bin\flutter.bat' test test/wallet_smoke_test.dart test/wallet_dashboard_model_test.dart test/wallet_dashboard_state_test.dart test/wallet_receipt_test.dart test/wallet_pages_smoke_test.dart test/top_up_smoke_test.dart test/p2p_smoke_test.dart test/my_wallet_smoke_test.dart test/subscription_ad_center_test.dart
```

