# Custom Confirmation Modal Implementation Guide

## Step 1: The Modal Component is Already Created ✅
Location: `f:\googer new\googer-next\components\ConfirmTransferModal.tsx`

This component displays a beautiful confirmation dialog with:
- Gradient header with icon
- Transaction details (To, Amount, Commission, Transfer Amount)
- Cancel and Confirm buttons
- Loading state

## Step 2: Update Desktop Wallet Page

File: `f:\googer new\googer-next\app\dashboard\wallet\my-wallet\page.tsx`

### A. Import is already added ✅
```tsx
import ConfirmTransferModal from '../../../../components/ConfirmTransferModal';
```

### B. State is already added ✅
```tsx
const [showConfirmModal, setShowConfirmModal] = useState(false);
const [confirmAction, setConfirmAction] = useState<{type: 'sell' | 'buy', user: any} | null>(null);
```

### C. Replace the `handleTransfer` function (around line 108-120)

**FIND THIS CODE:**
```tsx
const handleTransfer = async (type: 'sell' | 'buy') => {
    if (!selectedUser || !amount) {
        alert("Please select a user and enter amount");
        return;
    }

    // Show confirmation popup for both sell and buy
    const actionText = type === 'sell' ? 'send money to' : 'request money from';
    const confirmMessage = `Are you sure you want to ${actionText} ${selectedUser.username}?\n\nAmount: ${amount}\nCommission: ${commission || 0}%`;
    
    if (!confirm(confirmMessage)) {
        return;
    }

    setIsProcessing(true);
    try {
```

**REPLACE WITH:**
```tsx
const handleTransfer = async (type: 'sell' | 'buy') => {
    if (!selectedUser || !amount) {
        alert("Please select a user and enter amount");
        return;
    }

    // Show custom confirmation modal
    setConfirmAction({ type, user: selectedUser });
    setShowConfirmModal(true);
};

const handleConfirmTransfer = async () => {
    if (!confirmAction || !amount) return;

    const { type, user: selectedUserForTransfer } = confirmAction;

    setIsProcessing(true);
    setShowConfirmModal(false);
    
    try {
```

### D. Update the rest of handleConfirmTransfer (around line 126-147)

**FIND THIS CODE:**
```tsx
        const res = await walletService.requestMoney(
            selectedUser.id,
            parseFloat(amount),
            "",
            commission ? parseFloat(commission) : 0,
            requestType
        );
        
        if (res.success) {
            const successMsg = type === 'sell' 
                ? `Money transfer sent to ${selectedUser.username}. Amount is on hold until they accept.`
                : `Money request sent to ${selectedUser.username}. They will pay if they accept.`;
            alert(successMsg);
            
            // Refresh data
            await fetchAllData();
            
            setAmount("");
            setCommission("");
            setTargetQuery("");
            setSelectedUser(null);
        }
```

**REPLACE WITH:**
```tsx
        const res = await walletService.requestMoney(
            selectedUserForTransfer.id,
            parseFloat(amount),
            "",
            commission ? parseFloat(commission) : 0,
            requestType
        );
        
        if (res.success) {
            const successMsg = type === 'sell' 
                ? `Money transfer sent to ${selectedUserForTransfer.username}. Amount is on hold until they accept.`
                : `Money request sent to ${selectedUserForTransfer.username}. They will pay if they accept.`;
            alert(successMsg);
            
            // Refresh data
            await fetchAllData();
            
            setAmount("");
            setCommission("");
            setTargetQuery("");
            setSelectedUser(null);
            setConfirmAction(null);
        }
```

### E. Add the Modal Component (before the closing `</div>` and `</MainLayout>`, around line 527-529)

**FIND THIS CODE:**
```tsx
            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
        </div>
    );
}
```

**REPLACE WITH:**
```tsx
            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>

            {/* Confirmation Modal */}
            <ConfirmTransferModal
                isOpen={showConfirmModal}
                type={confirmAction?.type || 'sell'}
                username={confirmAction?.user?.username || ''}
                amount={amount}
                commission={commission}
                onConfirm={handleConfirmTransfer}
                onCancel={() => {
                    setShowConfirmModal(false);
                    setConfirmAction(null);
                }}
                isProcessing={isProcessing}
            />
        </div>
    );
}
```

## Step 3: Update Mobile Wallet Page

File: `f:\googer new\googer-next\wallet\my-wallet\page.tsx`

Follow the exact same steps as above for the mobile wallet page.

## Result

When users click "Sell" or "Buy", they will see a beautiful modal like this:

```
┌─────────────────────────────────────┐
│  [Gradient Header with Icon]        │
│     Confirm Transfer/Request        │
├─────────────────────────────────────┤
│  Transaction Details                │
│  To: @username                      │
│  Amount: ₹ 100                      │
│  Commission: 10%                    │
│  ─────────────────────────          │
│  Transfer Amount: ₹ 10              │
│                                     │
│  Amount will be held until          │
│  receiver accepts                   │
├─────────────────────────────────────┤
│  [Cancel]        [Confirm]          │
└─────────────────────────────────────┘
```

The modal features:
- ✅ Beautiful gradient header
- ✅ Clear transaction details
- ✅ Calculated transfer amount
- ✅ Helpful message about what happens next
- ✅ Cancel and Confirm buttons
- ✅ Loading state during processing
- ✅ Backdrop blur effect
- ✅ Smooth animations
