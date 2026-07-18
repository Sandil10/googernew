# Ad Coin Reward Flow

The main app and admin system now share the same DB-backed ad coin settings.

## Tables

### `ad_coin_reward_settings`
- Stores the active reward configuration for ad coin collection.
- Columns:
  - `id`
  - `user_reward_amount`
  - `googer_commission_amount`
  - `advertiser_charge_amount`
  - `is_active`
  - `created_at`
  - `updated_at`

### `ad_coin_collections`
- Stores one collection record per user, ad, and ad type.
- Columns:
  - `id`
  - `ad_id`
  - `ad_type`
  - `user_id`
  - `reward_amount`
  - `commission`
  - `advertiser_charge`
  - `created_at`

## Collect Flow

1. The frontend sends only `ad_id` and `ad_type`.
2. The backend loads the active row from `ad_coin_reward_settings`.
3. If no active row exists, the backend creates the default row:
   - `1.00`
   - `0.25`
   - `1.25`
4. The backend validates the logged-in user, ad ownership, like/watch eligibility, and advertiser balance.
5. One transaction handles:
   - duplicate check with `ad_coin_collections`
   - advertiser wallet deduction
   - clicked user wallet credit for exactly `user_reward_amount`
   - Googer wallet commission credit for exactly `googer_commission_amount`
   - `wallet_transfers` insert for the ad coin reward
   - `ad_coin_collections` insert
   - no product/wallet referral commission split is applied to ad coin rewards
6. Successful collection returns `Coin collected successfully`.
7. Duplicate collection returns `You already collected this coin`.
8. Insufficient advertiser balance returns `Reward unavailable`.

## Googer Wallet

Googer wallet commission can be calculated from accepted transfer rows:

```sql
SELECT SUM(commission)
FROM wallet_transfers
WHERE status = 'accepted';
```
