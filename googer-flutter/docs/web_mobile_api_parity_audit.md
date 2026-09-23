# Web To Mobile API Parity Audit

Audit date: 2026-07-25

Source of truth:
- Web frontend: `D:\googer-recovery-code\googernew-main\app`
- Web services: `D:\googer-recovery-code\googernew-main\services`
- Backend routes: `D:\googer-recovery-code\googernew-main\backend\src\routes`
- Flutter mobile API: `D:\googer-recovery-code\googer-flutter\lib\api\api.dart`
- Main mobile home/feed UI: `D:\googer-recovery-code\googer-flutter\lib\screens\home_feed_screen.dart`

This is an analysis-only parity checklist. It does not include code fixes.

## Counts

| Layer | Count | Notes |
|---|---:|---|
| Backend route declarations | 319 | Includes admin, p2p, withdrawal, notifications, feed, etc. |
| Web service call sites | 171 | Calls through `services/*.ts`, not every raw component fetch. |
| Flutter API call sites | 160 | Calls through `lib/api/api.dart`. |

Raw count is not enough for parity: a Flutter method can exist but be missing from UI, use the wrong endpoint, or lack the same request body/response behavior as web.

## Home Feed Web Data Graph

The web home feed composes several data sources:

| Web UI/feature | Web API | Backend route | Flutter status |
|---|---|---|---|
| Current session/profile | `GET /auth/profile` | `auth.js` | Present |
| Googs feed | `GET /googs` | `googs.js` | Present |
| Upload-content feed | `GET /upload-content/public` | `uploadContent.js` | Present |
| Active public ads | `GET /ads/active-public?limit=&offset=&shuffle=` | `ads.js` | Present |
| Upload control settings | `GET /admin/customization/upload-control/public` | `adminCustomization.js` | Present |
| Ad coin settings | `GET /admin/customization/ad-coin-settings/public` | `adminCustomization.js` | Partial: Flutter also calls `/market/ad-coin-settings` |
| Followed users/subscriptions | `GET /auth/user/:id/following` | `auth.js` | Present |
| Subscription status | `GET /auth/user/:id/subscription` | `auth.js` | Present |
| Blocked chat users | `GET /chat/blocked-users` | `chat.js` | Present |
| Notifications | `GET /notifications`, `POST /notifications/read-all` | `notifications.js` | Present |
| Cart count/items | `GET /cart` | `cart.js` | Present |

## Googs Parity

| Feature | Web API | Flutter API | Status |
|---|---|---|---|
| List posts | `GET /googs` | `Api.feed()` | Present |
| Create post | `POST /googs` | `Api.createGoog()` | Present |
| Edit post | `PUT /googs/:id` | `Api.updateGoog()` | Present |
| Delete post | `DELETE /googs/:id` | `Api.deleteGoog()` | Present |
| Like | `POST /googs/:id/like` | `Api.likeGoog()` | Present |
| View | `POST /googs/:id/view` | `Api.markGoogView()` | Present |
| Share | `POST /googs/:id/share` | `Api.shareGoog()` | Present |
| Report | `POST /googs/:id/report` | `Api.reportGoog()` | Present |
| Save/bookmark | `POST /googs/:id/save` | `Api.toggleGoogSave()` | Present |
| Subscribe to Goog author/post | `POST /googs/:id/subscribe` and `GET /googs/:id/subscribe` | `Api.toggleGoogSubscribe()`, `Api.isSubscribedToGoog()` | Present |
| Comments list | `GET /googs/:id/comments` | `Api.googInteractions(id, "comments")` | Present |
| Add comment | `POST /googs/:id/comments` with `{ text, parent_id }` | `Api.postGoogComment()` | Partial: no parent/reply UI |
| Delete comment | `DELETE /googs/comments/:commentId` | `Api.deleteGoogComment()` | Present |
| Report comment | `POST /googs/comments/:commentId/report` | `Api.reportGoogComment()` | Present |
| Likes/shares/views list | `GET /googs/:id/{likes,shares,views}` | `Api.googInteractions()` | Present |
| Public share lookup | `GET /googs/public/:id` | `Api.publicGoog()` | API present; UI wiring needs check |
| Saved googs list/status | `GET /googs/saved`, `/googs/saved/status` | Not clearly wired | Gap unless hidden in other screen |

## Upload Content Parity

| Feature | Web API | Flutter API | Status |
|---|---|---|---|
| Create upload content | `POST /upload-content` multipart | Not fully matched | Gap: multipart creation/progress parity |
| Public approved list | `GET /upload-content/public` | `Api.uploadContents()` | Present |
| Public by user | `GET /upload-content/public?userId=` | `Api.userUploads()` | Present |
| Public reel/share code | `GET /upload-content/public/reel/:shareCode` | `Api.uploadContentByShareCode()` | API present; UI wiring needs check |
| My uploads | `GET /upload-content/my` | `Api.myUploadContents()` | Present |
| Like | `POST /upload-content/:id/like` | `Api.likeUploadContent()` | Present |
| Share | `POST /upload-content/:id/share` | `Api.shareUploadContent()` | Present |
| Repost | `POST /upload-content/:id/repost` | `Api.repostUploadContent()` | Present |
| Remove repost | `DELETE /upload-content/:id/repost` | `Api.removeUploadRepost()` | Present |
| Pin | `POST /upload-content/:id/pin` | `Api.toggleUploadPin()` | Present |
| Report | `POST /upload-content/:id/report` | `Api.reportUploadContent()` | Present |
| Delete | `DELETE /upload-content/:id` | `Api.deleteUploadContent()` | Present |
| Insights | `GET /upload-content/:id/insights?range=` | `Api.uploadContentInsights()` | Present |
| Vault purchase | `POST /upload-content/:id/purchase` | `Api.purchaseUploadContent()` | Present |
| Creator subscription purchase | `POST /upload-content/:id/subscriptions/purchase` | `Api.purchaseUploadCreatorSubscription()` | API present; UI wiring needs check |
| View | `POST /upload-content/:id/view` | `Api.markUploadView()` | Present |
| Comments list | `GET /upload-content/:id/comments` | `Api.uploadInteractions(id, "comments")` | Present |
| Add comment | `POST /upload-content/:id/comments` | `Api.addUploadComment()` | Present, but no reply UI |
| Delete comment | `DELETE /upload-content/comments/:commentId` | `Api.deleteUploadComment()` | Present |
| Like/dislike comment | `POST /upload-content/comments/:id/like/dislike` | Present | Present |
| Report comment | `POST /upload-content/comments/:id/report` | Present | Present |
| Likes/shares/views list | `GET /upload-content/:id/{likes,shares,views}` | `Api.uploadInteractions()` | Present |

## Market, Products, Ads Parity

| Feature | Web API | Flutter API | Status |
|---|---|---|---|
| Product feed/grid | `GET /market/products` | `Api.products()` / `Api.marketProducts()` | Present |
| Market items by user | `GET /market?user_id=` | `Api.userProducts()` | Present |
| Create product | `POST /market/create` multipart | `Api.createProduct()` | Partial: text fields, image multipart gap |
| Product detail | `GET /market/:id` | `Api.productById()` | Present |
| Public product/ad lookup | `GET /market/public/:id`, `/market/product/public/:code`, `/market/code/:code` | `Api.publicMarketAd()`, `Api.publicProductByShareCode()`; `/market/code/:code` still not added | Partial |
| Unified share lookup | `GET /market/share-unified/:shareCode` | `Api.unifiedShareItem()` | API present; UI wiring needs check |
| Update product | `PUT /market/:id` | `Api.updateProduct()` | Present |
| Update status | `PUT /market/:id/status` | `Api.updateProductStatus()` | Present |
| Delete product | `DELETE /market/:id` | `Api.deleteProduct()` | Present |
| Like | `POST /market/:id/like` | Present | Present |
| View | `POST /market/:id/view` | Present | Present |
| Share | `POST /market/:id/share` | Present | Present |
| Impression/click | `POST /market/:id/impression`, `/click` | Present | Present |
| Ad coin collect | `POST /market/collect-coin` | Present | Present |
| Video watch eligible | `POST /market/:id/video-watch-eligible` | Present | Present |
| Comments/list/add/delete/like/dislike/report | `/market/:id/comments`, `/market/comments/:id/*` | Present | Present, but reply UI partial |
| Active public ads | `GET /ads/active-public` | `Api.activeAds()` | Present |
| My ads | `GET /ads/my` | Present | Present |
| Create/update ads | `POST /ads`, `PUT /ads/:adId` multipart | Not fully matched | Gap: multipart media parity |
| Save ads | `POST /ads/:adId/save`, `GET /ads/saves*` | Present | Present |
| Ad analytics | `GET /ads/:adId/analytics` | Not clearly wired | Gap |
| Ad report | `POST /ads/:adId/report` | Present | Present |

## Auth, Profile, Subscribe Parity

| Feature | Web API | Flutter API | Status |
|---|---|---|---|
| Login/register/profile | `/auth/login`, `/auth/register`, `/auth/profile` | Present | Present |
| OTP login/device approval/forgot password | multiple `/auth/login/*`, `/auth/forgot-password/*` | Partial | UI/API coverage partial |
| Public user by id/username | `GET /auth/user/:id`, `/auth/username/:username` | Present | Present |
| Follow status | `GET /auth/user/:id/subscription` | `Api.isSubscribedTo()` present | Present |
| Toggle follow | `POST /auth/user/:id/subscribe` | `Api.toggleUserSubscription()` | Present |
| Wrong mobile endpoint | none | Removed from active helper; `Api.subscriptionStatus()` now uses `/auth/user/:id/subscription` | Fixed |
| Followers/following/views | `/auth/user/:id/{followers,following,views}` | Present | Present |
| Block/report/view user | `/auth/user/:id/{block,report,view}` | Present | Present |
| Update profile | `PUT /auth/update-profile` multipart | Flutter uses fields map | Partial: profile photo upload needs verification |
| Security sessions/change password/self deactivate/delete | multiple `/auth/*` | Present/partial | Needs screen-by-screen check |

## Chat Parity

| Feature | Web API | Flutter API | Status |
|---|---|---|---|
| Conversations | `GET /chat/conversations` | Present | Present |
| Messages | `GET /chat/messages/:participantId` | Present | Present |
| Send message | `POST /chat/messages` | Present | Present |
| Forward/delete messages | `POST /chat/messages`, `DELETE /chat/messages` | API present for delete/forward | UI parity needs check |
| Presence/typing | `/chat/presence`, `/chat/typing` | Present | Present |
| Hide/unhide/delete conversation | `/chat/conversations/*` | Present | Present/partial UI |
| Block/unblock/blocked users | `/chat/block`, `/chat/unblock`, `/chat/blocked-users` | Present | Present |
| Calls | `/chat/calls/*` | API present | UI parity partial |
| Support assignment/product/topup assignment | `/chat/support-assignment`, `/chat/product-status/*`, `/chat/topup-request/*` | Support assignment only | Gap |

## Wallet, Orders, Cart, Subscription Parity

| Feature | Web API | Flutter API | Status |
|---|---|---|---|
| Wallet search/transfer/history/request/respond/cancel | `/wallet/*` | Present | Present |
| Manual payment hold | `POST /wallet/verify-manual-payment-hold` | Not clearly wired | Gap |
| Pay order/profile promote/record promo/refund edit/admin capital | `/wallet/pay-*`, `/wallet/record-promo-ad`, `/wallet/refund-*` | Partial | Several gaps |
| Orders create/bulk/list/status/report/cancel group | `/orders/*` | Present | Present |
| Cart get/add/update/delete/clear | `/cart/*` | Present except clear unclear | Partial |
| Subscription plan subscribe/me/public | `/subscriptions/*`, `/admin/customization/subscription-plans/public` | Present | Present |
| Auto renew/cancel/features/usage/badge | `/subscriptions/*` | Partial | Needs UI wiring check |

## Clear First Fix Batch

These are the safest first code fixes after this audit:

1. Done: restore the old red mobile Subscribe button if product decision is mobile-red, despite current web button being white.
2. Done: fix wrong Flutter endpoint `GET /auth/user/:id/subscription-status`; `Api.subscriptionStatus()` now uses `/auth/user/:id/subscription`.
3. Done: fix Flutter unified share lookup mismatch; `Api.unifiedShareItem()` now uses `GET /market/share-unified/:shareCode`, and reseller link generation is local like web.
4. Done: add missing `GET /googs/:id/subscribe` status method as `Api.isSubscribedToGoog()`.
5. Done: add upload creator subscription purchase helper: `POST /upload-content/:id/subscriptions/purchase`.
6. Partial: add shared-link lookup helpers for `GET /googs/public/:id`, `GET /upload-content/public/reel/:shareCode`, `GET /market/product/public/:shareCode`; UI wiring still needs checking.
7. Next: add/verify multipart parity for create flows: upload content, ad creation/update, product images, profile photo.
8. Next: add reply support (`parent_id` / `parentId`) to Googs, upload content, and market comment UIs where the web supports it.
9. Next: verify all profile-name/avatar taps in product comments, upload comments, Googs interactions, chat, wallet, orders, and notifications.
10. Next: align dedupe/cooldown behavior for likes, views, shares so mobile does not double-count compared with web.

## Notes

- The current web Subscribe component is white/black (`app/components/SubscribeButton.tsx`). The old red Subscribe button is a mobile/legacy design requirement and should be treated as an explicit exception to web UI parity.
- Existing parity docs in this repo are useful but stale in places. For example, they reference `home_tab.dart`, while the active home/feed UI is now `home_feed_screen.dart`.
