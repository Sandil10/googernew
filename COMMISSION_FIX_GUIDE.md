# COMMISSION LOGIC FIX - Complete Implementation

## Problem Summary
Currently, when User A sends 100 with 10% commission:
- ❌ Only 10 coins are held (commission only)
- ❌ User B gets 10 coins
- ❌ Wrong final balances

## Correct Flow Needed
When User A sends 100 with 10% commission:
- ✅ Hold FULL 100 coins from User A
- ✅ User B gets 90 coins (100 - 10% commission)
- ✅ User A gets 10 coins back (commission)
- ✅ Final: User A = 910 (1000-100+10), User B = 1090 (1000+90)

## Backend Changes Required

### File: `backend/src/controllers/walletController.js`

### Change 1: initiateTransferRequest (ALREADY DONE ✅)
The function now correctly holds the FULL amount (100) instead of just commission (10).

### Change 2: respondToRequest - Accept Logic

**FIND THIS CODE** (around line 187-199):
```javascript
        if (action === 'accept') {
            if (transferType === 'sell') {
                // For 'sell': Money is already held from sender
                // Remove from sender's hold_balance and add to receiver's wallet_balance
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1 WHERE id = $2',
                    [transferAmount, transfer.sender_id]
                );
                
                await client.query(
                    'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [transferAmount, userId]
                );
```

**REPLACE WITH:**
```javascript
        if (action === 'accept') {
            if (transferType === 'sell') {
                // For 'sell': Split the held amount
                // Example: transferAmount = 100, commission = 10
                // Receiver gets: 100 - 10 = 90
                // Sender gets back: 10 (commission)
                
                const commission = parseFloat(transfer.commission || 0);
                const amountToReceiver = transferAmount - commission; // 90
                const amountBackToSender = commission; // 10
                
                // Remove full amount from sender's hold_balance
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1 WHERE id = $2',
                    [transferAmount, transfer.sender_id]
                );
                
                // Give (amount - commission) to receiver
                await client.query(
                    'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [amountToReceiver, userId]
                );

                // Return commission to sender's wallet
                if (commission > 0) {
                    await client.query(
                        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                        [amountBackToSender, transfer.sender_id]
                    );
                }
```

### Change 3: Update Success Message

**FIND THIS CODE** (around line 240-243):
```javascript
            const acceptMessage = transferType === 'sell'
                ? 'Transfer accepted. Amount received.'
                : 'Request accepted. Payment sent.';
            return res.status(200).json({ success: true, message: acceptMessage });
```

**REPLACE WITH:**
```javascript
            const acceptMessage = transferType === 'sell'
                ? `Transfer accepted. You received ${(transferAmount - parseFloat(transfer.commission || 0)).toFixed(2)} coins.`
                : 'Request accepted. Payment sent.';
            return res.status(200).json({ success: true, message: acceptMessage });
```

## Complete Example Flow

### Initial State:
- User A: 1000 coins
- User B: 1000 coins

### Step 1: User A sends 100 with 10% commission (Sell)
```
User A clicks "Sell"
Amount: 100
Commission: 10%

Backend calculates:
- amountToHold = 100 (full amount)
- calculatedCommission = 10 (10% of 100)

Database updates:
- User A wallet_balance: 1000 - 100 = 900
- User A hold_balance: 0 + 100 = 100
- wallet_transfers record created:
  - amount: 100
  - commission: 10
  - status: 'pending'
```

### Step 2: User B accepts
```
User B clicks "Accept"

Backend calculates:
- transferAmount = 100 (from database)
- commission = 10 (from database)
- amountToReceiver = 100 - 10 = 90
- amountBackToSender = 10

Database updates:
1. User A hold_balance: 100 - 100 = 0
2. User B wallet_balance: 1000 + 90 = 1090
3. User A wallet_balance: 900 + 10 = 910
4. wallet_transfers status: 'accepted'
```

### Final State:
- User A: 910 coins (lost 90, kept 10 commission)
- User B: 1090 coins (gained 90)
- Total: 2000 coins (balanced ✅)

## User A's Pending Requests Display

User A should see in their "Requests" or "Transactions" tab:
```
Status: Pending
Type: Sell
To: @userB
Amount Held: 100 coins
Commission: 10%
Will Receive Back: 10 coins (if accepted)
Net Cost: 90 coins (if accepted)
```

## Frontend Updates Needed

### Show Pending Requests for Sender

In `getPendingRequests` controller, also fetch requests WHERE sender_id = userId:

```javascript
// Get requests where user is the SENDER (their outgoing requests)
const sentRequests = await client.query(
    `SELECT wt.*, u.username, u.user_id as receiver_user_id
     FROM wallet_transfers wt
     JOIN users u ON wt.receiver_id = u.id
     WHERE wt.sender_id = $1 AND wt.status = 'pending'
     ORDER BY wt.created_at DESC`,
    [userId]
);
```

### Display in UI

Show two sections:
1. **Incoming Requests** (current) - Where user needs to accept/reject
2. **Outgoing Requests** (new) - Where user is waiting for response
   - Show: Amount held, Commission, Net cost
   - Option to cancel (returns money from hold)

## Summary

✅ **What's Fixed:**
1. Full amount (100) is now held instead of just commission (10)
2. On accept: Receiver gets (amount - commission), sender gets commission back
3. Balances are correct: Sender loses net amount, receiver gains net amount

✅ **What Still Needs Manual Update:**
1. The `respondToRequest` accept logic (code provided above)
2. Success message update (code provided above)
3. Frontend to show outgoing pending requests for sender

This ensures the commission system works like a marketplace fee where the sender keeps the commission!
