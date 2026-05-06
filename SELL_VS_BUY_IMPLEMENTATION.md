# Money Transfer System - Sell vs Buy Implementation

## Overview
The system now has **two distinct flows** for money transfers:
1. **Sell (Send Money)** - Sender's money is held until receiver accepts
2. **Buy (Request Money)** - No money is held; receiver pays if they accept

## How It Works

### 1. **SELL Flow (Send Money with Hold)**

**User A wants to send money to User B:**

**Step 1: User A initiates**
- Enters: Amount = 100, Commission = 10%
- Clicks **"Sell"**
- Confirmation popup: "Are you sure you want to send money to @userB?"

**Step 2: Money is calculated and held**
- System calculates: 100 × 10% = **10 coins**
- **10 coins deducted from User A** (marked as "on hold")
- Request sent to User B with status "pending"

**Step 3: User B responds**
- User B sees in "Requests" tab: "User A wants to send you 10 coins"
- Two options: **Accept** or **Reject**

**Step 4a: If User B Accepts**
- ✅ The held **10 coins** transfer from User A to User B
- ✅ User B's balance increases by 10
- ✅ User A's balance stays reduced (already deducted)
- ✅ Status changes to "accepted"

**Step 4b: If User B Rejects**
- ✅ The held **10 coins** return to User A
- ✅ User A's balance is restored
- ✅ User B's balance unchanged
- ✅ Status changes to "rejected"

---

### 2. **BUY Flow (Request Money - No Hold)**

**User A wants to request money from User B:**

**Step 1: User A initiates**
- Enters: Amount = 100, Commission = 10%
- Clicks **"Buy"**
- Confirmation popup: "Are you sure you want to request money from @userB?"

**Step 2: Request is created (NO money deducted)**
- System calculates: 100 × 10% = **10 coins** (amount to request)
- **NO money deducted from User A**
- Request sent to User B with status "pending"

**Step 3: User B responds**
- User B sees in "Requests" tab: "User A requests 10 coins from you"
- Two options: **Accept** or **Reject**

**Step 4a: If User B Accepts**
- ✅ **10 coins deducted from User B**
- ✅ **10 coins added to User A**
- ✅ Status changes to "accepted"

**Step 4b: If User B Rejects**
- ✅ Nothing happens (no money was held)
- ✅ Both balances unchanged
- ✅ Status changes to "rejected"

---

## Comparison Table

| Feature | SELL (Send) | BUY (Request) |
|---------|-------------|---------------|
| **Money deducted from sender?** | ✅ Yes (immediately) | ❌ No |
| **Money held?** | ✅ Yes (until response) | ❌ No |
| **Who pays?** | Sender (User A) | Receiver (User B) |
| **On Accept** | Transfer held money to receiver | Deduct from receiver, add to sender |
| **On Reject** | Return held money to sender | Nothing (no money was held) |
| **Balance check** | Sender (before hold) | Receiver (before accept) |

---

## Examples

### Example 1: SELL with Commission
```
User A: 1000 coins
User B: 500 coins

User A: Amount=100, Commission=10%, Click "Sell"
→ Calculated: 10 coins (commission only)
→ User A balance: 1000 - 10 = 990 (on hold)

User B Accepts:
→ User A: 990 (stays reduced)
→ User B: 500 + 10 = 510
```

### Example 2: BUY with Commission
```
User A: 1000 coins
User B: 500 coins

User A: Amount=100, Commission=10%, Click "Buy"
→ Calculated: 10 coins (to request)
→ User A balance: 1000 (unchanged)

User B Accepts:
→ User A: 1000 + 10 = 1010
→ User B: 500 - 10 = 490
```

### Example 3: SELL Rejected
```
User A: 1000 coins
User B: 500 coins

User A: Amount=100, Commission=0%, Click "Sell"
→ User A balance: 1000 - 100 = 900 (on hold)

User B Rejects:
→ User A: 900 + 100 = 1000 (refunded)
→ User B: 500 (unchanged)
```

### Example 4: BUY Rejected
```
User A: 1000 coins
User B: 500 coins

User A: Amount=100, Commission=0%, Click "Buy"
→ User A balance: 1000 (unchanged)

User B Rejects:
→ User A: 1000 (unchanged)
→ User B: 500 (unchanged)
```

---

## Technical Implementation

### Backend Changes

**1. `initiateTransferRequest` (walletController.js)**
```javascript
// Check the 'type' parameter
if (type === 'sell') {
    // Deduct money from sender (hold it)
    // Check sender's balance first
} else {
    // type === 'request' (buy)
    // Don't deduct anything
}
```

**2. `respondToRequest` (walletController.js)**
```javascript
if (action === 'reject') {
    if (transferType === 'sell') {
        // Return held money to sender
    } else {
        // Nothing to return (no money was held)
    }
}

if (action === 'accept') {
    if (transferType === 'sell') {
        // Transfer held money to receiver
    } else {
        // Deduct from receiver, add to sender
        // Check receiver's balance first
    }
}
```

### Frontend Changes

**1. Service Layer (walletService.ts)**
```typescript
requestMoney: async (
    receiverId: number, 
    amount: number, 
    note: string, 
    commissionPercentage: number = 0, 
    type: 'sell' | 'request' = 'request'
)
```

**2. Wallet Pages**
```typescript
const handleTransfer = async (type: 'sell' | 'buy') => {
    const requestType = type === 'sell' ? 'sell' : 'request';
    
    await walletService.requestMoney(
        selectedUser.id,
        parseFloat(amount),
        "",
        commission ? parseFloat(commission) : 0,
        requestType  // 'sell' or 'request'
    );
}
```

---

## User Messages

### SELL Messages
- **On initiate**: "Money transfer sent to @user. Amount is on hold until they accept."
- **On accept**: "Transfer accepted. Amount received."
- **On reject**: "Request rejected. Amount returned to sender."

### BUY Messages
- **On initiate**: "Money request sent to @user. They will pay if they accept."
- **On accept**: "Request accepted. Payment sent."
- **On reject**: "Request rejected."

---

## Database Schema

The `wallet_transfers` table stores:
- `type`: **'sell'** or **'request'**
- `status`: 'pending', 'accepted', or 'rejected'
- `amount`: The calculated transfer amount
- `commission`: The calculated commission
- `commission_percentage`: The percentage entered

The `type` field determines how the transaction is processed when accepted/rejected.

---

## Migration

Run `supabase_complete_migration.sql` on your Supabase database to ensure all necessary columns exist.

---

## Summary

✅ **SELL** = "I want to send you money" (my money is held)  
✅ **BUY** = "I want you to send me money" (your money is requested)

Both support commission calculations, confirmations, and proper balance management!
