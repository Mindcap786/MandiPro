# Cheque Payment Behavior Guide

## Summary: Why ₹13,000 Appeared for ₹12,000

**The ₹12,000 is the goods value.** The ₹13,000 includes transport recovery charges.

### Example Breakdown:

**New Farmer Arrival:**
- Goods value: **₹12,000**
- Transport charges (hire + hamali + other): **₹1,000**
- **Total Payable: ₹13,000**

When the ledger records this as an arrival, it creates:
1. Debit Inventory: ₹12,000
2. Credit Party: ₹12,000
3. Debit Party: ₹1,000 (transport recovery)
4. Credit Expense Recovery: ₹1,000

**Net to Party:** ₹12,000 - ₹1,000 = ₹11,000 payable (or ₹13,000 gross if recovery is collected)

---

## How Cheque Payments Work (After Fix)

### 1. INSTANT CHEQUE CLEARING ✅

**Form Entry:**
- Payment Mode: `Cheque`
- Amount: ₹13,000 (total payable including transport)
- Cleared Instantly: `ON` ✓
- Cheque No: 12345
- Clear Date: (not shown, since instantly cleared)

**Result in Day Book:**
```
Single Transaction:
├─ Debit: Purchase Account ₹13,000
├─ Credit: Party ₹13,000
├─ Debit: Party ₹1,000 (transport recovery)
├─ Credit: Expense Recovery ₹1,000
└─ All in ONE voucher (like UPI/BANK) ✓
```

✅ **Correct:** Single transaction, no duplication

---

### 2. CHEQUE CLEAR LATER ⏳

**Form Entry:**
- Payment Mode: `Cheque`
- Amount: ₹13,000
- Cleared Instantly: `OFF` ⏳
- Cheque No: 12345
- Clear Date: `2026-04-15` (future date)

**Day Book - At Entry Time:**
```
Purchase Transaction:
├─ Debit: Purchase Account ₹13,000
├─ Credit: Party ₹13,000
└─ Status: PENDING (cheque awaiting clearance)
```

❌ **NO payment voucher created yet**

**Day Book - When Cheque Cleared (via Finance > Cheque Management > Clear):**
```
Payment Transaction (created automatically):
├─ Debit: Party ₹13,000
├─ Credit: Bank Account ₹13,000
└─ Status: CLEARED ✓
```

✅ **Correct:** Two transactions, one for purchase, one for payment when cleared

---

## Comparison: All Payment Modes

| Mode | Behavior | Result |
|------|----------|--------|
| **Cash** | Instantly settled | Single transaction (Debit Inventory → Credit Cash) |
| **UPI/BANK** | Instantly settled | Single transaction (Debit Inventory → Credit Bank) |
| **Cheque (Instant)** | Instantly cleared | Single transaction (Debit Inventory → Credit Bank) |
| **Cheque (Later)** | Pending, cleared later | Two transactions: Purchase now + Payment when cleared |
| **Credit (Udhaar)** | No payment recorded | Single transaction (Debit Inventory → Credit Party) |

---

## The ₹13,000 Mystery Explained

**Why did it show as TWO separate ₹13,000 entries in the old system?**

The bug was in `post_arrival_ledger`:
1. Created Purchase Voucher with ₹12,000 entries
2. **THEN created a DUPLICATE Payment Voucher** with another ₹13,000 (including transport)
3. Both vouchers showed in Day Book separately = **duplicate transaction**

**Old (Wrong):**
```
Transaction #23 (Purchase): ₹12,000 "1. PURCHASE - FULL UDHAAR"
Transaction #32 (Payment): ₹13,000 "Paid to Party" ← WRONG! This shouldn't exist yet
Transaction #31 (Payment): ₹13,000 "Cash paid" ← WRONG! Duplicate!
```

**New (Correct):**
```
Transaction #23 (Purchase): ₹13,000 (includes transport)
   ├─ Debit Purchase ₹12,000
   ├─ Credit Party ₹12,000
   ├─ Debit Party ₹1,000 (recovery)
   └─ Credit Expense Recovery ₹1,000
```

✅ Single entry, no duplication, all in one voucher

---

## Future Guarantee

With the fix (`20260406100000_fix_cheque_duplication.sql`):

✅ **Instant Cheques:** Act like UPI/BANK - single transaction  
✅ **Pending Cheques:** No duplicate payment entries until cleared  
✅ **No ₹13,000 mystery:** Transport amounts properly netted in one entry  
✅ **Clear on demand:** When cheque clears, one payment transaction added  
✅ **Consistent behavior:** All payment modes behave the same way

---

## Implementation Steps

1. **Apply migration:** `20260406100000_fix_cheque_duplication.sql`
2. **Run cleanup:** `20260406110000_cleanup_duplicate_arrivals_ledger.sql`
3. **Regenerate arrivals:** For each arrival with cheque payment, call `post_arrival_ledger(arrival_id)`
4. **Verify:** Check Finance > Day Book for single transactions

---

## Key SQL Changes

### Before (Buggy):
```sql
-- Created TWO separate vouchers - purchase AND payment
IF v_total_paid_advance > 0 THEN
    INSERT INTO mandi.vouchers (...) -- Always created new payment voucher
    VALUES (...);
END IF;
```

### After (Fixed):
```sql
-- UPSERT logic - reuse existing voucher
IF v_payment_voucher_id IS NULL THEN
    INSERT INTO mandi.vouchers (...);  -- Create only if doesn't exist
ELSE
    UPDATE mandi.vouchers SET ...;     -- Update existing voucher
END IF;
```

This ensures **one voucher per arrival payment**, not duplicates.
