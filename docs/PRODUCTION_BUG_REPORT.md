# Googer Production Bug Report

Audit date: 2026-06-10

## Checks Run

- `npm run build`: passed.
- `npm run lint`: passed with warnings only.
- `node -e "require('./backend/src/server')"`: backend loaded successfully.
- Log scan across current frontend/backend logs: no current fatal backend load error found; old `next3010.err.log` contains an `Invalid URL` entry.

## Fixed During Audit

- `app/components/ads/AdAnalyticsModal.tsx`: fixed a React lint/compiler error caused by mutating `accumulated` during render while building donut chart arcs.

## Current Ship Status

- Build status: pass.
- Lint status: pass with warnings.
- Backend syntax/load status: pass.
- Automated test coverage: no full automated test script exists in `package.json`; manual QA is still required before production.

## Remaining Risks

### High

- No end-to-end test suite exists for critical money/ad/order flows.
- Wallet, ads, checkout, P2P buy/sell, subscription renewal, and admin approval flows should be manually tested before production.

### Medium

- `app/components/ads/ProfilePromoteCarousel.tsx` has a React hook order warning. This can become a runtime bug if render paths change.
- Many `react-hooks/exhaustive-deps` warnings exist in large pages such as cart, chats, ad campaign editor, topup/sell wallet pages, and profile. These can cause stale data or missed refreshes.
- Old `next3010.err.log` shows `TypeError: Invalid URL` for `http://127.0.0.1:5000 /api/__ESC_COLON_path*`; if that config is still used anywhere, API proxying can break.
- Backend database config disables TLS verification when a connection string/relaxed SSL is used. This should not be left relaxed for a true production deployment unless the infrastructure explicitly requires it and the risk is accepted.

### Low

- Many unused variables/imports remain. These are not currently blocking, but they make future bug hunting harder.
- Many plain `<img>` warnings remain; this can hurt performance/LCP but is not a functional blocker.

## Recommended Pre-Production Manual QA

- Login/register/logout and deleted/deactivated account behavior.
- Profile page Googs ads: owner view vs public viewer view, saved completed ads, active ads, promote button, coin button.
- Home, Shop, and Chat ad delivery: targeting, like/comment/share/view, coin collection, not interested, report.
- Photo/video promote campaign: create, approve, active, complete, save, promote again from owner saved profile ad only.
- Product promote campaign: promote by owner and other user, identity display, second-view product behavior.
- Wallet: manual credit, transfer, hold balance, refund, withdrawal request/review, coin request/review.
- Checkout/order: normal purchase, resell purchase, seller commission, discount hold/release/refund.
- Subscription purchase/renewal/grace/expiry and plan limits.
- Admin pages: access control for non-admin users and admin actions.

## Suggested Automation Next

- Add a small `npm run check` script that runs `npm run lint && npm run build`.
- Add backend smoke scripts for auth, ads, wallet, market, and saved-public ads endpoints.
- Add Playwright/Cypress tests for the critical user flows above.
