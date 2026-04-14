# MandiPro Ledger System - Complete Codebase Architecture

## Overview
This document maps all ledger-related code across the MandiPro codebase, showing how financial data flows from transactions (sales, purchases, payments) into the ledger system.

---

## 1. LEDGER DATA & DATABASE LAYER

### Core Tables
- **`mandi.ledger_entries`** - General ledger transactions (debit/credit entries)
- **`mandi.sales`** - Sales transactions (created by confirm_sale_transaction RPC)
- **`mandi.arrivals`** - Purchase arrivals (handled by post_arrival_ledger RPC)
- **`mandi.lots`** - Individual lot purchases with advance payments
- **`mandi.receipts`** - Payment receipts (linked to sales via ledger)
- **`mandi.vouchers`** - Accounting vouchers (linked to arrivals/payments)
- **`mandi.day_book`** - Daily transaction summary (fed by ledger_entries)

### Key Columns in ledger_entries
- `contact_id` - Party/supplier/buyer linked to transaction
- `debit` / `credit` - Amount columns (double-entry bookkeeping)
- `transaction_type` - Type: 'goods', 'receipt', 'payment', 'advance', 'commission', 'income'
- `reference_id` - Links to sales.id or arrivals.id
- `voucher_id` - Optional voucher reference
- `entry_date` - When transaction posted
- `organization_id` - Multi-tenant support

---

## 2. SERVER-SIDE RPC FUNCTIONS (Database Layer)

### 2.1 Sales Transaction RPC
**File**: `supabase/migrations/20260425000000_fix_cash_sales_payment_status.sql` (latest)  
**Function**: `mandi.confirm_sale_transaction()`

**Parameters**:
```sql
p_buyer_id uuid,
p_sale_date date,
p_total_amount numeric,
p_lots jsonb,
p_amount_received numeric,
p_payment_mode text,
p_cheque_details jsonb,
... (19 total parameters)
```

**Responsibilities**:
- Validates sale data
- Inserts into `mandi.sales` table
- Creates goods ledger entries (DEBIT inventory, CREDIT party)
- For instant payments: Creates receipt ledger entries immediately
- For credit sales: Leaves payment status as 'pending'
- Decrements lot quantities from inventory
- Handles commission and expense deductions
- Sets payment_status correctly based on payment_mode:
  - CASH/UPI/BANK/cleared cheque → 'paid'
  - Uncleared cheque → 'pending'
  - Credit → 'pending'

**Ledger Entries Created**:
1. Goods entry: DEBIT inventory, CREDIT party (payable)
2. (If paid) Receipt entry: DEBIT party (cash collected), CREDIT income

**Called from**: [new-sale-form.tsx](#31-new-sale-formtsx)

---

### 2.2 Purchase Arrival RPC
**File**: `supabase/migrations/20260421130000_strict_partial_payment_status.sql` (latest)  
**Function**: `mandi.post_arrival_ledger(p_arrival_id uuid)`

**Responsibilities**:
- Called when purchase arrival is confirmed
- Deletes old ledger entries for this arrival (idempotent)
- Creates goods ledger entries for each lot:
  - DEBIT purchase account, CREDIT supplier payable
- If purchase has instant payment (advance):
  - Creates payment ledger entries
  - Links to voucher if exists
- Calculates supplier payable balance correctly
- Handles commission earned/charged
- Handles expense recovery (transport, etc.)
- Sets payment_status based on advance paid:
  - Full advance paid → 'paid'
  - Partial advance → 'partial'
  - No advance → 'pending'

**Ledger Entries Created**:
1. Goods entries (multiple, one per lot type)
2. Advance payment entries (if paid)
3. Commission entries (if applicable)
4. Expense recovery entries (if applicable)

**Called from**: 
- [new-sale-form.tsx](#31-new-sale-formtsx) after arrival created
- [rebuild-ledger-and-daybook.js](#611-rebuild-ledger-and-daybookjs) for repairs

---

### 2.3 Ledger Statement Query RPC
**File**: `supabase/migrations/20260420_party_ledger_detail_fix.sql` (latest)  
**Function**: `mandi.get_ledger_statement(p_contact_id uuid)`

**Returns**: All ledger entries for a contact with calculated running balance

**Key Logic**:
- Groups entries by contact
- Calculates balance based on contact type (is_creditor):
  - If creditor (supplier): DEBIT = credit owed by us, CREDIT = payments to them
  - If debtor (buyer): DEBIT = amount they owe, CREDIT = payments received
- Returns entries with running balance
- Orders chronologically

**Called from**: [ledger-statement-dialog.tsx](#323-ledger-statement-dialogtsx)

---

## 3. FRONTEND PAGES & COMPONENTS

### 3.1 Sales Transaction Components

#### **new-sale-form.tsx**
**Location**: `web/components/sales/new-sale-form.tsx`  
**Purpose**: Main form for creating sales invoices

**Key Functions**:
- Collects buyer, lot selection, payment details
- Validates amount_received against sale total
- Payment status calculation based on payment_mode
- Calls `confirm_sale_transaction` RPC on submit
- Shows confirmation dialog before posting to ledger
- Handles both cash and credit sales
- Supports partial payments

**Payment Flow in Component**:
```
1. Form submission triggered
2. Validate all inputs
3. Build payload for RPC
4. Call confirm_sale_transaction()
5. On success: Show success toast
6. On error: Show error details with RPC message
```

**Related**: [buyer-receivables-table.tsx](#32-buyer-receivables-tabletsx)

---

#### **buyer-receivables-table.tsx**
**Location**: `web/components/sales/buyer-receivables-table.tsx`  
**Purpose**: Displays aging receivables for a buyer

**Shows**:
- All sales to buyer with outstanding amounts
- Payment status for each invoice
- Aging (how long outstanding)
- Fetch via ledger_entries calculations

---

### 3.2 Purchase Transaction Components

#### **purchase-bill-details.tsx**
**Location**: `web/components/purchase/purchase-bill-details.tsx`  
**Purpose**: Display purchase bill summary

**Shows**:
- Lot details from arrival
- Supplier payables
- Advance payment status
- Payment_status calculated from arrival.advance total

---

#### **supplier-inwards-dialog.tsx**
**Location**: `web/components/purchase/supplier-inwards-dialog.tsx`  
**Purpose**: Record supplier payment/advance for purchase

**Functions**:
- Records advance payment against arrival
- Updates lot.advance and lot.advance_payment_mode
- Triggers post_arrival_ledger rebuild
- Updates payment_status on arrival

---

### 3.3 Ledger & Financial Components

#### **ledger-statement-dialog.tsx**
**Location**: `web/components/finance/ledger-statement-dialog.tsx`  
**Purpose**: View complete party ledger statement

**Fetches via**:
- `supabase.rpc('get_ledger_statement', { p_contact_id: buyerId })`
- Displays all entries for party in chronological order
- Shows running balance calculation
- PDF export via [printable-ledger.tsx](#333-printable-ledgertsx)

---

#### **new-payment-dialog.tsx**
**Location**: `web/components/finance/new-payment-dialog.tsx`  
**Purpose**: Record payment receipt or voucher

**Creates**:
- Receipt entry if payment from party
- Voucher entry if adjustment/allocation
- Ledger entry for double-entry bookkeeping:
  - DEBIT party (cash collected), CREDIT income
  - Links to sales via reference_id

---

#### **new-receipt-dialog.tsx**
**Location**: `web/components/accounting/new-receipt-dialog.tsx`  
**Purpose**: Create payment receipt for sale

**Functionality**:
- Records amount received from buyer
- Creates ledger receipt entry (not goods entry)
- Updates sale.amount_received
- Affects payment_status calculation

---

#### **day-book.tsx**
**Location**: `web/components/finance/day-book.tsx`  
**Purpose**: Daily transaction summary view

**Fetches from**:
- `mandi.day_book` table (aggregated from ledger_entries)
- Groups by transaction type
- Shows both goods and payment entries

**Transaction Categories**:
- SALE GOODS (inventory sold)
- SALE PAYMENT (cash received from sales)
- PURCHASE GOODS (inventory purchased)
- PURCHASE PAYMENT (cash paid to suppliers)
- ADJUSTMENTS (reversals, write-offs)

---

#### **balance-sheet.tsx**
**Location**: `web/components/finance/balance-sheet.tsx`  
**Purpose**: Financial statement showing assets/liabilities

**Fetches from ledger_entries**:
- Assets: inventory, cash, receivables
- Liabilities: payables, deferred income
- Groups by account classification

---

#### **profit-loss.tsx**
**Location**: `web/components/finance/profit-loss.tsx`  
**Purpose**: Profit & loss statement

**Calculates from ledger**:
- Revenue from sale entries
- Cost of goods sold from purchase entries
- Operating expenses
- Net profit

---

#### **trial-balance.tsx**
**Location**: `web/components/finance/trial-balance.tsx`  
**Purpose**: Trial balance report (for auditing)

**Verification**: Verifies Σ(debit) = Σ(credit)

---

#### **printable-ledger.tsx**
**Location**: `web/components/finance/printable-ledger.tsx`  
**Purpose**: Print/PDF version of ledger statement

**Formats ledger_entries for printing**

---

### 3.4 Receipts & Payments Pages

#### **receipts/page.tsx**
**Location**: `web/app/(main)/receipts/page.tsx`  
**Purpose**: List all payment receipts/vouchers

**Shows**:
- All receipts created via billing-service
- Links to sales they clear
- Fetch from `mandi.receipts` table
- Can filter by date, party, status

---

#### **finance/payments/page.tsx**
**Location**: `web/app/(main)/finance/payments/page.tsx`  
**Purpose**: Manage all payments (receipts + vouchers)

**Displays**:
- Payment receipts (from buyers)
- Expense vouchers (to suppliers)
- Grouped by type
- Links to underlying ledger entries

---

### 3.5 Sales Invoice Pages

#### **sales/page.tsx**
**Location**: `web/app/(main)/sales/page.tsx`  
**Purpose**: List all sales

**Shows**:
- All sales invoices with payment_status
- Outstanding amount per invoice
- Can filter by buyer, date, payment_status

---

#### **sales/invoice/[id]/page.tsx**
**Location**: `web/app/(main)/sales/invoice/[id]/page.tsx`  
**Purpose**: View individual sale invoice

**Displays**:
- Lot details, amounts, taxes
- Current payment_status
- Payments recorded against it (via ledger receipt entries)
- Outstanding balance

---

### 3.6 Purchase Pages

#### **purchase/bills/page.tsx**
**Location**: `web/app/(main)/purchase/bills/page.tsx`  
**Purpose**: List all purchase bills (arrivals)

**Shows**:
- All arrivals with supplier, amount, payment_status
- Outstanding balance to supplier

---

#### **purchase/invoices/page.tsx**
**Location**: `web/app/(main)/purchase/invoices/page.tsx`  
**Purpose**: Per-supplier invoice summary

---

### 3.7 Ledger Pages

#### **ledgers/page.tsx**
**Location**: `web/app/(main)/ledgers/page.tsx`  
**Purpose**: Party ledger list

**Shows**:
- All contacts with balances
- Quick access to detailed ledger

---

#### **ledgers/buyer/[id]/page.tsx**
**Location**: `web/app/(main)/ledgers/buyer/[id]/page.tsx`  
**Purpose**: Detailed ledger for specific party

**Displays**:
- All transactions for party
- Running balance
- Options to view/print as PDF

---

#### **reports/ledger/page.tsx**
**Location**: `web/app/(main)/reports/ledger/page.tsx`  
**Purpose**: Ledger report builder

**Allows**:
- Filter by date range, contact type, account
- Export to various formats

---

## 4. FRONTEND UTILITIES & HOOKS

### 4.1 TypeScript Utilities

#### **lib/mandi/confirm-sale-transaction.ts**
**Purpose**: RPC wrapper and error handling for sales

**Exports**:
- `confirmSaleTransactionWithFallback()` - Calls RPC with error handling
- `isConfirmSaleError()` - Detects specific RPC errors
- `isPaidSale()` - Calculates if sale was immediately paid

**Logic**:
```typescript
const isPaidSale = (paymentMode, chequeStatus) =>
  ["cash", "upi", "bank_transfer", "UPI/BANK"].includes(paymentMode) ||
  (paymentMode === "cheque" && chequeStatus);
```

**Called from**: [new-sale-form.tsx](#31-new-sale-formtsx)

---

#### **lib/finance/voucher-integrity.ts**
**Purpose**: Verify double-entry bookkeeping correctness

**Exports**:
- `isVoucherBalanced()` - Checks Σ(debit) = Σ(credit)
- `findImbalancedVoucherIds()` - Find broken vouchers
- `getVoucherImbalance()` - Calculate imbalance amount

**Key Constant**:
```typescript
VOUCHER_BALANCE_EPSILON = 0.01; // 1 paisa tolerance
```

**Used by**: Validation, audit reports, day-book

---

#### **lib/purchase-payables.ts**
**Purpose**: Purchase payment status logic (unified)

**Exports** (6 functions):
1. `calculatePaymentStatus(lot)` → 'paid'|'partial'|'pending'
2. `calculateBalancePending(lot)` → number
3. `validatePaymentInputs(values)` → errors or null
4. `getPaymentModeLabel(mode)` → display label
5. `getPaymentStatusColor(status)` → badge color
6. `formatPaymentInfo(lot)` → formatted object

**Key Logic**:
```typescript
const isPaymentCleared = 
  !lot?.advance_payment_mode || 
  ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
  lot?.advance_cheque_status === true;

const effectivePaidAmount = isPaymentCleared ? advancePaid : 0;
const netBillAmount = calculateLotGrossValue(lot);
const balancePending = netBillAmount - effectivePaidAmount;

status = 
  balancePending ≈ 0 ? 'paid' :
  balancePending > 0 && effectivePaid > 0 ? 'partial' :
  'pending';
```

**Payment Modes**:
| Mode | Cleared | Status |
|------|---------|--------|
| CASH | Immediate | ✓ paid |
| UPI/BANK | Immediate | ✓ paid |
| Cheque (is_cleared=true) | Immediate | ✓ paid |
| Cheque (is_cleared=false) | Pending | ⏳ pending |
| CREDIT/UDHAAR | Never | ⏳ pending |

**Used by**: 
- Purchase bills display
- Quick purchase form validation
- Supplier inwards payment recording

---

#### **lib/accounting-logic.ts**
**Purpose**: General accounting calculations

**Exports**:
- `calculateGrossRevenue(data)` - Total revenue
- `TransactionStats` interface

**Used by**: Reports, dashboard

---

### 4.2 API Services

#### **lib/services/billing-service.ts**
**Purpose**: Payment and voucher creation

**Main Functions**:
- `createPaymentVoucher()` - Create accounting entry for payment
- Creates entry in `mandi.receipts` table
- Creates corresponding ledger_entries

**Voucher Creation Flow**:
```
1. Create receipt record
2. Create 2 double-entry ledger lines:
   - DEBIT supplier (cash paid out)
   - CREDIT cash account
3. Link to arrival via reference_id
4. Return receipt ID
```

**Used by**: new-receipt-dialog, payment recording

---

#### **lib/services/branding-service.ts**
**Purpose**: PDF generation branding

**Used for**: Document headers/footers in financial exports

---

### 4.3 Hooks

#### **lib/hooks/use-offline-sync.ts**
**Purpose**: Sync transactions when offline

**Calls on reconnect**:
- `confirm_sale_transaction` for pending sales
- `post_arrival_ledger` for pending arrivals
- Payloads stored with payment_mode = 'credit' as fallback

---

## 5. DATABASE MIGRATIONS (Key Files)

### Latest Migration Strategy
All migrations organized chronologically in `/supabase/migrations/`

### Key Migrations by Topic

**Sales Flow**:
- `20260425000000_fix_cash_sales_payment_status.sql` - Latest confirm_sale_transaction
- `20260424000000_consolidate_confirm_sale_transaction.sql` - Consolidated RPC
- `20260421130000_strict_partial_payment_status.sql` - Payment mode logic

**Purchase Flow**:
- `20260421130000_strict_partial_payment_status.sql` - post_arrival_ledger with payment status
- `20260422000001_safe_ledger_cleanup.sql` - Safe ledger entry deletion
- `20260412080000_fix_arrival_ledger_no_party.sql` - Handle direct purchases

**Ledger & Reporting**:
- `20260420_party_ledger_detail_fix.sql` - get_ledger_statement function
- `20260204_ledger_statement_rpc.sql` - Initial RPC setup
- `20260413_clean_ledger_data.sql` - Ledger cleanup & wrapping

**Payment Modes**:
- `20260412_payment_modes_unified_logic.sql` - Unified payment status logic
- `20260331_fix_quick_purchase_ledger.sql` - Cheque/bank details support

**Ledger Triggers**:
- `20260405100000_finance_feedback_fixes.sql` - Trigger setup for automated posting
- Receipt & voucher triggers auto-update ledger

---

## 6. SCRIPTS & UTILITIES

### 6.1 Ledger Repair Scripts

#### **rebuild-ledger-and-daybook.js**
**Location**: `rebuild-ledger-and-daybook.js`  
**Purpose**: Repair/rebuild ledger from scratch

**Steps**:
1. Delete all ledger_entries for organization
2. For each sale: Call `confirm_sale_transaction()` RPC
3. For each arrival: Call `post_arrival_ledger()` RPC
4. Day book auto-updates from ledger_entries triggers

**Handles**: Idempotency via RPC logic

---

#### **investigate-balance.js**
**Location**: `investigate-balance.js`  
**Purpose**: Debug balance discrepancies

**Queries**:
- Fetches raw ledger_entries for contact
- Calculates balance manually
- Compares with calculated party balance

---

#### **check_ledger.js**
**Location**: `check_ledger.js`  
**Purpose**: Audit ledger health

**Checks**:
- Missing reference_ids
- Imbalanced vouchers
- Orphaned entries
- Status inconsistencies

---

### 6.2 Testing & Verification

#### **fix_payment_data_loss_recovery.sql**
**Purpose**: Test/verify receipt creation in ledger

**Scenarios**:
- Create sale
- Add receipt entry
- Verify payment_status updates
- Check ledger_entries count

---

## 7. DATA FLOW DIAGRAMS

### 7.1 Sales Transaction Flow
```
User fills out sale form
  ↓
confirm_sale_transaction RPC called
  ├─ Insert into mandi.sales
  ├─ Insert goods ledger entry (inventory → party)
  ├─ If paid: Insert receipt entry (party cash → income)
  ├─ Decrement lot quantities
  ├─ Update payment_status field in sales
  └─ Return sale_id
  ↓
Frontend shows success
  ↓
Buyer/Sales → Ledgers page shows new entries
```

### 7.2 Purchase Transaction Flow
```
Supplier delivers goods (arrival created)
  ↓
post_arrival_ledger RPC called
  ├─ DELETE old ledger entries for this arrival
  ├─ For each lot:
  │  ├─ Insert purchase goods entry
  │  ├─ If advance paid: Insert payment entry
  │  └─ Calculate payment_status
  ├─ If commission: Insert commission entry
  └─ UPDATE arrival.payment_status
  ↓
Supplier/Finance → Ledgers page shows entries
  ↓
Payment recorded via payment dialog
  ├─ UPDATE lot.advance amount
  ├─ post_arrival_ledger runs again (idempotent)
  └─ payment_status updates to 'paid'
```

### 7.3 Payment Receipt Flow
```
Customer pays ₹5,000 against invoice #10 (₹10,000)
  ↓
new-receipt-dialog submitted
  ↓
Call billing-service.createPaymentVoucher()
  ├─ INSERT into mandi.receipts
  ├─ INSERT 2 ledger lines:
  │  ├─ CREDIT income account
  │  └─ DEBIT customer payable
  └─ return receipt_id
  ↓
backend trigger: trg_post_receipt_ledger fires
  (Auto-posts if setup)
  ↓
Frontend calculates new balance via ledger query:
  amount_owed = SUM(goods debit) - SUM(payments credit)
        = 10000 - 5000 = 5000
  ↓
Sales page → Invoice #10 shows:
  - Original: ₹10,000
  - Paid: ₹5,000
  - Outstanding: ₹5,000
  - Status: PARTIAL
```

---

## 8. KEY CONCEPTS

### 8.1 Double-Entry Bookkeeping
Every transaction has exactly 2 legs:
- **Debit** (left side): Money owed to us or assets we own
- **Credit** (right side): Money we owe or income

**Example Sales Entry**:
```
DEBIT:   Inventory account    ₹10,000  (cost of goods sold)
CREDIT:  Party payable        ₹10,000  (we owe customer invoice)
```

**Example Payment Entry**:
```
DEBIT:   Cash received        ₹5,000
CREDIT:  Party payable        ₹5,000 (reducing debt)
```

### 8.2 Party Direction
**Creditor (Supplier)**:
- DEBIT = money owed to them (our liability)
- CREDIT = payments we made (asset reduction)
- Balance = net amount we owe them

**Debtor (Buyer)**:
- DEBIT = invoice amount (our asset/receivable)
- CREDIT = payments received (asset reduction)
- Balance = outstanding receivable

### 8.3 Payment Status States
- **pending** - No payment received yet OR uncleared cheque
- **partial** - Partial payment received  
- **paid** - Full payment received (or equivalent advance paid)

**Key Rule**: Uncleared cheques NEVER count as payment

### 8.4 Transaction Types in Ledger
1. **goods** - Invoice created (debit sale or purchase)
2. **receipt** - Cash received from customer
3. **payment** - Cash paid to supplier
4. **advance** - Pre-payment for purchase
5. **commission** - Commission earned/charged
6. **income** - Expense recovery, misc income

### 8.5 Idempotency
Both RPC functions are **idempotent**:
- `confirm_sale_transaction`: Creates sale only once (checks exists)
- `post_arrival_ledger`: Deletes old entries, recreates fresh (safe rebuild)

---

## 9. CRITICAL INTEGRATION POINTS

### When Sales are Posted
1. User clicks "Confirm Sale" in [new-sale-form.tsx](#31-new-sale-formtsx)
2. FE calls `confirmSaleTransactionWithFallback()` from [confirm-sale-transaction.ts](#411-libmandi-confirm-sale-transactionts)
3. RPC `mandi.confirm_sale_transaction()` executed
4. Ledger entries created via trigger
5. Day book updated via trigger
6. Frontend re-queries ledger via [ledger-statement-dialog.tsx](#323-ledger-statement-dialogtsx)

### When Purchases are Posted
1. Arrival record created
2. RPC `mandi.post_arrival_ledger(arrival_id)` called
3. Payment mode determines payment_status
4. Ledger entries created
5. [purchase-bill-details.tsx](#33-purchase-bill-detailstsx) displays updated balance

### When Payments are Recorded
1. User opens new-receipt or new-payment dialog
2. Selects invoice/arrival and amount
3. Calls `billing-service.createPaymentVoucher()`
4. Receipt record created + 2 ledger entries
5. Affects payment_status calculation on next ledger query

---

## 10. FILE REFERENCE INDEX

### Database Layer
- `supabase/migrations/20260425000000_fix_cash_sales_payment_status.sql` - confirm_sale_transaction
- `supabase/migrations/20260421130000_strict_partial_payment_status.sql` - post_arrival_ledger
- `supabase/migrations/20260420_party_ledger_detail_fix.sql` - get_ledger_statement
- `supabase/migrations/20260422000001_safe_ledger_cleanup.sql` - Safe deletion

### Frontend Components
- `web/components/sales/new-sale-form.tsx` - Main sales form
- `web/components/finance/ledger-statement-dialog.tsx` - Ledger view
- `web/components/finance/day-book.tsx` - Daily transactions
- `web/components/accounting/new-receipt-dialog.tsx` - Payment receipt
- `web/components/finance/new-payment-dialog.tsx` - Payment dialog

### Pages
- `web/app/(main)/sales/page.tsx` - Sales list
- `web/app/(main)/ledgers/page.tsx` - Ledger list
- `web/app/(main)/finance/payments/page.tsx` - Payments
- `web/app/(main)/receipts/page.tsx` - Receipts
- `web/app/(main)/purchase/bills/page.tsx` - Bills

### Utilities
- `web/lib/mandi/confirm-sale-transaction.ts` - RPC wrapper
- `web/lib/finance/voucher-integrity.ts` - Voucher validation
- `web/lib/purchase-payables.ts` - Payment status logic
- `web/lib/services/billing-service.ts` - Payment creation

### Scripts
- `rebuild-ledger-and-daybook.js` - Ledger repair
- `investigate-balance.js` - Debug balances
- `check_ledger.js` - Audit ledger

---

## 11. QUICK REFERENCE: WHERE TO FIND LOGIC

### "How do I find where payment_status is set?"
1. Check RPC in migrations: `confirm_sale_transaction` or `post_arrival_ledger`
2. Check FE logic: `lib/purchase-payables.ts` → `calculatePaymentStatus()`
3. Check display: Components query via `get_ledger_statement` RPC

### "How do I find where ledger entries are created?"
1. RPC functions: `post_arrival_ledger()` and `confirm_sale_transaction()` in migrations
2. Triggers in same migrations auto-post to day_book

### "How do I modify payment modes?"
1. Update `validatePaymentInputs()` in `lib/purchase-payables.ts`
2. Update cleared logic in `calculatePaymentStatus()`
3. Add label in `getPaymentModeLabel()`
4. Add color in `getPaymentStatusColor()`

### "How do I trace a specific payment?"
1. Open ledger_entries in DB
2. Filter by contact_id and date range
3. Look for transaction_type = 'receipt' or 'payment'
4. Check reference_id to find original sale/arrival
5. Verify double-entry with opposite leg

---

## 12. KNOWN ISSUES & WORKAROUNDS

### Issue: Ledger out of sync with sales
**Solution**: Run `rebuild-ledger-and-daybook.js` to rebuild all entries

### Issue: Payment_status shows 'paid' but ledger shows no receipt entries
**Possible causes**:
1. Uncleared cheque counted incorrectly (check advance_cheque_status)
2. Instant payment option selected but mode = 'credit'
3. Floating-point rounding issue (use EPSILON = 0.01)

**Debug**: Run `investigate-balance.js` for party

### Issue: Double entries appearing twice in day book
**Solution**: Check migrations weren't run twice; verify idempotency in RPC

---

**Last Updated**: April 13, 2026  
**Document Status**: Complete & Comprehensive
