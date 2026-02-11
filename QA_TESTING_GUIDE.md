# QA Testing Guide - Commission System

## Current Setup
- **User A (sandil/it6)**: 881 coins
- **New User**: 1000 coins

## Test Scenarios

### Test 1: Sell with Commission (Request Flow)
**Steps:**
1. Login as User A (sandil/it6)
2. Go to Wallet → My Wallet
3. Enter:
   - Select User: New User
   - Amount: 100
   - Commission: 10%
4. Click "Sell"
5. Confirm in popup

**Expected Results:**
- User A balance: 881 - 100 = **781 (available)**
- User A hold: **100 (on hold)**
- Status: Pending (waiting for New User to accept)

**Then:**
6. Login as New User
7. Go to Wallet → Requests tab
8. See request from sandil: "100 coins, 10% commission"
9. Click "Accept & Pay"

**Expected Final Results:**
- User A: 781 + 10 = **791 coins** (got commission back)
- New User: 1000 + 90 = **1090 coins** (received amount - commission)

---

### Test 2: Sell without Commission (Request Flow)
**Steps:**
1. Login as User A
2. Enter:
   - Select User: New User
   - Amount: 50
   - Commission: 0% (leave empty)
3. Click "Sell"

**Expected Results:**
- User A balance: 881 - 50 = **831 (available)**
- User A hold: **50 (on hold)**

**Then:**
4. Login as New User
5. Accept the request

**Expected Final Results:**
- User A: 831 (no commission to get back)
- New User: 1000 + 50 = **1050 coins**

---

### Test 3: Buy/Request with Commission
**Steps:**
1. Login as User A
2. Enter:
   - Select User: New User
   - Amount: 100
   - Commission: 10%
3. Click "Buy" (Request)

**Expected Results:**
- User A balance: **881** (unchanged - no hold)
- Request sent to New User

**Then:**
4. Login as New User
5. See request: "sandil requests 100 coins with 10% commission"
6. Click "Accept & Pay"

**Expected Final Results:**
- New User: 1000 - 100 = **900 coins** (paid full amount)
- User A: 881 + 90 = **971 coins** (received amount - commission)
- Commission 10 coins: Lost/burned

---

### Test 4: Reject Request
**Steps:**
1. User A sells 100 with 10% commission
2. User A balance: 881 - 100 = 781, Hold: 100
3. New User rejects

**Expected Results:**
- User A: 781 + 100 = **881 coins** (money returned from hold)
- New User: **1000 coins** (unchanged)

---

## DIRECT TRANSFER (No Request/Approval)

You mentioned wanting a **direct transfer without approval**. Currently, ALL transfers require approval. 

### Option 1: Add "Direct Transfer" Feature
I can add a new feature where:
- User enters amount + commission
- Clicks "Direct Transfer" button
- Money transfers IMMEDIATELY without approval
- No hold, instant transfer

### Option 2: Keep Current System
- "Sell" = Request (requires approval)
- "Buy" = Request (requires approval)

---

## Quick Test Commands (For Database)

### Check User A Balance:
```sql
SELECT username, wallet_balance, hold_balance 
FROM users 
WHERE username = 'sandil' OR user_id = 'it6';
```

### Check New User Balance:
```sql
SELECT username, wallet_balance, hold_balance 
FROM users 
WHERE id = [NEW_USER_ID];
```

### Check Pending Transfers:
```sql
SELECT 
    wt.*,
    sender.username as sender_name,
    receiver.username as receiver_name
FROM wallet_transfers wt
JOIN users sender ON wt.sender_id = sender.id
JOIN users receiver ON wt.receiver_id = receiver.id
WHERE wt.status = 'pending'
ORDER BY wt.created_at DESC;
```

### Reset User A Balance (for testing):
```sql
UPDATE users 
SET wallet_balance = 1000, hold_balance = 0 
WHERE username = 'sandil';
```

---

## Expected Behavior Summary

### WITH Commission (10%):
| Action | User A Start | User A Hold | User B Receives | User A Final | User B Final |
|--------|-------------|-------------|-----------------|--------------|--------------|
| Sell 100 | 881 | 100 | 90 | 791 | 1090 |
| Buy 100 | 881 | 0 | - | 971 | 900 |

### WITHOUT Commission (0%):
| Action | User A Start | User A Hold | User B Receives | User A Final | User B Final |
|--------|-------------|-------------|-----------------|--------------|--------------|
| Sell 100 | 881 | 100 | 100 | 781 | 1100 |
| Buy 100 | 881 | 0 | - | 981 | 900 |

---

## Do You Want Direct Transfer?

If you want a **direct transfer** (no approval needed), I can add:

1. New button: "Direct Transfer"
2. When clicked: Money transfers IMMEDIATELY
3. No hold, no pending status
4. Commission still applies (sender keeps it)

**Example:**
- User A: 881
- Direct Transfer 100 with 10% commission to User B
- **Instant Result:**
  - User A: 881 - 90 = 791 (keeps 10 commission)
  - User B: 1000 + 90 = 1090

Should I add this feature?
