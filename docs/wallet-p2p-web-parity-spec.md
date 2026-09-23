# Wallet P2P Web Parity Specification

This document is the mobile parity contract for the web wallet P2P flows.
It is derived from the current web source and backend routes, not screenshots.

Source files:

- `app/dashboard/wallet/topup/page.tsx`
- `app/dashboard/wallet/sell/page.tsx`
- `backend/src/routes/p2pAds.js`
- `backend/src/routes/p2pSellAds.js`

Mobile Flutter must match these rules without changing backend or web UI.

## Shared Page Structure

Both web pages use the same marketplace structure:

- Top navigation buttons: `Buy Coins`, `Sell Coins`, `Request`.
- Buy page route uses `/p2p-ads`.
- Sell page route uses `/p2p-sell-ads`.
- Filters are `All Currencies` and `All Countries`.
- Status tabs are `ALL`, `PENDING`, `COMPLETE`, `CANCEL`.
- `POST AD` opens the approved payment-method catalog/form.
- Each visible ad/order card shows owner profile image/name, verified badge when present, rate, currency, limit, available, payment method name/logo, country, release time, and action buttons.

## Shared Data Loading

Each page loads:

- Ads list.
- Transactions list.
- Wallet balance.
- Approved/admin payment methods.
- Country catalog.
- Verification/approval state for posting ads.

Ads must preserve backend fields needed by the UI:

- `id`
- `catalog_id`
- `name`
- `category`
- `admin_fields`
- `lkr_rate`
- `crypto_currency`
- `min_amount`
- `max_amount`
- `available_amount`
- `release_value`
- `release_unit`
- `description`
- `status` / inactive state
- `is_locked`
- owner fields: `user_id`, `username`, `full_name`, `profile_picture`
- payment logo fields: `svg_file`, `clearbit_domain`, `logo`

Transactions must preserve:

- `id`
- `ad_id`
- `buyer_id`
- `seller_id`
- `amount`
- `receive_amount`
- `receive_currency` on sell side
- `tx_id`
- `screenshot_data`
- `screenshot_name`
- `status`
- `created_at`
- `completed_at`
- buyer/seller usernames and profile pictures
- `buyer_fields` on sell side
- `buyer_report_reason`
- `seller_report_reason`

## Payment Logos

Web `PaymentLogo` behavior must be mirrored:

- Prefer explicit `svgFile` when present.
- Use payment method name/catalog id to resolve known SVG logos.
- Use `clearbitDomain` fallback where configured.
- Preserve full `http(s)` and `data:` image URLs.
- Resolve backend media paths such as `/uploads/...`, `uploads/...`, `/assets/...`, and `assets/...`.
- The same logo resolver must be used in cards, amount popup, details popup, completed popup, edit form, and payment catalog.

## Profile Images

Web cards use joined user fields from backend rows, especially `profile_picture`.

Mobile must:

- Use `profile_picture` from ad rows when present.
- Use nested user/profile/owner objects when present.
- Use transaction seller/buyer profile fields for synthetic transaction cards.
- If an ad/transaction row only has `user_id` or `seller_id`, fetch the public user profile and hydrate `profile_picture`.
- Use the same avatar resolver across wallet cards, profile page, feed cards, chats, and popups.
- Do not fall back to letter avatar if backend has a real profile picture.

## Order ID Rule

Web displayed order id is frontend-generated for cards/popups. It is not always the raw database id.

Mobile must generate order labels from the same transaction identity input:

- transaction `id`
- `ad_id`
- `buyer_id`
- `seller_id`
- `created_at`

The generated id must be stable across web and mobile for the same transaction.

## Transaction Lists

Web builds transaction tabs as synthetic per-transaction cards:

- `ALL` tab shows ad rows after currency/country filtering.
- `PENDING` tab shows one card per pending transaction, newest first.
- `COMPLETE` tab shows one card per completed transaction, newest first.
- `CANCEL` tab shows one card per cancelled transaction, newest first.
- If the original ad row still exists, merge the transaction with that ad.
- If the original ad row is missing, build a synthetic ad from transaction fields.
- Transaction cards must not collapse multiple transactions from the same ad into one card.

## Filtering Rules

Currency filter:

- `All Currencies` means no filter.
- Otherwise compare against ad `crypto_currency` or default currency.
- Crypto category defaults to `USDT`; wallet/bank default to `LKR` when no explicit currency exists.

Country filter:

- `All Countries` means no filter.
- Compare against `country` in `admin_fields`.
- Country picker/filter supports search by country name and country code.

Inactive filtering:

- In `ALL`, hide someone else’s inactive ads.
- Show the current user’s own inactive ads with inactive label.

## Available Amount Rule

Backend calculates `available_amount`:

- Buy side: max amount minus pending/completed transaction usage.
- Sell side: max amount minus pending/completed transaction usage.

Web also applies local optimistic pending reservation:

- Buy side local pending reservation subtracts `receive_amount || amount`.
- Sell side local pending reservation subtracts `amount`.

Mobile must show the same available amount as web:

- Use `available_amount` from backend where present.
- Apply local optimistic reservations in the same units.
- Clamp display at zero.

## Buy Coins Flow

Buy Coins page uses `/p2p-ads`.

### Buy Ad Creation/Edit

`POST AD` opens payment method catalog.

Post/edit form fields:

- Country is required.
- Rate is required.
- Currency selector is shown where web shows it.
- Minimum amount is required.
- Maximum amount is optional/validated.
- Coin release time has value and unit (`h`, `min`, `s`).
- Description is saved and shown in trade popup guide note.
- Admin/payment fields are rendered from the selected approved method.
- Locked admin fields are not editable.

Create endpoint:

- `POST /p2p-ads`

Edit endpoint:

- `PUT /p2p-ads/:id`

Delete endpoint:

- `DELETE /p2p-ads/:id`

Backend blocks duplicate buy ad for same user + `catalog_id`.

Edit/delete are blocked when ad has pending transaction.

### Buy Card Actions In ALL

For own buy ad:

- Show `Edit` and `Delete`.
- Disable them if ad is locked/pending.
- If inactive, show `Inactive · wallet below balance`.

For someone else’s buy ad:

- If ad inactive, hide in `ALL`.
- If seller/ad locked by an unsubmitted pending transaction, show a disabled grey `Buy` button.
- Otherwise show green clickable `Buy` button.

Important: web has separate lock handling:

- Current buyer already has a pending transaction on another live ad: clicking Buy opens `Locked · Pending Transaction` popup.
- Seller/ad locked by another unsubmitted transaction: card button is disabled and does not open normal amount popup.

### Buy Popup Open Rule

When `Buy` is clicked:

- Find current buyer’s pending transaction among live ads.
- If buyer pending exists on a different ad, open locked pending popup.
- If no global buyer lock, check per-seller lock:
  - Any pending latest transaction without `tx_id` where `seller_id === ad.userId`.
  - If yes, block opening amount popup.
- Otherwise set selected popup ad to the exact clicked ad.
- Reset amount, tx id, screenshot, success/error state.
- Keep selected popup ad synchronized with latest server ad snapshot by id.

### Buy Amount Popup

Header:

- Shows selected ad payment logo.
- Shows selected ad payment method name.
- Shows `R {rate} / {seller currency}` and release time.

Body:

- Limit/available panel.
- Amount input label: `Enter Amount ({seller currency})`.
- Amount placeholder: `Min {seller currency} {minAmount / rate}`.
- Receive panel label: `You will receive`.
- Receive calculation: entered external currency amount * `lkr_rate` = Rupieer.
- Receive display: `{amount} R`.
- Error panel appears below receive panel when invalid.
- Guide note uses selected ad `description` plus default buy guide.

Validation:

- Amount required and numeric.
- Receive Rupieer must be at least min.
- Receive Rupieer must not exceed max.
- Receive Rupieer must not exceed available.

Action buttons:

- `Cancel` closes/cancels popup.
- `Make Payment` starts pending transaction.

Start endpoint:

- `POST /p2p-ads/:id/start`
- Body includes `amount` and `receive_amount`.
- Backend holds `receive_amount` from ad owner/seller wallet.

### Buy Pending Details Popup For Buyer

The buyer opens pending details from pending transaction card or pending view.

If proof not submitted:

- Header shows payment logo/name and `PENDING`.
- Amount summary:
  - `Enter Amount`: transaction `amount` + seller currency.
  - `You Receive`: `R {receive_amount}`.
- `Send Payment To` section shows selected ad admin/payment fields.
- Each payment field has copy icon when value exists.
- Transaction ID field.
- Payment screenshot upload field.
- Error if neither transaction id nor screenshot is provided.
- `Report` button appears if current role has not reported.
- Footer buttons: `Close`, `Submit`.

Submit endpoint:

- `POST /p2p-ads/transactions/:transactionId/submit-details`
- Multipart body accepts `tx_id` and/or `screenshot`.
- Upload folder is `p2p-proofs`.

If proof already submitted:

- Header shows `PENDING · Submitted`.
- Shows submitted transaction id if present.
- Shows payment proof preview or filename/no image.
- Shows amber status: `Submitted · Waiting for seller confirmation`.
- Shows report badges/panel.
- Footer is `Close` only.

### Buy Pending Popup For Seller

Seller’s own ad pending transaction opens confirm popup.

If buyer has not submitted proof:

- Summary boxes:
  - `Amount`: `R {amount}`
  - `Receive`: `{receive_amount}`
- Amber status: `Waiting for buyer to submit transaction details.`
- Report badges if any.
- Footer: `Close`, `Confirm`.
- Confirm disabled until proof exists.

If buyer submitted proof:

- Shows transaction id/payment proof.
- Amber status: `Submitted · Ready for your confirmation`.
- Shows report panel.
- Footer: `Close`, `Confirm`.

Confirm endpoint:

- `POST /p2p-ads/transactions/:transactionId/confirm`
- Backend removes seller hold and adds Rupieer to buyer wallet.

### Buy Completed Popup

Completed transaction popup:

- Header payment logo/name and `COMPLETED`.
- Summary:
  - `Amount`
  - `Received`
- Shows order id and confirmed timestamp.
- Shows payment proof when available with zoom overlay.
- Green completion label: `Transaction confirmed - Coins released to buyer`.
- Shows report badges.
- Report button appears only if current role has not reported.
- Footer: `Close`.

## Sell Coins Flow

Sell Coins page uses `/p2p-sell-ads`.

### Sell Ad Creation/Edit

`POST AD` opens payment method catalog.

Post/edit form fields:

- Country required.
- Rate required.
- Currency selector and amount limits.
- Minimum amount required.
- Maximum amount optional/validated.
- Coin release time value/unit.
- Description saved and displayed in sell popup guide note.
- Admin/payment fields from selected approved method.
- Locked fields not editable.

Create endpoint:

- `POST /p2p-sell-ads`

Edit endpoint:

- `PUT /p2p-sell-ads/:id`

Delete endpoint:

- `DELETE /p2p-sell-ads/:id`

Backend blocks duplicate sell ad for same user + `catalog_id`.

Edit/delete are blocked when ad has pending transaction.

### Sell Card Actions In ALL

For own sell ad:

- Show `Edit` and `Delete`.
- Disable them if locked/pending.
- If inactive, show `Inactive · wallet below balance`.

For someone else’s sell ad:

- If inactive, hide in `ALL`.
- If exact ad has pending unsubmitted transaction, show disabled grey `Sell`.
- Otherwise show red clickable `Sell`.

Important sell difference:

- Sell page only exact-ad lock disables that ad.
- Global buyer pending lock opens locked pending popup when trying to sell any other ad.
- It does not borrow another payment method into the normal amount popup.

### Sell Popup Open Rule

When `Sell` is clicked:

- If current user already has any pending sell transaction on a live ad, open locked pending popup.
- Else if this exact ad has pending transaction with no `tx_id`, block opening amount popup.
- Otherwise set selected popup ad to exact clicked ad.
- Reset amount, tx id, screenshot, field values, success/error.
- Keep selected popup ad synchronized with latest server ad snapshot by id.

### Sell Amount Popup

Header:

- Shows selected ad payment logo.
- Shows selected ad payment method name.
- Shows `R {rate} / {currency}` and release time.

Body:

- Wallet balance + limit + available panel.
- Amount input label: `You Pay (Rupieer)`.
- Amount placeholder: `Rupieer {min} - Rupieer {max}`.
- Helper text: `Cannot exceed your wallet balance.`
- Receive panel label: `You Receive`.
- Receive calculation: Rupieer amount / `lkr_rate` = selected receive currency.
- Receive display: `{amount} {receiveCurrency}`.
- Payment method fields section from admin/payment method configuration.
- Required fields must be filled before `Sell Now`.
- Guide note uses selected ad `description` plus default sell guide.

Validation:

- Rupieer amount required and numeric.
- Amount must be at least min.
- Amount must not exceed max.
- Amount must not exceed available.
- Amount must not exceed current user wallet balance.
- Required buyer/payment fields must be filled.

Action buttons:

- `Cancel` closes/cancels popup.
- `Sell Now` disabled until valid.

Start endpoint:

- `POST /p2p-sell-ads/:id/start`
- Body includes:
  - `amount` in Rupieer.
  - `receive_amount` in receive currency.
  - `receive_currency`.
  - `buyer_fields`.
- Backend holds Rupieer amount from current user/buyer wallet.

### Sell Pending Popup For Ad Owner

Ad owner receives the external payment request from the buyer.

If owner has not submitted proof/payment details:

- Header payment logo/name and `PENDING`.
- Summary:
  - `You Pay`: external amount/currency.
  - `You Receive`: Rupieer amount.
- Shows `Buyer Details` from transaction `buyer_fields`.
- Transaction ID input.
- Payment screenshot upload.
- Error if neither transaction id nor screenshot is provided.
- Report panel appears if current role has not reported.
- Footer: `Close`, `Submit`.

Submit endpoint:

- `POST /p2p-sell-ads/transactions/:transactionId/submit-details`
- Multipart accepts `tx_id` and/or `screenshot`.
- Upload folder is `p2p-sell-proofs`.

If owner submitted proof:

- Header shows `PENDING · Submitted`.
- Shows transaction id/proof.
- Amber status: `Submitted · Waiting for buyer confirmation`.
- Shows report badges/panel.
- Footer: `Close`.

### Sell Pending Popup For Buyer

Buyer/current user confirms after seller submits proof.

If seller has not submitted proof:

- Shows amount summary.
- Amber status waiting for seller/payment details.
- Shows report panel.
- Footer is `Close` only unless web shows action for role.

If seller submitted proof:

- Shows transaction id/proof.
- Shows `Buyer Details` where applicable.
- Amber status: submitted/ready for confirmation.
- Shows report badges/panel.
- Footer: `Close`, `Confirm`.

Confirm endpoint:

- `POST /p2p-sell-ads/transactions/:transactionId/confirm`
- Backend removes buyer hold and adds Rupieer to ad owner/seller wallet.

### Sell Completed Popup

Completed sell popup:

- Header payment logo/name and `COMPLETED`.
- Summary:
  - `You Pay`
  - `You Receive`
- Shows buyer details when present.
- Shows transaction id when present.
- Shows payment proof with zoom overlay when present.
- Green completion label: `Completed · {timestamp}`.
- Shows `REPORTED BY BUYER` and/or `REPORTED BY SELLER` boxes.
- Report button appears only if current role has not reported.
- Footer: `Close`.

## Cancelled Tab

Cancelled tab cards:

- Show one card per cancelled transaction.
- Show owner/profile/payment method/country/rate/limit/available.
- Show `CANCELLED` chip.
- Web does not open details popup from cancelled card.
- Web does not show `View` button on cancelled card.
- Report button is not shown in cancelled card flow.

## Report Rules

Report endpoint:

- Buy: `POST /p2p-ads/transactions/:transactionId/report`
- Sell: `POST /p2p-sell-ads/transactions/:transactionId/report`

Backend:

- Only buyer or seller on that transaction may report.
- Only `pending` and `completed` transactions can be reported.
- Buyer report saved in `buyer_report_reason` / `buyer_reported_at`.
- Seller report saved in `seller_report_reason` / `seller_reported_at`.

Web UI:

- Report popup title: `Report Transaction`.
- Subtitle includes payment method and order label.
- Role chip:
  - `BUYER` for buyer role.
  - `SELLER` for seller role.
- Report options differ by page and role.

Buy page reasons:

- Buyer: `Payment still pending`, `Payment Not Received`, `Seller Not Responding`, `Other`.
- Seller: `User Not Responding`, `Payment still pending`, `Payment Not Received`, `Fake Receipt Uploaded`, `Buyer Marked as Paid Without Paying`, `Other`.

Sell page reasons:

- Buyer: `Payment still pending`, `Fake Payment Receipt`, `Payment Not Received`, `Seller Not Responding`, `Other`.
- Seller: `User Not Responding`, `Payment still pending`, `Payment Not Received`, `Other`.

Visibility:

- Show report badges for buyer/seller reasons.
- Hide report button for current role after that role has already reported.
- If opposite role reported, current role can still report unless current role also reported.
- Completed transactions still allow report if current role has not reported.
- Cancelled transactions do not show report action.

Report badge style:

- Red translucent background.
- Red border.
- Uppercase small label.
- Reason text below.

## Proof Upload Rules

For proof submission:

- User can submit transaction id only.
- User can submit screenshot only.
- User can submit both.
- If screenshot only, web uses a sentinel internally (`__submitted__`) so UI switches to submitted state even without real `tx_id`.
- Screenshot upload accepts images.
- Proof preview supports zoom overlay.
- If image data cannot render, show filename or `No image available`.
- Copy icon is shown for transaction id and payment/buyer detail values.
- Copy action should show a temporary green check icon.

## Realtime/Polling Rules

Backend exposes SSE:

- Buy: `/p2p-ads/events`
- Sell: `/p2p-sell-ads/events`

Web also polls/refetches:

- Ads refetch after mutations.
- Transactions refetch after mutations.
- Pending tab refreshes current transaction state.
- Confirm popup polls the specific transaction by id.
- Buyer view popup polls the specific transaction by id.
- Completed view popup refetches once when opened to get latest proof.

Mobile parity should either use SSE or equivalent polling/refetch behavior, but must keep visible state synchronized after:

- start pending
- submit proof
- cancel
- confirm
- report
- edit/delete/post ad

## Backend Hold/Release Rules

Buy side:

- Start pending holds seller/ad owner Rupieer amount (`receive_amount`).
- Buyer cancellation releases seller hold.
- Seller confirmation removes seller hold and credits buyer wallet.

Sell side:

- Start pending holds current user/buyer Rupieer amount (`amount`).
- Cancel releases buyer hold.
- Buyer confirmation removes buyer hold and credits ad owner/seller wallet.

No automatic expiration should cancel transactions. Backend explicitly disables auto-cancel triggers/jobs.

## Locked Popup Rules

Locked popup appears only for current-user global pending lock.

It shows:

- Title: `Locked · Pending Transaction`.
- Message: `You already have a pending transaction. Cancel or complete it before buying from another ad.`
- Pending transaction mini-card when `buyBlockedTx` exists:
  - Payment method name.
  - ID.
  - Amount.
  - Submitted/awaiting state.
- Actions:
  - `Cancel Pending` or `OK` depending state/context.
  - `View Pending`.

Do not open the normal amount popup with the wrong ad when locked.
Do not show another payment method name in the selected ad amount popup.

## Mobile Parity Audit Checklist

Before declaring mobile wallet parity complete, manually verify all of these:

- Tapping Trustly opens a Trustly amount popup, not GoCrypto or previous card.
- Tapping PayPal opens a PayPal amount popup.
- Tapping GoCrypto opens a GoCrypto amount popup.
- Buy side and sell side both keep selected popup ad bound by id after list refresh.
- Buy side seller lock disables only according to web seller-lock rule.
- Sell side exact-ad lock disables only that exact ad.
- Global current-user pending lock opens locked popup, not amount popup.
- Pending tabs show one card per transaction.
- Completed tabs show one card per transaction.
- Cancelled tabs show one card per cancelled transaction and no view popup.
- Web and mobile display the same order id for the same transaction.
- Web and mobile display the same available amount for the same ad.
- Web and mobile display the same report badges and hide/show report buttons by role.
- Profile images match web for `hee`, `googer`, and any transaction synthetic cards.
- Payment method logos match web in cards, popups, edit forms, and catalog.
- Screenshot upload works from gallery/photo and submits to same backend route.
- Copy icons show a green tick after copy.
- Edit form fields, labels, sizes, and locked values match web.
- Sell amount popup calculation matches web: Rupieer / rate = receive currency.
- Buy amount popup calculation matches web: external amount * rate = Rupieer.

