# Googer Web App — Full Feature Map (A to Z)

A page-by-page, feature-by-feature map of the Googer web app: **Next.js frontend →
Express backend → PostgreSQL**, including small behavioural details (validation
rules, dropdown contents, disabled states) that are easy to lose when the app is
re-implemented on another platform.

This set exists because `docs/FEATURES.md` is a one-line-per-feature summary. It
tells you *that* the cart exists. It does not tell you that the size dropdown
prints the remaining stock next to each size, disables the sold-out ones, and
that `Select Size` is a hard gate before ADD TO BAG will fire. That level of
detail is what these documents record.

## Documents

| File | Covers |
| --- | --- |
| [01-ARCHITECTURE-AND-WIRING.md](01-ARCHITECTURE-AND-WIRING.md) | How a click becomes a SQL row: route mounts, auth, service layer, realtime, caching |
| [02-HOME-FEED.md](02-HOME-FEED.md) | The home feed — composition, ad injection, every card type, every interaction |
| [03-SHOP-AND-PRODUCT.md](03-SHOP-AND-PRODUCT.md) | Shop grid, product second view modal, variants, sizes, stock, shipping |
| [04-CART-CHECKOUT-ORDERS.md](04-CART-CHECKOUT-ORDERS.md) | Bag, delivery grouping, checkout, order lifecycle, buyer/seller views |
| [05-ADS-AND-CAMPAIGNS.md](05-ADS-AND-CAMPAIGNS.md) | The five campaign types, reach/budget, impressions, ad coins |
| [06-WALLET-AND-PAYMENTS.md](06-WALLET-AND-PAYMENTS.md) | Wallet, top-up, withdrawal, P2P buy/sell, subscriptions, referral commission |
| [07-PROFILE-SOCIAL-CHAT.md](07-PROFILE-SOCIAL-CHAT.md) | Profiles, googs, upload content, follows, chat and calls |
| [08-AUTH-AND-SECURITY.md](08-AUTH-AND-SECURITY.md) | Registration, login, OTP, 2FA, passkeys, sessions, device trust, suspension |
| [09-ADMIN-PANEL.md](09-ADMIN-PANEL.md) | Admin customization surface and moderation queues |
| [10-DATABASE-SCHEMA-MAP.md](10-DATABASE-SCHEMA-MAP.md) | Every table, who writes it, and which feature owns it |

## How to read these

Each feature is documented as a chain:

```
UI surface  →  frontend handler  →  service module  →  HTTP route  →  controller  →  table(s)
```

Conventions used throughout:

- **`file.tsx:123`** — a real file and line. These drift; treat the symbol name
  as authoritative and the line as a hint.
- **Rule:** — a behaviour that is enforced in code. If you are porting the app,
  these are the ones that silently go missing.
- **Gap:** — behaviour that is *absent* on the web and is often assumed present.
  Recorded deliberately, so a port does not "fix" something into a difference.

## Scope and honesty notes

Read this before relying on the documents.

1. **Derived from source, not from a running system.** Everything here was read
   out of the code in this repository. Where behaviour depends on data (an admin
   toggle, a subscription plan row), the document says what the code *does with*
   that data, not what the production values currently are.

2. **The schema dump is dated.** `database/googer_production_2026-06-10.sql`
   predates several tables. The backend creates many tables at runtime with
   `CREATE TABLE IF NOT EXISTS` — the entire `upload_contents` family, `auth_sessions`,
   `account_security_otps`, `ad_impressions`, `cart_items`, chat assignment tables
   and others exist only in code. `10-DATABASE-SCHEMA-MAP.md` marks which is which,
   because searching the dump alone will make you conclude a table does not exist.

3. **Two route trees, one app.** Many pages exist at both `/dashboard/x` and `/x`
   (wallet, ad-campaign, profile, shop, chats). They are not always the same file.
   Where they differ it is called out; assume `/dashboard/*` is the primary.

4. **Size is a signal.** `app/dashboard/shop/page.tsx` is 412 KB and
   `marketController.js` is 216 KB. Documents cover the feature surface of these
   files rather than every branch inside them. Where a file was too large to read
   exhaustively, the document says so rather than implying full coverage.
