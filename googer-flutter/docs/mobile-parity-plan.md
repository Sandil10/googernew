# Web-to-Flutter Feature Parity Plan

The web app, backend, and Flutter app are the three sources used for parity. The backend is authoritative for data and permission rules; the web app is authoritative for current feature behavior and UI rules; Flutter is the target client.

## Seven-step workflow

1. Generate the backend inventory with `node tool/generate_api_inventory.js`.
2. Add request, success-response, and error-response fixtures for each feature group.
3. Verify public, bearer, admin, subscription, idempotency, and event-stream authentication rules.
4. Replace dynamic maps and production mock types with typed Flutter models and explicit JSON parsing.
5. Move HTTP behavior behind feature services using the shared API client.
6. Connect every Flutter state: initial loading, empty, populated, validation, submission, retry, unauthorized, forbidden, offline, and pagination.
7. Run contract tests, Flutter unit/widget tests, backend regression tests, and public smoke tests.

## Step 2 contracts

- [Authentication](contracts/authentication.md)
- [Home feed](contracts/home-feed.md)
- [Wallet page](contracts/wallet.md)

Authentication and home feed now have documented request fields, success/error responses, permissions, required UI states, current Flutter drift, and fixture/test requirements. Response envelopes explicitly marked **Envelope pending** must be captured before strict models are generated in Step 4.

## Current baseline

- Backend: 325 Express route declarations across 24 mounted route files.
- Flutter: broad screen coverage exists for auth, feed, uploads, ads, campaigns, marketplace, cart/orders, chat/calls, wallet/P2P, subscriptions, profile, settings, notifications, and verification.
- Flutter networking is split between `lib/api/api.dart` and smaller files under `lib/services`.
- `lib/api/api.dart` is approximately 4,800 lines and returns many dynamic maps/lists. This makes silent JSON drift likely.
- Production Flutter files still import `lib/data/mock.dart` for several UI data types. Mock fixtures must be separated from runtime models before parity can be certified.
- Existing Flutter tests are mostly widget smoke tests. Endpoint contract and authenticated integration coverage are still required.

## Definition of complete

A feature is complete only when its backend endpoints, auth rules, request fields, response models, UI states, actions, navigation, media behavior, and regression tests match the web behavior. A screen that only looks similar or loads sample data is not complete.

## Implementation order

1. Shared auth/session and API error handling.
2. Home feed, Googs, uploads, public ads, and profiles.
3. Chat, messages, calls, notifications, and stickers.
4. Marketplace, categories, cart, checkout, and orders.
5. Wallet, requests, transfers, withdrawals, P2P buy/sell, and verification.
6. Ad campaign creation/editing, reach, promo codes, analytics, and subscriptions.
7. Settings, security sessions, account lifecycle, support, and remaining edge states.

The generated `docs/api-inventory.md` is the endpoint-level checklist. It should be regenerated whenever backend routes or Flutter calls change.
