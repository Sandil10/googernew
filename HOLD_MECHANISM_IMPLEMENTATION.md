# Money Transfer System - Hold Mechanism Implementation

## Overview
The system now implements a **hold mechanism** for both "Sell" and "Buy" transactions, similar to how banks work. When a user initiates a transfer, the money is immediately deducted from their account and held until the receiver accepts or rejects the request.

## How It Works

### 1. **Initiating a Transfer (Sell or Buy)**

**User A enters:**
- Amount: 100
- Commission: 10%

**When User A clicks "Sell" or "Buy":**
1. ✅ **Confirmation popup appears**: "Are you sure you want to send money to @username?"
2. ✅ **If Yes**: System calculates the actual transfer amount:
   - If commission is entered (10%): Transfer amount = 100 × 10% = **10 coins**
   - If no commission: Transfer amount = **100 coins**
3. ✅ **Money is deducted from User A's balance** and marked as "on hold"
4. ✅ **Request is sent to User B** with status "pending"

### 2. **Receiving the Request**

**User B sees the request in their "Requests" tab:**
- Shows sender's name
- Shows the amount that will be received
- Shows commission percentage (if applicable)
- Two buttons: **Accept & Pay** | **Reject**

### 3. **Accepting the Request**

**When User B clicks "Accept & Pay":**
1. ✅ The held amount is **transferred from User A to User B**
2. ✅ User B's balance increases by the held amount
3. ✅ Transfer status changes to "accepted"
4. ✅ Both users see the transaction in their history

### 4. **Rejecting the Request**

**When User B clicks "Reject":**
1. ✅ The held amount is **returned to User A**
2. ✅ User A's balance is restored
3. ✅ Transfer status changes to "rejected"
4. ✅ Transaction appears as "rejected" in history

## Examples

### Example 1: With Commission
- **User A enters**: Amount = 100, Commission = 10%
- **Calculated transfer**: 10 coins (commission only)
- **User A's balance**: Reduced by 10 coins (on hold)
- **If User B accepts**: User B receives 10 coins
- **If User B rejects**: User A gets 10 coins back

### Example 2: Without Commission
- **User A enters**: Amount = 100, Commission = 0%
- **Calculated transfer**: 100 coins (full amount)
- **User A's balance**: Reduced by 100 coins (on hold)
- **If User B accepts**: User B receives 100 coins
- **If User B rejects**: User A gets 100 coins back

## Technical Changes

### Frontend Changes
1. **Both "Sell" and "Buy" now use the same flow**
   - Both show confirmation popup
   - Both use `requestMoney` service
   - Both create pending requests

2. **Updated Files:**
   - `app/dashboard/wallet/my-wallet/page.tsx`
   - `wallet/my-wallet/page.tsx`

### Backend Changes

1. **`initiateTransferRequest` (walletController.js)**
   - Now deducts money from sender immediately
   - Calculates commission if present
   - Stores the calculated amount in the database
   - Uses database transactions for safety

2. **`respondToRequest` (walletController.js)**
   - **On Accept**: Transfers held amount to receiver
   - **On Reject**: Returns held amount to sender
   - No balance checks needed (money already held)

### Database Schema
The `wallet_transfers` table stores:
- `sender_id`: User who initiated the transfer
- `receiver_id`: User who needs to accept/reject
- `amount`: The actual amount being transferred (already calculated)
- `commission`: The calculated commission amount
- `commission_percentage`: The percentage entered
- `status`: 'pending', 'accepted', or 'rejected'
- `type`: 'transfer' or 'request'

## Benefits

1. ✅ **Prevents double-spending**: Money is locked during pending requests
2. ✅ **Bank-like experience**: Users see their available balance accurately
3. ✅ **Consistent flow**: Both Sell and Buy work the same way
4. ✅ **Safe transactions**: Uses database transactions to prevent errors
5. ✅ **Clear communication**: Users know exactly what's happening

## User Experience Flow

```
User A (Sender)                          User B (Receiver)
─────────────────                        ─────────────────
1. Enter amount & commission
2. Click "Sell" or "Buy"
3. Confirm popup → Yes
4. Balance reduced (on hold)
5. See "Request sent" message
                                         6. See request in "Requests" tab
                                         7. Click "Accept" or "Reject"
                                         
If ACCEPT:                               If ACCEPT:
8. Money stays deducted                  8. Balance increases
9. See "accepted" in history             9. See "accepted" in history

If REJECT:                               If REJECT:
8. Money returned                        8. No balance change
9. See "rejected" in history             9. See "rejected" in history
```

## Migration Required

To use this system on Supabase, run the SQL migration script:
`supabase_complete_migration.sql`

This will add the necessary columns to support the hold mechanism.
