# Googer Mobile — Web Parity Audit

Compares the Next.js web app (`googernew-main/app`) against the Flutter mobile
app (`googer-flutter/lib`). Both talk to the **same** Express backend
(`googernew-main/backend`) and the same database — nothing here proposes
changing either.

Audited: 28 July 2026.

Legend — **Done** = built and wired to the backend · **Partial** = screen exists
but features or wiring are missing · **Missing** = no mobile equivalent.

---

## 1. Headline numbers

| | Web | Mobile |
|---|---|---|
| Screens / routes | 84 route files (≈50 unique, rest are share/deep-link variants) | 44 screens |
| Backend route groups used | 24 | 18 |
| Backend endpoints defined | ~334 | ~192 called |

Mobile covers roughly **75–80%** of the web surface. The gap is concentrated in
admin tooling, wallet sub-flows and account-security pages — not in the main
consumer journey.

---

## 2. Core consumer journey

| Feature | Web | Mobile | Status |
|---|---|---|---|
| Login / register / OTP | `/login`, `/register` | `login_screen`, `register_screen`, `otp_screen` | **Done** |
| Forgot / reset password | `/settings/reset-password` | `forgot_password_screen` | **Done** |
| Session persistence | localStorage token | `Api.init()` + `TokenStore` | **Done** (fixed this session) |
| Home feed (googs) | `/dashboard` | `home_feed_screen` | **Done** |
| Goog second view | modal | goog popup | **Done** |
| Goog link preview | `GoogLinkPreviewCard` | ported | **Done** |
| Upload content (vault / flash) | feed cards | `_UploadContentFeedCard` | **Done** |
| Ads — all campaign types in feed | shared ad cards | `_HomeAdFeedCard` | **Done** |
| Comments + 3-level replies | `InteractionBottomSheet` | shared `openInteractionsSheet` | **Done** |
| Comment report | modal | ported modal | **Done** |
| Comment like / dislike toggle | per-user | goog only | **Partial** — see §5 |
| Shop feed + product quick view | `/dashboard/shop` | `shop_feed_screen` | **Done** |
| Cart | `CartSidebar` | `cart_screen` + `CartStore` | **Done** (rebuilt this session) |
| Checkout + address | `CartSidebar` address view | `cart_screen` | **Done** |
| Payments — wallet / manual / COD | 3 methods | 3 methods | **Partial** — manual flow, §5 |
| Orders (buyer / seller) | `/dashboard/shop` tabs | `shop_feed_screen` order tabs | **Done** |
| Chats + DM | `/chats` | `chats_screen`, `chat_dm_screen` | **Done** |
| Voice / video calls | chat calls | call APIs wired | **Partial** — needs device testing |
| Profile (own / public) | `/profile`, `/u/[username]` | `profile_screen`, `user_profile_screen` | **Done** |
| Subscribe / unsubscribe | `SubscribeButton` | `SubscribeButton` | **Done** |
| Search (people) | feed + directory | same, shared endpoint | **Done** |
| Notifications | `/notifications` | `notifications_screen` | **Done** |
| Settings | `/dashboard/settings` | `settings_screen` | **Partial** — §4 |
| Terms / privacy / support | several pages | `terms_policies_screen`, `help_support_screen` | **Done** |
| Suspended account | `/suspended` | `suspended_screen` | **Done** |

---

## 3. Ad campaign creation

All five creation flows exist in mobile as thin wrappers over one shared
`widgets/campaign_editor.dart` (~30 KB), mirroring the web's `CampaignEditor`.

| Campaign type | Mobile screen | Status |
|---|---|---|
| Photo & Video | `photo_video_ad_screen` | **Done** |
| Product Promote | `product_promote_screen` | **Done** |
| Profile Promote | `profile_promote_screen` | **Done** |
| Flash Content | `flash_content_screen` | **Done** |
| Vault / Upload Content | `upload_content_screen` | **Done** |

Needs an end-to-end test pass (create → pay → appears in feed) — the code is
present but has not been verified against a live campaign.

---

## 4. Wallet

| Feature | Web route | Mobile | Status |
|---|---|---|---|
| Wallet home | `/wallet` | `wallet_screen` | **Done** |
| My wallet | `/wallet/my-wallet` | `my_wallet_screen` | **Done** |
| Transactions | `/wallet/transactions` | `transactions_screen` | **Done** |
| Top-up | `/wallet/topup` | `top_up_screen` | **Done** |
| Bank transfer | `/wallet/topup/bank-transfer` | `bank_transfer_screen` | **Done** |
| Withdrawal | `/wallet/withdrawal` | `withdrawal_screen` | **Partial** — no `/withdrawals` API calls |
| Verification (KYC) | `/wallet/verification` | `wallet_verification_screen` | **Partial** — no `/verification` API calls |
| Request money | `/wallet/request` | `request_screen` | **Done** |
| P2P sell ads | `/wallet/sell` | `sell_screen` | **Done** |
| Coins management | `/wallet/coins-management` | `coins_management_screen` | **Done** |
| Ad center | `/wallet/ad-center` | `ad_center_screen` | **Done** |
| Subscription plans | `/wallet/subscription` | `subscription_screen` | **Partial** — no `/subscription-plans` calls |
| Wallet pay | `/wallet-pay` | `wallet_pay_screen` | **Done** |

**Two screens call no backend at all** — withdrawal and KYC verification. They
render, but nothing is submitted. These are the clearest "looks finished, isn't"
cases found.

---

## 5. Known gaps (detail)

1. **Comment like/dislike** — only goog comments have a true per-user toggle.
   Upload-content and product/ad comments still use blind-increment endpoints:
   the button moves but the vote is not recorded and cannot be undone.
   *Needs a backend change (same pattern already applied to googs).*

2. **Manual payment** — mobile shows the seller ID and a transaction-ID field
   with working verification, but does not auto-navigate to the wallet screen
   the way web does. The buyer must go there manually.

3. **Withdrawal + KYC verification** — screens exist, no API wiring.

4. **Account security pages** — web has six dedicated pages (passkeys,
   two-factor, trusted devices, security alerts, change login email, reset
   password). Mobile has the APIs in `Api` but only partial UI inside
   `settings_screen`. **Partial.**

5. **Admin tooling** — mobile has 3 admin screens (ads, subscription,
   verification). Web's `adminCustomization` group alone has 34 endpoints;
   mobile calls 2. **Mostly missing** — arguably fine, admins can use web.

6. **Deep links / share landing pages** — web has `/share/*`, `/product/*`,
   `/reel/*` including reseller-ref variants. Mobile generates these links but
   has no in-app handler for opening one. **Missing.**

7. **Not wired at all**: `/withdrawals`, `/verification`, `/promo-codes`,
   `/stickers`, `/subscription-plans`, `/feed`.

---

## 6. Bugs found and fixed during this session

Listed because they show the *type* of defect parity work uncovers — all were
invisible until exercised.

| Bug | Impact |
|---|---|
| `addToCart` posted `{item_id,…}`; backend requires `{productId,title,…}` | Add-to-bag never worked, anywhere |
| Login and startup used two different token stores | Every page refresh logged the user out |
| Search used the wallet recipient lookup | Exposed staff accounts, searched email addresses |
| `int.tryParse('ad-comment-12')` → null | Every reply on an ad silently became a top-level comment |
| Comments rendered flat | Replies appeared as separate comments; no threading existed |
| Timestamps parsed as local, DB stores UTC | Every comment time off by +5:30 |
| `_copy()` popped the navigator before confirming | Goog share and ⋮ Share appeared dead |
| `onPressed: () {}` on ad second-view ⋮ | Dead button |
| "View profile" showed a toast | Dead button |
| Products/ads used a separate comment sheet | Reply/report/time fixes never reached them |
| Comment count captured once, never refreshed | Count stale after commenting |

---

## 7. Recommended order of work

1. **Wire withdrawal + KYC verification** — screens that submit nothing are the
   worst failure mode for a user.
2. **Finish account-security UI** — APIs already exist in `Api`.
3. **Comment reactions for uploads/products/ads** — needs the backend decision.
4. **Deep-link handling** — share links currently open the web app only.
5. **End-to-end test pass on ad campaign creation** — code present, unverified.
6. **Admin tooling** — lowest priority; web is a reasonable fallback.

Items 1, 2, 4 and 5 are mobile-only. Item 3 needs a backend addition.

---

## 8. Honest estimate

Reaching genuine A-to-Z parity, tested screen by screen: **6–10 focused weeks**.

The remaining 20–25% of screens is not 20–25% of the effort. As §6 shows, screens
that appear complete routinely have silent wiring defects, and those only surface
when someone uses the feature. The schedule should assume a verification pass per
screen, not just implementation.
