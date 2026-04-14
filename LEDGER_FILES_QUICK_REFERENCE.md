# MandiPro Ledger System - Quick File Reference

## 📊 DATABASE LAYER (RPC Functions & Migrations)

### Core Ledger Functions (Latest)
| Function | File | Purpose |
|----------|------|---------|
| `confirm_sale_transaction()` | `supabase/migrations/20260425000000_fix_cash_sales_payment_status.sql` | Create sales invoice + ledger entries |
| `post_arrival_ledger()` | `supabase/migrations/20260421130000_strict_partial_payment_status.sql` | Create purchase invoice + ledger entries |
| `get_ledger_statement()` | `supabase/migrations/20260420_party_ledger_detail_fix.sql` | Query party ledger with running balance |
| (Automated posting) | `supabase/migrations/20260405100000_finance_feedback_fixes.sql` | Triggers for receipt/voucher auto-posting |

### Important Earlier Migrations (Archived)
| File | Purpose |
|------|---------|
| `20260326153000_fix_sale_daybook_and_vouchers.sql` | Comprehensive sale flow fixes |
| `20260413_fix_sale_flow_comprehensive.sql` | All-in-one sale RPC |
| `20260402000000_finance_numbering_and_cheque_cleanup.sql` | Cheque handling improvement |
| `20260331_fix_quick_purchase_ledger.sql` | Purchase flow with payment modes |
| `20260204_ledger_statement_rpc.sql` | Initial ledger statement RPC |

---

## 🎨 FRONTEND PAGES (User-Facing)

### Sales & Invoices
| Page | Path | Purpose |
|------|------|---------|
| Sales List | `web/app/(main)/sales/page.tsx` | View all sales with payment status |
| New Sale | `web/app/(main)/sales/new/page.tsx` | Create sale invoice |
| Sales Bulk | `web/app/(main)/sales/bulk/page.tsx` | Bulk sales entry |
| Invoice Detail | `web/app/(main)/sales/invoice/[id]/page.tsx` | View invoice details |
| Sales POS | `web/app/(main)/sales/pos/page.tsx` | Point of sale interface |
| Sales Returns | `web/app/(main)/sales/returns/page.tsx` | Sale returns |

### Purchase & Bills
| Page | Path | Purpose |
|------|------|---------|
| Purchase Bills | `web/app/(main)/purchase/bills/page.tsx` | View supplier bills (arrivals) |
| Purchase Invoices | `web/app/(main)/purchase/invoices/page.tsx` | Grouped by supplier |
| Delivery Challans | `web/app/(main)/delivery-challans/page.tsx` | Delivery documents |

### Ledger & Finance
| Page | Path | Purpose |
|------|------|---------|
| Ledger List | `web/app/(main)/ledgers/page.tsx` | Party ledger summary |
| Party Ledger Detail | `web/app/(main)/ledgers/buyer/[id]/page.tsx` | Full ledger for party |
| Payments & Receipts | `web/app/(main)/finance/payments/page.tsx` | All payment operations |
| Receipts | `web/app/(main)/receipts/page.tsx` | Payment receipts list |
| Ledger Report | `web/app/(main)/reports/ledger/page.tsx` | Financial ledger report |

### Financial Reports
| Page | Path | Purpose |
|------|------|---------|
| Finance Dashboard | `web/components/finance/finance-dashboard.tsx` | Financial overview (component) |
| Day Book | `web/components/finance/day-book.tsx` | Daily transactions view (component) |
| Balance Sheet | `web/components/finance/balance-sheet.tsx` | Balance sheet (component) |
| Trial Balance | `web/components/finance/trial-balance.tsx` | Trial balance (component) |
| Profit & Loss | `web/components/finance/profit-loss.tsx` | P&L statement (component) |

---

## 🧩 FRONTEND COMPONENTS (Reusable)

### Sales Components
| Component | Path | Purpose |
|-----------|------|---------|
| **new-sale-form.tsx** | `web/components/sales/new-sale-form.tsx` | Main sales invoice form |
| **sales-form.tsx** | `web/components/sales/sales-form.tsx` | Alternative sales form |
| **bulk-sale-form.tsx** | `web/components/sales/bulk-sale-form.tsx` | Bulk entry form |
| **new-invoice-form.tsx** | `web/components/sales/new-invoice-form.tsx` | Invoice creation form |
| **return-form.tsx** | `web/components/sales/return-form.tsx` | Sales return form |
| **sales-table.tsx** | `web/components/sales/sales-table.tsx` | Sales list table |
| **buyer-receivables-table.tsx** | `web/components/sales/buyer-receivables-table.tsx` | Aging receivables (AR) |
| **invoice-template.tsx** | `web/components/sales/invoice-template.tsx` | Invoice printable template |

### Purchase Components
| Component | Path | Purpose |
|-----------|------|---------|
| **purchase-bill-details.tsx** | `web/components/purchase/purchase-bill-details.tsx` | Bill summary |
| **supplier-inwards-dialog.tsx** | `web/components/purchase/supplier-inwards-dialog.tsx` | Payment recording |

### Finance/Accounting Components
| Component | Path | Purpose |
|-----------|------|---------|
| **ledger-statement-dialog.tsx** | `web/components/finance/ledger-statement-dialog.tsx` | Party ledger modal dialog |
| **new-payment-dialog.tsx** | `web/components/finance/new-payment-dialog.tsx` | Payment creation dialog |
| **new-receipt-dialog.tsx** | `web/components/accounting/new-receipt-dialog.tsx` | Receipt creation dialog |
| **advance-dialog.tsx** | `web/components/finance/advance-dialog.tsx` | Advance payment dialog |
| **payment-dialog.tsx** | `web/components/finance/payment-dialog.tsx` | Payment processing |
| **balance-sheet.tsx** | `web/components/finance/balance-sheet.tsx` | Balance sheet |
| **day-book.tsx** | `web/components/finance/day-book.tsx` | Daily transactions |
| **trial-balance.tsx** | `web/components/finance/trial-balance.tsx` | Trial balance |
| **profit-loss.tsx** | `web/components/finance/profit-loss.tsx` | P&L statement |
| **receivables-aging.tsx** | `web/components/finance/receivables-aging.tsx` | AR aging report |

### Printable/Report Components
| Component | Path | Purpose |
|-----------|------|---------|
| **printable-ledger.tsx** | `web/components/finance/printable-ledger.tsx` | Ledger print format |
| **ledger-pdf-report.tsx** | `web/components/finance/ledger-pdf-report.tsx` | PDF ledger export |
| **printable-financial-report.tsx** | `web/components/finance/printable-financial-report.tsx` | Multi-page report |

---

## 🛠️ UTILITIES & SERVICES

### TypeScript Utilities
| File | Path | Purpose |
|------|------|---------|
| **confirm-sale-transaction.ts** | `web/lib/mandi/confirm-sale-transaction.ts` | RPC wrapper for sales |
| **voucher-integrity.ts** | `web/lib/finance/voucher-integrity.ts` | Double-entry validation |
| **purchase-payables.ts** | `web/lib/purchase-payables.ts` | Payment status calculation |
| **accounting-logic.ts** | `web/lib/accounting-logic.ts` | Financial calculations |

### Services
| File | Path | Purpose |
|------|------|---------|
| **billing-service.ts** | `web/lib/services/billing-service.ts` | Payment & voucher creation |
| **branding-service.ts** | `web/lib/services/branding-service.ts` | PDF branding |

### Hooks
| File | Path | Purpose |
|------|------|---------|
| **use-offline-sync.ts** | `web/lib/hooks/use-offline-sync.ts` | Offline sync for RPCs |

---

## 📜 SHELL SCRIPTS & REPAIR SCRIPTS

| Script | Path | Purpose |
|--------|------|---------|
| **rebuild-ledger-and-daybook.js** | `rebuild-ledger-and-daybook.js` | Rebuild entire ledger from scratch |
| **investigate-balance.js** | `investigate-balance.js` | Debug balance discrepancies |
| **check_ledger.js** | `check_ledger.js` | Audit ledger integrity |

---

## 🔄 DATA FLOW SUMMARY

### Sales Transaction Flow
```
User → new-sale-form.tsx
  ↓
confirmSaleTransactionWithFallback() [confirm-sale-transaction.ts]
  ↓
mandi.confirm_sale_transaction RPC (database)
  ↓
ledger_entries created
  ↓
day_book updated (via trigger)
  ↓
ledger-statement-dialog queries results
```

### Purchase Transaction Flow
```
Arrival created (via inventory UI)
  ↓
mandi.post_arrival_ledger RPC called
  ↓
ledger_entries created for goods & advance
  ↓
purchase-bill-details displays updated balance
  ↓
User records payment via supplier-inwards-dialog
  ↓
post_arrival_ledger runs again (idempotent)
```

### Payment Receipt Flow
```
new-receipt-dialog.tsx submitted
  ↓
billing-service.createPaymentVoucher()
  ↓
Receipt record + 2 ledger legs created
  ↓
ledger-statement-dialog shows updated balance
  ↓
Sales page shows PAID status
```

---

## 🎯 KEY FUNCTIONS & WHERE THEY ARE

### Sales & Purchases
| Function | File | Type |
|----------|------|------|
| `confirm_sale_transaction()` | Migrations | RPC |
| `post_arrival_ledger()` | Migrations | RPC |
| `confirmSaleTransactionWithFallback()` | `confirm-sale-transaction.ts` | TypeScript |
| `calculatePaymentStatus()` | `purchase-payables.ts` | TypeScript |
| `validatePaymentInputs()` | `purchase-payables.ts` | TypeScript |

### Ledger & Payments
| Function | File | Type |
|----------|------|------|
| `get_ledger_statement()` | Migrations | RPC |
| `isVoucherBalanced()` | `voucher-integrity.ts` | TypeScript |
| `findImbalancedVoucherIds()` | `voucher-integrity.ts` | TypeScript |
| `createPaymentVoucher()` | `billing-service.ts` | TypeScript |

---

## 📊 TABLE RELATIONSHIPS

```
MAIN TABLES:
├── mandi.sales (created by confirm_sale_transaction)
│   ├── id
│   ├── buyer_id → mandi.contacts
│   ├── total_amount
│   ├── amount_received
│   ├── payment_status ('pending'|'partial'|'paid')
│   └── payment_mode
│
├── mandi.arrivals (purchase invoices)
│   ├── id
│   ├── supplier_id → mandi.contacts
│   ├── lots_data [] (lot details)
│   ├── total_amount
│   ├── advance_total
│   └── payment_status (derived from advance_total)
│
├── mandi.lots (individual purchased items)
│   ├── id
│   ├── arrival_id → mandi.arrivals
│   ├── advance (payment amount)
│   ├── advance_payment_mode (cash|cheque|upi|credit)
│   └── advance_cheque_status (cleared T/F)
│
├── mandi.ledger_entries (GL lines)
│   ├── contact_id → mandi.contacts
│   ├── debit / credit
│   ├── transaction_type (goods|receipt|payment|etc)
│   ├── reference_id → sales.id or arrivals.id
│   ├── voucher_id → mandi.vouchers
│   └── entry_date
│
├── mandi.receipts (payment receipts)
│   ├── id
│   ├── contact_id
│   ├── amount
│   └── voucher_no
│
├── mandi.vouchers (accounting vouchers)
│   ├── id
│   ├── contact_id
│   ├── arrival_id
│   └── voucher_no
│
├── mandi.day_book (aggregated daily summary)
│   ├── entry_date
│   ├── transaction_type
│   ├── debit_total
│   └── credit_total
│
└── mandi.contacts (parties)
    ├── id
    ├── name
    └── is_creditor (T=supplier, F=buyer)
```

---

## 🔍 HOW TO FIND...

### "Where are sales posted to ledger?"
→ `supabase/migrations/20260425000000_fix_cash_sales_payment_status.sql` (function: `confirm_sale_transaction`)
→ Called from: `web/components/sales/new-sale-form.tsx`

### "Where are purchases posted to ledger?"
→ `supabase/migrations/20260421130000_strict_partial_payment_status.sql` (function: `post_arrival_ledger`)
→ Called from: Purchase arrival creation (automatic)

### "Where is payment_status calculated?"
→ Frontend: `web/lib/purchase-payables.ts` → `calculatePaymentStatus()`
→ Database: RPC functions calculate at posting time

### "Where is payment recorded?"
→ `web/components/accounting/new-receipt-dialog.tsx` or `new-payment-dialog.tsx`
→ Service: `web/lib/services/billing-service.ts` → `createPaymentVoucher()`

### "Where is the ledger displayed to users?"
→ `web/app/(main)/ledgers/page.tsx` (list)
→ `web/app/(main)/ledgers/buyer/[id]/page.tsx` (detail)
→ Component: `web/components/finance/ledger-statement-dialog.tsx` (modal)

### "Where are reports generated?"
→ `web/app/(main)/reports/ledger/page.tsx` (ledger)
→ Components: `balance-sheet.tsx`, `profit-loss.tsx`, `trial-balance.tsx`

### "Where can I verify double-entry integrity?"
→ `web/lib/finance/voucher-integrity.ts`
→ Check: `isVoucherBalanced()` and `findImbalancedVoucherIds()`

---

## ⚠️ CRITICAL FILES (Don't Modify Without Understanding)

1. **RPC Functions** - Complex logic, affects all transactions
   - `confirm_sale_transaction()` in migrations
   - `post_arrival_ledger()` in migrations
   - `get_ledger_statement()` in migrations

2. **Payment Status Logic** - Used everywhere
   - `web/lib/purchase-payables.ts` → `calculatePaymentStatus()`
   - EPSILON = 0.01 is crucial

3. **Voucher Integrity** - Ensures correct accounting
   - `web/lib/finance/voucher-integrity.ts`
   - Must always check = balance

4. **new-sale-form.tsx** - Main sales entry point
   - Calls confirm_sale_transaction RPC
   - Updates payment_status

---

## 📋 SUMMARY: 42 Key Files

**Database**: 5 core migrations + 20+ support migrations  
**Pages**: 13 main pages (sales, purchase, ledger, reports)  
**Components**: 25+ reusable components  
**Utilities**: 6 key TypeScript files  
**Services**: 2 service files  
**Scripts**: 3 repair/debug scripts  

**Total**: 54 files analyzed across ledger system

---

**Last Updated**: April 13, 2026  
**Format**: Quick Reference Checklist
