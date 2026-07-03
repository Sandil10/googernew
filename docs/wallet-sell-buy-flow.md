# Wallet Sell and Buy Flow Rules

This file records the current accepted wallet behavior. Do not change these rules unless the wallet sell/buy flow is intentionally redesigned.

## Covered Flows

- User to user sell flow: OK
- User to user buy flow: OK
- User to seller sell flow: OK
- User to seller buy flow: OK

The same rules apply whether the receiver is a normal user or seller account.

## Sell Flow With Discount

Example:

```text
User A enters amount: 1000
User A enters discount: 10%
User A enters User B id
User A clicks Sell
User B receives request
```

When User B accepts:

```text
User A wallet/hold deducts full amount: 1000
User B receives amount minus discount: 900
Discount pool: 100
```

Discount pool split:

```text
Googer main commission = 20% of 100 = 20
Remaining pool = 80
Check User A side uplines
Pay each active upline level from the original discount pool
Leftover goes back to User A
```

If User A has 3 uplines and each level is 10%:

```text
Level 1 = 10
Level 2 = 10
Level 3 = 10
Leftover to User A = 50
```

## Buy Flow With Discount

Example:

```text
User A enters amount: 1000
User A enters discount: 10%
User A enters User B id
User A clicks Buy
User B receives request
```

When User B accepts:

```text
User B wallet deducts discount amount only: 100
Discount pool: 100
```

Discount pool split:

```text
Googer main commission = 20% of 100 = 20
Remaining pool = 80
Check User A side uplines
Pay each active upline level from the original discount pool
Leftover goes to User A
```

If User A has 3 uplines and each level is 10%:

```text
Level 1 = 10
Level 2 = 10
Level 3 = 10
Leftover to User A = 50
```

If User A has no uplines:

```text
Googer main = 20
User A receives leftover = 80
```

## History Display Rules

Normal wallet history must not show the internal upline commission split rows.

Hidden from normal wallet history:

```text
referral_commission rows
discount sending-side internal split/refund rows
```

Shown inside referral network:

```text
Per-referral earned amount beside the referral user
Example: Level 4 user 04 shows + R amount earned from 04
```

## Naming Rules

For buy requests with discount:

```text
Popup title: Discount Request
Amount line: Coins
Discount line: Discount Request
Receipt/slip title: Discount Request
```

For sell requests with discount:

```text
Sell wording remains as send coins and discount request wording.
```

## Product Order Receive Discount Rule

This applies to the production shop/order flow only when the buyer clicks Receive, including:

```text
Googer Manual Payment
Googer Payment
Cash on Delivery
Any existing product order payment method
```

Do not change the cart, place-order, seller delivery, or buyer receive flow unless specifically requested.

Example:

```text
Product price = 1000
Product discount = 100
Buyer clicks Receive
```

The product discount goes to the buyer side, but it must be split before the buyer receives the leftover:

```text
Googer main commission = 20% of 100 = 20
Remaining pool = 80
Check buyer side uplines
Pay each active upline level from the original discount pool
Leftover goes to buyer
```

If buyer has 3 uplines and each level is 10%:

```text
Level 1 = 10
Level 2 = 10
Level 3 = 10
Leftover to buyer = 50
```

If buyer has no uplines:

```text
Googer main = 20
Buyer receives leftover = 80
```

## Seller Wallet Send Discount Rule

This rule applies only when the logged-in sender account is a seller and clicks Sell with a discount.

It applies to:

```text
Seller to user
Seller to seller
```

Do not change the already accepted user-to-user or user-to-seller sell/buy request flows for this rule.

Example:

```text
Seller enters amount: 1000
Seller enters discount: 10%
Seller enters user id or seller id
Seller clicks Sell
```

This must not create a pending request. The discount is sent immediately.

Money movement:

```text
Discount amount = 1000 x 10% = 100
Seller wallet deducts 100 only
```

Discount pool split:

```text
Googer main commission = 20% of 100 = 20
Remaining pool = 80
Check discount receiver side uplines
Pay each active upline level from the original discount pool
Leftover goes to discount receiver
```

If receiver has 3 uplines and each level is 10%:

```text
Level 1 = 10
Level 2 = 10
Level 3 = 10
Leftover to receiver = 50
```

Naming:

```text
Popup title: Send Discount
Amount line: Coins
Discount line: Send Discounts
Receipt/slip title: Send Discount
```

## Seller Wallet Buy Discount Rule

This rule applies only when the logged-in sender account is a seller and clicks Buy with a discount.

It applies to:

```text
Seller to user
Seller to seller
```

Do not change the already accepted user-to-user, user-to-seller, or seller Sell discount flows for this rule.

Example:

```text
Seller A enters amount: 1000
Seller A enters discount: 10%
Seller A enters User B or Seller B id
Seller A clicks Buy
User B/Seller B receives request
```

When User B/Seller B accepts:

```text
User B/Seller B wallet deducts full amount: 1000
Seller A receives amount minus discount: 900
Discount pool stays on User B/Seller B side: 100
```

Discount pool split:

```text
Googer main commission = 20% of 100 = 20
Remaining pool = 80
Check User B/Seller B side uplines
Pay each active upline level from the original discount pool
Leftover goes back to User B/Seller B
```

If User B/Seller B has 1 upline and that level is 10%:

```text
Level 1 = 10
Leftover to User B/Seller B = 70
```

If User B/Seller B has 3 uplines and each level is 10%:

```text
Level 1 = 10
Level 2 = 10
Level 3 = 10
Leftover to User B/Seller B = 50
```

Naming:

```text
Popup title: Coin Request and Send Discount
Amount line: Coin Request
Discount line: Send Discount
Counterparty line: Request to
Receipt/slip title: Coin Request and Send Discount
```

## Ad Coin Collect Referral Rule

This rule applies only when a user collects the coin from an ad.

Do not change the existing ad like, collect button, watch-time, budget, or ad owner charge flow unless specifically requested.

Example:

```text
Ad coin reward = 1
Collector clicks Collect Coin
```

The collector is treated as the buyer/referral side for the reward split.

Commission settings:

```text
Use the admin panel AD COMMISSION column only.
Do not use the PRO / WALLET COMMISSION column for ad coin reward referral splits.
```

Reward split:

```text
Googer main commission = AD COMMISSION level 0 percent from the reward
Remaining reward pool checks the collector side uplines
Each active upline receives its configured AD COMMISSION percent from the original reward
Leftover goes back to the collector
```

If reward is 1 and ad commission is 10% for Googer and 10% for one upline:

```text
Googer main = 0.10
Level 1 upline = 0.10
Leftover to collector = 0.80
```
