# FRONTEND IMPLEMENTATION GUIDE
**Purchase Recording - Unified Payment Status Logic**

---

## 1. QUICK PURCHASE FORM UPDATES

### 1.1 Import New Functions

**File**: `web/components/inventory/quick-consignment-form.tsx`

```typescript
import {
    calculatePaymentStatus,
    calculateBalancePending,
    getPaymentModeLabel,
    getPaymentStatusColor,
    formatPaymentInfo
} from '@/lib/purchase-payables'
```

### 1.2 Add Validation Function in Component

Insert this function BEFORE the `onSubmit` function (around line 310):

```typescript
/**
 * Validate payment inputs before submission
 * Returns validation error string or null if valid
 */
const validatePaymentInputs = (values: QuickPurchaseFormValues): string | null => {
    const mode = values.advance_payment_mode;
    const amount = Number(values.advance) || 0;
    
    // Rule 1: Non-credit modes require amount > 0
    if (mode !== 'credit' && amount <= 0) {
        return `Please enter a payment amount > 0 for ${getPaymentModeLabel(mode)} mode`;
    }
    
    // Rule 2: Amount cannot exceed bill
    if (amount > totalFinancials.billAmount && totalFinancials.billAmount > 0) {
        return `Payment amount (₹${amount}) cannot exceed bill amount (₹${totalFinancials.billAmount})`;
    }
    
    // Rule 3: Cheque needs details
    if (mode === 'cheque') {
        if (!values.advance_cheque_no) {
            return 'Cheque number is required for cheque payment';
        }
        if (!values.advance_bank_account_id) {
            return 'Bank account must be selected for cheque payment';
        }
        if (!values.advance_cheque_status && !values.advance_cheque_date) {
            return 'Please specify when the cheque will clear or mark as cleared immediately';
        }
    }
    
    // Rule 4: UPI/BANK needs account
    if (mode === 'upi_bank' && !values.advance_bank_account_id) {
        return 'Bank account selection is required for UPI/BANK payment';
    }
    
    return null;
};
```

### 1.3 Update onSubmit Function

Replace the validation section in `onSubmit` (around line 320) with:

```typescript
const onSubmit = async (values: QuickPurchaseFormValues) => {
    if (!profile?.organization_id) return
    
    // NEW: Use unified validation function
    const validationError = validatePaymentInputs(values);
    if (validationError) {
        toast.error(validationError);
        return;
    }
    
    // Keep existing logic...
    const totalAdvance = Number(values.advance) || 0;
    const totalNetBill = totalFinancials.billAmount;

    // Keep existing overpayment check (now redundant but keep as safety net)
    if (totalAdvance > totalNetBill && totalNetBill > 0) {
        toast.error(`Total Paid (₹${totalAdvance.toLocaleString()}) cannot exceed Purchase Bill Amount (₹${totalNetBill.toLocaleString()}).`);
        form.setFocus(`advance`);
        return;
    }

    // ... rest of existing logic unchanged ...
};
```

### 1.4 Add Payment Status Display

Add this calculated state in the component (after line 160 where other states are defined):

```typescript
// Payment status calculation - updates whenever form values change
const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'pending'>('pending');
const [balancePending, setBalancePending] = useState<number>(0);

useEffect(() => {
    // Create a mock lot object to calculate payment status
    const mockLot = {
        // Lot properties
        initial_qty: totalFinancials.qty || 0,
        supplier_rate: totalFinancials.rate || 0,
        less_percent: 0,
        less_units: 0,
        farmer_charges: 0,
        packing_cost: 0,
        loading_cost: 0,
        transport_share: 0,
        commission_percent: advanceValue > 0 ? rows?.[0]?.commission || 0 : 0,
        arrival_type: 'direct',
        
        // Payment properties
        advance: Number(advanceValue) || 0,
        advance_payment_mode: paymentMode,
        advance_cheque_status: form.watch('advance_cheque_status'),
        advance_cheque_no: form.watch('advance_cheque_no'),
        advance_cheque_date: form.watch('advance_cheque_date')
    };
    
    const status = calculatePaymentStatus(mockLot);
    const balance = calculateBalancePending(mockLot);
    
    setPaymentStatus(status);
    setBalancePending(balance);
}, [advanceValue, paymentMode, rows, form, totalFinancials]);
```

### 1.5 Add Status Badge to UI

Insert this in the render section where "ADVANCE / PAYOUT" section is displayed (around line 650):

```typescript
{/* NEW: Payment Status Badge */}
<div className="flex items-center justify-between mb-4">
    <div className="text-sm font-semibold text-gray-700">Balance Pending</div>
    <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-gray-900">
            ₹{balancePending.toLocaleString('en-IN', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            })}
        </span>
        <Badge className={cn(
            'uppercase text-xs font-semibold',
            getPaymentStatusColor(paymentStatus)
        )}>
            {paymentStatus === 'paid' ? '✓ Paid' : 
             paymentStatus === 'partial' ? '⚠ Partial' : 
             '⏳ Pending'}
        </Badge>
    </div>
</div>
```

---

## 2. PURCHASE BILLS PAGE UPDATES

### 2.1 Update Balance Calculation

**File**: `web/app/(main)/purchase/bills/page.tsx`

Replace the balance calculation logic (around line 180-220) with:

```typescript
// Import at top
import {
    calculatePaymentStatus,
    calculateBalancePending
} from '@/lib/purchase-payables'

// In the data processing loop:
const contactBalances = {};

data.forEach(lot => {
    const contactId = lot.contact_id;
    
    // Calculate payment status and balance using unified function
    const status = calculatePaymentStatus(lot);
    const balance = calculateBalancePending(lot);
    
    if (!contactBalances[contactId]) {
        contactBalances[contactId] = {
            name: lot.contact_name,
            status: status,
            balancePending: balance,
            advancePaid: lot.advance ? Number(lot.advance) : 0,
            paymentMode: lot.advance_payment_mode
        };
    } else {
        // For multi-lot arrivals: aggregate balance
        const existingBalance = contactBalances[contactId].balancePending;
        contactBalances[contactId].balancePending = existingBalance + balance;
        contactBalances[contactId].advancePaid += lot.advance ? Number(lot.advance) : 0;
        
        // Update status: if any lot pending, status is pending
        if (status === 'pending') {
            contactBalances[contactId].status = 'pending';
        }
    }
});

// Convert to rows for display
const displayRows = Object.entries(contactBalances).map(([contactId, balance]: any) => ({
    contactId,
    name: balance.name,
    status: balance.status,
    balance: balance.balancePending,
    advancePaid: balance.advancePaid,
    paymentMode: balance.paymentMode
}));
```

### 2.2 Update Status Badge Display

In the table body (around line 280), replace status column with:

```typescript
<TableCell className={cn(
    'font-semibold text-center',
    row.status === 'paid' ? 'text-green-700' :
    row.status === 'partial' ? 'text-orange-700' :
    'text-gray-700'
)}>
    <Badge className={cn(
        'uppercase text-xs',
        row.status === 'paid' ? 'bg-green-100 text-green-800' :
        row.status === 'partial' ? 'bg-orange-100 text-orange-800' :
        'bg-gray-100 text-gray-800'
    )}>
        {row.status === 'paid' ? '✓ Paid' :
         row.status === 'partial' ? '⚠ Partial' :
         '⏳ Pending'}
    </Badge>
</TableCell>
```

---

## 3. ARRIVALS FORM UPDATES

### 3.1 Apply Same Validation

**File**: `web/components/arrivals/arrivals-form.tsx`

Add the same `validatePaymentInputs` function and import the utility functions.

Apply in the form submission logic.

---

## 4. DISPLAY COMPONENTS

### 4.1 Reusable Payment Info Badge

**File**: `web/components/ui/payment-status-badge.tsx` (NEW)

```typescript
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getPaymentStatusColor, formatPaymentInfo } from '@/lib/purchase-payables'

interface PaymentStatusBadgeProps {
    lot: any;
    showBalance?: boolean;
    className?: string;
}

export function PaymentStatusBadge({ 
    lot, 
    showBalance = true,
    className 
}: PaymentStatusBadgeProps) {
    const {
        status,
        balance,
        mode,
        cleared
    } = formatPaymentInfo(lot);
    
    return (
        <div className={cn('flex items-center gap-2', className)}>
            {showBalance && (
                <span className="text-sm font-semibold">
                    ₹{balance.toLocaleString('en-IN', { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                    })}
                </span>
            )}
            <Badge className={cn(
                'uppercase text-xs font-semibold',
                getPaymentStatusColor(status)
            )}>
                {status === 'paid' ? '✓ Paid' :
                 status === 'partial' ? '⚠ Partial' :
                 '⏳ Pending'}
            </Badge>
        </div>
    );
}
```

---

## 5. CHEQUE CLEARING WORKFLOW

### 5.1 Update Cheque on Clearing

When a cheque is cleared, update the database:

```typescript
// Function to update cheque status when cleared
const clearCheque = async (lotId: string) => {
    const { error } = await supabase
        .schema('mandi')
        .from('lots')
        .update({
            advance_cheque_status: true,
            updated_at: new Date().toISOString()
        })
        .eq('id', lotId);
    
    if (error) throw error;
    
    // Trigger refetch of payment status in UI
    toast.success('Cheque marked as cleared. Balance updated.');
};
```

---

## 6. TESTING THE IMPLEMENTATION

### 6.1 Test Scenario 1: Fully Paid

```
1. Open Quick Purchase Entry
2. Enter: ₹12,000 bill
3. Select Payment Mode: CASH
4. Enter Amount: ₹12,000
5. Expected: Status = ✓ PAID, Balance = ₹0
6. Submit and verify in Purchase Bills
```

### 6.2 Test Scenario 2: Partial Paid

```
1. Enter: ₹12,000 bill
2. Select Payment Mode: UPI/BANK
3. Select Bank Account
4. Enter Amount: ₹5,000
5. Expected: Status = ⚠ PARTIAL, Balance = ₹7,000
6. Submit and verify
```

### 6.3 Test Scenario 3: Pending Credit

```
1. Enter: ₹12,000 bill
2. Select Payment Mode: CREDIT/UDHAAR
3. Amount: Auto-set to ₹0
4. Expected: Status = ⏳ PENDING, Balance = ₹12,000
5. Submit and verify
```

### 6.4 Test Scenario 4: Cheque Pending

```
1. Enter: ₹12,000 bill
2. Select Payment Mode: CHEQUE
3. Amount: ₹12,000
4. Cheque No: CQ001234
5. Bank: Select from dropdown
6. Uncheck "Clear Immediately"
7. Set Clearing Date: Future date
8. Expected: Status = ⏳ PENDING (even though full amount)
9. Submit
10. Verify in bills: Shows PENDING until cheque status updated
```

### 6.5 Test Scenario 5: Cheque Cleared

```
1. Same as above but CHECK "Clear Immediately"
2. Expected: Status = ✓ PAID, Balance = ₹0
```

---

## 7. FORM VALIDATION MESSAGES

Display these messages when validation fails:

| Scenario | Message |
|---|---|
| Non-credit with ₹0 | "Please enter a payment amount > 0 for CASH mode" |
| Over-payment | "Payment amount cannot exceed bill amount" |
| Cheque no number | "Cheque number is required for cheque payment" |
| Cheque no account | "Bank account must be selected for cheque payment" |
| Cheque no date | "Specify clearing date or mark as cleared immediately" |
| UPI no account | "Bank account selection is required for UPI/BANK payment" |

---

## 8. DATABASE SYNC CHECK

After deployment, verify with:

```sql
-- Check that payment functions are available
SELECT proname FROM pg_proc WHERE proname = 'get_payment_status';

-- Check that validation rules are in place
SELECT 
    lot_id,
    advance,
    advance_payment_mode,
    advance_cheque_status,
    mandi.get_payment_status(id) as payment_status
FROM mandi.lots
LIMIT 10;
```

---

## 9. DEPLOYMENT STEPS

1. **Database**: Apply migration 20260412_payment_modes_unified_logic.sql
2. **Backend**: Deploy RPC functions
3. **Frontend**: Deploy form component updates
4. **Testing**: Run scenario test suite
5. **Documentation**: Update user guides

---

## 10. QUICK REFERENCE: Function Usage

```typescript
// Calculate status
const status = calculatePaymentStatus(lot);  // Returns: 'paid' | 'partial' | 'pending'

// Calculate balance
const balance = calculateBalancePending(lot);  // Returns: number

// Format for display
const info = formatPaymentInfo(lot);  // Returns object with all payment info

// Get display label
const label = getPaymentModeLabel(lot.advance_payment_mode);  // 'Cash', 'UPI/Bank', etc

// Get badge color class
const color = getPaymentStatusColor(status);  // 'bg-green-100 text-green-800', etc
```

---

**END OF FRONTEND IMPLEMENTATION GUIDE**
