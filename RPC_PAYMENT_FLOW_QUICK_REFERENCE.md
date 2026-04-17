# Quick Reference: RPC Functions & Payment Flow

## Visual: Payment Mode Decision Tree

```
confirm_sale_transaction(p_payment_mode, p_amount_received, p_cheque_status)
│
├─ payment_mode = 'CREDIT'
│  │
│  ├─ amount_received = NULL/0 → Status: 'pending'
│  ├─ No receipt voucher created
│  └─ Day Book: 1 entry (goods only, red 🔴)
│
├─ payment_mode = 'CASH'
│  │
│  ├─ amount_received = NULL/0 → Defaults to FULL AMOUNT → Status: 'paid' ✅ (FIXED BUG)
│  ├─ amount_received < total → Status: 'partial'
│  ├─ amount_received >= total → Status: 'paid'
│  ├─ Receipt voucher CREATED
│  ├─ Account: 1001 (Cash)
│  └─ Day Book: 2 entries (goods + payment, green 🟢 or orange 🟠)
│
├─ payment_mode = 'UPI' / 'BANK_TRANSFER' / 'CARD'
│  │
│  ├─ amount_received = NULL/0 → Defaults to FULL AMOUNT → Status: 'paid'
│  ├─ amount_received < total → Status: 'partial'
│  ├─ Receipt voucher CREATED
│  ├─ Account: 1002 (Bank) or p_bank_account_id
│  └─ Day Book: 2 entries (goods + payment, green 🟢 or orange 🟠)
│
└─ payment_mode = 'CHEQUE'
   │
   ├─ cheque_status = FALSE (Clear Later)
   │  │
   │  ├─ Status: 'pending'
   │  ├─ NO receipt voucher created AT ENTRY TIME ⚠️
   │  ├─ Cheque details stored: cheque_no, cheque_date, bank_name
   │  │
   │  ├─ [Later] User calls clear_cheque()
   │  │  │
   │  │  ├─ clear_cheque() creates PAYMENT voucher
   │  │  ├─ Updates sales.payment_status = 'paid'
   │  │  └─ Day Book: 2 entries appear (goods + payment)
   │  │
   │  └─ [OR] User cancels cheque
   │     │
   │     ├─ Cheque status = 'Cancelled'
   │     ├─ No voucher change
   │     ├─ Status stays 'pending'
   │     └─ Day Book: 1 entry (goods only, red 🔴)
   │
   └─ cheque_status = TRUE (Instant Clear)
      │
      ├─ Treated as INSTANT PAYMENT ⚠️ Note: Still pending until cleared
      ├─ amount_received defaults to FULL AMOUNT
      ├─ Status: 'paid'
      ├─ Receipt voucher CREATED
      ├─ Account: p_bank_account_id or 1002 (Bank)
      │
      ├─ [Later] User verifies cheque cleared
      │  │
      │  └─ clear_cheque() just updates status, voucher already exists
      │
      └─ Day Book: 2 entries (goods + payment, green 🟢)
```

---

## Visual: Payment Status Logic

```
BEFORE: ❌ Status = p_payment_mode (WRONG)
  - Only checked if p_payment_mode = 'partial'
  - Frontend never sent 'partial'
  - Cash payments defaulted to 0 amount_received
  - Result: Cash payments marked 'pending' even when paid! 💥

NOW: ✅ Status = Math(amount_received vs total) (CORRECT)
  
  calculate:
    v_receipt_amount = ???
    v_total_inc_tax = total + GST
  
  if is_instant_payment (cash, upi, bank, card, cheque-cleared):
    if amount_received is NULL or 0:
      v_receipt_amount = v_total_inc_tax  ← NOW DEFAULTS TO FULL ✅
    else:
      v_receipt_amount = amount_received
    
    status = case
      when v_receipt_amount >= v_total_inc_tax then 'paid'
      when v_receipt_amount > 0 then 'partial'
      else 'pending'
    end
  else:  -- credit, cheque-pending
    v_receipt_amount = 0
    status = 'pending'
```

---

## Table: Payment Mode → Account Mapping

| Payment Mode | Account Lookup | Account Code | Fallback |
|---|---|---|---|
| **cash** | ILIKE 'Cash%' | 1001 | Any asset account |
| **upi** | From p_bank_account_id OR ILIKE 'Bank%' | 1002 | Cash (1001) |
| **bank_transfer** | From p_bank_account_id OR ILIKE 'Bank%' | 1002 | Cash (1001) |
| **card** | From p_bank_account_id OR ILIKE 'Bank%' | 1002 | Cash (1001) |
| **cheque** | From p_bank_account_id | 1002 | Cheques Issued (2005) |

---

## Function Return Format

```sql
-- confirm_sale_transaction returns:
{
  "success": true,
  "sale_id": "uuid",
  "bill_no": 1,
  "contact_bill_no": 1,
  "message": "Duplicate skipped" (if idempotent retry)
}

-- post_arrival_ledger returns:
{
  "success": true,
  "arrival_id": "uuid",
  "arrival_type": "commission|direct",
  "lots_processed": 5,
  "commission_posted": 5000,
  "payable_posted": 95000
}
```

---

## Voucher Types & When Created

```
SALES Voucher (type='sales')
├─ When: ALWAYS at sale entry
├─ Amount: v_total_inc_tax
├─ Ledger Entries: 2 (DR buyer, CR sales revenue)
├─ Narration: 'Invoice #<bill_no>'
└─ Voucher_no: Auto-increment per org

RECEIPT Voucher (type='receipt')
├─ When: Only if v_receipt_amount > 0
├─ Amount: v_receipt_amount
├─ Ledger Entries: 2 (DR cash/bank, CR buyer)
├─ Narration: 'Payment against Invoice #<bill_no>'
└─ Voucher_no: Auto-increment per org

PURCHASE Voucher (type='purchase')
├─ When: ALWAYS at arrival post_arrival_ledger() call
├─ Amount: v_total_inventory (commission) or v_total_direct_cost (direct)
├─ Ledger Entries: N (depends on arrival_type)
├─ Narration: '<type> Arrival - <reference_no>'
├─ Voucher_no: Auto-increment per org
└─ Idempotent: Deletes old entries, recreates fresh

PAYMENT Voucher (type='payment')
├─ When: Called by clear_cheque() for cheque-pending arrivals
├─ Amount: cheque face value
├─ Ledger Entries: 2 (DR party, CR bank/cheque account)
├─ Narration: 'Cheque <cheque_no> Payment Cleared'
└─ Idempotent: No, unless wrapped in post_arrival_ledger()
```

---

## Ledger Entry Types

| Transaction Type | Debit | Credit | When | Purpose |
|---|---|---|---|---|
| **sale** | Buyer | Sales Revenue | At sale entry | Goods supplied |
| **receipt** | Cash/Bank | Buyer | If instant payment | Cash/UPI/Card received |
| **purchase** | Inventory/Purchase Account | Party/Supplier | At post_arrival_ledger() | Goods received |
| **commission** | Party | Commission Income | At post_arrival_ledger() | Commission earned |
| **income** (expense recovery) | Party | Expense Recovery | At post_arrival_ledger() | Transport/costs recovery |
| **payable** | Party | Accounts Payable | At post_arrival_ledger() | Party owes us |
| **payment** | Party/Supplier | Cash/Bank/Cheque | At clear_cheque() | Payment to supplier |

---

## Time-Based Transaction Creation

```
SALE WORKFLOW:

T=0 (User clicks "Save Sale")
  ✅ INSERT mandi.sales (payment_status determined)
  ✅ INSERT mandi.sale_items (qty, rate, amount)
  ✅ UPDATE mandi.lots (decrement stock)
  ✅ INSERT mandi.vouchers (sales) - ALWAYS
  ✅ INSERT mandi.ledger_entries (2: goods)
  ✅ IF instant payment: INSERT mandi.vouchers (receipt)
  ✅ IF instant payment: INSERT mandi.ledger_entries (2: payment)
  └─ Day Book: 1 or 2 rows (goods ± payment)

T=n (If cheque pending, user later clears it)
  ✅ User clicks "Clear" in Finance > Cheque Management
  ✅ CALL clear_cheque()
    ├─ UPDATE mandi.vouchers (cheque_status = 'Cleared')
    ├─ INSERT mandi.vouchers (payment type RECEIPT) ← NEW
    ├─ INSERT mandi.ledger_entries (2: payment) ← NEW
    ├─ UPDATE mandi.sales (payment_status = 'paid')
    └─ Day Book: 2 rows appear (goods + payment)


PURCHASE WORKFLOW:

T=0 (User clicks "Save Arrival")
  ✅ INSERT mandi.arrivals
  ✅ INSERT mandi.lots (qty, rate, commission, expenses, advance)
  ✅ CALL post_arrival_ledger(arrival_id)
    ├─ DELETE old ledger_entries for this arrival
    ├─ INSERT mandi.vouchers (purchase) - ALWAYS
    ├─ INSERT mandi.ledger_entries (N: depends on type)
    ├─ INSERT mandi.ledger_entries (advances: if any)
    └─ Day Book: 1 row (goods + advances)

T=n (If cheque advance paid, user later clears it)
  ✅ User clicks "Clear" in Finance > Cheque Management
  ✅ CALL clear_cheque()
    ├─ UPDATE mandi.vouchers (cheque_status = 'Cleared')
    ├─ UPDATE mandi.lots (advance_cheque_status = true)
    ├─ CALL post_arrival_ledger(arrival_id) ← RE-POSTS
      └─ Deletes old entries, recreates with cleared status
    └─ Day Book: Fresh entries with cleared payment
```

---

## Status Field Meanings

### sales.payment_status
```
'pending'  → No payment received yet (balance = total_amount_inc_tax)
'partial'  → Some payment received (0 < amount_paid < total, balance > 0)
'paid'     → Full payment received (balance ≈ 0)
```

### vouchers.cheque_status
```
NULL       → Not a cheque payment
'Pending'  → Cheque received, awaiting clearing
'Cleared'  → Cheque cleared successfully, payment recorded
'Cancelled'→ Cheque cancelled, no payment recorded
'Bounced'  → Cheque cleared then bounced, payment reversed
```

### lots.payment_status (for purchases)
```
NULL       → No payment recorded yet
'partial'  → Advances paid partially
'paid'     → Full amount paid
```

---

## Common Mistakes & Fixes

| Mistake | Result | Fix |
|---|---|---|
| Creating receipt voucher for credit sales | Duplicate payment entry | Check if is_instant_payment before voucher insert |
| Not defaulting amount_received for cash/upi | Cash marked as 'pending' | Check if COALESCE(amount, 0) = 0 for instant modes |
| Wrong account (cash vs bank) | Ledger imbalance | Use p_bank_account_id if provided, else payment_mode |
| Calling post_arrival_ledger() twice | Duplicate ledger entries | Built-in UPSERT: deletes old before inserting new |
| Not updating sales.payment_status after clear_cheque() | UI shows 'pending' | Trigger on clear_cheque() to call get_invoice_balance() |
| Creating payment voucher at entry for cheque-pending | Premature ledger entries | Only create receipt voucher if is_instant_payment |

---

## SQL Quick Checks

```sql
-- Check if sale has duplicate payment entries:
SELECT sale_id, COUNT(*) as voucher_count
FROM mandi.vouchers
WHERE type IN ('sales', 'receipt') AND invoice_id = 'xxx'
GROUP BY sale_id
HAVING COUNT(*) > 2;
-- Should return: 0 rows (or 2 for normal[1 sales + 1 receipt])

-- Check if cheque marked cleared:
SELECT cheque_no, cheque_status, is_cleared, amount
FROM mandi.vouchers
WHERE id = 'xxx';
-- Should show: cheque_status='Cleared', is_cleared=true

-- Check ledger balance for sale:
SELECT
  SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END) as total_debit,
  SUM(CASE WHEN credit > 0 THEN credit ELSE 0 END) as total_credit
FROM mandi.ledger_entries
WHERE reference_id = 'sale_xxx' AND transaction_type IN ('sale', 'receipt');
-- Should show: total_debit = total_credit (balanced)

-- Check arrival payment status:
SELECT
  a.id, a.arrival_type,
  (SELECT SUM(advance) FROM mandi.lots WHERE arrival_id = a.id) as total_advance,
  (SELECT COUNT(*) FROM mandi.ledger_entries WHERE reference_id = a.id) as ledger_count
FROM mandi.arrivals a
WHERE id = 'xxx';
-- Should show: ledger_count > 0 (post_arrival_ledger was called)

-- Find all pending cheques awaiting clearing:
SELECT cheque_no, cheque_date, amount, reference_id
FROM mandi.vouchers
WHERE cheque_status = 'Pending' AND organization_id = 'org_xxx'
ORDER BY cheque_date;
```

---

## Integration Points

### Frontend → RPC Calls
```
Sales Entry Form:
  confirm_sale_transaction(
    org_id, buyer_id, sale_date,
    payment_mode, total_amount,
    items_array,  -- [{lot_id, qty, rate, ...}]
    p_amount_received ← CRITICAL
  )

Purchase Entry Form:
  [Create arrivals record]
  [Create lots records with advance data]
  post_arrival_ledger(arrival_id)  ← Called after insert

Cheque Clearing:
  clear_cheque(voucher_id, bank_account_id, clear_date)
```

### API Routes Affected
```
POST /api/sales/create → confirm_sale_transaction()
POST /api/purchases/create → post_arrival_ledger()
POST /api/finance/clear-cheque → clear_cheque()
GET /api/sales/:id/balance → get_invoice_balance()
GET /api/ledger/day-book → Query ledger_entries + vouchers
```

---

## Deployment Checklist

Before deploying any payment/ledger changes:

- [ ] Verify all 5 cheque scenarios pass (pending, instant, cleared, cancelled, bounced)
- [ ] Test cash payment (should default to full amount if amount_received = 0)
- [ ] Test partial cash payment (amount_received < total)
- [ ] Test credit sale (should have status='pending', no receipt voucher)
- [ ] Test commission arrival (verify commission deduction)
- [ ] Test direct arrival (verify full cost in AP)
- [ ] Test post_arrival_ledger() idempotency (call twice, same result)
- [ ] Verify Day Book shows no duplicate amounts
- [ ] Verify ledger entries balance (debit = credit per voucher)
- [ ] Check payment_status matches actual amount_paid

---

**Quick Reference Complete**
