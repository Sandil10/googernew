# Googer Web App — Complete Feature & Backend Map (A→Z)

Source analysis of `googernew-main` (Next.js frontend + Express backend on :5000 + PostgreSQL),
used as the parity checklist for the Flutter app. Status column: ✅ live in Flutter · 🟡 UI present,
endpoint not wired · ❌ not built yet.

## Architecture
- **Frontend** Next.js 16 (React 19), pages under `app/dashboard/*`, aliased to `/home /shop /wallet /chats`
- **Backend** Express `:5000`, routes `/api/{auth,googs,market,chat,wallet,upload-content,ads,orders,subscriptions,verification,categories,cart,coin-requests,p2p-*,withdrawals,admin}`
- **DB** PostgreSQL (wallet balances, googs, products, chats, subscriptions…)
- **Realtime** socket.io on the same backend (chat presence/typing/calls)
- **Media** `/uploads/*` (frontend) + Cloudinary; QR via api.qrserver.com
- **Tunnel** cloudflared → googer.site (`/api/*`→5000, rest→3000)

## 1. Home feed (`dashboard/page.tsx`)
> Deep-dive with per-feature steps: see `HOME_PAGE_PARITY.md` (A→Z playbook, 2026-07-19).
| Feature | Backend | Flutter |
|---|---|---|
| Feed of googs (algorithmic order, expansion stages `home_expansion_*`) | GET `/googs` | ✅ |
| Mixed feed: googs + upload contents + promoted ads (seeded shuffle; 1st ad after 1 organic then every 4) | GET `/upload-content/public`, GET `/ads/active-public` | ✅ full web algorithm ported (`home_tab.dart`) |
| Promoted ad card: header, media, CTA (Visit/Call/WhatsApp), hide/report menu, icon counts (no summary line) | `/market/{ad-N}/like·view·impression·share·comments`, `/ads/{id}/report` | ✅ |
| Product Promote ad card (web SharedProductCard): avatar · green "Ad" tag · Subscribe · two-dot menu, square image + discount badge, R price + cart, icon counts, tap → product quick-view popup | same + `/market?user_id` | ✅ (`ProductPromoteAdCard` in `home_tab.dart`) |
| Ad coin: Rupieer button appears after liking a promote ad → POST collect → white "Coin collected" toast, like-lock after collect | POST `/market/collect-coin` | ✅ |
| Profile Promote carousels (after 3 organic cards, then every 8) — web card: header + 3-item product grid + View Profile, no "Sponsored" labels | from `/ads/active-public` profile ads, `/market?user_id` | ✅ |
| Ad impression + view logging (web AdImpressionTrigger) | POST `/market/{ad-N}/impression·view` | ✅ once per card appearance |
| Search Googs + live profile suggestions dropdown | client-side filter | ✅ web-exact: draft drives a 6-row deduped profile dropdown (tap → profile), only a **submitted** query filters the feed; clear (✕) resets both |
| Category chips — full 27-list (All/Subscriptions/Comedy/…): text+hashtag matching, Subscriptions = followed authors | client-side, GET `/auth/user/{id}/following` | ✅ |
| Infinite scroll batches (6 initial, +3) + bottom buffering spinner | client-side | ✅ |
| Shimmer skeleton first load (RN/FB-style moving gradient, GoogCard geometry) | — | ✅ |
| Pull-to-refresh + silent background refresh (signature-checked, flicker-free) | 15s poll (web: 5s) | ✅ |
| Like goog (heart, optimistic, login-gated) | POST `/googs/{id}/like` | ✅ |
| View counting (IntersectionObserver) | POST `/googs/{id}/view` | ✅ (on card build) |
| Interaction sheet: likes/comments/shares/views lists | GET `/googs/{id}/{likes,comments,shares,views}` | ✅ |
| Add comment (+ emoji quick row) | POST `/googs/{id}/comments` | ✅ |
| Comment like/dislike/report/delete | POST `/googs/comments/{id}/…` | ✅ report + delete (own) wired; like/dislike have no backend route |
| Share sheet (WhatsApp/FB/IG/X/Telegram/copy) + log share | POST `/googs/{id}/share` | ✅ opens the same platform share URLs as web (wa.me/sharer/tweet/t.me); IG copies w/ hint like web |
| ⋮ menu — **per-card-type, matching the web 1:1** (2026-07-22) | see below | ✅ |
| · Goog: Not Interested · Share · Report · Edit · Delete | PUT/DELETE `/googs/{id}`, `/googs/{id}/report` | ✅ all five (Edit dialog added) |
| · Upload content: Insights · Pin/Unpin · Edit · Delete · Share · Promote · Not Interested · Report | POST `/upload-content/{id}/pin`, DELETE `/upload-content/{id}` | ✅ except **Edit** — backend has no `PUT /upload-content/{id}` (create is multipart-only) |
| · Photo & Video ad: Not Interested · Share Link · Promote Again · Delete Ad · Report | `/ads/{id}/report` | ✅ except **Delete Ad** — `ads.js` exposes no DELETE route |
| · Product Promote ad: Share Link · Promote Again · Edit · Delete · Report · Not Interested | `/ads/{id}/report` | ✅ except Edit/Delete (no backend route) |
| · Profile Promote: **no two-dot menu at all** | — | ✅ dots removed to match web |
| Category strip hides on scroll-down, returns on scroll-up | — | ✅ direction-based (`ScrollDirection`), lives outside the list so toggling never shifts scroll offset |
| Goog save/bookmark (limit by plan) | POST `/googs/{id}/save` | ✅ bookmark button on card + ⋮ menu |
| Subscribe to goog author | POST `/googs/{id}/subscribe` | ✅ in ⋮ menu |
| Write a Goog (color palette, letter limit by plan, link preview) | POST `/googs` | ✅ posts real googs with color |
| Edit/delete own goog | PUT/DELETE `/googs/{id}` | ✅ own posts get Edit/Delete in ⋮ menu |
| Upload-content card: WATCH NOW, coins unlock, blur-locked media | POST `/upload-content/{id}/purchase` | ✅ |
| Upload-content like/repost/pin/report/insights | POST `/upload-content/{id}/…` | ✅ like/share/view; ✅ vault + flash repost; vault-only resell attribution; ✅ pin/unpin + delete + insights |
| Trending strip (desktop-only sidebar on web), ad expiry warning, subscription expiry warning | various | ❌ (trending is not shown on web mobile either) |

## 2. Shop (`dashboard/shop/page.tsx`, 7.9k lines)
> Full A→Z rebuild 2026-07-22 — `lib/screens/shop_feed_screen.dart` (was a 192-line
> placeholder, now the live marketplace). Works on raw product maps, matching the web's
> `product: any` shape, so `variants`/`shipping_info`/`commission_info` parse identically.
| Feature | Backend | Flutter |
|---|---|---|
| Product grid (feed-scored: relevance/engagement/freshness) | GET `/market/products` | ✅ paged 20/offset, infinite scroll + pull-to-refresh |
| Search + category tree + country filter + sort/algorithm | GET `/categories/tree` | ✅ debounced search, chips, full tree drawer, filters sheet (algorithm/sort/country) |
| Tabs: Market · My Listings · My Orders (+ order badges) | `/orders/badge-counts` | ✅ |
| Product box: like/views/comments/share counts, discount badge, colour dots, two-dot menu | POST `/market/{id}/like`, GET `/market/{id}/…` | ✅ (web SharedProductCard layout) |
| Product quick-view popup: media rail, colors, sizes, qty, delivery, warranty, ships-to | GET `/market/{id}` | ✅ |
| Product comments thread (like/dislike/report/delete) | `/market/{id}/comments`, `/market/comments/{id}/…` | ✅ all four wired |
| Likes/views/shares interaction lists | GET `/market/{id}/{likes,views,shares}` | ✅ tabbed sheet |
| Add product (text/variant fields) | POST `/market/create` | ✅ form wired; 🟡 image upload still needs multipart |
| Buy → order flow, buyer/seller orders, status updates, badges | `/orders/create`, `/orders/create-bulk`, `/orders/{buyer,seller}`, `/orders/{id}/status` | ✅ Buy Now + cart checkout + seller process/ship/deliver + buyer received |
| Cart | `/cart`, `/cart/items/{id}` | ✅ live (add/qty/remove/checkout → create-bulk) |
| Reseller links & commission | `/market/share-unified` | ✅ resell link in menu (falls back to share page) |
| Seller subscribe/follow | POST `/auth/user/{id}/subscribe` | ✅ quick-view Subscribe |
| Report product / report order dispute | `/market/{id}/report`, `/orders/{id}/report` | ✅ reason + detail sheet |
| Share sheet (WhatsApp/FB/X/Telegram/copy) | `/market/{id}/share` | ✅ |
| Sponsored product-promote cards interleaved in grid | `/ads/active-public` | ✅ (1 after first organic, then every 6) |
| Ad coin settings/collect coin on ads | `/market/collect-coin` | ✅ home-feed promote ads (`Api.collectAdCoin`) |
| Profile-promote carousels + media-ad cards inside the shop grid | `/ads/active-public` | ❌ (home feed only) |

_Shop endpoint probe 2026-07-22: `/market/products` returns `{success,data,pagination{nextOffset,hasMore}}`;
`/market/{id}` returns variants/shipping_info/warranty_info/return_policy/commission_info;
comments/likes/views/shares all 200; orders + cart return 401 unauthenticated (routes correct).
Note: the list payload carries no `user_liked`/`profile_picture`, so grid cards start unliked and
show initial-letter avatars until the detail call loads._

## 3. Chats (`dashboard/chats/page.tsx`, 6.2k lines)
| Feature | Backend | Flutter |
|---|---|---|
| Conversations list (unread, presence) | GET `/chat/conversations` | ✅ |
| Messages thread + mark seen | GET `/chat/messages/{participantId}?markSeen=1` | ✅ |
| Send text | POST `/chat/messages` {receiverId,type:'text',text} | ✅ |
| Send image/video/sticker/voice/voice_tts | same, type variants + upload | ❌ |
| Reply-to, forward, delete (me/everyone) | `/chat/messages` DELETE/PUT | ❌ |
| Typing indicator + presence heartbeat | sendTyping/getTyping, updatePresence (socket.io) | ✅ typing… label (4s poll) + presence on open/close |
| Audio/video calls (start/accept/reject/complete, history) | chatService.*Call | ❌ |
| Block/unblock users | POST `/chat/block…` | ✅ chat ⋮ menu |
| Delete/unhide conversation | chatService | ✅ delete via chat ⋮ menu; unhide ❌ |
| Support flows: topup-request + product-status assignments in chat | getTopupRequestAssignment… | ❌ |

## 4. Profile (`dashboard/profile/page.tsx`)
| Feature | Backend | Flutter |
|---|---|---|
| Own + public profile, stats | GET `/auth/user/{id}` / username | ✅ real user + live goog/follower/following counts |
| Followers/following lists | GET `/auth/user/{id}/followers…` | ✅ tap stats → bottom-sheet lists |
| Profile views logging + list | `/auth/user/{id}/view(s)` | ✅ logs visits; views list on own profile |
| Tabs: googs/products/uploads/saved (per-user content) | getUserPosts, getItems, getPublicApprovedByUser | ✅ googs tab per-user (`/googs/user/{id}`); products/uploads/saved ❌ |
| Subscribe/follow user, verified badge by plan | toggleSubscription, getBadgeForUser | ✅ follow/subscribe wired w/ optimistic update; badge tier ❌ |
| Block user, edit profile, self-deactivate/delete | authService | ✅ block/report sheet, edit profile saves (name/username/bio/country/phone + live username check), deactivate in Settings; self-delete UI ❌ |

## 5. Wallet (all `dashboard/wallet/*` + wallet-pay)
| Feature | Backend | Flutter |
|---|---|---|
| Balance + Googer ID + referral link + wallet QR | GET `/auth/profile` | ✅ |
| Transaction history + cancel pending | GET `/wallet/history`, `/wallet/cancel` | ✅ list (wallet + transactions screens) + cancel on pending outgoing |
| Direct transfer (user search → confirm) | GET `/wallet/search-users?query=`, POST `/wallet/transfer` {receiverId,amount,note,commissionPercentage} | ✅ |
| Request money + respond to requests | `/wallet/request`, `/wallet/respond`, `/wallet/pending-requests` | ✅ Send/Request toggle in Googer Pay; accept/reject cards on wallet home |
| Topup: bank slip / manual payment verify | `/wallet/verify-manual-payment-hold` + admin chat flow | 🟡 UI only |
| Withdrawals (accounts, fee, admin approval) | `/withdrawals/*` | 🟡 UI only |
| Subscription plans (public plans, subscribe, auto-renew) | `/subscription-plans`, `/subscriptions/*` | ✅ real plans + current plan + subscribe/switch; auto-renew toggle ❌ |
| ID verification (docs upload, status) | `/verification/*` | 🟡 UI only |
| Ad center (my ads, update/boost) | `/ads/*` | 🟡 demo list |
| Coins management / P2P sell ads / coin requests | `/p2p-sell-ads`, `/coin-requests` | 🟡 UI only |
| Pay order via wallet | `/wallet/pay-order` | ❌ |

## 6. Settings & security (`dashboard/settings` + `settings/*`)
change password (verify old), username availability check, update profile, auth sessions
list/revoke/logout-others, trusted devices + location map, security alerts, passkeys,
two-factor (OTP request/verify, delivery channel), change login email (OTP), forgot
password (OTP), self-deactivate/delete. → Flutter: ✅ change password, ✅ username check
(edit profile), ✅ update profile, ✅ sessions list/revoke/logout-others (Trusted Devices),
✅ self-deactivate; 🟡 two-factor/passkeys/change-email/forgot-password still UI-only (OTP flows).

## 7. Create flows (layout modals)
Write Goog (usage limit → plans modal), Add Product (limit → plans modal), Ad Campaign
(5 types, drafts in localStorage, budget/audience/duration), Upload Content (vault/flash,
unlock price, subscription packages). → Flutter: ✅ Write Goog posts for real; Add Product /
Ad Campaign / Upload Content UIs exist, submissions 🟡 (need multipart upload).

## 8. Cross-cutting
Login/register (+ referral codes, device approval, suspension redirect), JWT bearer auth,
login-required prompts on protected actions, plans/usage gating everywhere, topbar
notifications (✅ real list + mark-all-read), cart sidebar, presence heartbeat (✅ in chat),
socket.io realtime, media URL normalization, PDF export (transactions), share pages `/share/{code}`.

_Last parity pass: 2026-07-15 — all list/detail/interaction endpoints above wired natively
in `lib/api/api.dart` (~45 endpoints); remaining gaps are media-upload flows (multipart),
calls, orders/cart server-side, and OTP security flows._
