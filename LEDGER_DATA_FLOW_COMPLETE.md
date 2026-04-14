# MandiPro Ledger System - Data Flow & Integration Guide

## 📍 PART 1: Where Ledger Data Is Fetched/Calculated

### 1.1 Sales Ledger Data Entry Points

#### Source 1: Invoice Creation (new-sale-form.tsx)
```
├─ User submits sale form
├─ Form data validated (amount_received, payment_mode, etc)
├─ RPC: confirm_sale_transaction() called
│  ├─ Inserts: mandi.sales record
│  ├─ Creates: Goods ledger entry (inventory → party)
│  ├─ Creates: Receipt ledger entry (if paid immediately)
│  └─ Sets: payment_status field in sales
└─ Returns: sale_id + all generated ledger data

Data persisted in:
├─ mandi.sales (transaction header)
├─ mandi.ledger_entries (GL lines)
└─ mandi.day_book (via trigger)
```

**File**: `web/components/sales/new-sale-form.tsx`  
**RPC Called**: `mandi.confirm_sale_transaction()`  
**Ledger Entries Created**: 2-3 entries (goods + receipt if paid)

---

#### Source 2: Payment Receipt (new-receipt-dialog.tsx)
```
├─ User records payment against existing sale
├─ Dialog submitted with:
│  ├─ sale_id (which invoice)
│  ├─ amount (payment amount)
│  └─ payment_mode (cash/cheque/bank)
├─ Service: billing-service.createPaymentVoucher()
│  ├─ Creates: mandi.receipts record
│  ├─ Creates: 2 ledger entries (double-entry):
│  │  ├─ DEBIT: Party payable (reducing debt)
│  │  └─ CREDIT: Cash account (cash out)
│  └─ Triggers: auto-posting of receipt ledger
└─ Returns: receipt_id + ledger entries

Data persisted in:
├─ mandi.receipts (payment record)
├─ mandi.ledger_entries (2 new GL lines)
└─ mandi.sales.amount_received updated (via UI refresh)
```

**File**: `web/components/accounting/new-receipt-dialog.tsx`  
**Service**: `web/lib/services/billing-service.ts`  
**Ledger Entries Created**: 2 entries (payment double-entry)

---

#### Source 3: Sales Data Query (ledger-statement-dialog.tsx)
```
├─ User opens ledger statement for specific buyer
├─ RPC Query: get_ledger_statement(buyer_id)
├─ Database returns:
│  ├─ All ledger_entries for contact_id = buyer_id
│  ├─ Filtered by date range
│  ├─ Includes running balance calculation
│  └─ Sorted chronologically
├─ Frontend displays:
│  ├─ Date, type, debit, credit, balance
│  ├─ Links to source (invoice #, receipt #)
│  └─ Export to PDF option
└─ Calculations done: Running balance = SUM(debits) - SUM(credits)

Data source: mandi.ledger_entries table
Calculation: See `get_ledger_statement()` RPC logic
Display: ledger-statement-dialog.tsx component
```

**File**: `web/components/finance/ledger-statement-dialog.tsx`  
**RPC Called**: `mandi.get_ledger_statement(contact_id)`  
**Data Retrieved**: All ledger entries with running balance

---

### 1.2 Purchase Ledger Data Entry Points

#### Source 1: Arrival Posted (post_arrival_ledger RPC)
```
├─ Purchase arrival created (goods received from supplier)
├─ Automatic RPC trigger: post_arrival_ledger(arrival_id)
├─ RPC logic:
│  ├─ Deletes old ledger entries for this arrival (idempotent)
│  ├─ Creates NEW ledger entries:
│  │  ├─ Goods entry: DEBIT purchase account, CREDIT supplier
│  │  ├─ Advance payment entries: if advance_total paid
│  │  ├─ Commission entries: if applicable
│  │  └─ Expense recovery entries: if applicable
│  ├─ Calculates: payment_status
│  │  ├─ If advance_total ≈ bill_amount → 'paid'
│  │  ├─ If 0 < advance_total < bill_amount → 'partial'
│  │  └─ If advance_total = 0 → 'pending'
│  └─ Updates: arrival.payment_status field
└─ Returns: Updated arrival + all generated ledger data

Data persisted in:
├─ mandi.arrivals (transaction header + payment_status)
├─ mandi.ledger_entries (GL lines for goods + payments)
└─ mandi.day_book (via trigger)
```

**File**: `supabase/migrations/20260421130000_strict_partial_payment_status.sql`  
**Function**: `mandi.post_arrival_ledger(p_arrival_id uuid)`  
**Ledger Entries Created**: 4-6 entries (goods, advance, commission, expenses)

---

#### Source 2: Supplier Payment (supplier-inwards-dialog.tsx)
```
├─ User records advance payment for supplier
├─ Dialog submitted with:
│  ├─ arrival_id (which purchase)
│  ├─ advance_amount (payment amount)
│  └─ advance_payment_mode (cash/cheque/upi/credit)
├─ Updates: lot.advance and lot.advance_payment_mode
├─ Automatic trigger: post_arrival_ledger(arrival_id)
│  ├─ Recalculates all ledger entries for this arrival
│  ├─ Creates payment ledger entry: DEBIT supplier, CREDIT bank
│  └─ Recalculates payment_status
└─ Frontend re-queries arrival status

Data persisted in:
├─ mandi.lots (advance amount stored here)
├─ mandi.arrivals (re-calculated payment_status)
├─ mandi.ledger_entries (payment ledger entry created)
└─ mandi.day_book (updated via trigger)
```

**File**: `web/components/purchase/supplier-inwards-dialog.tsx`  
**RPC Triggered**: `post_arrival_ledger()` (automatic)  
**Ledger Entries Affected**: +1 payment entry

---

#### Source 3: Purchase Data Query
```
├─ User views purchase bill details
├─ Component: purchase-bill-details.tsx queries:
│  ├─ mandi.arrivals table (bill header)
│  ├─ mandi.lots table (individual items)
│  └─ mandi.ledger_entries (GL verification)
├─ Calculates displayed information:
│  ├─ Bill amount = SUM(lot quantities × prices)
│  ├─ Advance paid = SUM(lot.advance)
│  ├─ Balance pending = bill_amount - advance_paid
│  └─ Payment status = calculatePaymentStatus(arrival)
└─ Displays: Summary with all calculated values

Data source: mandi.arrivals, mandi.lots, mandi.ledger_entries
Calculation: `calculatePaymentStatus()` in purchase-payables.ts
```

**File**: `web/components/purchase/purchase-bill-details.tsx`  
**Data Retrieved**: Arrival + lots + ledger
**Calculation Used**: `calculatePaymentStatus()`

---

### 1.3 Ledger Calculation Logic

#### Payment Status Calculation Algorithm
```typescript
// File: web/lib/purchase-payables.ts
export function calculatePaymentStatus(lot) {
  // Step 1: Calculate net bill amount
  const netBillAmount = calculateLotGrossValue(lot);
  
  // Step 2: Determine if payment was actually cleared
  const isPaymentCleared = 
    !lot?.advance_payment_mode || 
    ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
    (lot?.advance_payment_mode === 'cheque' && lot?.advance_cheque_status === true);
  
  // Step 3: Calculate effective paid amount
  const effectivePaidAmount = isPaymentCleared ? (lot?.advance || 0) : 0;
  
  // Step 4: Calculate balance pending
  let balancePending = netBillAmount - effectivePaidAmount;
  
  // Step 5: Apply epsilon tolerance (0.01 = 1 paisa)
  if (Math.abs(balancePending) < 0.01) balancePending = 0;
  
  // Step 6: Determine status
  if (balancePending ≈ 0) return 'paid';
  if (balancePending > 0 && effectivePaidAmount > 0) return 'partial';
  return 'pending';
}

Key Rules:
• Uncleared cheques NEVER count as payment
• Payment must be cleared to update status
• Balance uses EPSILON tolerance (floating-point safety)
• Only goods count in bill amount (not tax/fees separately in this logic)
```

Located in: `web/lib/purchase-payables.ts` (lines 114-165)

---

#### Double-Entry Verification
```typescript
// File: web/lib/finance/voucher-integrity.ts
export function isVoucherBalanced(legs: LedgerLegLike[]): boolean {
  const imbalance = Math.abs(
    legs.reduce((sum, leg) => sum + (leg.debit || 0) - (leg.credit || 0), 0)
  );
  return imbalance < VOUCHER_BALANCE_EPSILON; // 0.01
}

// Every valid voucher must satisfy:
// Σ(debit) = Σ(credit) within 0.01 tolerance
```

Used in: Audit, day-book validation, payment verification

---

### 1.4 Running Balance Calculation

```sql
-- File: supabase/migrations/20260420_party_ledger_detail_fix.sql
-- In the get_ledger_statement() function:

SELECT 
  entry_date,
  debit,
  credit,
  SUM(debit - credit) OVER (
    PARTITION BY contact_id 
    ORDER BY entry_date, id
  ) as running_balance
FROM mandi.ledger_entries
WHERE contact_id = p_contact_id
ORDER BY entry_date ASC, id ASC;

Result Logic:
├─ Start: running_balance = 0
├─ For each entry (chronologically):
│  ├─ If DEBIT: running_balance += amount
│  └─ If CREDIT: running_balance -= amount
└─ Display: Final balance = outstanding owed/receivable

Balance Direction:
├─ For creditor (supplier): positive = they owe us
├─ For debtor (buyer): positive = we owe them
└─ (Actually inverted in implementation based on account classification)
```

---

---

## 📍 PART 2: How Sales Data Flows to Ledger

### Flow Map: Complete Sales Transaction

```
START: User in /app/(main)/sales/new/page.tsx
  ↓
COMPONENT: web/components/sales/new-sale-form.tsx
  ├─ Lifecycle: React form state management
  ├─ State tracked:
  │  ├─ buyer_id
  │  ├─ sale_date
  │  ├─ lots_selected[] (what items being sold)
  │  ├─ total_amount (calculated)
  │  ├─ amount_received (user input)
  │  ├─ payment_mode (user selects: cash/credit/cheque/etc)
  │  ├─ cheque_details (if payment_mode = cheque)
  │  └─ payment_status (auto-calculated based on payment_mode)
  │
  ├─ Validation (onSubmit):
  │  ├─ Check buyer_id not null
  │  ├─ Check at least 1 lot selected
  │  ├─ Check amount_received ≤ total_amount
  │  ├─ If payment_mode = cheque: validate cheque fields
  │  ├─ If payment_mode = credit: set amount_received = 0
  │  └─ If validation fails: show toast error, abort
  │
  └─ Build RPC payload:
     ├─ p_buyer_id = buyer_id
     ├─ p_sale_date = selected date
     ├─ p_total_amount = calculated total
     ├─ p_lots = lots_selected[] as JSONB
     ├─ p_amount_received = amount entered
     ├─ p_payment_mode = selected payment mode
     ├─ p_cheque_details = cheque info if applicable
     └─ ... (+ 13 more parameters)
       ↓
RPC EXECUTED: mandi.confirm_sale_transaction()
  Location: supabase/migrations/20260425000000_fix_cash_sales_payment_status.sql
  Input: All parameters from above
  
  Processing in RPC:
  ├─ Step 1: Validate inputs
  │  ├─ buyer must exist in mandi.contacts
  │  ├─ lots must exist in mandi.lots
  │  ├─ total_amount must match calculation
  │  └─ No duplicates in lots[]
  │
  ├─ Step 2: INSERT mandi.sales record
  │  └─ Generate: sale_id (UUID)
  │
  ├─ Step 3: CREATE GOODS LEDGER ENTRY
  │  ├─ transaction_type = 'goods'
  │  ├─ contact_id = buyer_id
  │  ├─ debit = total_amount (inventory sold)
  │  ├─ credit = NULL (uses reference_id to track)
  │  ├─ reference_id = sale_id
  │  └─ entry_date = sale_date
  │     (Actually creates multiple GL legs per ledger design)
  │
  ├─ Step 4: IF PAID IMMEDIATELY
  │  └─ Determine if paid:
  │     ├─ payment_mode IN ('cash', 'upi', 'bank_transfer', 'UPI/BANK')
  │     ├─ OR (payment_mode = 'cheque' AND cheque_status = true)
  │     → YES: Create RECEIPT entry
  │
  │  CREATE RECEIPT LEDGER ENTRY:
  │  ├─ transaction_type = 'receipt'
  │  ├─ contact_id = buyer_id
  │  ├─ debit = amount_received (cash collected)
  │  ├─ credit = NULL
  │  ├─ reference_id = sale_id
  │  └─ entry_date = sale_date
  │
  ├─ Step 5: DECREMENT LOT QUANTITIES
  │  └─ For each lot in lots[]:
  │     ├─ UPDATE mandi.lots
  │     │  SET quantity_available -= quantity_sold
  │     └─ Only if quantity_available >= quantity_sold
  │
  ├─ Step 6: CALCULATE PAYMENT STATUS
  │  └─ IF amount_received ≈ total_amount → 'paid'
  │     ELSE IF amount_received > 0 → 'partial'
  │     ELSE IF payment_mode = 'credit' → 'pending'
  │     ELSE IF payment_mode = 'cheque' AND !cheque_cleared → 'pending'
  │     ELSE → 'pending'
  │
  ├─ Step 7: UPDATE mandi.sales.payment_status
  │  └─ SET payment_status = (calculated value)
  │
  └─ Step 8: RETURN result object
     ├─ sale_id
     ├─ entries_created: 2-3
     ├─ ledger_entries[]: all GL lines
     └─ status: 'success'
       ↓
TRIGGER FIRES: trg_auto_post_sales_ledger (if exists)
  ├─ Auto-inserts into mandi.day_book
  ├─ Groups entries by transaction type
  ├─ Aggregates debits/credits
  └─ Timestamp: NOW()
       ↓
FRONTEND RECEIVES: RPC Result
  ├─ If error: show toast
  │  └─ Display RPC error message (helpful for debugging)
  │
  └─ If success:
     ├─ Show success toast
     ├─ Auto-dismiss dialog
     ├─ Redirect to: /sales/invoice/[sale_id]
     └─ Display newly created invoice
          ↓
PAGE RENDERS: Invoice Detail Page
  ├─ URL: /sales/invoice/[sale_id]/page.tsx
  ├─ Query: mandi.sales WHERE id = sale_id
  ├─ Display:
  │  ├─ Buyer name
  │  ├─ Lot details (what was sold)
  │  ├─ Total amount
  │  ├─ Amount received
  │  ├─ Outstanding balance = total - received
  │  ├─ Payment status badge (PAID/PARTIAL/PENDING)
  │  └─ "View Ledger" link
          ↓
USER VIEWS LEDGER: ledger-statement-dialog.tsx
  ├─ Clicks "View Ledger" on invoice
  ├─ RPC Query: mandi.get_ledger_statement(buyer_id)
  ├─ Returns all ledger entries for this buyer:
  │  ├─ The goods entry (from Step 3)
  │  ├─ The receipt entry (from Step 4, if paid)
  │  ├─ Any previous entries
  │  └─ Running balance for each
  ├─ Display: Ledger statement with:
  │  ├─ Entry date: [sale_date]
  │  ├─ Type: [Goods/Receipt]
  │  ├─ Debit: [amount] / Credit: [amount]
  │  ├─ Running Balance: [calculated]
  │  └─ Reference: Sale/Receipt ID
          ✓
END: Data persisted in ledger, visible to users
```

### Database State After Sales Transaction

```sql
-- Table: mandi.sales
INSERT INTO mandi.sales (
  id, buyer_id, sale_date, total_amount, amount_received, 
  payment_status, payment_mode, ...
) VALUES (
  'abc-123', 'buyer-456', '2026-04-13', 10000, 5000,
  'partial', 'cash', ...
);

-- Table: mandi.ledger_entries
-- Entry 1: Goods
INSERT INTO mandi.ledger_entries (
  contact_id, debit, credit, transaction_type, reference_id, entry_date, ...
) VALUES (
  'buyer-456', 10000, NULL, 'goods', 'abc-123', '2026-04-13', ...
);

-- Entry 2: Receipt (if paid)
INSERT INTO mandi.ledger_entries (
  contact_id, debit, credit, transaction_type, reference_id, entry_date, ...
) VALUES (
  'buyer-456', 5000, NULL, 'receipt', 'abc-123', '2026-04-13', ...
);

-- Table: mandi.day_book (auto-updated by trigger)
UPDATE mandi.day_book 
SET debit_total = 10000 + 5000, credit_total = 0
WHERE entry_date = '2026-04-13' AND transaction_type IN ('goods', 'receipt');

-- Query: Running balance for buyer
SELECT SUM(debit) - SUM(credit) FROM mandi.ledger_entries 
WHERE contact_id = 'buyer-456' AND entry_date <= '2026-04-13';
-- Result: 10000 - 5000 = 5000 outstanding
```

---

---

## 📍 PART 3: How Purchase Data Flows to Ledger

### Flow Map: Complete Purchase Transaction

```
START: Supplier delivers goods
  ↓
COMPONENT: Arrival created (via inventory module)
  │ (not shown here - focus on ledger flow)
  ↓
AUTOMATIC TRIGGER: post_arrival_ledger RPC called
  Location: supabase/migrations/20260421130000_strict_partial_payment_status.sql
  Function: mandi.post_arrival_ledger(p_arrival_id uuid)
  
  Processing:
  ├─ Step 1: FETCH arrival details
  │  └─ SELECT * FROM mandi.arrivals WHERE id = p_arrival_id
  │
  ├─ Step 2: DELETE OLD LEDGER ENTRIES (idempotent!)
  │  └─ DELETE FROM mandi.ledger_entries 
  │     WHERE reference_id = p_arrival_id
  │     (Ensures rebuild is fresh, no duplicates)
  │
  ├─ Step 3: FOR EACH LOT IN ARRIVAL
  │  │  (Build ledger entries based on lot type)
  │  │
  │  └─ Create GOODS LEDGER ENTRY:
  │     ├─ transaction_type = 'goods'
  │     ├─ contact_id = supplier_id
  │     ├─ debit = lot_amount (purchase cost)
  │     ├─ credit = NULL
  │     ├─ reference_id = arrival_id
  │     └─ entry_date = arrival_date
  │
  ├─ Step 4: IF ADVANCE PAYMENT EXISTS
  │  │  (Check lot.advance > 0)
  │  │
  │  └─ Create PAYMENT LEDGER ENTRY:
  │     ├─ transaction_type = 'payment'
  │     ├─ contact_id = supplier_id
  │     ├─ debit = lot.advance (payment made)
  │     ├─ credit = NULL
  │     ├─ reference_id = arrival_id
  │     └─ entry_date = arrival_date
  │
  ├─ Step 5: CALCULATE PAYMENT STATUS
  │  └─ Based on lot.advance_payment_mode and amount:
  │     ├─ If advance_payment_mode IN ('cash', 'bank', 'upi')
  │     │  └─ Counts as cleared → affects status
  │     ├─ If advance_payment_mode = 'cheque'
  │     │  ├─ If lot.advance_cheque_status = TRUE → counts
  │     │  └─ If lot.advance_cheque_status = FALSE → pending
  │     └─ If advance_payment_mode = 'credit' or NULL
  │        └─ Does NOT count
  │
  │  Calculate:
  │  ├─ total_bill_amount = SUM(lot amounts)
  │  ├─ total_advance_paid = SUM(lot.advance WHERE cleared)
  │  ├─ balance_pending = total_bill_amount - total_advance_paid
  │  └─ IF balance_pending ≈ 0 → 'paid'
  │     ELSE IF balance_pending > 0 && total_advance_paid > 0 → 'partial'
  │     ELSE → 'pending'
  │
  ├─ Step 6: UPDATE arrival.payment_status
  │  └─ SET payment_status = (calculated value from step 5)
  │
  └─ Step 7: RETURN updated arrival + entries created
       ↓
TRIGGER FIRES: auto-post to day_book
  ├─ Inserts aggregated entries
  └─ Groups by transaction type
       ↓
USER RECORDS PAYMENT: supplier-inwards-dialog.tsx
  ├─ Dialog submitted:
  │  ├─ arrival_id
  │  ├─ advance_amount (user enters payment)
  │  ├─ advance_payment_mode (cash/cheque/upi/credit)
  │  └─ advance_cheque_status (T/F if cheque)
  │
  ├─ Updates: lot.advance = advance_amount
  ├─ Updates: lot.advance_payment_mode = selected mode
  ├─ AUTOMATIC: post_arrival_ledger(arrival_id) called again!
  │  (Rebuilds all entries with new advance amount)
  │
  ├─ New payment_status calculated:
  │  └─ Now includes the new advance payment
  │
  └─ Frontend queries updated arrival
       ↓
DISPLAY: purchase-bill-details.tsx shows:
  ├─ Bill amount (from mandi.arrivals)
  ├─ Advance paid (from SUM(lots.advance))
  ├─ Balance pending (calculated)
  ├─ Payment status (from arrival.payment_status)
  └─ Payment mode badge

NEXT PAYMENT: When more payment recorded
  ├─ User opens supplier-inwards again
  ├─ Adds additional advance (e.g., +₹3,000)
  ├─ lot.advance updated again
  ├─ post_arrival_ledger runs (again!)
  ├─ All ledger entries rebuilt with new total
  ├─ payment_status recalculated
  └─ Display updates
       ✓
END: purchase tracked with running payment status
```

### Database State After Purchase Transaction

```sql
-- Table: mandi.arrivals
INSERT INTO mandi.arrivals (
  id, supplier_id, total_amount, advance_total, payment_status, ...
) VALUES (
  'arr-789', 'supp-101', 15000, 5000, 'partial', ...
);

-- Table: mandi.lots (individual items)
INSERT INTO mandi.lots (
  id, arrival_id, quantity, rate, amount, advance, 
  advance_payment_mode, advance_cheque_status, ...
) VALUES
  ('lot-1', 'arr-789', 10, 1000, 10000, 3000, 'cash', TRUE, ...)
  ('lot-2', 'arr-789', 5, 1000, 5000, 2000, 'cheque', FALSE, ...);

-- Table: mandi.ledger_entries
-- Entry 1: Goods for Lot 1
INSERT INTO mandi.ledger_entries (...) VALUES (
  ..., supplier_id, 10000, NULL, 'goods', 'arr-789', ...
);

-- Entry 2: Payment for Lot 1 (cash, cleared)
INSERT INTO mandi.ledger_entries (...) VALUES (
  ..., supplier_id, 3000, NULL, 'payment', 'arr-789', ...
);

-- Entry 3: Goods for Lot 2
INSERT INTO mandi.ledger_entries (...) VALUES (
  ..., supplier_id, 5000, NULL, 'goods', 'arr-789', ...
);

-- Entry 4: Payment for Lot 2 (cheque, NOT YET cleared)
-- Actually NOT created until cheque clears!
-- Or created with pending flag...

-- Payment Status Calculation:
-- total_bill = 10000 + 5000 = 15000
-- total_cleared_advance = 3000 (cash cleared) + 0 (cheque not cleared) = 3000
-- balance_pending = 15000 - 3000 = 12000
-- status = 'partial' (because balance > 0 but some payment made)

-- Query: Supplier ledger
SELECT * FROM mandi.ledger_entries 
WHERE contact_id = 'supp-101' AND entry_date <= '2026-04-13'
ORDER BY entry_date;
-- Result:
-- Entry | Type    | Debit | Credit | Balance
-- 1     | goods   | 10000 |        | 10000 (owe supplier)
-- 2     | payment | 3000  |        | 13000 (reduced owed)
-- 3     | goods   | 5000  |        | 18000 (now owe more)
-- Final balance = supplier gets ₹12,000 more
```

---

---

## 📍 PART 4: How Payments Update Ledger

### Payment Flow: Receipt from Customer

```
TRIGGER: User records payment on sales invoice
  ├─ Open: new-receipt-dialog.tsx
  ├─ Select: which invoice to clear
  ├─ Enter: amount received
  └─ Select: payment mode
       ↓
RPC CALL: billing-service.createPaymentVoucher()
  Location: web/lib/services/billing-service.ts
  
  Processing:
  ├─ Step 1: CREATE receipt record
  │  └─ INSERT INTO mandi.receipts (
  │       contact_id, amount, voucher_no, created_at, ...
  │     ) RETURNING *;
  │
  ├─ Step 2: CREATE 2 ledger entries (double-entry)
  │  │
  │  ├─ Entry A: Payment received
  │  │  ├─ contact_id = buyer_id
  │  │  ├─ debit = amount
  │  │  ├─ credit = NULL
  │  │  ├─ transaction_type = 'receipt'
  │  │  ├─ reference_id = sale_id
  │  │  └─ entry_date = TODAY
  │  │
  │  └─ Entry B: Cash account (offset)
  │     ├─ contact_id = 'cash_account' (system)
  │     ├─ debit = NULL
  │     ├─ credit = amount
  │     ├─ transaction_type = 'receipt'
  │     ├─ reference_id = sale_id
  │     └─ entry_date = TODAY
  │
  ├─ Step 3: TRIGGER auto-post
  │  └─ trg_post_receipt_ledger fires
  │     └─ Inserts into mandi.day_book
  │
  └─ Step 4: RETURN receipt_id
       ↓
FRONTEND UPDATES UI
  ├─ Dismiss dialog
  ├─ Re-query sale.amount_received
  ├─ Recalculate payment_status
  └─ Show updated balance:
     └─ Outstanding = sale_total - amount_received
          ↓
LEDGER UPDATED AUTOMATICALLY
  ├─ Query: get_ledger_statement(buyer_id)
  ├─ Returns all entries including new receipt
  ├─ Running balance recalculated:
  │  ├─ Previous balance: ₹10,000 owed
  │  ├─ New receipt: -₹5,000
  │  └─ New balance: ₹5,000 still owed
  └─ Display: "Outstanding: ₹5,000"
```

### Payment Flow: Supplier Payment via Cheque

```
TRIGGER: User records cheque payment to supplier
  ├─ Open: supplier-inwards-dialog.tsx
  ├─ Select: which arrival to pay
  ├─ Enter: amount, mode = CHEQUE
  ├─ Enter: cheque_number, bank, clearing_date
  └─ Submit
       ↓
BACKEND PROCESSING
  ├─ Step 1: UPDATE lot.advance = amount
  ├─ Step 2: UPDATE lot.advance_payment_mode = 'cheque'
  ├─ Step 3: UPDATE lot.advance_cheque_status = FALSE (not yet cleared)
  ├─ Step 4: AUTO-TRIGGER: post_arrival_ledger(arrival_id)
  │  ├─ Delete old entries (idempotent)
  │  ├─ Rebuild all entries with new amount
  │  ├─ Cheque NOT counted as payment (advance_cheque_status = FALSE)
  │  ├─ NEW payment_status calculated:
  │  │  ├─ total_bill = 15000
  │  │  ├─ cleared_amount = 0 (cheque not cleared)
  │  │  ├─ balance = 15000
  │  │  └─ status = 'pending' (back to pending!)
  │  │
  │  └─ CREATE payment ledger entry (marked as uncleared):
  │     ├─ transaction_type = 'payment'
  │     ├─ contact_id = supplier_id
  │     ├─ debit = amount
  │     ├─ status_field= 'uncleared'
  │     └─ entry_date = date_given
  │
  └─ Step 5: STORE cheque details for later clearing
       ↓
LATER: Cheque is cleared by bank
  ├─ Manual step (or webhook from bank):
  │  └─ UPDATE lot.advance_cheque_status = TRUE
  │
  ├─ AUTO-TRIGGER: post_arrival_ledger(arrival_id) again!
  │  ├─ Delete old entries (again!)
  │  ├─ Rebuild with cheque now cleared:
  │  │  ├─ total_bill = 15000
  │  │  ├─ cleared_amount = 5000 (cheque NOW cleared)
  │  │  ├─ balance = 10000
  │  │  └─ status = 'partial' (updated!)
  │  │
  │  └─ UPDATE payment ledger entry:
  │     └─ status_field = 'cleared'
  │
  └─ Frontend shows updated status: PARTIAL PAID
```

---

---

## 📍 PART 5: Current Balance Calculation Logic

### For Sales (Buyer Payables)

```typescript
// Outstanding Amount Buyer Owes

Query: All ledger entries for buyer
├─ Find all transaction_type = 'goods' entries
│  └─ SUM(debit) = total invoiced
│
├─ Find all transaction_type = 'receipt' entries
│  └─ SUM(debit) = total paid
│
└─ Outstanding = SUM(goods.debit) - SUM(receipts.debit)
   Example:
   ├─ Goods on 2026-04-10: ₹10,000 owed
   ├─ Receipt on 2026-04-11: ₹5,000 paid
   ├─ Goods on 2026-04-12: ₹3,000 owed
   └─ Total outstanding = (10000 + 3000) - 5000 = ₹8,000
```

### For Purchases (Supplier Payables)

```typescript
// Amount Owed to Supplier

Query: All ledger entries for supplier
├─ Find all transaction_type = 'goods' entries
│  └─ SUM(debit) = total invoiced (their bills to us)
│
├─ Find all transaction_type = 'payment' entries
│  └─ SUM(debit) = total paid (our payments to them)
│
└─ Balance Owed = SUM(goods.debit) - SUM(payments.debit)
   Example:
   ├─ Bill 1 on 2026-04-10: ₹15,000 owed
   ├─ Advance on 2026-04-11: ₹5,000 paid (if cleared!)
   ├─ Bill 2 on 2026-04-12: ₹8,000 owed
   └─ Total owed = (15000 + 8000) - 5000 = ₹18,000

Key: Only CLEARED payments count!
     Uncleared cheques don't reduce balance
```

### Running Balance (in Ledger Statement)

```sql
-- Chronological calculation

Entry 1 (2026-04-10): Goods ₹10,000
  └─ Running balance = 0 + 10000 = ₹10,000 owed

Entry 2 (2026-04-11): Receipt ₹5,000
  └─ Running balance = 10000 - 5000 = ₹5,000 owed

Entry 3 (2026-04-12): Goods ₹3,000
  └─ Running balance = 5000 + 3000 = ₹8,000 owed

Entry 4 (2026-04-13): Cheque ₹2,000 (uncleared)
  └─ Running balance = 8000 + 0 = ₹8,000 still owed
     (Uncleared doesn't count yet)

Entry 5 (2026-04-14): Cheque ₹2,000 (now cleared)
  └─ Running balance = 8000 - 2000 = ₹6,000 owed
```

---

---

## 📋 SUMMARY TABLE

| Aspect | How It Works | Key File | Key Function |
|--------|-------------|----------|--------------|
| **Sales Posted** | User submits form → RPC creates sale + goods + receipt entries | `new-sale-form.tsx` | `confirm_sale_transaction()` |
| **Purchase Posted** | Arrival created → RPC creates goods + advance entries | Auto (arrival creation) | `post_arrival_ledger()` |
| **Payment from Customer** | Receipt dialog → Creates 2 ledger entries (double-entry) | `new-receipt-dialog.tsx` | `createPaymentVoucher()` |
| **Payment to Supplier** | Cheque recorded → Updates lot.advance → RPC rebuilds entries | `supplier-inwards-dialog.tsx` | `post_arrival_ledger()` (again) |
| **Transaction Status** | Based on payment_mode + amount logic | `purchase-payables.ts` | `calculatePaymentStatus()` |
| **Ledger Display** | Query all GL entries per contact | `ledger-statement-dialog.tsx` | `get_ledger_statement()` |
| **Balance Calculation** | SUM(debits) - SUM(credits) with chronological ordering | SQL query | Window function in RPC |
| **Validation** | Verify double-entry integrity | `voucher-integrity.ts` | `isVoucherBalanced()` |

---

**Last Updated**: April 13, 2026  
**Document Type**: Comprehensive Data Flow Guide  
**Status**: Complete with examples and SQL
