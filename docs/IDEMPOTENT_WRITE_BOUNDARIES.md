# Idempotent Write Boundaries

## Purpose

Step 6 protects sensitive write flows from duplicate client submits and safe retries.

## Shared Infrastructure

Files:

- [idempotencyRepository.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/idempotency/idempotencyRepository.js)
- [idempotencyService.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/idempotency/idempotencyService.js)
- [idempotencyMiddleware.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/idempotency/idempotencyMiddleware.js)

Behavior:

- reads `Idempotency-Key` or `X-Idempotency-Key`
- scopes keys by authenticated user and operation
- rejects key reuse when the request payload changes
- replays completed responses for matching duplicate requests
- blocks duplicate in-flight requests for the same user/key/scope

## Current Protected Sensitive Routes

### Wallet

Protected in [wallet.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/routes/wallet.js):

- transfer request
- manual payment hold verification
- request response
- transaction cancel
- direct transfer
- pay order
- pay profile promote
- record promo ad
- admin add capital

### Withdrawals

Protected in:

- [withdrawals.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/routes/withdrawals.js)
- [withdrawalAdmin.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/routes/withdrawalAdmin.js)

Routes covered:

- submit withdrawal request
- cancel withdrawal request
- admin approve/reject withdrawal request

### Subscriptions

Protected in [subscriptions.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/routes/subscriptions.js):

- subscribe
- cancel subscription
- set auto renew

## Result

This gives the backend a real retry-safe boundary for the highest-risk money and plan mutation flows.
