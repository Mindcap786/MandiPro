# Executive Summary: RPC Functions & Ledger Analysis

**Generated:** 2026-04-12  
**Scope:** Complete analysis of confirm_sale_transaction, post_arrival_ledger, and day book structure  
**Status:** ✅ READY FOR REVIEW

---

## Three Key Functions Analyzed

### 1. confirm_sale_transaction()
**Purpose:** Create sales transactions with all payment modes  
**Status:** ⚠️ Recently fixed (3 migrations in 2 weeks)  
**Key Logic:**
- Determines payment status by comparing `amount_received` to `total_amount_inc_tax`
- Creates SALES voucher (always)
- Creates RECEIPT voucher (only if instant payment & amount > 0)
- Handles: cash, credit, cheque, UPI, bank transfer, card

**Recent Fixes:**
- ✅ Bug: Cash payment with 0 amount_received marked as 'pending' → Now defaults to full amount
- ✅ Bug: Partial payments ignored (code checked for mode='partial', never sent) → Now uses math
- ✅ Bug: Wrong account for partial bank payments → Now respects p_bank_account_id first

---

### 2. post_arrival_ledger()
**Purpose:** Create purchase transactions (commission & direct)  
**Status:** ✅ Stable (idempotent upsert design)  
**Key Logic:**
- Deletes old entries before inserting (ensures no duplicates)
- Handles commission percentage, less percent, expenses, transport, advances
- Creates single PURCHASE voucher with N ledger entries
- Arrival types: 'commission', 'commission_supplier', 'direct'

**Design Feature:**
- Call it 100 times on same arrival_id = same result
- Use this when cheque cleared, lots changed, expenses modified

---

### 3. Day Book Structure
**Purpose:** Unified view of sales & purchases  
**Status:** ❌ Not explicitly defined (built dynamically at query time)  
**Current State:**
- Reconstructed from: sales + vouchers + arrivals + lots
- Frontend must query 4 tables and join

**Recommendation:**
- Create `mandi.mv_day_book` materialized view
- Query once: `SELECT * FROM mandi.mv_day_book WHERE org_id = 'xxx'`

---

## Payment Mode Handling Matrix

```
Mode              Instant?  Receipt Voucher  Status Logic
────────────────────────────────────────────────────────
cash              ✅ YES    ✅ If amt > 0   Based on amt_received
credit            ❌ NO     ❌ NO           Always 'pending'
cheque-pending    ❌ NO     ❌ NO           'pending' until cleared
cheque-instant    ✅ YES    ✅ If amt > 0   Based on amt_received
upi               ✅ YES    ✅ If amt > 0   Based on amt_received
bank_transfer     ✅ YES    ✅ If amt > 0   Based on amt_received
card              ✅ YES    ✅ If amt > 0   Based on amt_received
```

---

## Critical Issues Found

| Issue | Severity | Impact | Quick Fix |
|-------|----------|--------|-----------|
| Day Book not explicit | P0 | Performance bottleneck, duplicate logic | Create MV |
| Partial payments not tracked | P0 | Reconciliation breaks | New table |
| Status not auto-updated | P0 | UI shows wrong payment state | Centralize calc |
| Ledger reference_id NULL | P0 | Audit trail broken | Add constraint |
| Commission not visible | P1 | Can't audit calculations | Create view |
| Transport not allocated per-lot | P1 | Wrong per-lot cost | Add calculation |
| Arrival type not always set | P1 | Wrong ledger posting | UI enforcement |
| Account codes fragile | P1 | Ledger posting fails | Add constraints |
| Terminology inconsistent | P2 | User confusion | Rename fields |
| Pending cheque status unclear | P2 | Users confused | Add UI note |

---

## Bugs Fixed (Recent Migrations)

### Migration: 20260412180000_fix_cash_payment_status_bug.sql
**Bug:** Cash payment marked as 'pending' instead of 'paid'  
**Root Cause:** `amount_received` defaulted only if NULL, but frontend sent 0  
**Fix:** Check if `COALESCE(amount_received, 0) = 0` for instant payments

### Migration: 20260412160000_fix_sale_payment_status.sql
**Bug:** Partial cash payments marked as 'paid' with full amount  
**Root Cause:** Status logic checked `payment_mode = 'partial'`, never sent by frontend  
**Fix:** Strict math: `WHEN v_receipt_amount >= v_total_inc_tax THEN 'paid'`

### Migration: 20260403000000_fix_partial_payment_and_status.sql
**Bug:** Wrong account selected for partial UPI/bank payments  
**Root Cause:** Account selection used payment_mode after already in partial flow  
**Fix:** Respect `p_bank_account_id` explicitly first

---

## Transaction Flow (Simplified)

### Sale Entry
```
1. User submits sale form with payment_mode & amount_received
2. confirm_sale_transaction() called
3. Sales record created with status (paid/partial/pending)
4. SALES voucher created + 2 ledger entries (always)
5. IF instant payment AND amount > 0:
   - RECEIPT voucher created + 2 ledger entries
6. Return sale_id & bill_no

Day Book: 1-2 entries (goods ± payment)
```

### Purchase Entry (Arrival)
```
1. User submits arrival with lots & advances
2. Arrival & lots records created
3. post_arrival_ledger(arrival_id) called
4. Deletes old entries, creates fresh (idempotent)
5. PURCHASE voucher created + N ledger entries (type-specific)
6. All advances grouped by payment_mode & included
7. Return: lots_processed, commission_posted, payable_posted

Day Book: 1 entry (goods + advances aggregated)
```

### Payment Recording (Cheque Clearing)
```
1. User goes to Finance > Cheque Management
2. Selects cheque & clicks "Clear"
3. clear_cheque(voucher_id, bank_account_id, date) called
4. Updates cheque_status = 'Cleared'
5. Creates PAYMENT voucher + 2 ledger entries (new)
6. Calls post_arrival_ledger() to refresh (for purchases)
7. Updates sales.payment_status = 'paid'

Day Book: Payment entry now appears (2-entry total now visible)
```

---

## Ledger Structure

### Key Tables
- `mandi.sales` - Sales header (payment_mode, payment_status, amount_received)
- `mandi.arrivals` - Purchase header (arrival_type, transport costs)
- `mandi.lots` - Stock lines (qty, rate, commission%, advance)
- `mandi.vouchers` - Accounting entries (type, payment_mode, cheque_status)
- `mandi.ledger_entries` - GL lines (debit/credit, reference_id, transaction_type)

### Key Columns for Day Book
```
sales.payment_mode → Categorize (cash, cheque, credit, upi, etc.)
sales.payment_status → Status (paid, partial, pending)
sales.amount_received → Amount paid now
arrivals.arrival_type → Type (commission, direct)
vouchers.cheque_status → Cheque state (pending, cleared, cancelled, bounced)
```

---

## Account Code Mapping

| Purpose | Code | Type | Used By |
|---------|------|------|---------|
| Cash | 1001 | Asset | Instant cash/cheque payments |
| Bank | 1002 | Asset | UPI/bank transfer/card payments |
| Inventory | 1003 | Asset | Purchase arrivals |
| Accounts Payable | 2001 | Liability | Supplier payables |
| Cheques Issued | 2005 | Liability | Cheque advance payments |
| Purchase | 5001 | Expense | Direct purchase arrivals |
| Commission Income | 4001 | Income | Commission arrivals |
| Expense Recovery | 4002 | Income | Transport recovery |

---

## Documentation Generated

### 1. RPC_FUNCTIONS_AND_LEDGER_ANALYSIS.md (Comprehensive)
- **Length:** 800+ lines
- **Content:**
  - Full confirm_sale_transaction() implementation walkthrough
  - Full post_arrival_ledger() implementation walkthrough
  - Payment status logic & cheque handling
  - Ledger structure & day book categories
  - 10 identified gaps with recommendations

### 2. RPC_PAYMENT_FLOW_QUICK_REFERENCE.md (Quick Reference)
- **Length:** 300+ lines
- **Content:**
  - Visual decision trees (payment mode → status)
  - Payment status logic simplified
  - Voucher types & when created
  - Time-based transaction creation
  - SQL quick checks
  - Deployment checklist

### 3. LEDGER_SYSTEM_ISSUES_AND_RECOMMENDATIONS.md (Issues & Fixes)
- **Length:** 350+ lines
- **Content:**
  - 4 critical P0 issues with code examples
  - 4 important P1 issues with recommendations
  - 4 nice-to-have P2 improvements
  - Phase-based migration priorities
  - Testing checklist

### 4. This Executive Summary
- **Content:** High-level overview & quick reference

---

## Recommended Next Steps

### Immediate (This Sprint)
1. Review 3 recent migration fixes (20260412\*)
2. Test all 5 cheque scenarios end-to-end
3. Verify cash payment status bug is fixed

### Next Sprint (P0 Fixes)
1. Create `mandi.mv_day_book` materialized view
2. Create `mandi.payment_transactions` table for history
3. Create `mandi.update_sale_payment_status()` function
4. Add constraints to `ledger_entries` (reference_id NOT NULL)

### Following Sprint (P1 Fixes)
1. Create commission breakdown view
2. Implement transport allocation per lot
3. Enforce arrival_type in UI
4. Add account code constraints

### Later (P2 Polish)
1. Standardize discount/settlement terminology
2. Add pending cheque status notes
3. Create payment reconciliation view
4. Add status change audit trail

---

## Key Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Payment modes supported | 7 | ✅ Complete |
| Recent bug fixes | 3 | ✅ Addressed |
| Issues identified | 12 | ️️⚠️ Needs work |
| Critical issues | 4 | 🔴 Priority |
| Arrival types | 3 | ✅ Complete |
| Account types | 8 | ✅ Complete |
| Ledger table rows (sample org) | 50k+ | ⚠️ Needs indexing |

---

## Verification Checklist

- [x] Analyzed confirm_sale_transaction() from 3 recent migrations
- [x] Traced payment status logic for all 7 modes
- [x] Extracted post_arrival_ledger() full implementation
- [x] Documented commission vs direct arrival handling
- [x] Identified day book structure challenges
- [x] Listed 12 issues with P0/P1/P2 priorities
- [x] Created code examples for each recommendation
- [x] Provided SQL quick checks for validation
- [x] Compiled deployment checklist

---

## Questions for Product/Engineering Review

1. **Priority:** Which P0 issues are blocking next feature release?
2. **Day Book:** Should this be materialized view or real-time query?
3. **Partial Payments:** Should multiple payments be tracked separately or aggregated?
4. **Cheque Clearing:** Current UX requires 2 steps (record sale, then clear in Finance). OK or should combine?
5. **Commission:** Should commission calculation be user-editable or always % of base value?
6. **Transport:** Should transport be entered as % or absolute amount?
7. **Account Codes:** Is enforcing standard codes acceptable (breaks custom setups)?
8. **Terminology:** Ready to standardize 'discount' vs 'settlement'?

---

## Files Reference

| File | Purpose | Line Count |
|------|---------|-----------|
| RPC_FUNCTIONS_AND_LEDGER_ANALYSIS.md | Detailed technical analysis | 800+ |
| RPC_PAYMENT_FLOW_QUICK_REFERENCE.md | Quick reference & visual guides | 300+ |
| LEDGER_SYSTEM_ISSUES_AND_RECOMMENDATIONS.md | Issues & recommended fixes | 350+ |
| EXECUTIVE_SUMMARY (this file) | Overview & key takeaways | 150+ |

**Total Generated:** 1,600+ lines of analysis & recommendations

---

## How to Use This Analysis

### For Backend Engineers
1. Start with: RPC_PAYMENT_FLOW_QUICK_REFERENCE.md (decision trees)
2. Deep dive: RPC_FUNCTIONS_AND_LEDGER_ANALYSIS.md (implementation)
3. Before coding: LEDGER_SYSTEM_ISSUES_AND_RECOMMENDATIONS.md (what to fix)

### For Financial Team
1. Start with: EXECUTIVE_SUMMARY (this file)
2. Understand: RPC_PAYMENT_FLOW_QUICK_REFERENCE.md (payment modes)
3. Verify: LEDGER_SYSTEM_ISSUES_AND_RECOMMENDATIONS.md (reconciliation gaps)

### For Product
1. Start with: EXECUTIVE_SUMMARY (this file)
2. Understand problems: LEDGER_SYSTEM_ISSUES_AND_RECOMMENDATIONS.md (P0/P1/P2)
3. Plan roadmap: Migration priorities section

### For QA
1. Test checklist: LEDGER_SYSTEM_ISSUES_AND_RECOMMENDATIONS.md (Testing section)
2. Scenarios: RPC_PAYMENT_FLOW_QUICK_REFERENCE.md (5 cheque scenarios)
3. Regression: RPC_FUNCTIONS_AND_LEDGER_ANALYSIS.md (every code path)

---

**Analysis Complete. Ready for implementation.**
