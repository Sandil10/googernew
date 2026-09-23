# Googer Home Page — Web → Flutter Parity Playbook (A→Z)

Source of truth for the **home page only**, analyzed feature-by-feature from the web app
`googernew-main/app/dashboard/page.tsx` (4,189 lines) + `layout.tsx` (topbar/create modals).
Each item says: **what the web does** (with file:line), **Flutter status today**, and the
**exact steps** to reach 100% parity. Statuses: ✅ done · 🟡 partial · ❌ missing.

> Overall app map lives in `FEATURE_MAP.md`. This file is the deep-dive for the home page.
> Flutter home feed lives in `lib/screens/home_tab.dart` (LiveHomeTab).

---

## A. Feed data loading
**Web:** loads three sources in parallel — googs `GET /googs` (`loadGoogPosts` page.tsx:1715),
upload contents `GET /upload-content/public` (`loadUploadContents` :1595), active ads
`GET /ads/active-public` (`loadAds` :1561). Refresh poll ~5s, signature-checked so no flicker.
**Flutter:** ✅ same three calls in `home_tab.dart` (`Api.fetchGoogs`, `Api.fetchPublicUploads`,
`Api.fetchActiveAds`), 15s silent poll with signature check.
**Steps:** none. (Optional: drop poll to 5s to exactly match web.)

## B. Feed mixing algorithm
**Web:** seeded shuffle (`shuffleItemsWithSeed` :454, persistent client seed :151),
organic mix googs+uploads (`mixHomeOrganicItems` :725), sponsored ads: first after 1 organic
card then every 4 (`interleaveHomeOrganicItemsWithAds` :544), profile-promote carousels:
first after 3 organic then every 8 (`insertHomeProfilePromoteRows` :676), ad dedupe :774,
recently-shown ad memory in localStorage :462-495.
**Flutter:** ✅ full port in `home_tab.dart` (same offsets 1/4 and 3/8, seeded shuffle).
**Steps:** none.

## C. Goog card (text post)
**Web:** author header, colored background, letter-limit by plan, link preview, verified badge.
**Flutter:** ✅ `widgets/goog_card.dart` + `VerifiedBadge` (scalloped seal, `kit.dart`).
**Steps:** none.

## D. Like / view / counts
**Web:** optimistic heart with 1.2s throttle (`toggleWriteLike` :1837, throttle :1824),
login-gated; views via IntersectionObserver → `POST /googs/{id}/view`.
**Flutter:** ✅ optimistic like + login gate; view logged on card build.
**Steps:** none. (Optional: log view only when card is ≥50% visible using
`VisibilityDetector`-style check instead of on-build.)

## E. Interaction sheet (likes/comments/shares/views lists)
**Web:** `openWritePostSheet` :2315, refresh :2358 — tabs for likes, comments, shares, views.
**Flutter:** ✅ `widgets/interaction_sheet.dart`.
**Steps:** none.

## F. Comments
**Web:** add comment + emoji quick row; comment report/delete(own). Comment like/dislike
buttons exist but **have no backend route** (dead on web too).
**Flutter:** ✅ add/report/delete wired; like/dislike intentionally not wired (no route).
**Steps:** none — do NOT wire comment like/dislike until backend adds the route.

## G. Share sheet
**Web:** WhatsApp / Facebook / Instagram / X / Telegram / copy-link buttons, each opens the
platform share URL, then logs `POST /googs/{id}/share` (`handleGoogCopyLink` :2680).
**Flutter:** 🟡 `widgets/share_sheet.dart` copies the link + logs share; per-platform buttons
open nothing native.
**Steps:**
1. On Flutter **web** builds, open the same platform share URLs the web app uses
   (`https://wa.me/?text=…`, `https://t.me/share/url?…`, etc.) via `openLink()`
   (`lib/util/open_link.dart`) — this is an exact-parity fix with no new dependency.
2. (Native Android/iOS later) add `share_plus` and call `Share.share(url)`.

## H. ⋮ (two-dot) menu on goog cards
**Web:** Not Interested (hide 24h, per-user, localStorage) / Share / Report; own posts get
Edit + Delete (`togglePostOptionsMenu` :2383, report modal :2415-2447).
**Flutter:** ✅ all present (`goog_menu.dart`; own-post edit/delete wired).
🟡 Hide is session-only — lost after restart.
**Steps:**
1. In `home_tab.dart` persist hidden ids via `lib/util/storage.dart` as JSON
   `{id: expiryMillis}` under key `googer-hidden-feed-items-{userId}`.
2. On feed build, drop entries whose expiry passed (web: 24h —
   `hideFeedItemFor24Hours` in page.tsx:2216-2219 for uploads, same helper for googs/ads).
3. Use one helper for all three item types (goog / upload / ad).

## I. Save / bookmark + Subscribe author
**Web:** `POST /googs/{id}/save` (plan-limited), `POST /googs/{id}/subscribe`.
**Flutter:** ✅ bookmark on card + ⋮ menu; subscribe in ⋮ menu.
**Steps:** none.

## J. Write a Goog composer
**Web:** color palette, letter limit by plan, live link preview, usage-limit → plans modal
(layout.tsx modal).
**Flutter:** ✅ posts real googs with color. 🟡 link preview + plan-limit modal not shown.
**Steps:**
1. Port the letter-limit-by-plan check (read plan from `Api.currentUser`, same limits as web).
2. When limit reached, open the plans screen (already exists in wallet screens).

## K. Upload-content card (WATCH NOW)
**Web:** blur-locked media, coins unlock (`POST /upload-content/{id}/purchase`), WATCH NOW
button, vault quick-unlock memory (`VAULT_QUICK_UNLOCK_KEY` :59).
**Flutter:** ✅ `widgets/upload_content_card.dart` — blur lock, WATCH NOW, purchase.
**Steps:** none for core. Optional: remember unlock choice like web key :59.

## L. Upload-content actions (two-dot sheet)
**Web:** like, repost to profile (`handleUploadRepost` :2122), **remove repost** :2183,
**pin** (`togglePin` :2097), **insights** (7d prefetch :2090), **Not Interested (24h)** :2216,
report (modal :2221-2247), edit own (:2248), delete own (:2602).
**Flutter:** ✅ like/share/view, repost (vault+flash), report. ❌ pin, insights, remove-repost,
Not-Interested, edit own, delete own.
**Steps:**
1. `api.dart`: add `togglePinUpload(id)` → `POST /upload-content/{id}/pin`,
   `removeRepost(id)` → `DELETE /upload-content/{id}/repost`,
   `fetchUploadInsights(id, range)` → `GET /upload-content/{id}/insights?range=7d`
   (verify exact routes in `googernew-main/backend/src/routes/uploadContent.js` first).
2. `upload_content_card.dart`: add sheet entries — Pin/Unpin (owner only), Remove repost
   (only when `user_reposted`), Not interested, Edit (owner), Delete (owner).
3. Wire Not-Interested to the shared 24h hide helper from item H.
4. Insights: simple bottom sheet with views/likes/earnings numbers from step-1 endpoint.

## M. Sponsored ad card (PromotedAdCard)
**Web:** header, media, CTA row Visit (`getSponsoredCtaHref` :311) / Call (:326) / WhatsApp,
hide/report menu, icon counts, impression+view logging (:2854 openSponsoredLink).
**Flutter:** ✅ full card in `home_tab.dart` incl. CTA row + impression/view logging.
**Steps:** none for the card itself — see N for the media gap.

## N. Sponsored ad media: YouTube / social embeds  ❌ biggest visible gap
**Web:** ad media can be an image, a video, or an **embedded player**: YouTube thumbnail
(`getYouTubeThumbnailUrl` :186) → tap → second-view modal with YouTube/social iframe
(`getYouTubeEmbedUrl` :223, `getSponsoredSocialEmbedUrl` :249, kind resolver
`getSponsoredSecondViewKind` :301, modal state `adPreviewModal` :932).
**Flutter:** ❌ shows the static image only; YouTube/social-link ads show a broken/empty box.
**Steps:**
1. Port `getYouTubeThumbnailUrl` (pure string logic — take video id, build
   `https://img.youtube.com/vi/{id}/hqdefault.jpg`) into `home_tab.dart`.
2. Port `getSponsoredSecondViewKind` (image | video | embed).
3. On tap: image → full-screen viewer; video → existing `web_video.dart` player;
   embed (web build) → `IFrameElement` via the same conditional-import pattern as
   `lib/util/web_video_web.dart`; on non-web fallback → `openLink()` to the URL.

## O. Product Promote ad card
**Web:** SharedProductCard — avatar · green "Ad" tag · Subscribe · two-dot menu, square image
+ discount badge, R price + cart, tap → product quick-view (`openProductAdInShopSecondView`
:2954), add-to-bag :3027.
**Flutter:** ✅ `ProductPromoteAdCard` in `home_tab.dart` incl. quick-view popup + cart.
**Steps:** none.

## P. Ad coin (Rupieer)
**Web:** settings `loadAdCoinSettings` :2552, coin button after like (`handleAdCoinClick`
:2835) → `POST /market/collect-coin` → toast, like-lock after collect.
**Flutter:** ✅ full flow incl. white "Coin collected" toast.
**Steps:** none.

## Q. Profile Promote carousel
**Web:** after 3 organic cards then every 8 — header + 3-item product grid
(`/market?user_id`) + View Profile; can also open a promoted upload content
(`openProfilePromoteUploadContent` :2966).
**Flutter:** ✅ web-parity compact card. 🟡 promoted-upload open path not handled.
**Steps:**
1. When the promote ad points to an upload content (web :2966 checks `content` payload),
   open the existing upload-content viewer instead of the profile.

## R. "Promote again" on own expired ads
**Web:** `handlePromoteAgain` :1255 — own expired ad card shows a Promote-again button that
reopens the ad-campaign modal pre-filled.
**Flutter:** ❌.
**Steps:** 1. Detect own+expired ads in feed; 2. show button → push existing Ad Campaign
screen (`campaign_screens.dart`) pre-filled from the ad payload.

## S. Search + live suggestions
**Web:** "Search Googs" input (:3128) — client-side filter over googs/uploads/ads
(`hasHomeSearchMatch` :620, `matchesHomeAdSearch` :640, `matchesHomeUploadSearch` :659)
+ live profile-suggestion dropdown.
**Flutter:** ✅ same filter + suggestions dropdown.
**Steps:** none.

## T. Category chips
**Web:** 27 chips (`HOME_GOOG_CATEGORIES` :62) — All / Subscriptions / Comedy / … ;
text+hashtag matching (`postMatchesGoogCategory` :748, uploads :756); Subscriptions chip =
posts from followed authors (`loadFollowedUsers` :1037); page size 10 mobile / 18 desktop (:60-61).
**Flutter:** ✅ all 27 chips + matching + Subscriptions-follows logic.
**Steps:** none.

## U. Infinite scroll + skeleton
**Web:** 6 initial, +3 per batch, bottom spinner; shimmer skeleton on first load.
**Flutter:** ✅ same batches, `GoogerSpinner`, shimmer skeleton matching card geometry.
**Steps:** none.

## V. Pull-to-refresh + silent background refresh
**Web:** 5s poll, signature-checked (no flicker).
**Flutter:** ✅ pull-to-refresh + 15s signature-checked poll.
**Steps:** none (see A for optional 5s).

## W. Daily Trending Posts sidebar
**Web:** desktop-only right sidebar (:3558) — trending list, tap stores
`googer-selected-trending-post` and navigates (:2847). **Not rendered on web mobile.**
**Flutter:** ❌ — intentionally skipped: the phone-width web app doesn't show it either.
**Steps:** none (decision: skip; matches web mobile). If ever wanted: simple horizontal
strip fed by the same `/googs` list sorted by engagement.

## X. Blocked users / hidden items sync
**Web:** blocked users filter (`loadBlockedUsers` :1013), subscription-updated +
blocked-users events re-filter the feed live (:1023-1068, :1087).
**Flutter:** ✅ blocked users excluded; follow state refreshes on action.
**Steps:** none.

## Y. Login-required gating
**Web:** every protected action (like, comment, save, subscribe, coin) opens a
login-required prompt.
**Flutter:** ✅ same gating; session now persists across refreshes (`Api.init()` restores
token from localStorage).
**Steps:** none.

## Z. Topbar (part of home UX, from `layout.tsx`)
**Web:** logo, search, notifications bell (list + mark-all-read), cart sidebar, create
menu (Write Goog / Add Product / Ad Campaign / Upload Content), profile menu.
**Flutter:** ✅ notifications real; ✅ Write Goog; 🟡 Add Product / Ad Campaign /
Upload Content screens exist but submission needs **multipart upload** (the single biggest
non-home blocker — tracked in FEATURE_MAP §7).
**Steps (multipart, applies to all create flows):**
1. `api.dart`: add a `MultipartRequest` helper (`http.MultipartRequest` already available
   via the `http` package) with the auth bearer header.
2. Wire Add Product → `POST /market/create`, Upload Content → `POST /upload-content`,
   Ad Campaign media → its `/ads` route (check field names in the backend routes files).
3. On Flutter web use `file_picker`/`image_picker_for_web` bytes → `MultipartFile.fromBytes`.

---

## Fix log
- **2026-07-19 — "Greek-like words" bug FIXED.** Root cause: 4 files
  (`auth_screens.dart`, `home_tab.dart`, `profile_screens.dart`, `social_screens.dart`)
  had double-encoded UTF-8 (cp1252 mojibake) — `—` showed as `â€”`, `…` as `â€¦`, `•` as
  `â€¢` in the running app (e.g. "Messageâ€¦", "New to Googer? â€”"). Repaired by a strict
  cp1252→UTF-8 round-trip on scratch copies, verified with `flutter analyze` (0 errors),
  then copied into `lib/`. If it ever reappears: the writer saved UTF-8 text through a
  cp1252 decode — always write Dart files as UTF-8.

## Recommended order of remaining work
1. **N** — sponsored YouTube/social embed second view (visible broken ads today)
2. **L** — upload-content pin / insights / remove-repost / edit / delete / not-interested
3. **H** — 24h persistent hide (shared helper, used by H + L)
4. **G** — real platform share links on web builds
5. **Z** — multipart uploads (unblocks all three create flows)
6. **J, Q, R** — composer plan-limit, promote-upload open path, promote-again
