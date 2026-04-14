# Developer Quick Reference - STRICT NO-DUPLICATES

**Pin this. Memorize this. Code by this.**

---

## The One Rule

```
1 Sale/Purchase Entry = 1 Goods Transaction ONLY

Payments recorded separately = separate transactions

NO DUPLICATES. EVER.
```

---

## When to Create Transactions

| Event | Create Transaction | Type | Count |
|-------|-------------------|------|-------|
| User creates sale | ✅ YES | Goods | 1 |
| User selects payment mode | ❌ NO | - | 0 |
| User marks cheque "instant" | ❌ NO | - | 0 |
| User marks cheque "pending" | ❌ NO | - | 0 |
| Cheque actually clears | ✅ YES | Payment | 1 |
| Cash payment recorded | ✅ YES | Payment | 1 |
| Bank transfer verified | ✅ YES | Payment | 1 |
| Cheque cancelled | ❌ NO | - | 0 |

---

## Code Patterns

### ❌ WRONG - Creates Duplicate:
```sql
-- In confirm_sale_transaction():
INSERT INTO mandi.ledger_entries (...) -- Goods
INSERT INTO mandi.ledger_entries (...) -- Payment ← WRONG!
```

### ✅ RIGHT - Goods Only:
```sql
-- In confirm_sale_transaction():
INSERT INTO mandi.ledger_entries (...) -- Goods only
-- Payment happens later via clear_cheque() or manual payment recording
```

### ✅ RIGHT - Payment Later:
```sql
-- In clear_cheque():
INSERT INTO mandi.vouchers (type='payment') -- NOW create payment
INSERT INTO mandi.ledger_entries (...) -- NOW create payment entries
```

---

## Status Progression

```
Sale Created:
payment_status = 'pending' (regardless of payment_mode)
        ↓
Payment Recorded:
payment_status = 'partial' or 'paid'
        ↓
(if more payments needed)
payment_status goes back to 'partial'
```

---

## Cheque States in vouchers.cheque_status

```
'Pending'   → Cheque is pending, no payment recorded yet
'Cleared'   → Cheque cleared, payment transaction created
'Cancelled' → Cheque cancelled, no payment transaction
'Bounced'   → Cheque bounced after clearing, reverse payment
```

---

## SQL Checklist

**Before committing cheque/payment code:**

```sql
-- Should return 0 rows (no duplicates):
SELECT sale_id, COUNT(*) as txn_count
FROM mandi.vouchers
WHERE sale_id = 'xxx'
GROUP BY sale_id
HAVING COUNT(*) > 2;

-- Should return 1:
SELECT COUNT(DISTINCT voucher_id)
FROM mandi.ledger_entries
WHERE reference_id = 'xxx' AND transaction_type = 'sale';

-- Should show 2 separate vouchers (1 goods, 1 payment):
SELECT type, COUNT(*) FROM mandi.vouchers
WHERE reference_id = 'xxx' GROUP BY type;
-- Output:
-- sale    | 1
-- payment | 1
```

---

## Frontend Flow

### Sale Entry:
1. User fills form
2. Selects payment mode
3. Clicks Save
4. **Result:** 1 goods transaction in Day Book
5. **Status:** "Pending" (shown as orange in UI)

### If cheque pending:
- User sees "Cheque pending, awaiting clearance"
- No payment transaction in Day Book yet
- Status remains "Pending"

### When cheque clears:
- User goes to Finance > Cheque Management
- Clicks "Clear"
- **Result:** 2nd transaction appears in Day Book
- **Status:** "Paid"

### If cheque cancelled:
- User clicks "Cancel"
- Cheque status = "Cancelled"
- Status remains "Pending" (unpaid)
- No new transaction in Day Book

---

## The ₹13,000 Issue (EXPLAINED FOREVER)

**Old System (BROKEN):**
```
Goods: ₹12,000
Transport: ₹1,000
---
Party Owes: ₹13,000

But system showed:
Transaction #1: ₹12,000 (goods)
Transaction #2: ₹13,000 (payment) ← DUPLICATE!
```

**New System (FIXED):**
```
Goods: ₹12,000
Transport: ₹1,000
---
Party Owes: ₹13,000

System shows:
Transaction #1 (with multiple ledger entries):
├─ Debit Inventory ₹12,000
├─ Credit Party ₹12,000
├─ Debit Party ₹1,000 (transport recovery)
└─ Credit Expense Recovery ₹1,000

Result: ONE voucher, net amount ₹13,000 payable ✓

When paid:
Transaction #2 (separate payment):
├─ Debit Bank ₹13,000
└─ Credit Party ₹13,000
```

---

## Code Review Questions

Ask these for EVERY payment/cheque change:

1. **How many vouchers created?**
   - Correct: 1 goods (at entry) + 1 payment (when paid)
   - Wrong: 2+ vouchers at entry time

2. **When are ledger entries posted?**
   - Correct: Goods at entry, Payment when cleared/recorded
   - Wrong: Payment entries at entry time

3. **Cheque handling:**
   - Correct: No entries until cleared
   - Wrong: Entries created when marked "instant"

4. **Cancellation:**
   - Correct: Status update only
   - Wrong: Any ledger entries created

5. **Day Book test:**
   - Correct: Shows 1 entry for goods, 1 for payment
   - Wrong: Shows duplicate amounts or 2+ payment entries

---

## Common Mistakes (AVOID THESE)

❌ **Mistake #1:** Creating payment entries at sale entry time
```sql
INSERT INTO mandi.vouchers (type='payment') -- WRONG at entry!
```

❌ **Mistake #2:** Creating second voucher when amount doesn't match
```sql
IF calculated_amount != p_amount THEN
    INSERT INTO mandi.vouchers (...) -- WRONG! Creates duplicate
END IF;
```

❌ **Mistake #3:** Adding cheque details as separate transaction
```sql
IF payment_mode = 'cheque' THEN
    INSERT INTO mandi.vouchers (...) -- WRONG! Creates duplicate
END IF;
```

❌ **Mistake #4:** Creating transaction when cancelling
```sql
UPDATE vouchers SET cheque_status='Cancelled'
INSERT INTO mandi.vouchers (...) -- WRONG! No new transaction
```

---

## Testing Each Scenario

### Scenario 1: Udhaar (Credit)
```
Create sale ₹10,000 with Credit mode
├─ Day Book: 1 entry (goods)
├─ Status: "pending"
└─ Pay later: Creates 2nd entry when paid
```

### Scenario 2: Cash Now
```
Create sale ₹10,000 with Cash mode, pay ₹10,000 now
├─ Day Book: 2 entries (goods + payment)
├─ Status: "paid"
└─ Total: 2 transactions ✓
```

### Scenario 3: Cheque Pending
```
Create arrival ₹12,000 with Cheque, Clear Later date
├─ Day Book: 1 entry (goods/transport/commission)
├─ Status: "pending"
└─ When cleared: 2nd entry appears (payment) ✓
```

### Scenario 4: Cheque Instant
```
Create arrival ₹12,000 with Cheque, Cleared Instantly: ON
├─ Day Book: 1 entry (goods) - STATUS: pending
├─ User sees: "Awaiting cheque clearing confirmation"
└─ When actually cleared: 2nd entry appears ✓
```

### Scenario 5: Cancelled
```
Create sale ₹10,000 with Cheque pending
├─ Status: "pending"
├─ Day Book: 1 entry
├─ User cancels cheque
├─ Day Book: still 1 entry (no change)
├─ Status: "pending" (unchanged)
└─ User must record different payment ✓
```

---

## Git Commit Message Template

```
fix: Implement strict no-duplicate transaction design

- Sales/purchases create ONE goods transaction
- Payments recorded separately create payment transactions
- Cheque clearing NOW creates payment transaction (not at entry)
- Cheque cancellation updates status only (no ledger entries)
- Guarantees: 1 goods txn + N payment txns (N = actual payments)

Fixes: ₹13,000 appearing for ₹12,000 sale
Fixes: Duplicate payment entries
Fixes: Pending cheques creating premature payment entries

Test: Day Book shows no duplicates
Test: Status field reflects actual payment state
Test: All 5 cheque scenarios pass
```

---

## Deployment Checklist

Before pushing to production:

- [ ] Read `TRANSACTION_DESIGN_SPEC.md`
- [ ] Review `20260406120000_strict_no_duplicate_transactions.sql`
- [ ] Test all 5 cheque scenarios
- [ ] Run Day Book validation query
- [ ] Verify status progression works
- [ ] Check Cheque Management clearing works
- [ ] Confirm cancellation doesn't create entries
- [ ] Test partial payments (multiple)
- [ ] Validate no orphaned ledger entries

---

## When in Doubt

Ask yourself:

> "If I create this transaction now, will a duplicate be created later when payment is recorded?"

If **YES** → Don't create it  
If **NO** → Go ahead

---

**This is your North Star. Code by it.**

```
┌─────────────────────────────────────┐
│  ONE TRANSACTION = ONE LOGICAL EVENT │
│  NOT MULTIPLE REPRESENTATIONS OF     │
│  THE SAME EVENT                     │
└─────────────────────────────────────┘
```
