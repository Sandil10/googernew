# Mobile API Contracts

These documents are the Step 2 source of truth for web-to-Flutter parity.

- The backend defines request fields, authentication, status codes, and response data.
- The web app defines current user-visible behavior and UI rules.
- Flutter must implement both without inventing a second contract.

Contract confidence labels:

- **Verified**: read directly from the current route and controller implementation.
- **Envelope pending**: the route and permission are verified, but a captured response fixture is still required before creating a strict typed model.
- **Drift**: the current Flutter behavior does not match the backend or web behavior.

Feature contracts:

- [Authentication](authentication.md)
- [Home feed](home-feed.md)
- [Wallet page](wallet.md)
