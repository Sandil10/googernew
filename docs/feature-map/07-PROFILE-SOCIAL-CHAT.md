# 07 — Profiles, Social Content and Chat

## 1. Profile routes

The same profile is reachable four ways:

| Route | Notes |
| --- | --- |
| `/dashboard/profile` | own profile (204 KB page) |
| `/profile`, `/profile/[user]` | public |
| `/u/[username]` | short link |
| `/[username]` | root-level catch-all |

`app/lib/profileRoute.ts` centralises href construction (`getPublicProfileHref`).
Shared view: `components/profile/PublicProfileView.tsx` (46 KB).
Editing: `components/EditProfileModal.tsx`.

| Endpoint | Purpose |
| --- | --- |
| `GET /auth/user/:id`, `GET /auth/profile` | fetch |
| `PUT /auth/update-profile`, `PUT /auth/update-shipping-address` | edit |
| `GET /auth/check-username`, `GET /auth/username/:username` | availability / lookup |
| `GET /auth/search-users` | search |
| `POST /auth/user/:id/view`, `GET /auth/user/:id/views` | profile views (`profile_views`) |
| `POST /auth/user/:id/subscribe` | follow toggle (`user_subscriptions`) |
| `GET /auth/user/:id/followers`, `/following` | social graph |
| `POST /auth/user/:id/block`, `GET /auth/user/:id/blocked` | blocking (`user_blocks`) |
| `POST /auth/user/:id/report` | moderation (`user_reports`) |
| `GET /auth/user/:id/subscription` | plan badge |

**Rule:** "subscribe" here means **follow**. `user_subscriptions` is the social
graph; `user_plan_subscriptions` is paid plans. Two different tables, similar names.

**Rule:** blocking is enforced client-side in the feed (`isBlockedOwnerItem` filters
posts and uploads out of `homeFeedItems`) — the feed query itself does not join
`user_blocks`.

## 2. Googs (short posts)

Table family: `goog_posts`, `goog_likes`, `goog_comments`, `goog_comment_reports`,
`goog_shares`, `goog_share_logs`, `goog_share_aliases`, `goog_views`,
`goog_subscribes`, `goog_reports`, `saved_googs`.

Backend: `controllers/googController.js` (50 KB) plus a full module at
`modules/feed/goog*` split read / mutation / interaction / engagement.

| Endpoint | Purpose |
| --- | --- |
| `GET /googs` | **list feed posts** — what the Flutter client uses as its post source |
| `POST /googs`, `PUT /googs/:id`, `DELETE /googs/:id` | CRUD |
| `GET /googs/:id`, `GET /googs/public/:id`, `GET /googs/user/:userId` | fetch |
| `POST /googs/:id/like` | like |
| `POST/GET /googs/:id/comments` | comments |
| `DELETE /googs/comments/:commentId` | delete comment |
| `POST /googs/comments/:commentId/{like,dislike,report}` | comment actions |
| `POST /googs/:id/{share,view,save,report,subscribe}` | interactions |
| `GET /googs/:id/{likes,shares,views}` | interaction lists |
| `GET /googs/saved`, `/saved/status` | saved posts |
| `PATCH /googs/:id/admin-toggle` | admin visibility |

**Rule:** comments support like **and dislike** and per-comment reporting — the
comment model is richer than the post model.

UI: `components/googs/GoogCard.tsx`, detail page `/dashboard/googs/[id]`,
interactions via `components/InteractionBottomSheet.tsx`.

## 3. Upload content

The largest single backend controller: `uploadContentController.js` (173 KB).
Frontend: `UploadContentFeedCard.tsx` (72 KB), `UploadContentWatchModal.tsx`,
`UploadContentMedia.tsx`, `UploadContentInsightsModal.tsx`.

Tables (all runtime-created): `upload_contents`, `upload_content_likes`,
`upload_content_comments`, `upload_content_comment_likes`,
`upload_content_comment_dislikes`, `upload_content_comment_reports`,
`upload_content_shares`, `upload_content_views`, `upload_content_reposts`,
`upload_content_purchases`, `upload_content_subscriptions`, `upload_content_reports`.

Three concepts run through this module:

1. **Moderation status** — `Pending` / `Approved` / `Rejected`. The home feed only
   shows `Approved` (`page.tsx:1459`).
2. **Visibility** — includes `private`, which is filtered out of the Subscriptions
   feed view.
3. **Monetisation** — content can be **paid**. `price` appears ~94 times in the
   controller; purchases land in `upload_content_purchases` and per-creator access
   in `upload_content_subscriptions`.

Two content flavours are referenced throughout the feed code: **flash** uploads and
**vault** uploads. Both count toward the Profile Promote cadence in the home feed.

| Endpoint | Purpose |
| --- | --- |
| `GET /upload-content/public` | **public feed list** — the home feed's upload source |
| `GET /upload-content/public/reel/:shareCode` | share-link resolution |
| `POST /upload-content` | create |
| `DELETE /upload-content/:contentId` | delete |
| `GET /upload-content/my` | own list |
| `POST /upload-content/:contentId/like` | like |
| `POST/DELETE /upload-content/:contentId/repost` | repost / undo |
| `POST /upload-content/:contentId/pin` | pin |
| `POST /upload-content/:contentId/purchase` | buy content |
| `POST /upload-content/:contentId/subscriptions/purchase` | buy creator access |
| `POST /upload-content/:contentId/comments` | comment |
| `DELETE /upload-content/comments/:commentId` | delete comment |
| `POST /upload-content/comments/:commentId/{like,dislike,report}` | comment actions |
| `GET /upload-content/:contentId/{likes,comments,shares,views}` | lists |
| `POST /upload-content/:contentId/{share,view,report}` | interactions |
| `GET /upload-content/:contentId/insights` | creator analytics |
| `GET /upload-content/admin/all`, `PATCH /upload-content/admin/:contentId/status` | moderation |

**Rule:** reposts carry attribution — the feed builds keys from
`reposted_by_username` / `reposted_by_full_name` / `reposted_at`
(`app/dashboard/page.tsx:733`), so the same content reposted by two users is two
distinct feed rows.

Upload limits are admin-controlled: `upload_control_settings`,
`GET /admin/customization/upload-control/public`, `PUT .../upload-control`,
`controllers/uploadControlController.js`.

## 4. Chat

`app/dashboard/chats/page.tsx` (387 KB) — the second-largest file in the app.
Routes `/chats`, `/chats/[username]`, `/dashboard/chats`.
Backend: `controllers/chatController.js` (123 KB), `realtime/chatSocket.js`.
Tables: `chat_messages`, `chat_presence`, `chat_call_sessions`, `chat_call_signals`,
`product_status_chat_assignments`, `topup_request_chat_assignments`.

### Messaging

| Endpoint | Purpose |
| --- | --- |
| `GET /chat/conversations` | list |
| `GET /chat/messages/:participantId` | thread |
| `POST /chat/messages` | send |
| `DELETE /chat/messages` | delete |
| `POST /chat/conversations/hide`, `/unhide` | hide without deleting |
| `DELETE /chat/conversations/:participantId` | delete thread |
| `POST /chat/presence` | heartbeat (`components/LivePresenceHeartbeat.tsx`) |
| `POST /chat/typing`, `GET /chat/typing/:participantId` | typing indicator |
| `POST /chat/block`, `/unblock`, `GET /chat/blocked-users` | chat-level blocking |

Rich content: `components/chat/ChatRichText.tsx`, sticker packs
(`stickerPacks.ts`, `GET /stickers/trending`, `GET /stickers/search`), and
`ChatAdBox.tsx` (30 KB) which embeds an ad/product card inside a conversation.

### Support routing

| Endpoint | Purpose |
| --- | --- |
| `GET /chat/support-assignment` | which staff member handles this user |
| `GET/PUT /chat/product-status/:productStatusId/assignment` | order-issue thread routing |
| `GET/PUT /chat/topup-request/:topupRequestId/assignment` | top-up review thread routing |
| `GET /admin/customization/chat-assignment`, `PUT ...` | admin config |

**Rule:** support conversations are **assigned**, and the assignment is a first-class
record — a product-status dispute and a top-up review each get a routed thread.

### Calls (WebRTC)

| Endpoint | Purpose |
| --- | --- |
| `POST /chat/calls/start` | initiate |
| `GET /chat/calls/incoming` | poll for inbound |
| `POST /chat/calls/:callId/{accept,reject,complete}` | lifecycle |
| `POST /chat/calls/:callId/signal`, `GET /chat/calls/:callId/signals` | SDP/ICE exchange |
| `GET /chat/calls/history/:participantId`, `/summaries`, `/:callId` | history |

**Rule:** signalling is available over **both** the socket and plain HTTP. The HTTP
path (`chat_call_signals` + polling) is the fallback when the socket drops, which is
why signals are persisted rather than only relayed.

Global inbound UI: `components/chat/GlobalIncomingCallOverlay.tsx` — mounted app-wide
so a call can arrive on any page.

## 5. Notifications

| Endpoint | Purpose |
| --- | --- |
| `GET /notifications` | list |
| `POST /notifications` | create |
| `POST /notifications/:id/read`, `POST /notifications/read-all` | read state |

Table `user_notifications`. Topbar integration: `app/lib/topbarNotifications.ts`,
`app/lib/badgeCache.ts`, `components/Topbar.tsx` (48 KB).

## 6. Sharing

`app/lib/shareLinks.ts` (8 KB) + `components/ShareModal.tsx` (37 KB).

Share landing routes:

| Route | Target |
| --- | --- |
| `/share/[shareCode]` , `/share/[shareCode]/[resellerRef]` | generic |
| `/share/product/[shareCode]` (+ resellerRef) | product |
| `/share/goog/[postId]` | goog |
| `/share/ad/[adId]` | ad |
| `/product/[shareCode]` (+ resellerRef) | product |
| `/reel/[shareCode]` (+ resellerRef) | reel |

Resolution: `GET /market/share-unified/:shareCode`, `GET /market/product/:shareCode`,
`GET /googs/public/:id`. Alias tables: `product_share_aliases`, `goog_share_aliases`.

**Rule:** share codes are 8-character alphanumerics. When a row lacks one,
`buildShortShareCode(prefix, id, 8)` derives a deterministic code from a 32-bit hash
(`feedController.js:294`) — so a shareable link exists even for rows created before
codes were introduced.

**Rule:** the optional `[resellerRef]` segment is what carries resell attribution
into the cart. See `06-WALLET-AND-PAYMENTS.md` §7.
