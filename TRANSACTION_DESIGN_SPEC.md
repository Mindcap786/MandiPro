# Transaction Design Specification - No Duplicates

**Effective Date:** 2026-04-06  
**Applies To:** ALL sales and purchases  
**Priority:** STRICT - Zero Tolerance for Duplicates

---

## Core Principle

**One logical transaction = One voucher entry**

A sale or purchase creates **exactly one initial transaction**, regardless of payment method or payment status.

---

## Transaction Lifecycle

### Phase 1: Sale/Purchase Created (Goods Transaction)

**When:** User creates a sale invoice or arrival
**What:** Record the goods exchange ONLY

```
Sale: Apple 100 boxes @ ₹100 = ₹10,000

TRANSACTION #1 (Goods Only)
├─ Debit: Buyer (Receivable) ₹10,000
├─ Credit: Sales Revenue ₹10,000
├─ Status: Pending Payment (regardless of payment mode chosen)
└─ Notes: 
    - Udhaar selected? Still ONE transaction
    - Cash to be paid later? Still ONE transaction
    - Cheque pending? Still ONE transaction
    - Cheque instant clear? Still ONE transaction (payment happens later)
```

**Payment Method Selected (does NOT create separate transaction):**
- Credit (Udhaar): No payment entry yet
- Cash: No payment entry yet
- Bank/UPI: No payment entry yet
- Cheque (Instant): No payment entry yet ← KEY CHANGE!
- Cheque (Pending): No payment entry yet

---

### Phase 2: Payment Recorded (Separate Transaction - Only If Needed)

**When:** User explicitly records payment (via Finance > Payments, or cheque cleared via Finance > Cheque Management)

**Condition:** Only create this transaction IF:
- Payment is recorded AFTER initial sale/purchase
- Cheque is being CLEARED (not when marked pending)
- Amount > 0

```
Payment Recorded: ₹10,000 Cash Paid

TRANSACTION #2 (Payment Only - Created Now)
├─ Debit: Cash Account ₹10,000
├─ Credit: Buyer (Receivable) ₹10,000
├─ Status: Paid ✓
└─ Links to: Transaction #1 (same sale)
```

---

### Phase 3: Special Cases

#### Case A: Cheque Instantly Cleared (at entry time)

```
Arrival: ₹12,000 with Cheque Instantly Cleared

TRANSACTION #1 (At Entry)
├─ Debit: Inventory ₹12,000
├─ Credit: Farmer (Payable) ₹12,000
├─ Payment Method: Cheque (Instant)
├─ Status: NEEDS PAYMENT ⚠️
└─ Note: No ledger entry for the cheque payment yet
    (User said "instant" but hasn't verified cheque actually cleared)

TRANSACTION #2 (When Cheque Actually Clears - e.g. next day in Finance)
├─ Debit: Bank Account ₹12,000
├─ Credit: Farmer (Payable) ₹12,000
├─ Status: PAID ✓
└─ Triggered by: Finance > Cheque Management > Clear
```

**Why?** User marks "instant" but cheque hasn't physically cleared yet. When confirmed via Cheque Management, THEN record the payment.

---

#### Case B: Cheque Clear Later (at entry time)

```
Arrival: ₹12,000 with Cheque Clear Later (2026-04-20)

TRANSACTION #1 (At Entry)
├─ Debit: Inventory ₹12,000
├─ Credit: Farmer (Payable) ₹12,000
├─ Payment Method: Cheque (Pending)
├─ Status: PENDING CHEQUE ⏳
└─ Cheque Details Stored: No. 54321, Date: 2026-04-20

[No Transaction #2 created yet]

TRANSACTION #2 (When Cheque Cleared via Finance > Cheque Management)
├─ Debit: Bank Account ₹12,000
├─ Credit: Farmer (Payable) ₹12,000
├─ Status: PAID ✓
└─ Cheque Status: Cleared
```

**Why?** Cheque is pending. Payment transaction only created when actually cleared.

---

#### Case C: Cheque Cancelled

```
Cheque #54321 Marked as Cancelled

Action: Update cheque status to "Cancelled" in mandi.vouchers
├─ cheque_status = 'Cancelled'
├─ Do NOT create any new transaction
├─ Do NOT credit the bank
└─ Arrival/Sale status remains UNPAID

If Payment Was Needed:
User must record alternative payment (cash, bank transfer, etc.)
This creates a NEW transaction with the alternative method
```

**Why?** Cancelled cheques are void. No accounting entry. Just update status.

---

#### Case D: Partial Payment

```
Sale: ₹10,000 Total
User pays ₹6,000 in cash now, rest later (udhaar)

TRANSACTION #1 (At Entry)
├─ Debit: Buyer ₹10,000
├─ Credit: Sales Revenue ₹10,000
├─ Amount Received Now: ₹6,000
└─ Status: PARTIAL (₹6,000 paid, ₹4,000 pending)

TRANSACTION #2 (When ₹6,000 Cash Recorded)
├─ Debit: Cash Account ₹6,000
├─ Credit: Buyer ₹6,000
├─ Status: PARTIAL PAYMENT RECORDED

TRANSACTION #3 (When remaining ₹4,000 paid later)
├─ Debit: Cash Account ₹4,000
├─ Credit: Buyer ₹4,000
├─ Status: FULLY PAID ✓
```

**Why?** Multiple partial payments = multiple payment transactions, but ONLY ONE goods transaction.

---

#### Case E: Cheque Bounce

```
Cheque Cleared, then Bounced

TRANSACTION #1: Goods (₹12,000)
TRANSACTION #2: Payment Recorded (cheque cleared) (₹12,000)

[Later] Cheque bounces

Action: Reverse Transaction #2
├─ Create REVERSE entry (negative debit/credit)
├─ Update cheque status to "Bounced"
└─ Arrival/Sale status reverts to UNPAID

Then user records alternative payment (cash, bank transfer, etc.)
This creates TRANSACTION #3 with the new method
```

**Why?** Bounced cheque means payment was never actually made. Reverse it and record correct payment.

---

## Summary: Transaction Count

| Scenario | Transaction Count | When Created |
|----------|-------------------|--------------|
| Sale with Udhaar (Credit) | 1 | At entry |
| Sale with Cash (later) | 2 | Entry + When recorded |
| Sale with Bank Transfer | 2 | Entry + When cleared |
| Sale with Cheque (Instant) | 2 | Entry + When cleared in Finance |
| Sale with Cheque (Pending) | 2 | Entry + When cleared in Finance |
| Partial Payment (multiple times) | 1 + N | Entry + 1 per payment |
| Cheque Cancelled | 1 | At entry (no change) |
| Cheque Bounced | 2 | Entry + when bounced reversal |

---

## Validation Rules

### At Sale/Purchase Entry:
- ❌ Do NOT create payment ledger entries
- ✅ Create ONLY goods ledger entries
- ✅ Store payment method and amount for reference
- ✅ Set status to "Pending Payment" (regardless of payment mode)

### At Payment Recording:
- ✅ Create payment ledger entries (debit cash/bank, credit party)
- ✅ Update sale/purchase status to "Paid" or "Partial"
- ❌ Do NOT recreate goods entries

### At Cheque Clearing:
- ✅ Create payment transaction
- ✅ Update cheque_status = "Cleared"
- ✅ Update sale/purchase status = "Paid"
- ❌ Do NOT create another goods transaction

### At Cheque Cancellation:
- ✅ Update cheque_status = "Cancelled"
- ✅ Update sale/purchase status = "Unpaid" (if no other payment)
- ❌ Do NOT create any transaction
- ❌ Do NOT debit/credit any account

---

## Implementation Impact

### Functions to Modify

1. **`confirm_sale_transaction()`**
   - Only create goods ledger entries
   - Do NOT create payment entries based on payment_mode
   - Only create payment entries if `p_amount_received > 0` AND `p_payment_mode IN ('cash')` (instant payment)

2. **`post_arrival_ledger()`**
   - Only create goods ledger entries
   - Remove the "create separate payment voucher" logic
   - Payment entries created only when clearing happens

3. **`clear_cheque()`**
   - Now ALWAYS creates payment ledger entries
   - Updates cheque_status = "Cleared"
   - Updates parent sale/arrival status

4. **`cancel_cheque()`** (NEW FUNCTION)
   - Updates cheque_status = "Cancelled"
   - Updates parent sale/arrival status = "Unpaid"
   - No ledger entries created/modified

---

## Status Field Values

### For Sales:
- `'pending'` - Goods recorded, payment not made
- `'partial'` - Some payment recorded
- `'paid'` - Full payment recorded
- `'cancelled'` - Sale cancelled (refund issued)

### For Arrivals:
- `'pending'` - Goods recorded, payment not made
- `'partial'` - Some payment recorded
- `'paid'` - Full payment recorded

### For Vouchers (cheque_status):
- `'Pending'` - Cheque awaiting clearing
- `'Cleared'` - Cheque cleared, payment recorded
- `'Cancelled'` - Cheque cancelled, void
- `'Bounced'` - Cheque bounced after clearing

---

## Frontend Behavior

### At Sale/Purchase Entry:
```
User fills form with payment details:
- Method: Cheque
- Amount to receive: ₹10,000
- Cheque No: 54321
- Cleared Instantly: OFF

System stores this info but does NOT create payment transaction yet.
Status shows: "PENDING CHEQUE" ⏳
```

### At Cheque Management:
```
User goes to Finance > Cheque Management
Sees pending cheques
Clicks "Clear"

System:
1. Creates payment ledger entry
2. Updates cheque_status = "Cleared"
3. Updates parent sale/arrival status = "Paid"
4. Shows in Day Book as new transaction
```

---

## Backward Compatibility

This is a **breaking change** for existing functionality.

- ❌ Old transactions with duplicates must be cleaned up
- ✅ New code path prevents duplicates from day 1
- ✅ Cheque management remains the same
- ✅ Status tracking logic simplified

---

## Audit Trail

Every transaction must be traceable:

```
Sale #10 (₹12,000)
├─ Created: 2026-04-06 10:00 AM (Goods transaction)
├─ Payment Recorded: 2026-04-07 03:00 PM (Cash ₹5,000)
├─ Status Change: pending → partial (by system)
├─ Payment Recorded: 2026-04-08 02:30 PM (Cheque ₹7,000)
└─ Status Change: partial → paid (by system)
```

Each status change is tied to a transaction creation.

---

## Enforcement

**Code Review Checklist:**
- [ ] No duplicate payment vouchers for same sale/purchase
- [ ] Cheque pending doesn't create payment ledger entries
- [ ] Cheque clear creates EXACTLY ONE payment transaction
- [ ] Cheque cancel updates status only
- [ ] Cancellation doesn't create reverse entries
- [ ] Status field correctly reflects payment state
- [ ] No orphaned ledger entries

---

## Testing Scenarios

All scenarios must result in ZERO duplicates:

1. ✅ Instant cheque payment
2. ✅ Pending cheque cleared later
3. ✅ Cheque cancelled
4. ✅ Cheque bounced
5. ✅ Partial payment (multiple installments)
6. ✅ Mixed payment (cheque + cash)
7. ✅ Full udhaar (no payment recorded)
8. ✅ Cash paid at entry
9. ✅ Bank transfer later
10. ✅ Complete payment after 30 days

Each must show exactly 1 goods transaction + N payment transactions (where N = number of actual payments made).

---

## Sign-Off

**This specification is binding.** All future code must follow these rules strictly.

**Zero tolerance for duplicates in production.**

```
Date: 2026-04-06
Owner: [User]
Architect: Claude Code
Status: APPROVED & ACTIVE
```
