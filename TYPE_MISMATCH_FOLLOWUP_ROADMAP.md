# Type Mismatch Fix - Follow-Up Roadmap

**Status**: Core `post_arrival_ledger()` fix applied in `20260414_comprehensive_type_safety_fix.sql`

**Remaining Work**: 7 other migrations need similar fixes

---

## Summary of Issues Found: 21 Instances Across 8 Migrations

### ✅ FIXED
- `20260421_fix_arrival_ledger_products_column.sql` - **3 instances** ✅

### 🔄 REMAINING (Type Mismatch in Other Functions)

| # | Migration | File | Instances | Affected Function(s) | Priority |
|---|-----------|------|-----------|----------------------|----------|
| 1 | 20260216 | add_sales_return_system.sql | 2 | `post_sales_return()` | HIGH |
| 2 | 20260220 | add_purchase_returns_damages.sql | 2 | `process_purchase_return()` x2 | HIGH |
| 3 | 20260317 | update_confirm_sale_transaction.sql | 2 | `confirm_sale_transaction()` | CRITICAL |
| 4 | 20260404 | update_arrival_cheque_status.sql | 1 | `post_arrival_ledger()` variant | HIGH |
| 5 | 20260412 | fix_sale_payment_status.sql | 3 | `record_sale_payment()` | HIGH |
| 6 | 20260422 | safe_ledger_cleanup.sql | 3 | `post_arrival_ledger()` variant | HIGH |
| 7 | 20260424 | standardize_sales_and_ledger_repair.sql | 5 | `confirm_sale_transaction()` x2, `process_monthly_settlement()` | CRITICAL |

---

## Affected Account Codes (All TEXT, Need Quotes)

```sql
'1001'  - Cash Account
'1002'  - Bank Account  
'3001'  - Sales Revenue Account
'4001'  - Purchase Account / Sales Revenue
'4002'  - Expense Recovery Account
'4300'  - Alternative Expense Account
'5001'  - Purchase Account (Mandi)
```

---

## Recommended Fix Order

### Phase 1: Sales & Returns (Next)
1. **`20260317_update_confirm_sale_transaction.sql`** - CRITICAL (sales confirm)
   - Fix: `code = 1001` → `code = '1001'`
   - Fix: `code = 1002` → `code = '1002'`

2. **`20260216_add_sales_return_system.sql`** - HIGH (sales returns)
   - Fix: `code = 3001` → `code = '3001'`
   - Fix: `code = 1001` → `code = '1001'`

### Phase 2: Purchase & Payment (After Phase 1)
3. **`20260220000000_add_purchase_returns_damages.sql`** - HIGH
   - Fix: `code = 4001` → `code = '4001'` (2 locations)

4. **`20260412160000_fix_sale_payment_status.sql`** - HIGH
   - Fix: `code = 1001` → `code = '1001'` (2 locations)
   - Fix: `code = 1002` → `code = '1002'`

### Phase 3: Ledger Cleanup & Repair (After Phase 2)
5. **`20260422000001_safe_ledger_cleanup.sql`** - HIGH (cleanup function)
   - Fix: `code = 5001` → `code = '5001'`
   - Fix: `code = 4002` → `code = '4002'`
   - Fix: `code = 1001` → `code = '1001'`

6. **`20260404100000_update_arrival_cheque_status.sql`** - HIGH
   - Fix: `code = 5001` → `code = '5001'`

7. **`20260424010000_standardize_sales_and_ledger_repair.sql`** - CRITICAL
   - Fix: `code = 4001` → `code = '4001'` (2 locations)
   - Fix: `code = 4002` → `code = '4002'` (2 locations)
   - Fix: `code = 4300` → `code = '4300'` (2 locations)

---

## How Each Fix Works

### Template for Phase 1-3 Fixes

```sql
-- In migration: 20260[date]_fix_[name]_type_safety.sql

CREATE OR REPLACE FUNCTION affected_function_name(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
AS ...
-- Replace all: code = XXXX with code = 'XXXX'
-- Keep all logic identical
-- Add comment: "Fixed: 2026-04-14 - Type-safe code comparisons"
```

---

## Testing Each Phase

### After Each Migration Applied:
```bash
1. List affected transactions (arrivals/sales/returns)
2. Process one new transaction
3. Verify ledger entries created (no type errors)
4. Check ledger statement for accuracy
5. Confirm no warnings in database logs
```

---

## Command to Apply All Fixes (Once Created)

```bash
# Apply fixes in order
supabase migration up --file=20260414_fix_confirm_sale_type_safety.sql
supabase migration up --file=20260414_fix_sales_return_type_safety.sql
supabase migration up --file=20260414_fix_purchase_return_type_safety.sql
supabase migration up --file=20260414_fix_payment_status_type_safety.sql
supabase migration up --file=20260414_fix_ledger_cleanup_type_safety.sql
supabase migration up --file=20260414_fix_cheque_status_type_safety.sql
supabase migration up --file=20260414_fix_standardize_ledger_type_safety.sql
```

---

## Prevention: Code Review Checklist

For future migrations involving account lookups:

- [ ] Column type verified (is `code` TEXT or INT?)
- [ ] Comparison literal matches column type (strings for TEXT)
- [ ] All account codes quoted: `'XXXX'`, not `XXXX`
- [ ] Function tested with sample data
- [ ] No type mismatch errors in PostgreSQL logs
- [ ] Ledger statement shows correct entries

---

## Current State

✅ **Post-Arrival-Ledger**: FIXED in `20260414_comprehensive_type_safety_fix.sql`
🔄 **All Others**: Pending (7 migrations, 18 instances remaining)

**Estimated Impact When All Fixed**:
- ✅ Arrival logging: Works perfectly
- ✅ Sales confirmation: No more type errors
- ✅ Returns processing: Type-safe
- ✅ Payment reconciliation: Correct
- ✅ Ledger statements: Accurate & complete
