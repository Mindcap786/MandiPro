# MandiPro Ledger System - Master Documentation Index

**Created**: April 13, 2026  
**Status**: Complete & Comprehensive Analysis  
**Total Files Analyzed**: 54 files across codebase

---

## 📚 DOCUMENTATION CREATED

This analysis has created **3 comprehensive documents** to understand the MandiPro ledger system:

### 1. **CODEBASE_LEDGER_ARCHITECTURE.md** ⭐ START HERE
**Purpose**: Complete architectural overview of how ledger system works  
**Size**: ~3,000 lines  
**Sections**:
- Core tables and database schema
- All 3 RPC functions with parameters and responsibilities
- 24+ frontend pages and components with descriptions
- 6 key TypeScript utilities explaining ledger logic
- 3 repair/debug scripts
- Data flow diagrams (3 main flows)
- 12 key concepts explained
- Critical integration points
- File reference index
- Quick lookup guide

**Best For**: Understanding the complete system, finding where logic lives, learning how everything connects

---

### 2. **LEDGER_FILES_QUICK_REFERENCE.md** ⚡ QUICK LOOKUP
**Purpose**: Quick reference checklist of all 54 files  
**Size**: ~1,500 lines  
**Sections**:
- Database RPC functions table (core functions)
- All 13 main user-facing pages listed
- 25+ reusable components with descriptions
- 6 key TypeScript utilities
- 2 services
- 3 repair scripts
- Data flow summaries (3 flows in boxes)
- Key functions table
- Table relationships diagram
- "How to find..." quick answers
- Critical files to NOT modify
- 42 key files summary

**Best For**: Looking up a specific file, finding which component handles what, quick reference while coding

---

### 3. **LEDGER_DATA_FLOW_COMPLETE.md** 🔄 FLOWS & INTEGRATION
**Purpose**: Detailed data flow from transactions to ledger  
**Size**: ~2,000 lines  
**Sections**:
- Part 1: Where ledger data is fetched/calculated
  - 4 sales data entry points
  - 3 purchase data entry points
  - Payment status calculation (full algorithm)
  - Double-entry verification logic
  - Running balance calculation
- Part 2: How sales data flows to ledger
  - Complete flow map (20 steps)
  - Database state after transaction
- Part 3: How purchase data flows to ledger
  - Complete flow map (20+ steps)
  - Database state after transaction
- Part 4: How payments update ledger
  - Payment receipt flow
  - Cheque payment flow with clearing
- Part 5: Current balance calculation
  - For sales (buyer payables)
  - For purchases (supplier payables)
  - Running balance with examples
- Summary table

**Best For**: Understanding transaction flow end-to-end, tracing how data changes, debugging payment status issues

---

## 🗂️ FILE ORGANIZATION BY TYPE

### Database Layer (Migrations)
**Location**: `supabase/migrations/`  
**Key Files**:
1. `20260425000000_fix_cash_sales_payment_status.sql` - Latest: `confirm_sale_transaction()`
2. `20260421130000_strict_partial_payment_status.sql` - Latest: `post_arrival_ledger()`
3. `20260420_party_ledger_detail_fix.sql` - Latest: `get_ledger_statement()`
4. `20260405100000_finance_feedback_fixes.sql` - Triggers for auto-posting
5. 20+ more support migrations

**See**: CODEBASE_LEDGER_ARCHITECTURE.md § 2, LEDGER_FILES_QUICK_REFERENCE.md § Database Layer

---

### Frontend Pages (Customer-Facing)
**Location**: `web/app/(main)/`  
**Categories**:
- **Sales**: `/sales/`, `/sales/new/`, `/sales/invoice/[id]/`, `/sales/bulk/`, `/sales/pos/`
- **Purchases**: `/purchase/bills/`, `/purchase/invoices/`, `/delivery-challans/`
- **Ledger**: `/ledgers/`, `/ledgers/buyer/[id]/`, `/reports/ledger/`
- **Payments**: `/finance/payments/`, `/receipts/`

**See**: LEDGER_FILES_QUICK_REFERENCE.md § Frontend Pages

---

### Frontend Components (Reusable)
**Location**: `web/components/`  
**Types**:
- **Sales Components** (11 files): new-sale-form, bulk-sale-form, sales-table, etc.
- **Purchase Components** (2 files): purchase-bill-details, supplier-inwards-dialog
- **Finance Components** (13 files): ledger-statement, day-book, balance-sheet, etc.
- **Accounting** (1 file): new-receipt-dialog

**See**: CODEBASE_LEDGER_ARCHITECTURE.md § 3, LEDGER_FILES_QUICK_REFERENCE.md § Components

---

### Utilities & Services
**Location**: `web/lib/`  
**Files**:
1. `lib/mandi/confirm-sale-transaction.ts` - RPC wrapper for sales
2. `lib/finance/voucher-integrity.ts` - Double-entry validation
3. `lib/purchase-payables.ts` - Payment status calculation (KEY FILE)
4. `lib/accounting-logic.ts` - Financial calculations
5. `lib/services/billing-service.ts` - Payment/voucher creation
6. `lib/hooks/use-offline-sync.ts` - Offline RPC syncing

**See**: CODEBASE_LEDGER_ARCHITECTURE.md § 4, LEDGER_FILES_QUICK_REFERENCE.md § Utilities

---

### Scripts (Admin/Repair)
**Location**: Root directory  
**Files**:
1. `rebuild-ledger-and-daybook.js` - Rebuild entire ledger
2. `investigate-balance.js` - Debug balance discrepancies
3. `check_ledger.js` - Audit ledger integrity

**See**: CODEBASE_LEDGER_ARCHITECTURE.md § 6, LEDGER_FILES_QUICK_REFERENCE.md § Scripts

---

## 🔍 LOOKUP GUIDE

### "I need to understand the overall architecture"
**→ Read**: CODEBASE_LEDGER_ARCHITECTURE.md
- Start with § 1-2 (Database & RPCs)
- Then § 3 (Components)
- Then § 8 (Key Concepts)

### "I need to find where specific logic lives"
**→ Use**: LEDGER_FILES_QUICK_REFERENCE.md § "How to find..."
- "Where are sales posted to ledger?" 
- "Where is payment_status calculated?"
- "Where is a voucher balancing validated?"

### "I need to trace a transaction end-to-end"
**→ Read**: LEDGER_DATA_FLOW_COMPLETE.md
- Select the flow: Sales, Purchase, or Payment
- Follow the detailed flow map
- See database state at each step

### "I need to understand payment status logic"
**→ Read**: LEDGER_DATA_FLOW_COMPLETE.md § Part 5
**Also Use**: CODEBASE_LEDGER_ARCHITECTURE.md § 4.1 (purchase-payables.ts)
- Key function: `calculatePaymentStatus()`
- Key file: `web/lib/purchase-payables.ts`

### "I need to see all components for [feature]"
**→ Use**: LEDGER_FILES_QUICK_REFERENCE.md § Components section
**Cross-reference**: CODEBASE_LEDGER_ARCHITECTURE.md § 3

### "I need to understand double-entry bookkeeping in this app"
**→ Read**: 
- CODEBASE_LEDGER_ARCHITECTURE.md § 8.1
- LEDGER_DATA_FLOW_COMPLETE.md § Part 4 (payment flow)
- CODEBASE_LEDGER_ARCHITECTURE.md § 4.1 (voucher-integrity.ts)

### "I need to debug a payment status issue"
**→ Steps**:
1. Read: LEDGER_DATA_FLOW_COMPLETE.md § Part 5 (balance calculation)
2. Look up: `calculatePaymentStatus()` in CODEBASE_LEDGER_ARCHITECTURE.md § 4.1
3. Check file: `web/lib/purchase-payables.ts` (in codebase)
4. Run: `investigate-balance.js` script

### "I need to understand how ledger entries are created"
**→ Read**: 
- LEDGER_DATA_FLOW_COMPLETE.md § Part 2 (sales flow)
- LEDGER_DATA_FLOW_COMPLETE.md § Part 3 (purchase flow)
- CODEBASE_LEDGER_ARCHITECTURE.md § 2.1-2.3 (RPC functions)

---

## 📊 STATISTICAL SUMMARY

| Category | Count | Key Files |
|----------|-------|-----------|
| **Database Migrations** | 20+ | confirm_sale_transaction, post_arrival_ledger, get_ledger_statement |
| **Pages** | 13 | sales, purchase, ledger, reports, payments |
| **Components** | 25+ | new-sale-form, ledger-statement-dialog, day-book, etc |
| **TypeScript Utilities** | 6 | purchase-payables, voucher-integrity, confirm-sale-transaction |
| **Services** | 2 | billing-service, branding-service |
| **Hooks** | 1 | use-offline-sync |
| **Scripts** | 3 | rebuild-ledger, investigate-balance, check-ledger |
| **Total Analyzed** | **54+** files |

---

## 🎯 KEY CONCEPTS QUICK REFERENCE

| Concept | Explanation | Where to Learn |
|---------|-------------|-----------------|
| **Ledger Entry** | Single debit or credit line in GL (double-entry bookkeeping) | CODEBASE § 8.1 |
| **Voucher** | Set of balanced ledger entries (debit = credit) | CODEBASE § 8.1 |
| **Transaction Type** | Categorization: goods, receipt, payment, advance, etc | CODEBASE § 8.4 |
| **Payment Status** | pending \| partial \| paid (based on amount & mode) | FLOW § Part 5 |
| **Payment Mode** | cash \| cheque \| upi \| bank \| credit | REFERENCE § Payment Modes table |
| **Running Balance** | Cumulative sum of debits - credits chronologically | FLOW § Part 5 |
| **Double-Entry Rule** | For every entry: Σ(debit) must equal Σ(credit) | CODEBASE § 8.1 |
| **Idempotency** | Can run repeatedly and get same result | CODEBASE § 8.5 |
| **Creditor vs Debtor** | Creditor=supplier (we owe them), Debtor=buyer (they owe us) | CODEBASE § 8.2 |
| **Cleared Payment** | Cash/UPI/cleared cheque (counts as payment) vs uncleared cheque (pending) | FLOW § Part 4 |

---

## 🚀 WHERE TO START

### For Developers Learning the System
1. Read: **CODEBASE_LEDGER_ARCHITECTURE.md** (40 minutes)
   - Get the big picture
   - Understand key components
   - Know what files exist and where

2. Read: **LEDGER_DATA_FLOW_COMPLETE.md** (30 minutes)
   - Trace sales transaction end-to-end
   - Trace purchase transaction end-to-end
   - Understand payment recording

3. Reference: **LEDGER_FILES_QUICK_REFERENCE.md** (as needed)
   - Look up specific files
   - Find components by functionality
   - Use "How to find..." section

### For Debugging/Fixing Issues
1. Identify the issue type:
   - Sales payment status wrong? → FLOW § Part 2, ARCH § 4.1
   - Purchase balance incorrect? → FLOW § Part 3, ARCH § 4.1
   - Ledger entries missing? → FLOW § database state
   - Payment not recorded? → FLOW § Part 4, ARCH § 3.2

2. Find the relevant code:
   - Use REFERENCE § "How to find..."
   - Cross-reference files in ARCH

3. Debug:
   - Check data in database
   - Run `investigate-balance.js` script
   - Run `check_ledger.js` script
   - Verify RPC logic in migrations

### For Code Changes
1. Find affected components:
   - Use REFERENCE § file listings
   - Check affected RPC if DB change
   - Check affected components if logic change

2. Understand impact:
   - Read FLOW document for affected data flow
   - Check integration points in ARCH § 9

3. Make changes:
   - Follow existing patterns in analogous code
   - Ensure idempotency if modifying RPC
   - Test double-entry balance integrity

---

## 🔗 CROSS-REFERENCES

### RPC Functions
- `confirm_sale_transaction()` → ARCH § 2.1, FLOW § Part 2
- `post_arrival_ledger()` → ARCH § 2.2, FLOW § Part 3
- `get_ledger_statement()` → ARCH § 2.3, FLOW § Part 5

### Key Utilities
- `calculatePaymentStatus()` → ARCH § 4.1, FLOW § Part 5
- `isVoucherBalanced()` → ARCH § 4.1, FLOW § Part 4
- `confirmSaleTransactionWithFallback()` → ARCH § 4.1, FLOW § Part 2

### Key Components
- `new-sale-form.tsx` → ARCH § 3.1, FLOW § Part 2
- `ledger-statement-dialog.tsx` → ARCH § 3.3, FLOW § Part 5
- `new-receipt-dialog.tsx` → ARCH § 3.3, FLOW § Part 4

---

## ✅ WHAT EACH DOCUMENT CONTAINS

### CODEBASE_LEDGER_ARCHITECTURE.md
✅ Complete file listing with descriptions  
✅ Database schema explanation  
✅ All RPC functions explained  
✅ All pages listed  
✅ All components listed  
✅ All utilities explained  
✅ Repair scripts listed  
✅ Data flow diagrams  
✅ Key concepts explained  
✅ Integration points identified  
✅ File reference index  
❌ Detailed transaction flows (see FLOW doc)  
❌ Code examples (see actual files in codebase)

### LEDGER_FILES_QUICK_REFERENCE.md
✅ Quick tables of all files  
✅ Fast lookup by category  
✅ "How to find..." Q&A  
✅ Table relationships diagram  
✅ Summary statistics  
💼 Designed for quick reference while coding  
❌ Detailed explanations (see ARCH doc)  
❌ Transaction flow steps (see FLOW doc)

### LEDGER_DATA_FLOW_COMPLETE.md
✅ Where data is fetched/calculated  
✅ Detailed sales transaction flow (20+ steps)  
✅ Detailed purchase transaction flow (20+ steps)  
✅ Payment recording flows  
✅ Balance calculation logic with examples  
✅ Database state at each checkpoint  
✅ SQL examples  
✅ Pseudocode examples  
💼 Designed for understanding data movement  
💼 Designed for debugging workflows  
❌ Quick reference (see REFERENCE doc)  
❌ File listings (see ARCH doc)

---

## 🎓 LEARNING PATH

### Path 1: Complete Understanding (3-4 hours)
1. ARCH § 1-2 (Database, 30 min) - Understand tables and RPCs
2. ARCH § 3 (Components, 30 min) - See what pages/components exist
3. FLOW § Part 2 (Sales flow, 30 min) - Trace complete sales flow
4. FLOW § Part 3 (Purchase flow, 30 min) - Trace complete purchase flow
5. FLOW § Part 5 (Balance calc, 20 min) - Understand balance calculation
6. ARCH § 8-9 (Concepts & Integration, 20 min) - Solidify understanding

### Path 2: Quick Start (1 hour)
1. ARCH § 1-2 (Database, 15 min) - Core concepts
2. REFERENCE § Data Flow Summary (10 min) - Get overview
3. FLOW § Part 2 - First 5 steps (15 min) - See sample flow
4. ARCH § 9 (Integration points, 20 min) - Know what's critical

### Path 3: Targeted Learning (30-45 min)
Pick your topic:
- **Sales**: ARCH § 3.1, FLOW § Part 2
- **Purchases**: ARCH § 3.2, FLOW § Part 3  
- **Payments**: ARCH § 3.3, FLOW § Part 4
- **Reports**: ARCH § 3.3, FLOW § Part 5

---

## 📱 Files by Module

### Sales Module
- Components: new-sale-form.tsx, sales-table.tsx, buyer-receivables-table.tsx, invoice-template.tsx
- Pages: /sales/page.tsx, /sales/new/page.tsx, /sales/invoice/[id]/page.tsx
- Utilities: confirm-sale-transaction.ts
- RPC: confirm_sale_transaction()
- Docs: ARCH § 3.1, FLOW § Part 2

### Purchase Module  
- Components: purchase-bill-details.tsx, supplier-inwards-dialog.tsx
- Pages: /purchase/bills/page.tsx, /purchase/invoices/page.tsx
- Utilities: purchase-payables.ts
- RPC: post_arrival_ledger()
- Docs: ARCH § 3.2, FLOW § Part 3

### Ledger/Finance Module
- Components: ledger-statement-dialog.tsx, day-book.tsx, balance-sheet.tsx, profit-loss.tsx
- Pages: /ledgers/page.tsx, /ledgers/buyer/[id]/page.tsx, /reports/ledger/page.tsx
- Utilities: voucher-integrity.ts
- RPC: get_ledger_statement()
- Docs: ARCH § 3.3, FLOW § Part 5

### Payment Processing Module
- Components: new-receipt-dialog.tsx, new-payment-dialog.tsx, payment-dialog.tsx
- Pages: /finance/payments/page.tsx, /receipts/page.tsx
- Services: billing-service.ts
- Utilities: purchase-payables.ts (for status)
- Docs: ARCH § 3.3, FLOW § Part 4

---

## ❓ FREQUENTLY NEEDED ANSWERS

**Q: Where do I find the sales payment status logic?**  
A: `web/lib/purchase-payables.ts` function `calculatePaymentStatus()` - see ARCH § 4.1 or FLOW § Part 5

**Q: How does payment_status get set for purchases?**  
A: In `post_arrival_ledger()` RPC during arrival posting - see ARCH § 2.2 or FLOW § Part 3

**Q: Where are ledger entries created for sales?**  
A: In `confirm_sale_transaction()` RPC - see ARCH § 2.1 or FLOW § Part 2 Step 3

**Q: Where is the ledger displayed to users?**  
A: In `ledger-statement-dialog.tsx` component - see ARCH § 3.3

**Q: How do I rebuild the ledger if it's corrupt?**  
A: Run `rebuild-ledger-and-daybook.js` script - see ARCH § 6.1

**Q: How do I debug a balance discrepancy?**  
A: Use `investigate-balance.js` script and check `purchase-payables.ts` logic

**Q: Where can I verify double-entry bookkeeping?**  
A: Check `voucher-integrity.ts` functions - see ARCH § 4.1

**Q: What's the difference between 'pending', 'partial', and 'paid' status?**  
A: ARCH § 8.3 explains all three states and when they're set

---

## 📝 NOTES

### Important
- These 3 documents provide **complete coverage** of the ledger system
- They are **derived from actual code analysis** of 54+ files
- Use them as a **reference alongside the actual code**
- For code details, still check the actual files mentioned

### Version
- Created: April 13, 2026
- Based on: Latest migrations as of 20260425
- Codebase: MandiPro ledger system

### Maintenance
- If new RPC added: Add to ARCH § 2
- If new page added: Add to ARCH § 3
- If key util added: Add to ARCH § 4
- If flow changes: Update FLOW § parts
- If file locations change: Update REFERENCE tables

---

**END OF INDEX**

---

### How to Use These Documents

1. **First Time Learning**: Start with CODEBASE_LEDGER_ARCHITECTURE.md
2. **Quick Lookup**: Use LEDGER_FILES_QUICK_REFERENCE.md
3. **Tracing Issues**: Go to LEDGER_DATA_FLOW_COMPLETE.md
4. **Combination Strategy**: Use all 3 as a reference set

**Total Reading Time**: 1-4 hours depending on depth needed
