# Web Parity Checklist: Verification, Plans, Ad Center

Source pages:
- Web verification: `googernew-main/app/dashboard/wallet/verification/page.tsx`
- Web plans: `googernew-main/app/dashboard/wallet/subscription/page.tsx`
- Web ad center: `googernew-main/app/dashboard/wallet/ad-center/page.tsx`
- Mobile verification: `googer-flutter/lib/screens/wallet_verification_screen.dart`
- Mobile plans: `googer-flutter/lib/screens/subscription_screen.dart`
- Mobile ad center: `googer-flutter/lib/screens/ad_center_screen.dart`

## Verification Rules
- Load current verification from `GET /verification/status`.
- `Verified` state shows one green `Account Verified` status card and no application form.
- `Under Review` / `Pending` / `Submitted` state shows one amber status card and no application form.
- `Rejected` state shows red status card with rejection reason and a resubmit action.
- Resubmit action reopens the application form with existing saved values prefilled.
- New / none state shows application form.
- Steps are `Personal Info`, `Identity`, `Authenticity`, `Business`.
- Required personal fields: full name, valid email, address, date of birth, country.
- Required identity fields: document type, front document, and back document except Passport.
- Authenticity and business fields are optional.
- Submit sends `POST /verification/submit` with multipart document fields matching web field names.
- Successful submit shows a success message and returns to status/reload.

## Subscription Plan Rules
- Load plans from public subscription plans endpoint and current user subscription.
- Hide `basic` / free plan from selectable cards.
- Selected plan accent color comes from `extra.badge_custom_color` or `badge_color`.
- Active plan card shows active/expired pill, auto-renew toggle, start/end dates, and grace countdown when applicable.
- Subscribe action opens confirm payment sheet with wallet balance, selected plan, interval, and total.
- Pay checks current wallet balance against selected plan price.
- Insufficient balance shows centered error popup with shortfall and Top Up action.
- Subscribe uses `POST /subscriptions/subscribe` with `switch_plan` when user already has a paid active plan.
- Cancel subscription turns auto-renew off, not immediate plan removal.
- Auto-renew toggle uses `PATCH /subscriptions/auto-renew`.
- Successful subscribe/cancel refreshes subscription and wallet/profile state.

## Ad Center Rules
- Load ads from `GET /ads/my`.
- Status filters are `All Ads`, `Under Review`, `Active`, `Paused`, `Completed`, `Cancelled`.
- Cancelled filter includes both `Cancelled` and `Removed`.
- `Expired` remains its own status in All Ads, not mapped to Completed.
- Web paginates ads at 5 per page with Previous / Next controls.
- Ads sort newest first by created time.
- Active action: Pause.
- Paused action: Resume.
- Under Review action: Edit, navigating to the campaign editor with the ad draft.
- Under Review / Active / Paused action: Cancel.
- Cancel confirmation text differs by status and campaign/refund support.
- Analytics opens a metrics modal.
- Card summary includes creative, order summary, performance, budget, status, timing, reach, views, clicks.
- Completed/Expired raw photo-video media is hidden when web hides it.
