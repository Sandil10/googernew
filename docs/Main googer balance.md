# Main Googer Balance

The Main Googer Balance is not a saved column in one table.

It must be calculated from `wallet_transfers.commission`:

```sql
SELECT SUM(commission)
FROM wallet_transfers
WHERE status = 'accepted';
```

Example current value:

```text
22754.10
```

Important:

- `SUM(wallet_transfers.commission) WHERE status = 'accepted'` is the Main Googer Balance.
- `users.wallet_balance` is the personal admin wallet balance, not the Main Googer Balance.
- Do not rename or treat `users.wallet_balance` as the Main Googer Balance.

## Wallet Discount Split

For a wallet sell/buy discount:

```text
Amount: 1000
Discount: 10%
Discount amount: 100
```

The discount amount is split by the referral level settings:

```text
Googer / Golden Level: 20% of 100 = 20
Buyer Level: 20% of 100 = 20, paid to the actual buyer/initiator
Referral Levels 1-6: each configured percentage of 100
```

The Googer / Golden Level amount must be recorded as an accepted `wallet_transfers.commission` entry so it increases the Main Googer Balance.

The original wallet sell/buy request row must not keep the full discount amount in `wallet_transfers.commission` after it is accepted. That original row is only the discount basis. If it keeps `commission = 100`, the Main Googer Balance counts the discount twice.

If one or more referral levels do not exist for that receiver's referral chain, the unused referral-level amount goes back to the receiver wallet as `discount_refund`.

For a wallet sell where User A sends/sells to User B and no referral levels exist:

```text
User B receives transfer net: 900
Main Googer Balance: +20
User A Buyer Level commission: +20
User B unused level refund: +60
User B final received value: 960
```
