# COMPREHENSIVE PURCHASE RECORDING SPECIFICATION
**Version 1.0** | **Date: 2026-04-12** | **Scope: Quick Purchase Entry + Arrivals**

---

## 1. BUSINESS REQUIREMENTS

### 1.1 Core Purchase Scenarios

The system must handle three primary purchase scenarios with **identical logic**:
- **Quick Purchase Entry** (`/stock/quick-entry`) 
- **Arrival Entry** (Manual goods arrival)
- **Direct Purchase** (via invoices)

All three should use **same payment mode handling**:

#### SCENARIO 1: FULLY PAID
```
Bill Amount: ₹12,000
Payment Received: ₹12,000  
Balance Pending: ₹0
Status: PAID ✓
```
Payment modes that trigger FULLY PAID:
- ✓ Cash (immediate)
- ✓ UPI/Bank Transfer (immediate)
- ✓ Cheque (cleared immediately, `is_cleared = true`)

#### SCENARIO 2: PARTIAL PAID
```
Bill Amount: ₹12,000
Payment Received: ₹5,000 (advance)
Balance Pending: ₹7,000
Status: PARTIAL ⚠️
```
Conditions:
- Advance > 0
- Advance < Bill Amount
- Payment mode: Cash | UPI/Bank | Cheque (cleared)

#### SCENARIO 3: PENDING (CREDIT/UDHAAR)
```
Bill Amount: ₹12,000
Payment Received: ₹0
Balance Pending: ₹12,000
Status: PENDING ⏳
```
Conditions:
- Payment mode: CREDIT/UDHAAR (no advance)
- Payment mode: Cheque (uncleared, `is_cleared = false`)

---

## 2. PAYMENT MODES & POSTING LOGIC

### 2.1 Payment Mode Standards (Industry)

| Mode | Characteristics | Posting | Status |
|------|---|---|---|
| **CASH** | Immediate payment in cash | Posts immediately as PAID | ✓ PAID |
| **UPI/BANK** | Bank transfer/UPI | Posts immediately as PAID | ✓ PAID |
| **CHEQUE** | Instrument-based | Depends on `is_cleared` flag | Variable |
| **CREDIT/UDHAAR** | Payment deferred | Posts as PENDING | ⏳ PENDING |

### 2.2 Cheque Payment Sub-States

| State | Condition | When It Happens | Display |
|---|---|---|---|
| **PENDING** | `is_cleared = false` | Cheque given but not yet cleared | ⏳ Not yet cleared |
| **CLEARED** | `is_cleared = true` | Cheque cleared with bank | ✓ Cleared |

### 2.3 Payment Flow Rules

```
Payment Mode Selection
    ├─ CASH
    │  ├─ Amount > 0 required
    │  └─ Posts immediately
    │
    ├─ UPI/BANK
    │  ├─ Bank account required
    │  ├─ Amount > 0 required
    │  └─ Posts immediately
    │
    ├─ CHEQUE
    │  ├─ Cheque details required (No, Date, Bank)
    │  ├─ Amount > 0 required
    │  ├─ If immediately cleared (is_cleared=true)
    │  │  └─ Posts as PAID
    │  └─ If pending clearing (is_cleared=false)
    │     ├─ Future clearing date optional
    │     └─ Posts as PENDING
    │
    └─ CREDIT/UDHAAR
       ├─ No amount needed (advance = 0)
       └─ Posts as PENDING (full bill due)
```

---

## 3. DATABASE SCHEMA REQUIRED FIELDS

### 3.1 `mandi.lots` Table Columns (Payment Tracking)

```sql
-- Existing columns that track payment
advance NUMERIC DEFAULT 0
advance_payment_mode TEXT ('cash'|'bank'|'cheque'|'credit')
advance_cheque_no TEXT
advance_cheque_date DATE
advance_bank_account_id UUID → accounts(id)
advance_bank_name TEXT
advance_cheque_status BOOLEAN (true=cleared, false=pending)
```

### 3.2 `mandi.purchase_bills` Columns (Bill Tracking)

```sql
-- Status fields
payment_status TEXT ('unpaid'|'partial'|'paid')

-- Balance calculation
balance_pending NUMERIC GENERATED (net_payable - paid_amount)
```

### 3.3 `mandi.arrivals` Columns

```sql
-- Payment tracking aggregate
total_advance_paid NUMERIC
status TEXT ('pending'|'partial'|'paid')
```

---

## 4. BALANCE CALCULATION FORMULA

### Core Formula (Identical Across All Entry Types)

```javascript
// Step 1: Calculate Net Bill Amount
netBillAmount = calculateLotSettlementAmount(lot)
// Includes: gross - commission - deductions - expenses

// Step 2: Determine Payment Received Amount
advancePaid = lot.advance || 0

// Step 3: Check if Payment Was Cleared
isPaymentCleared = (
  !lot.advance_payment_mode || 
  ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
  lot.advance_cheque_status === true
)

// Step 4: Calculate Balance
balancePending = netBillAmount - (isPaymentCleared ? advancePaid : 0)

// Step 5: Determine Status
const AMOUNT_EPSILON = 0.01
if (Math.abs(balancePending) < AMOUNT_EPSILON) {
    status = 'paid'     // ✓ PAID
} else if (balancePending > AMOUNT_EPSILON && advancePaid > AMOUNT_EPSILON) {
    status = 'partial'  // ⚠️ PARTIAL
} else if (balancePending > AMOUNT_EPSILON) {
    status = 'pending'  // ⏳ PENDING
}
```

### Key Rules

1. **Uncleared cheques don't count as payment**
2. **Credit/UDHAAR always shows full balance pending**
3. **Use EPSILON (0.01) for floating-point tolerance**
4. **Status is read-only, derived from balance calculation**

---

## 5. EDGE CASES & VALIDATIONS

### 5.1 Input Validation (Form Level)

| Scenario | Validation | Error Message |
|---|---|---|
| Non-credit mode with ₹0 advance | Amount required | "Please enter a payment amount > 0 for CASH/UPI/CHEQUE" |
| Advance > Bill Amount | Overpayment check | "Advance (₹X) exceeds bill amount (₹Y)" |
| UPI/BANK without account | Bank account required | "Bank account is required for UPI/BANK payment" |
| CHEQUE without details | Details required | "Cheque number, date, and bank required" |
| CHEQUE without clear status but bank | Optional date | "If cheque not cleared immediately, specify clearing date" |

### 5.2 Data Integrity Rules

| Rule | Application | Impact |
|---|---|---|
| **One-way status transition** | PENDING → PARTIAL → PAID | Once cleared/paid, cannot revert |
| **Immutable bill amount** | Once recorded, cannot change | Adjustment recorded separately |
| **Atomic transaction** | All lots posted together | Partial failure prevents posting |
| **Idempotent cheque clearing** | Clearing same cheque multiple times safe | Balance recalculated correctly |

### 5.3 Impossible Scenarios (Prevent)

```
❌ UNPAID status with CASH payment mode
❌ PARTIAL status with CREDIT mode
❌ Balance > 0 with advance = bill_amount
❌ Uncleared cheque with is_cleared = true
❌ Advance payment without payment_mode specified
```

---

## 6. USER INTERFACE REQUIREMENTS

### 6.1 Quick Purchase Entry Form Display

```
┌─────────────────────────────────────────────────┐
│ ADVANCE / PAYOUT                                │
├─────────────────────────────────────────────────┤
│ Total Gross: ₹12,000                            │
│ Balance Pending: ₹X.XX (blue badge)             │
│                                                 │
│ PAID AMOUNT: [5000        ▼]                   │
│ PAYMENT MODE: [UPI/BANK ▼] [Select Bank ▼]    │
│              [UDHAAR] [CASH] [UPI/BANK] [CHQ]  │
│                                                 │
│ For Cheque:                                     │
│   Cheque #: [__________]                        │
│   Bank: [__________]                            │
│   Date: [__/__/____]                            │
│   ☐ Clear immediately                           │
│   If not cleared, clearing date: [__/__/____]  │
│                                                 │
│ Total Payable: ₹7,000 (calculated)              │
│                                                 │
│ [COMPLETE PURCHASE] button                      │
└─────────────────────────────────────────────────┘
```

### 6.2 Status Badges

- ✓ **PAID** (Green) - Balance = 0, payment cleared
- ⚠️ **PARTIAL** (Orange) - 0 < Balance < Bill, advance > 0
- ⏳ **PENDING** (Gray) - Balance = Bill, no payment or uncleared

---

## 7. CODE CHANGES REQUIRED

### 7.1 Database Layer

#### Migration: `create_payment_status_fields.sql`
```sql
-- Add missing columns to lots table
ALTER TABLE mandi.lots
  ADD COLUMN IF NOT EXISTS advance_cheque_status BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS advance_payment_mode_set_date TIMESTAMP DEFAULT NOW();

-- Create index for quick status queries
CREATE INDEX IF NOT EXISTS idx_lots_payment_status 
  ON mandi.lots(organization_id, advance_payment_mode, advance_cheque_status);

-- Add columns to purchase_bills
ALTER TABLE mandi.purchase_bills
  ADD COLUMN IF NOT EXISTS balance_pending NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN payment_status = 'paid' THEN 0
      ELSE net_payable - COALESCE((
        SELECT SUM(advance) FROM mandi.lots WHERE id = lot_id
      ), 0)
    END
  ) STORED;

-- Add trigger to handle payment status updates
CREATE OR REPLACE FUNCTION mandi.update_lot_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When lot advance or mode changes, recalculate status
  IF (NEW.advance IS DISTINCT FROM OLD.advance) OR 
     (NEW.advance_payment_mode IS DISTINCT FROM OLD.advance_payment_mode) OR
     (NEW.advance_cheque_status IS DISTINCT FROM OLD.advance_cheque_status) THEN
    -- Status will be derived from lots, no update needed here
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 7.2 RPC Function: Enhanced `record_quick_purchase`

**File**: `supabase/migrations/20260412_payment_modes_fix.sql`

```sql
CREATE OR REPLACE FUNCTION mandi.record_quick_purchase(
    p_organization_id uuid,
    p_supplier_id uuid,
    p_arrival_date date,
    p_arrival_type text,
    p_items jsonb,
    p_advance numeric DEFAULT 0,
    p_advance_payment_mode text DEFAULT 'credit'::text,
    p_advance_bank_account_id uuid DEFAULT NULL::uuid,
    p_advance_cheque_no text DEFAULT NULL::text,
    p_advance_cheque_date date DEFAULT NULL::date,
    p_advance_bank_name text DEFAULT NULL::text,
    p_advance_cheque_status boolean DEFAULT false,
    p_clear_instantly boolean DEFAULT false,
    p_created_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
...
BEGIN
    -- VALIDATIONS (NEW)
    -- 1. Pre-validation: Payment mode logic
    IF p_advance_payment_mode != 'credit' AND p_advance <= 0 THEN
        RAISE EXCEPTION 'Payment amount required for % mode', UPPER(p_advance_payment_mode);
    END IF;
    
    -- 2. Cheque validation
    IF p_advance_payment_mode = 'cheque' THEN
        IF p_advance_cheque_no IS NULL OR p_advance_bank_name IS NULL THEN
            RAISE EXCEPTION 'Cheque details (number, bank, date) required for cheque payment';
        END IF;
        IF NOT p_advance_cheque_status AND p_advance_cheque_date IS NULL THEN
            RAISE EXCEPTION 'Expected clearing date required for uncleared cheque';
        END IF;
    END IF;
    
    -- 3. UPI/BANK validation
    IF p_advance_payment_mode = 'bank' AND p_advance_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'Bank account required for UPI/BANK payment';
    END IF;
    
    -- EXISTING LOGIC FOR ARRIVAL & LOTS...
    
    -- 4. Store Advance Reference (UPDATED)
    IF v_first_lot_id IS NOT NULL THEN
        UPDATE mandi.lots SET
            advance = CASE 
                WHEN p_advance_payment_mode = 'credit' THEN 0
                ELSE p_advance
            END,
            advance_payment_mode = p_advance_payment_mode,
            advance_cheque_no = CASE 
                WHEN p_advance_payment_mode = 'cheque' THEN p_advance_cheque_no
                ELSE NULL
            END,
            advance_cheque_date = CASE 
                WHEN p_advance_payment_mode = 'cheque' THEN p_advance_cheque_date
                ELSE NULL
            END,
            advance_bank_name = CASE 
                WHEN p_advance_payment_mode IN ('bank', 'cheque') THEN p_advance_bank_name
                ELSE NULL
            END,
            advance_bank_account_id = CASE 
                WHEN p_advance_payment_mode IN ('bank', 'cheque') THEN p_advance_bank_account_id
                ELSE NULL
            END,
            advance_cheque_status = CASE 
                WHEN p_advance_payment_mode = 'cheque' THEN p_advance_cheque_status
                ELSE false
            END
        WHERE id = v_first_lot_id;
    END IF;
    
    RETURN jsonb_build_object(...);
END;
$function$;
```

### 7.3 Payment Status Calculation Function

**File**: `web/lib/purchase-payables.ts` (NEW FUNCTION)

```typescript
/**
 * Determine payment status based on bill amount and advance payment
 * IDENTICAL logic used across Quick Purchase, Arrivals, Purchase Bills
 */
export function calculatePaymentStatus(lot: any): 'paid' | 'partial' | 'pending' {
    const AMOUNT_EPSILON = 0.01;
    
    const netBillAmount = calculateLotSettlementAmount(lot);
    const advancePaid = toNumber(lot?.advance);
    
    // Check if payment was actually cleared (not uncleared cheques)
    const isPaymentCleared = 
        !lot?.advance_payment_mode || 
        ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
        lot.advance_cheque_status === true;
    
    // Calculate balance
    const effectivePaidAmount = isPaymentCleared ? advancePaid : 0;
    const balancePending = netBillAmount - effectivePaidAmount;
    
    // Determine status
    if (Math.abs(balancePending) < AMOUNT_EPSILON) {
        return 'paid';
    } else if (balancePending > AMOUNT_EPSILON && effectivePaidAmount > AMOUNT_EPSILON) {
        return 'partial';
    } else {
        return 'pending';
    }
}

/**
 * Get balance amount for display
 */
export function calculateBalancePending(lot: any): number {
    const AMOUNT_EPSILON = 0.01;
    const netBillAmount = calculateLotSettlementAmount(lot);
    
    const isPaymentCleared = 
        !lot?.advance_payment_mode || 
        ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
        lot.advance_cheque_status === true;
    
    const effectivePaidAmount = isPaymentCleared ? toNumber(lot?.advance) : 0;
    const balance = netBillAmount - effectivePaidAmount;
    
    return Math.abs(balance) < AMOUNT_EPSILON ? 0 : balance;
}
```

### 7.4 Quick Purchase Form Updates

**File**: `web/components/inventory/quick-consignment-form.tsx` (CHANGES)

```typescript
// 1. Add validation helper
const validatePaymentInputs = (values: QuickPurchaseFormValues) => {
    const mode = values.advance_payment_mode;
    const amount = Number(values.advance) || 0;
    
    // Rule 1: Non-credit modes require amount > 0
    if (mode !== 'credit' && amount <= 0) {
        return `Payment amount required for ${mode.toUpperCase()} mode`;
    }
    
    // Rule 2: Amount cannot exceed bill
    if (amount > totalFinancials.billAmount) {
        return `Amount exceeds bill by ₹${amount - totalFinancials.billAmount}`;
    }
    
    // Rule 3: Cheque needs details
    if (mode === 'cheque') {
        if (!values.advance_cheque_no || !values.advance_bank_name) {
            return 'Cheque number and bank are required';
        }
        if (!values.advance_cheque_status && !values.advance_cheque_date) {
            return 'Please specify when cheque will clear';
        }
    }
    
    // Rule 4: Bank/UPI needs account
    if (mode === 'upi_bank' && !values.advance_bank_account_id) {
        return 'Bank account selection required';
    }
    
    return null;
};

// 2. Update submitted validation
const onSubmit = async (values: QuickPurchaseFormValues) => {
    const validationError = validatePaymentInputs(values);
    if (validationError) {
        toast.error(validationError);
        return;
    }
    
    // ... existing logic ...
};

// 3. Add display of status badge (ADDED)
const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'pending'>('pending');

useEffect(() => {
    // Mock lot for calculation
    const mockLot = {
        initial_qty: totalFinancials.qty,
        supplier_rate: totalFinancials.rate,
        commission_percent: values.rows[0]?.commission || 0,
        advance: Number(values.advance) || 0,
        advance_payment_mode: values.advance_payment_mode,
        advance_cheque_status: values.advance_cheque_status,
        less_percent: 0,
        farmer_charges: 0,
        packing_cost: 0,
        loading_cost: 0,
        transport_share: 0
    };
    
    const status = calculatePaymentStatus(mockLot);
    setPaymentStatus(status);
}, [values.advance, values.advance_payment_mode, values.advance_cheque_status]);

// 4. Add status badge to UI
<div className="text-sm font-semibold">
    Balance Pending:{' '}
    <span className={cn(
        paymentStatus === 'paid' ? 'text-green-600' :
        paymentStatus === 'partial' ? 'text-orange-600' :
        'text-gray-600'
    )}>
        ₹{balancePending}
    </span>
    <Badge className={cn(
        paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
        paymentStatus === 'partial' ? 'bg-orange-100 text-orange-800' :
        'bg-gray-100 text-gray-800'
    )}>
        {paymentStatus.toUpperCase()}
    </Badge>
</div>
```

### 7.5 Purchase Bills Page Updates

**File**: `web/app/(main)/purchase/bills/page.tsx` (CHANGES)

```typescript
// Use same calculation as Quick Purchase
const contactBalances = {};

data.forEach(lot => {
    const contactId = lot.contact_id;
    const status = calculatePaymentStatus(lot);
    const balance = calculateBalancePending(lot);
    const netAmount = calculateLotSettlementAmount(lot);
    
    if (!contactBalances[contactId]) {
        contactBalances[contactId] = {
            name: lot.contact_name,
            netAmount: 0,
            advancePaid: 0,
            balancePending: 0,
            status: 'pending',
            payments: []
        };
    }
    
    contactBalances[contactId].netAmount += netAmount;
    contactBalances[contactId].advancePaid += lot.advance ? Number(lot.advance) : 0;
    contactBalances[contactId].balancePending = balance;
    contactBalances[contactId].status = status;
    contactBalances[contactId].payments.push({
        mode: lot.advance_payment_mode,
        amount: lot.advance,
        chequeNo: lot.advance_cheque_no,
        chequeStatus: lot.advance_cheque_status
    });
});
```

### 7.6 Arrivals Form Updates

**File**: `web/components/arrivals/arrivals-form.tsx` (CHANGES)

```typescript
// Add same payment mode logic and validations as Quick Purchase
// Apply identical calculatePaymentStatus function
```

---

## 8. MIGRATION STRATEGY (Multi-Tenant)

### 8.1 Safe Migration Steps

```sql
-- Step 1: Add missing columns (safe, no data loss)
ALTER TABLE mandi.lots ADD COLUMN ... (idempotent);

-- Step 2: Backfill calculated values (selective)
UPDATE mandi.lots SET advance_cheque_status = false 
WHERE advance_payment_mode = 'cheque' AND advance_cheque_status IS NULL;

UPDATE mandi.lots SET advance_payment_mode = 'credit'
WHERE advance = 0 AND advance_payment_mode IS NULL;

-- Step 3: Create indexes for performance
CREATE INDEX ... (idempotent);

-- Step 4: Validate data integrity
SELECT COUNT(*) WHERE balance_calculation_invalid;
```

### 8.2 Per-Tenant Application

```bash
# For each organization:
for org_id in $(select distinct organization_id from mandi.arrivals); do
  supabase migration apply $org_id 20260412_payment_modes_fix.sql
done
```

---

## 9. TESTING CHECKLIST

### 9.1 Scenario Testing

- [ ] Quick Purchase: PAID (Cash ₹12K on ₹12K bill)
- [ ] Quick Purchase: PARTIAL (Cash ₹5K on ₹12K bill → ₹7K pending)
- [ ] Quick Purchase: PENDING (No payment, shows ₹12K pending)
- [ ] Quick Purchase: CREDIT (UDHAAR selected, ₹12K pending)
- [ ] Quick Purchase: Cheque (Cleared immediately, shows PAID)
- [ ] Quick Purchase: Cheque (Pending clearing, shows PENDING)
- [ ] Purchase Bills: All three scenarios
- [ ] Arrivals: All three scenarios

### 9.2 Edge Case Testing

- [ ] Overpayment prevention (prevents advance > bill)
- [ ] Zero payment with non-credit mode (shows error)
- [ ] Cheque without account (shows error)
- [ ] UPI without bank account (shows error)
- [ ] Update advance after recording (recalculates status)
- [ ] Multi-lot arrival (sums correctly)

### 9.3 Performance Testing

- [ ] Load test: 10K records queryable < 2s
- [ ] Calculate payment status < 5ms per lot
- [ ] Bulk update (clear 1000 cheques) < 5s

---

## 10. DEPLOYMENT CHECKLIST

- [ ] Database migration created and tested
- [ ] RPC function deployed and validated
- [ ] Frontend components updated
- [ ] Form validation rules implemented
- [ ] Payment calculation utility exported
- [ ] All tenants migrated
- [ ] Regression tests passed
- [ ] User documentation updated
- [ ] Support team trained

---

## 11. FILES REQUIRING CHANGES

### Backend (Database)
1. `supabase/migrations/20260412_payment_modes_fix.sql` - NEW
2. `supabase/migrations/20260331_fix_quick_purchase_ledger.sql` - MODIFY `record_quick_purchase`

### Frontend Components
1. `web/lib/purchase-payables.ts` - ADD functions
2. `web/components/inventory/quick-consignment-form.tsx` - UPDATE validation
3. `web/app/(main)/purchase/bills/page.tsx` - UPDATE calculation
4. `web/components/arrivals/arrivals-form.tsx` - UPDATE validation

### Configuration
1. `.env.example` - Document payment modes
2. `README.md` - Update payment mode documentation

---

## 12. TESTING SCRIPT (E2E)

```bash
# Test all scenarios
npm run test:purchase-recording

# Results
✓ Scenario 1: Fully Paid (Cash)
✓ Scenario 2: Partial Paid
✓ Scenario 3: Pending (Credit)
✓ Edge Case: Cheque Validation
✓ Edge Case: Overpayment Prevention
```

---

**END OF SPECIFICATION**
