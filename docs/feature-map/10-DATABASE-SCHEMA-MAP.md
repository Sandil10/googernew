# 10 — Database Schema Map

Which table belongs to which feature, and where it is defined.

## 1. Read this first: the dump is not the schema

There are **two** sources of table definitions:

| Source | Contents |
| --- | --- |
| `database/googer_production_2026-06-10.sql` | 33 MB dump, **dated 2026-06-10** |
| `CREATE TABLE IF NOT EXISTS` inside `backend/src/**` | tables created at runtime |

Neither is complete. Tables in the dump but not in code are legacy; tables in code
but not in the dump were added after the dump was taken.

**Tables that exist only in code — searching the dump will wrongly suggest they do
not exist:**

```
account_security_otps          auth_sessions
password_reset_otps            ad_impressions
cart_items                     product_status_chat_assignments
topup_request_chat_assignments upload_control_settings
upload_contents                upload_content_likes
upload_content_comments        upload_content_comment_likes
upload_content_comment_dislikes upload_content_comment_reports
upload_content_shares          upload_content_views
upload_content_reposts         upload_content_purchases
upload_content_subscriptions   upload_content_reports
```

**Tables in the dump with no runtime creator** (managed by the dump/migrations only):
`ad_click_events`, `ads` (partly), `category_nodes`, `coin_requests`, `market`,
`market_comments`, `market_likes`, `market_views`, `market_reports`,
`market_comment_reports`, `orders`, `user_notifications`, `wallet_transfers`,
`withdrawal_requests`, `withdrawal_settings`, `withdrawal_payment_methods`,
`topup_payment_methods`, `referral_levels`, `subscription_plans` (also runtime).

**Column additions are scattered.** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` runs
from controllers and middleware on the hot path:

| Guard | Adds |
| --- | --- |
| `ensureTokenVersionColumn` (`middleware/auth.js:9`) | `users.token_version` |
| `ensureFeedAdEngagementSchema` (`feedController.js:22`) | `ads.linked_product_id`, `.linked_product_share_code`, `.current_reach`, `.max_reach_cap` — **and creates `ad_likes`, `ad_like_coin_rewards`, `ad_views`** |
| `ensureOrderResellCommissionColumns` (`orderController.js`) | order resell-commission columns |

**Consequence:** the home feed bootstraps part of the ad schema, and the auth
middleware bootstraps a users column. Exercising a feature can change the schema.

## 2. Tables by feature

### Users and auth — `08-AUTH-AND-SECURITY.md`

| Table | Notes |
| --- | --- |
| `users` | central; `token_version` added at runtime; `is_deactivated` + `status` both gate feed visibility |
| `auth_sessions` | per-device revocation; absence degrades gracefully (`42P01`) |
| `account_security_otps` | logged-in sensitive changes |
| `password_reset_otps` | logged-out reset |
| `user_blocks` | blocking (filtered client-side in the feed) |
| `user_reports` | user moderation |
| `profile_views` | profile view log |
| `user_subscriptions` | **social follows** — not paid plans |
| `user_verifications` | KYC |

### Social content — `07-PROFILE-SOCIAL-CHAT.md`

| Group | Tables |
| --- | --- |
| Googs | `goog_posts`, `goog_likes`, `goog_comments`, `goog_comment_reports`, `goog_shares`, `goog_share_logs`, `goog_share_aliases`, `goog_views`, `goog_subscribes`, `goog_reports`, `saved_googs` |
| Upload content | `upload_contents`, `upload_content_likes`, `upload_content_comments`, `upload_content_comment_likes`, `upload_content_comment_dislikes`, `upload_content_comment_reports`, `upload_content_shares`, `upload_content_views`, `upload_content_reposts`, `upload_content_purchases`, `upload_content_subscriptions`, `upload_content_reports` |
| Control | `upload_control_settings` |

### Marketplace — `03-SHOP-AND-PRODUCT.md`

`market`, `market_likes`, `market_comments`, `market_comment_reports`,
`market_shares`, `market_views`, `market_reports`, `product_share_aliases`,
`category_nodes`, `managed_categories`, `commission_settings`.

### Cart and orders — `04-CART-CHECKOUT-ORDERS.md`

| Table | Notes |
| --- | --- |
| `cart_items` | runtime-created; six-column merge key matched with `IS NOT DISTINCT FROM` |
| `orders` | `order_number` groups lines; uniqueness by retry loop, **not a constraint** |

### Ads — `05-ADS-AND-CAMPAIGNS.md`

| Table | Notes |
| --- | --- |
| `ads` | `status`, `campaign_type`, `impressions`, `max_reach_cap`, `remaining_budget`, `accumulated_active_ms`, `last_resumed_at` |
| `ad_likes` | `UNIQUE(ad_id, user_id)` |
| `ad_like_coin_rewards` | `UNIQUE(ad_id, user_id)` — **the double-collect guard** |
| `ad_views` | `viewer_key` + `ip_address` for anonymous dedupe |
| `ad_impressions`, `ad_click_events` | per-event rows behind the `ads` rollups |
| `ad_comments`, `ad_shares`, `ad_saves`, `ad_reports` | interactions |
| `ad_coin_collections`, `ad_coin_reward_settings` | coin ledger + config |
| `ad_video_watch_eligibility` | video watch gate |
| `reach_settings`, `reach_tiers` | pricing config |
| `promo_codes` | keeps an out-of-budget ad deliverable |

**Note:** `ad_likes.ad_id` is `VARCHAR(20)` while `ad_views.ad_id` is `VARCHAR(80)` —
inconsistent widths on the same logical key.

### Wallet and money — `06-WALLET-AND-PAYMENTS.md`

| Group | Tables |
| --- | --- |
| Core | `wallet`, `wallet_transfers` |
| Withdrawals | `withdrawal_requests`, `withdrawal_settings`, `withdrawal_payment_methods` |
| Top-up | `coin_requests`, `topup_payment_methods` |
| P2P buy | `p2p_buy_ads`, `p2p_transactions`, `p2p_active_buyers` |
| P2P sell | `p2p_sell_ads`, `p2p_sell_transactions`, `p2p_sell_active_buyers` |
| Plans | `subscription_plans`, `user_plan_subscriptions` |
| Referral | `referral_relationships`, `referral_levels`, `referral_level_settings`, `referral_commission_settings`, `referral_commission_payouts` |

### Chat — `07-PROFILE-SOCIAL-CHAT.md`

`chat_messages`, `chat_presence`, `chat_call_sessions`, `chat_call_signals`,
`product_status_chat_assignments`, `topup_request_chat_assignments`.

### Platform

`admin_customization_settings`, `user_notifications`.

## 3. Naming conventions

Consistent enough to predict:

```
<entity>              e.g. goog_posts, market, ads, upload_contents
<entity>_likes        <entity>_comments        <entity>_views
<entity>_shares       <entity>_reports         <entity>_comment_reports
<entity>_share_aliases
```

Exceptions worth memorising:

- Googs use `goog_*` but the base table is `goog_posts` (not `googs`).
- Products use `market_*` but the base table is `market` (singular).
- Upload content is `upload_contents` (plural) with `upload_content_*` children.
- Ads use `ad_*` (singular prefix) with base table `ads`.

## 4. Two "subscription" concepts

The single most common source of confusion:

| Table | Meaning |
| --- | --- |
| `user_subscriptions` | **social follow** — A follows B |
| `user_plan_subscriptions` | **paid plan** — A is on the Gold plan |
| `goog_subscribes` | follow triggered from a goog |
| `upload_content_subscriptions` | paid access to a creator's content |

`POST /auth/user/:id/subscribe` is a **follow**. `POST /subscriptions/subscribe`
is a **purchase**.

## 5. Verifying the live schema

Do not trust the dump. To see what actually exists:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ads' ORDER BY ordinal_position;
```

The backend does this itself — `getCachedColumnCheck` (`utils/adDelivery.js:32`)
probes `information_schema` and caches per column, substituting `NULL::type` when a
column is missing, so ad targeting degrades instead of erroring on an older schema.

## 6. Integrity notes

1. **`orders.order_number` has no unique constraint** — generated by retry loop
   (`orderController.js:716`), racy under concurrency.
2. **Stock is only enforced in `adjustOrderItemStock`** during order creation.
   Nothing constrains cart quantity against stock.
3. **`UNIQUE(ad_id, user_id)` on `ad_like_coin_rewards`** is the one place a
   business rule is enforced by the schema rather than by a handler. Good pattern —
   worth extending.
4. **Runtime table creation is racy at cold start** — several processes can attempt
   the same `CREATE TABLE IF NOT EXISTS` concurrently. `IF NOT EXISTS` makes it
   survivable, but ordering is not guaranteed under the clustered server.
