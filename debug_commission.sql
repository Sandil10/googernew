-- TEST QUERIES FOR DEBUGGING COMMISSION ISSUE

-- 1. Check current user balances
SELECT 
    username,
    user_id,
    wallet_balance,
    hold_balance,
    (wallet_balance + hold_balance) as total_balance
FROM users 
WHERE username IN ('sandil', 'it6') OR user_id IN ('sandil', 'it6')
ORDER BY username;

-- 2. Check all pending transfers
SELECT 
    wt.id,
    wt.amount,
    wt.commission,
    wt.commission_percentage,
    wt.type,
    wt.status,
    sender.username as sender_name,
    receiver.username as receiver_name,
    wt.created_at
FROM wallet_transfers wt
JOIN users sender ON wt.sender_id = sender.id
JOIN users receiver ON wt.receiver_id = receiver.id
WHERE wt.status = 'pending'
ORDER BY wt.created_at DESC;

-- 3. Check recent transfers (last 10)
SELECT 
    wt.id,
    wt.amount,
    wt.commission,
    wt.commission_percentage,
    wt.type,
    wt.status,
    sender.username as sender_name,
    receiver.username as receiver_name,
    wt.created_at,
    wt.updated_at
FROM wallet_transfers wt
JOIN users sender ON wt.sender_id = sender.id
JOIN users receiver ON wt.receiver_id = receiver.id
ORDER BY wt.created_at DESC
LIMIT 10;

-- 4. RESET USER A BALANCE (for testing)
-- Uncomment to reset:
-- UPDATE users 
-- SET wallet_balance = 881, hold_balance = 0 
-- WHERE username = 'sandil' OR user_id = 'it6';

-- 5. SIMULATE CORRECT FLOW MANUALLY
-- User A: 881, sends 100 with 10% commission

-- Step 1: Deduct and hold (what should happen)
-- UPDATE users 
-- SET wallet_balance = wallet_balance - 100, 
--     hold_balance = hold_balance + 100 
-- WHERE username = 'sandil';
-- Result: wallet_balance = 781, hold_balance = 100

-- Step 2: User B accepts (what should happen)
-- User A gets commission back:
-- UPDATE users 
-- SET hold_balance = hold_balance - 100,
--     wallet_balance = wallet_balance + 10
-- WHERE username = 'sandil';
-- Result: wallet_balance = 791, hold_balance = 0

-- User B receives (amount - commission):
-- UPDATE users 
-- SET wallet_balance = wallet_balance + 90
-- WHERE [new_user_condition];
-- Result: User B gets 90

-- 6. CHECK IF BACKEND IS RUNNING LATEST CODE
-- Run this to see what the backend is actually doing:
-- Look at the wallet_transfers table after a test transaction
-- The 'amount' column should be 100 (not 90)
-- The 'commission' column should be 10

SELECT 
    'Expected: amount=100, commission=10' as test_case,
    amount,
    commission,
    commission_percentage
FROM wallet_transfers
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 1;
