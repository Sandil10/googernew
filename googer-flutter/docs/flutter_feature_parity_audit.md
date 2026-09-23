# Googer Flutter Feature Parity Audit

Purpose: track the web app behavior that must be matched in the Flutter mobile app. All user content, product media, upload content, videos, ads, avatars, wallet data, and chat media must come from the backend/database/storage bucket through the same API contracts used by the web app. No seeded/demo content should render as real data.

## 2026-08-24 Current A-Z Pass

Sources used for this pass:

- Web source truth: `D:\googer-recovery-code\googernew-main\app`, `D:\googer-recovery-code\googernew-main\services`
- Mobile target: `D:\googer-recovery-code\googer-flutter\lib`
- Backend/API contract: shared Express API through Flutter `Api` and Web services
- Verification: public origins and local backend returned `200`; Flutter automated parity suite passed `228/228`

Chrome practical-click QA was attempted through the installed browser bridge, but the bridge failed before page control with `failed to write kernel assets: The system cannot find the path specified`. This section therefore records code/API/test evidence, not a completed Chrome click-through for every live transaction.

### Verified Strong Parity Areas

| Area | Current status |
|---|---|
| Auth/session | Login, register, OTP/password reset, session restore, and profile deep-link auth refresh are covered by tests. |
| Home feed | Googs, upload-content cards, ads, profile-promote/product-promote card opening, search/category filtering, hidden items, comments/interactions, share, repost, report, delete, and upload playback helper coverage are present. |
| New/Edit Goog | Web-style link preview, plan character limits, colored-Goog boundary rules, edit reuse of create rules, and upgrade-popup hooks are covered. |
| Upload Content: Flash/Vault | Media selection rules, raw video preview defaults, existing edit media, thumbnail/preview mode preservation, draft/cancel, publish validation order, progress UI, content ID format, plan video limits, recommendation logic, subscription access packages, and existing media mobile/desktop preview are covered. |
| Subscription limits | Goog posting limits, upload-content daily/total/video limits, ad-save limits, and web boundary semantics are covered by focused tests. |
| Add Listing / Product create | Responsive modal/form, media-mode selection, category pickers, variants, price/logistics/payment sections, and empty publish validation are covered. |
| Shop feed | Product card media/avatar parsing, two-dot owner state, recommended/trending grids, product quick view, add-to-bag, and cart entry are wired through live models. |
| Cart/checkout | Cart totals, selected items, address validation, COD availability, wallet/manual/COD payment method rules, wallet shortfall popup, and order payload shape are covered. |
| Ads/campaigns | Photo-video, product-promote, profile-promote editors share one Flutter campaign editor and have responsive tests. Ad parser/audience/promote action parity is covered. |
| Profile | Own/public profile, upload-content under Googs, pending review card, saved ad expiry/save states, other-user upload menu, photo-video ad menu, and creator subscription selector are covered. |
| Chat | Conversation list, rich text colors, media previews, selection bar, ad placement cadence, composer send/voice swap, and plan-gated call-quality controls have tests. |
| Wallet/P2P | Wallet home, top-up/request, P2P buy/sell transaction presentation, receipt rendering/PDF, transaction history, balance hide, referral actions, and wallet dashboard error retention are covered. |

### Remaining Confirmed Gaps

1. Chrome/manual live QA is not complete in this environment because the browser bridge failed before control. Live submit flows that spend wallet balance or create production records still need a human-approved browser run.
2. `lib/screens/product_detail_screen.dart` is still a static/demo standalone screen with inert heart/add-cart/buy buttons. The main Shop feed uses live shop modal/card flows instead, so this is a gap only if that standalone screen becomes routable.
3. `lib/screens/wallet_pay_screen.dart` is still a static/demo standalone wallet-pay screen with an inert pay button. The real cart checkout wallet flow is implemented in `cart_screen.dart`; this standalone route should either be wired or removed from parity scope.
4. `lib/screens/share_goog_screen.dart` is still a static/demo shared-Goog landing screen with an inert dashboard button. Flutter currently does not implement Web's full `/share/goog/[postId]` deep-link landing behavior.
5. Flutter `MaterialApp.onGenerateRoute` currently has explicit route handling only for `/profile`; other Web deep links such as `/reel/*`, `/product/*`, `/share/*`, `/wallet/*`, and `/shop/*` fall back to home/login in-app. Server-side SPA fallback exists, but in-app route parity is not complete.
6. Chat call transport remains partial: backend call APIs and call-history UI pieces exist, but the code documents no mobile WebRTC transport yet. Needs device/browser call QA before claiming web-equal calling.
7. Admin mobile screens are not Web-admin complete. User-facing Web/mobile parity is the target; admin should stay Web-first unless the product requires mobile admin parity.
8. Some older parity docs in `docs/` are stale and still mention gaps now covered by current tests, especially upload-content multipart and ad campaign creation. Treat this dated section as newer than those older notes.

## Current Priority

1. Shared mobile shell and headers.
2. Home feed parity.
3. Shop/Market parity.
4. Wallet parity.
5. Chats parity.
6. Profile/settings/security parity.
7. Ad campaigns and upload/flash/vault content parity.
8. Final polish: loading states, media fallbacks, empty states, offline/error states, performance.

## Shared Shell

- Web source areas: `app/dashboard/layout.tsx`, `app/components/Topbar.tsx`, `app/components/Sidebar.tsx`.
- Flutter areas: `lib/screens/shell.dart`, `lib/theme.dart`, `lib/widgets/kit.dart`.
- Required:
  - Black top headers on every primary tab.
  - Home header: logo, `Search Googs`, cart, notification, live avatar.
  - Shop header: logo, `Search Googer`, cart, notification, live avatar.
  - Wallet header: logo, cart, notification, live avatar.
  - Chats header: logo, cart, notification, live avatar; conversation view adds back/user/call/video controls.
  - Bottom navigation: Home, Shop, Add, Wallet, Chats.
  - Images and avatars must resolve through `Api.resolveMedia`.

## Home Feed

- Web source: `app/dashboard/page.tsx`.
- Services: `googService`, `marketService`, `uploadContentService`, `authService`, `chatService`.
- Backend routes currently used by Flutter:
  - `GET /googs`
  - `GET /upload-content/public`
  - `GET /ads/active-public`
  - `POST /googs/{id}/like`
  - `POST /googs/{id}/view`
  - `POST /googs/{id}/share`
  - `POST /upload-content/{id}/purchase`
  - `POST /market/{ad-id}/like/view/share/comments`
- Required web behavior:
  - Category chips: All, Subscriptions, Comedy, Music, Gaming, Food & Cooking, etc.
  - Search with suggestions.
  - Mixed organic feed: Googs + upload content.
  - Sponsored ads interleaved.
  - Profile-promote cards interleaved.
  - Hidden item state per user.
  - Blocked user filtering.
  - Like/comment/view/share sheets.
  - Report flows.
  - Delete own Googs/upload content with confirmation.
  - Upload/vault purchase and watch modal.
  - Repost/resell/share upload content.
  - Ad coin collect timing and watch requirement.

## Shop / Market

- Web source: `app/dashboard/shop/page.tsx`, product modal components under `app/components/market`.
- Services: `marketService`, `authService`, `subscriptionService`.
- Backend routes currently used by Flutter:
  - `GET /market/products`
  - `POST /market/{id}/like`
  - `POST /market/{id}/view`
  - `POST /market/{id}/share`
  - `GET /market/{id}/comments`
- Required web behavior:
  - Top tabs: Market, My Listings, My Orders.
  - Badge count on My Listings when applicable.
  - Category chips from live product data and configured categories.
  - Recommended product grid with seller header, media, discount badge, price, cart, engagement row.
  - Product quick-view modal.
  - Product detail second view: media gallery, color/variant selection, stock, quantity, price, Rupieer display.
  - Cart and checkout flow.
  - My listings management.
  - My orders tracking.
  - Sponsored/product-promote products shown with correct engagement.

## Wallet

- Web sources:
  - `app/dashboard/wallet/page.tsx`
  - `app/dashboard/wallet/my-wallet/page.tsx`
  - `app/dashboard/wallet/transactions/page.tsx`
  - `app/dashboard/wallet/topup/page.tsx`
  - `app/dashboard/wallet/withdrawal/page.tsx`
  - `app/dashboard/wallet/subscription/page.tsx`
  - `app/dashboard/wallet/coins-management/page.tsx`
- Services: `walletService`, `authService`, `subscriptionService`.
- Backend routes currently used by Flutter:
  - `GET /auth/profile`
  - `GET /auth/wallet`
  - `GET /wallet/history`
  - `GET /wallet/search-users`
  - `POST /wallet/transfer`
  - request/response/topup/withdrawal endpoints as available in `Api`.
- Required web behavior:
  - Estimated balance from live profile/wallet.
  - Top up, withdraw, transfer, history.
  - Wallet transactions with password/passkey/biometric-style verification where supported.
  - Coin requests and approvals.
  - Subscription plans.
  - Ad center entry.
  - Verification entry.
  - Recent activity.
  - No static wallet numbers.

## Chats

- Web source: `app/dashboard/chats/page.tsx`.
- Service: `chatService`, `marketService`.
- Backend routes currently used by Flutter:
  - `GET /chat/conversations`
  - `GET /chat/messages/{participantId}`
  - `POST /chat/messages`
  - presence/typing/block/delete routes in `Api`.
- Required web behavior:
  - Conversation list with live sorting and unread state.
  - Conversation header: back, user avatar/name/status, call/video controls.
  - Text messages from backend.
  - Typing presence.
  - Pin/hide/delete conversation.
  - Block/unblock.
  - Image/video/file messages from storage bucket.
  - Product/ad message cards.
  - Sponsored chat ads and engagement sheets.
  - Calls and call history where web supports it.
  - Stickers/text colors gated by plan where web supports it.

## Profile

- Web sources:
  - `app/dashboard/profile/page.tsx`
  - `app/components/profile/PublicProfileView.tsx`
  - `app/dashboard/settings/page.tsx`
- Required:
  - Own profile header with live avatar/name/username/Googer ID.
  - Back button on mobile profile route.
  - No follower/following stats row when disabled by product request.
  - Own Googs/upload content/ads interleaving.
  - Own content delete confirmation.
  - Public profile menu and support/settings routes.
  - Edit profile uses backend profile fields only.

## Settings / Security

- Web sources:
  - `app/dashboard/settings/page.tsx`
  - `app/dashboard/settings/SecurityActionPanel.tsx`
  - `app/settings/*`
- Required:
  - General, Privacy, Security, Notifications.
  - Username change lock for 14 days.
  - Immutable email/Googer ID display rules.
  - DOB and account fields from backend.
  - 2FA phone setup and OTP destination choice.
  - Passkey save and login acceptance.
  - Trusted device approval/untrust behavior.
  - Security alerts and session locations.

## Implementation Queue

1. Finish shared header and black page background across Home/Shop/Wallet/Chats/Profile.
2. Replace any remaining local seed data usage in visible user flows.
3. Expand API models for exact web response shapes.
4. Port Home feed interaction sheets and delete/report flows.
5. Port Shop product quick view and detail second view.
6. Port Wallet verification modals and transaction actions.
7. Port Chat media messages, product cards, call controls, and sponsored chat ad cards.
8. Add Playwright/mobile screenshot verification for `expo.googer.site`.
