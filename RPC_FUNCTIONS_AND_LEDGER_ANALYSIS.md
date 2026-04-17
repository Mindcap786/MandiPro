# Key RPC Functions & Ledger Logic Analysis

**Generated:** 2026-04-12  
**Author:** Code Analysis  
**Purpose:** Extract and document core transaction functions, payment handling, and ledger structure

---

## SUMMARY

This analysis covers three critical components:

1. **`confirm_sale_transaction()`** - Handles all sales with multiple payment modes
2. **`post_arrival_ledger()`** - Handles all purchases (commission & direct) with ledger posting
3. **Ledger Structure & Day Book Categorization** - How transactions are recorded and viewed

---

# PART 1: confirm_sale_transaction() - Sales RPC

## Location
- **Primary Definition:** [supabase/migrations/20260412180000_fix_cash_payment_status_bug.sql](supabase/migrations/20260412180000_fix_cash_payment_status_bug.sql)
- **Latest Fix:** [supabase/migrations/20260412160000_fix_sale_payment_status.sql](supabase/migrations/20260412160000_fix_sale_payment_status.sql)
- **Previous Version:** [supabase/migrations/20260403000000_fix_partial_payment_and_status.sql](supabase/migrations/20260403000000_fix_partial_payment_and_status.sql)

## Function Signature

```sql
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id    uuid,
    p_buyer_id           uuid,
    p_sale_date          date,
    p_payment_mode       text,      -- 'cash', 'credit', 'cheque', 'upi', 'bank_transfer', 'card'
    p_total_amount       numeric,
    p_items              jsonb,     -- [{lot_id, qty, rate, amount, unit, gst_amount}]
    p_market_fee         numeric    DEFAULT 0,
    p_nirashrit          numeric    DEFAULT 0,
    p_misc_fee           numeric    DEFAULT 0,
    p_loading_charges    numeric    DEFAULT 0,
    p_unloading_charges  numeric    DEFAULT 0,
    p_other_expenses     numeric    DEFAULT 0,
    p_amount_received    numeric    DEFAULT NULL,  -- CRITICAL: Actual amount paid now
    p_idempotency_key    text       DEFAULT NULL,
    p_due_date           date       DEFAULT NULL,
    p_cheque_no          text       DEFAULT NULL,
    p_cheque_date        date       DEFAULT NULL,
    p_cheque_status      boolean    DEFAULT false, -- TRUE = "Instant clear" (still needs confirmation)
    p_bank_name          text       DEFAULT NULL,
    p_bank_account_id    uuid       DEFAULT NULL,
    p_cgst_amount        numeric    DEFAULT 0,
    p_sgst_amount        numeric    DEFAULT 0,
    p_igst_amount        numeric    DEFAULT 0,
    p_gst_total          numeric    DEFAULT 0,
    p_discount_percent   numeric    DEFAULT 0,
    p_discount_amount    numeric    DEFAULT 0,
    p_place_of_supply    text       DEFAULT NULL,
    p_buyer_gstin        text       DEFAULT NULL,
    p_is_igst            boolean    DEFAULT false
) RETURNS jsonb
```

---

## Current Implementation: Step-by-Step

### Step 1: Idempotency Guard
```sql
-- Checks if sale already created with this idempotency_key
-- Returns cached result if duplicate attempt
IF p_idempotency_key IS NOT NULL THEN
    SELECT id, bill_no, contact_bill_no
    INTO v_sale_id, v_bill_no, v_contact_bill_no
    FROM mandi.sales
    WHERE idempotency_key = p_idempotency_key::uuid
      AND organization_id = p_organization_id
    LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'sale_id', v_sale_id,
            'bill_no', v_bill_no,
            'contact_bill_no', v_contact_bill_no,
            'message', 'Duplicate skipped'
        );
    END IF;
END IF;
```

**Purpose:** Ensure no duplicate sales if transaction retried

---

### Step 2: Validate Items
```sql
IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items in sale';
END IF;
```

**Purpose:** Sales must have at least one item

---

### Step 3: Calculate Totals
```sql
v_gross_total := ROUND(
    COALESCE(p_total_amount,      0)
  + COALESCE(p_market_fee,        0)
  + COALESCE(p_nirashrit,         0)
  + COALESCE(p_misc_fee,          0)
  + COALESCE(p_loading_charges,   0)
  + COALESCE(p_unloading_charges, 0)
  + COALESCE(p_other_expenses,    0), 2);

v_total_inc_tax := ROUND(v_gross_total + COALESCE(p_gst_total, 0), 2);
```

**What's Included:**
- Base item amount
- Market fee
- Nirashrit (commission)
- Misc fee
- Loading/Unloading
- Other expenses
- + GST (if applicable)

---

### Step 4: ⭐ CRITICAL - Normalize Payment Mode & Determine Payment Status

```sql
-- Normalize payment mode for consistency
v_normalized_payment_mode := LOWER(COALESCE(p_payment_mode, 'credit'));

-- Determine if this is an INSTANT payment (can be recorded immediately)
v_is_instant_payment := (
    v_normalized_payment_mode IN ('cash', 'upi', 'upi/bank', 'bank_transfer', 'card')
    OR (v_normalized_payment_mode = 'cheque' AND p_cheque_status = true)
);

-- Cheque status text
v_cheque_status_txt := CASE
    WHEN v_normalized_payment_mode = 'cheque' AND p_cheque_status = true  THEN 'Cleared'
    WHEN v_normalized_payment_mode = 'cheque'                              THEN 'Pending'
    ELSE NULL
END;

-- ⭐ CRITICAL FIX: For instant payments, default amount_received
-- If amount_received is 0 or NULL for instant payments, use full total
IF v_is_instant_payment THEN
    IF COALESCE(p_amount_received, 0) = 0 THEN
        -- For instant payments without explicit partial amount, assume full payment
        v_receipt_amount := v_total_inc_tax;
    ELSE
        -- Use explicitly provided amount (handles partial instant payments)
        v_receipt_amount := ROUND(COALESCE(p_amount_received, 0), 2);
    END IF;

    -- Strict payment status determination
    v_payment_status := CASE
        WHEN v_receipt_amount >= v_total_inc_tax THEN 'paid'
        WHEN v_receipt_amount > 0 THEN 'partial'
        ELSE 'pending'
    END;
ELSE
    -- For credit/pending cheques, always pending
    v_receipt_amount := 0;
    v_payment_status := 'pending';
END IF;
```

**Payment Status Logic:**

| Payment Mode | p_cheque_status | Amount | Status | Ledger Entry |
|---|---|---|---|---|
| cash | - | 0 | 'paid' | ✅ Yes |
| cash | - | < total | 'partial' | ✅ Yes |
| cash | - | total | 'paid' | ✅ Yes |
| upi | - | 0 | 'paid' | ✅ Yes |
| bank_transfer | - | 0 | 'paid' | ✅ Yes |
| card | - | any | 'paid' | ✅ Yes |
| cheque | TRUE | any | 'paid' | ✅ Yes |
| cheque | FALSE | any | 'pending' | ❌ No |
| credit | - | any | 'pending' | ❌ No |

**⚠️ BUG FIXED:** Old code required `p_payment_mode = 'partial'` to mark as partial. Frontend never sent this, so partial cash payments were marked 'paid' with full amount. **Now:** Status determined purely from `v_receipt_amount` vs `v_total_inc_tax`.

---

### Step 5: Insert Sale Record

```sql
INSERT INTO mandi.sales (
    organization_id, buyer_id, sale_date,
    total_amount, total_amount_inc_tax,
    payment_mode, payment_status,
    market_fee, nirashrit, misc_fee,
    loading_charges, unloading_charges, other_expenses,
    due_date, cheque_no, cheque_date, bank_name,
    cgst_amount, sgst_amount, igst_amount, gst_total,
    discount_percent, discount_amount,
    is_cheque_cleared, idempotency_key, amount_received
) VALUES (
    p_organization_id, p_buyer_id, p_sale_date,
    p_total_amount, v_total_inc_tax,
    p_payment_mode, v_payment_status,
    -- ... all fields ...
    p_cheque_status, p_idempotency_key::uuid, v_receipt_amount
) RETURNING id, bill_no, contact_bill_no;
```

**Key Fields:**
- `payment_status`: Stores 'paid', 'partial', or 'pending'
- `amount_received`: Stores actual amount paid at sale time
- `is_cheque_cleared`: Boolean (used for cheque-specific logic)

---

### Step 6: Insert Sale Items & Decrement Lot Stock

```sql
FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO mandi.sale_items (
        organization_id, sale_id, lot_id, qty, rate, amount, unit, tax_amount
    ) VALUES (
        p_organization_id, v_sale_id,
        (v_item->>'lot_id')::uuid,
        (v_item->>'qty')::numeric,
        (v_item->>'rate')::numeric,
        (v_item->>'qty')::numeric * (v_item->>'rate')::numeric,
        COALESCE(v_item->>'unit', 'Box'),
        COALESCE((v_item->>'gst_amount')::numeric, 0)
    );

    -- Decrement lot stock
    UPDATE mandi.lots
    SET current_qty = current_qty - (v_item->>'qty')::numeric
    WHERE id = (v_item->>'lot_id')::uuid
      AND organization_id = p_organization_id;

    -- Guard: reject if over-sold
    IF EXISTS (
        SELECT 1
        FROM mandi.lots
        WHERE id = (v_item->>'lot_id')::uuid AND current_qty < 0
    ) THEN
        RAISE EXCEPTION 'Insufficient stock for Lot ID %. Transaction Aborted.', (v_item->>'lot_id');
    END IF;
END LOOP;
```

**Purpose:**
- Record each line item with its qty, rate, amount, and tax
- Immediately decrement inventory
- Prevent overselling

---

### Step 7: Create SALES VOUCHER & Ledger Entries (Goods Transaction)

```sql
-- Create sales voucher (ONE voucher per sale, regardless of payment)
SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_sale_voucher_no
FROM mandi.vouchers
WHERE organization_id = p_organization_id AND type = 'sales';

INSERT INTO mandi.vouchers (
    organization_id, date, type, voucher_no, amount, narration,
    invoice_id, party_id, payment_mode, cheque_no, cheque_date,
    cheque_status, bank_account_id
) VALUES (
    p_organization_id, p_sale_date, 'sales', v_sale_voucher_no,
    v_total_inc_tax, 'Invoice #' || v_bill_label,
    v_sale_id, p_buyer_id, p_payment_mode,
    p_cheque_no, p_cheque_date, v_cheque_status_txt, p_bank_account_id
) RETURNING id INTO v_sale_voucher_id;
```

**Ledger Leg 1 - Debit Buyer (Receivable):**
```sql
INSERT INTO mandi.ledger_entries (
    organization_id, voucher_id, contact_id, debit, credit,
    entry_date, description, transaction_type, reference_no, reference_id
) VALUES (
    p_organization_id, v_sale_voucher_id, p_buyer_id,
    v_total_inc_tax, 0,
    p_sale_date,
    'Invoice #' || v_bill_label,
    'sale',
    v_bill_label,
    v_sale_id
);
```

**Ledger Leg 2 - Credit Sales Account (Revenue):**
```sql
-- Find Sales Account
SELECT id INTO v_sales_acct_id FROM mandi.accounts
WHERE organization_id = p_organization_id
  AND (name ILIKE 'Sales%' OR name = 'Revenue' OR type = 'income')
  AND name NOT ILIKE '%Commission%'
ORDER BY (name = 'Sales') DESC, (name = 'Sales Revenue') DESC, name
LIMIT 1;

-- CR Sales Account
INSERT INTO mandi.ledger_entries (
    organization_id, voucher_id, account_id, debit, credit,
    entry_date, description, transaction_type, reference_no, reference_id
) VALUES (
    p_organization_id, v_sale_voucher_id, v_sales_acct_id,
    0, v_total_inc_tax,
    p_sale_date,
    'Invoice #' || v_bill_label,
    'sales',
    v_bill_label,
    v_sale_id
);
```

**Journal Entry (GOODS TRANSACTION):**
```
Date: p_sale_date
Voucher: sales #v_sale_voucher_no

Debit:  Buyer (contact) ........................ v_total_inc_tax
  Credit: Sales Revenue (account) ............ v_total_inc_tax
```

**This happens ALWAYS, IMMEDIATELY, regardless of payment_mode or payment_status.**

---

### Step 8: Create RECEIPT VOUCHER & Ledger Entries (ONLY If Payment Will Be Recorded Now)

```sql
-- Only create receipt voucher if amount will be paid now
IF v_receipt_amount > 0 THEN
    -- Resolve correct account based on payment mode
    IF LOWER(p_payment_mode) = 'cash' THEN
        SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
    ELSIF p_bank_account_id IS NOT NULL THEN
        v_cash_bank_acc_id := p_bank_account_id;
    ELSE
        SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND code = '1002' LIMIT 1;
    END IF;
    -- Final fallback
    IF v_cash_bank_acc_id IS NULL THEN
        SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
    END IF;

    IF v_cash_bank_acc_id IS NOT NULL THEN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_rcpt_voucher_no
        FROM mandi.vouchers
        WHERE organization_id = p_organization_id AND type = 'receipt';

        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, narration, amount,
            contact_id, invoice_id, bank_account_id,
            cheque_no, cheque_date, cheque_status, is_cleared, cleared_at
        ) VALUES (
            p_organization_id, p_sale_date, 'receipt', v_rcpt_voucher_no,
            'Payment against Invoice #' || v_bill_label, v_receipt_amount,
            p_buyer_id, v_sale_id, v_cash_bank_acc_id,
            p_cheque_no, p_cheque_date, v_cheque_status_txt,
            CASE WHEN p_payment_mode = 'cheque' THEN true ELSE false END,
            CASE WHEN p_payment_mode = 'cheque' THEN p_sale_date ELSE NULL END
        ) RETURNING id INTO v_rcpt_voucher_id;

        -- CR Buyer (Payment received reduces receivable)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, contact_id, debit, credit,
            entry_date, description, transaction_type, reference_no, reference_id
        ) VALUES (
            p_organization_id, v_rcpt_voucher_id, p_buyer_id,
            0, v_receipt_amount,
            p_sale_date,
            'Payment against Invoice #' || v_bill_label,
            'receipt',
            v_bill_label,
            v_sale_id
        );

        -- DR Cash/Bank (Asset increases)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit,
            entry_date, description, transaction_type, reference_no, reference_id
        ) VALUES (
            p_organization_id, v_rcpt_voucher_id, v_cash_bank_acc_id,
            v_receipt_amount, 0,
            p_sale_date,
            'Cash Received - Invoice #' || v_bill_label,
            'receipt',
            v_bill_label,
            v_sale_id
        );
    END IF;
END IF;
```

**Journal Entry (PAYMENT TRANSACTION - Only if v_receipt_amount > 0):**
```
Date: p_sale_date
Voucher: receipt #v_rcpt_voucher_no

Debit:  Cash/Bank (account) .................. v_receipt_amount
  Credit: Buyer (contact) ................... v_receipt_amount
```

**This ONLY happens if:**
- Payment mode is 'cash', 'upi', 'bank_transfer', 'card' (v_is_instant_payment = true)
- OR cheque is marked "instant clear" (p_cheque_status = true)
- AND amount_received > 0

---

## Payment Mode Handling Summary

| Mode | Is Instant? | Receipt Voucher Created? | Status Set | Behavior |
|---|---|---|---|---|
| **cash** | ✅ Yes | ✅ If amt > 0 | 'paid' or 'partial' | Creates payment entry immediately |
| **credit** | ❌ No | ❌ No | 'pending' | No payment entry |
| **cheque (pending)** | ❌ No | ❌ No | 'pending' | No payment entry; cleared later by clear_cheque() |
| **cheque (instant)** | ✅ Yes | ✅ If amt > 0 | 'paid' | Creates payment entry immediately, but still needs clearing |
| **upi** | ✅ Yes | ✅ If amt > 0 | 'paid' or 'partial' | Creates payment entry immediately |
| **bank_transfer** | ✅ Yes | ✅ If amt > 0 | 'paid' or 'partial' | Creates payment entry immediately |
| **card** | ✅ Yes | ✅ If amt > 0 | 'paid' | Creates payment entry immediately |

---

## Key Bugs Fixed (Recent Migrations)

### Bug 1: Cash Payment Marked as 'Pending'
- **Issue:** When payment_mode='cash' and amount_received=0 (form default), status stayed 'pending'
- **Root Cause:** OLD code only defaulted amount_received if NULL, but frontend sent 0
- **Fix:** NEW code checks if amount_received is 0 OR NULL for instant payments
- **Migration:** 20260412180000_fix_cash_payment_status_bug.sql

### Bug 2: Partial Payments Ignored
- **Issue:** Partial payments treated as full 'paid' because code checked for p_payment_mode='partial' (never sent by frontend)
- **Root Cause:** Status logic relied on payment_mode instead of math
- **Fix:** Strict math comparison: `WHEN v_receipt_amount >= v_total_inc_tax THEN 'paid' WHEN v_receipt_amount > 0 THEN 'partial'`
- **Migration:** 20260412160000_fix_sale_payment_status.sql

### Bug 3: Wrong Account Selected for Partial Payments
- **Issue:** Partial UPI/bank payments defaulted to cash account
- **Root Cause:** Logic selected account AFTER determining if instant payment
- **Fix:** Account selection now respects p_bank_account_id first, then payment_mode
- **Migration:** 20260403000000_fix_partial_payment_and_status.sql

---

# PART 2: post_arrival_ledger() - Purchase RPC

## Location
- **Primary Definition:** [supabase/migrations/20260325_fix_post_arrival_ledger.sql](supabase/migrations/20260325_fix_post_arrival_ledger.sql)
- **Latest Updates:** [supabase/migrations/20260404100001_update_clear_cheque.sql](supabase/migrations/20260404100001_update_clear_cheque.sql)
  - [supabase/migrations/20260406110000_cleanup_duplicate_arrivals_ledger.sql](supabase/migrations/20260406110000_cleanup_duplicate_arrivals_ledger.sql)
  - [supabase/migrations/20260406160000_rename_discount_to_settlement.sql](supabase/migrations/20260406160000_rename_discount_to_settlement.sql)

## Function Signature

```sql
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
```

**Input:** Just the arrival_id  
**Output:** JSON with success status, lots processed, totals posted

---

## Current Implementation: Step-by-Step

### Step 1: Idempotency - Delete Old Ledger Entries

```sql
-- ⭐ CRITICAL: Delete existing entries for this arrival
-- This makes post_arrival_ledger() a pure UPSERT function
WITH deleted AS (
    DELETE FROM mandi.ledger_entries
    WHERE reference_id = p_arrival_id
      AND transaction_type IN ('expense', 'income', 'purchase', 'payment', 'payable', 'commission')
    RETURNING voucher_id
)
DELETE FROM mandi.vouchers WHERE id IN (SELECT voucher_id FROM deleted);
```

**Purpose:** 
- If called multiple times (e.g., after advance cheque cleared), removes all old entries
- Then re-inserts fresh entries with current lot data
- Ensures NO duplicates even if called repeatedly

---

### Step 2: Fetch Arrival Header

```sql
SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Arrival % not found', p_arrival_id; END IF;

v_org_id       := v_arrival.organization_id;
v_party_id     := v_arrival.party_id;
v_arrival_date := v_arrival.arrival_date;
v_reference_no := COALESCE(v_arrival.reference_no, 'Arrival');
v_arrival_type := v_arrival.arrival_type;  -- 'commission', 'commission_supplier', or 'direct'

IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'Party ID required on arrival % for ledger posting', p_arrival_id;
END IF;
```

**Key Data:**
- `arrival_type`: Determines ledger posting logic (commission vs direct purchase)
- `party_id`: The farmer/supplier receiving payment
- `arrival_date`: Date of transaction

---

### Step 3: Ensure Required Accounts Exist

```sql
-- Fetch or auto-create essential accounts
SELECT id INTO v_purchase_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id AND (code = '5001' OR name ILIKE '%Purchase%') AND type = 'expense' LIMIT 1;
SELECT id INTO v_inventory_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' AND type = 'asset' LIMIT 1;
SELECT id INTO v_ap_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id AND (code = '2001' OR name ILIKE '%Accounts Payable%') AND type = 'liability' LIMIT 1;
SELECT id INTO v_cash_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id AND (code = '1001' OR name ILIKE 'Cash%') AND type = 'asset' LIMIT 1;
SELECT id INTO v_cheque_issued_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id AND (code = '2005' OR name ILIKE '%Cheques Issued%') AND type = 'liability' LIMIT 1;
SELECT id INTO v_commission_income_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' AND type = 'income' LIMIT 1;
SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id AND (code = '4002' OR name ILIKE '%Expense Recovery%') AND type = 'income' LIMIT 1;

-- Auto-create if missing (ensures no failures)
IF v_purchase_acc_id IS NULL THEN
    INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
    VALUES (v_org_id, 'Purchase Account', 'expense', '5001', true)
    RETURNING id INTO v_purchase_acc_id;
END IF;
-- ... similar for other accounts ...
```

**Accounts Used:**
- `5001` Purchase Account (expense)
- `1001` Cash Account (asset)
- `1002` Bank Account (asset)
- `1003` Inventory/Stock (asset)
- `2001` Accounts Payable (liability)
- `2005` Cheques Issued (liability)
- `4001` Commission Income (income)
- `4002` Expense Recovery (income)

---

### Step 4: Calculate Header-Level Transport Deductions

```sql
v_total_transport := COALESCE(v_arrival.hire_charges, 0)
                   + COALESCE(v_arrival.hamali_expenses, 0)
                   + COALESCE(v_arrival.other_expenses, 0);
```

**What's Included:**
- Hire charges (vehicle rental)
- Hamali expenses (labor)
- Other expenses

These are deducted from the party's payment basis.

---

### Step 5A: Commission Arrival (Special Handling)

```sql
IF v_arrival_type IN ('commission', 'commission_supplier') AND v_lot_count > 0 THEN
    
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;

        -- Calculate adjusted qty (after less percent)
        v_adj_qty := COALESCE(v_lot.initial_qty, 0)
                   - (COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.less_percent, 0) / 100.0);
        
        -- Base value = adjusted qty × supplier rate
        v_base_value := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);

        -- Calculate commission (part we keep)
        v_commission_amt := v_base_value * COALESCE(v_lot.commission_percent, 0) / 100.0;
        
        -- Lot expenses (deducted from party)
        v_lot_expenses := COALESCE(v_lot.packing_cost, 0) + COALESCE(v_lot.loading_cost, 0);
        
        -- Net payable to farmer (after commission and expenses)
        v_net_payable := v_base_value - v_commission_amt - v_lot_expenses
                       - COALESCE(v_lot.farmer_charges, 0);

        v_total_commission := v_total_commission + v_commission_amt;
        v_total_inventory  := v_total_inventory  + v_base_value;
        v_total_payable    := v_total_payable    + v_net_payable;
    END LOOP;

    -- Calculate final payable (net of transport)
    v_net_payable := v_total_payable - v_total_transport;

    -- Create single PURCHASE voucher for entire arrival
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount)
    VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no,
            'Commission Arrival - ' || v_reference_no, v_total_inventory)
    RETURNING id INTO v_main_voucher_id;
```

**Journal Entry (COMMISSION ARRIVAL):**
```
Date: v_arrival_date
Voucher: purchase #v_main_voucher_id
Amount: v_total_inventory

Debit:  Inventory ............................ v_total_inventory
  Credit: Party Payable ..................... v_net_payable
  Credit: Commission Income ................ v_total_commission
  Credit: Expense Recovery ................. v_total_transport

Net Effect on Party: Owes v_net_payable = v_total_inventory - commission - expenses - transport
```

**Calculation Example:**
```
Lot: 1000 kg @ ₹100/kg = ₹100,000 (base)
Commission: 5% = ₹5,000 (we keep)
Packing: ₹500 (we deduct)
Farmer charges: ₹1,000 (we deduct)
Transport: ₹2,000 (we deduct from party)

Party Payable: ₹100,000 - ₹5,000 - ₹500 - ₹1,000 - ₹2,000 = ₹91,500

Ledger:
Debit Inventory ₹100,000
  Credit Party ₹91,500
  Credit Commission Income ₹5,000
  Credit Expense Recovery ₹2,000
  (Packing & Farmer charges are deducted from party via multiple entries)
```

---

### Step 5B: Direct Purchase Arrival

```sql
ELSIF v_arrival_type = 'direct' AND v_total_direct_cost > 0 THEN

    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_base_value := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        v_base_value := v_base_value - COALESCE(v_lot.farmer_charges, 0);
        v_total_direct_cost := v_total_direct_cost + v_base_value;
    END LOOP;

    -- Create single PURCHASE voucher
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount)
    VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no,
            'Direct Purchase Arrival - ' || v_reference_no, v_total_direct_cost)
    RETURNING id INTO v_main_voucher_id;
```

**Journal Entry (DIRECT PURCHASE):**
```
Date: v_arrival_date
Voucher: purchase #v_main_voucher_id
Amount: v_total_direct_cost

Debit:  Purchase Account ..................... v_total_direct_cost
  Credit: Party Payable ..................... v_total_direct_cost

Plus if transport:
Debit:  Party ............................... v_total_transport
  Credit: Expense Recovery ................ v_total_transport
```

**Net Effect on Party:** Owes v_total_direct_cost + v_total_transport

---

### Step 6: Handle Advances (All Arrival Types)

```sql
-- ⭐ All under same Purchase Voucher (idempotent - deletes and recreates)
IF v_main_voucher_id IS NOT NULL THEN
    FOR v_adv IN
        SELECT
            COALESCE(advance_payment_mode, 'cash') AS mode,
            advance_cheque_no   AS chq_no,
            advance_cheque_date AS chq_date,
            advance_bank_name   AS bnk,
            SUM(advance)        AS total_adv
        FROM mandi.lots
        WHERE arrival_id = p_arrival_id AND advance > 0
        GROUP BY 1, 2, 3, 4
    LOOP
        -- Determine contra account (where money went out)
        v_contra_id := CASE WHEN v_adv.mode = 'cheque' THEN v_cheque_issued_acc_id ELSE v_cash_acc_id END;

        -- DR Party (reduces their payable balance)
        INSERT INTO mandi.ledger_entries
            (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id,
                v_adv.total_adv, 0, v_arrival_date,
                'Advance Paid (' || v_adv.mode || ')', 'purchase', p_arrival_id);

        -- CR Cash/Cheque (money went out)
        INSERT INTO mandi.ledger_entries
            (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_contra_id,
                0, v_adv.total_adv, v_arrival_date,
                'Advance Contra (' || v_adv.mode || ')', 'purchase', p_arrival_id);
    END LOOP;
END IF;
```

**Journal Entries (ADVANCES):**
```
For each advance grouping by payment mode:

Debit:  Party ............................... total_adv
  Credit: Cash/Cheque Issued ............... total_adv
```

**Example:**
```
Arrival: ₹100,000 payable
Advance paid in cash: ₹30,000
Advance paid in cheque #123: ₹20,000

Final Party Balance: ₹100,000 - ₹30,000 - ₹20,000 = ₹50,000

Ledger:
Debit Party ₹30,000
  Credit Cash ₹30,000

Debit Party ₹20,000
  Credit Cheques Issued ₹20,000
```

---

## Arrival Type Handling Summary

| Type | Ledger Posted | Journal Entries | Status |
|---|---|---|---|
| **commission** | ✅ Yes | 4-5 entries (inventory, party, commission, expense recovery, advances) | Payable is net of commission & transport |
| **commission_supplier** | ✅ Yes | Same as commission | Payable is net of commission & transport |
| **direct** | ✅ Yes | 2-3 entries (purchase, party, advances) | Payable is full cost + transport |

---

## Key Behavior: Idempotency via Upsert

```sql
-- Called BEFORE creating any entries:
WITH deleted AS (
    DELETE FROM mandi.ledger_entries
    WHERE reference_id = p_arrival_id
      AND transaction_type IN ('expense', 'income', 'purchase', 'payment', 'payable', 'commission')
    RETURNING voucher_id
)
DELETE FROM mandi.vouchers WHERE id IN (SELECT voucher_id FROM deleted);

-- Then insert fresh entries below
```

**Impact:**
- Safe to call `post_arrival_ledger()` multiple times
- Useful when: advance cheque cleared, lot quantities changed, expenses modified
- Always produces consistent result without duplicates
- Last call wins

---

# PART 3: Ledger Structure & Day Book Categorization

## Database Structure

### Core Tables

#### mandi.sales
```sql
id, organization_id, buyer_id, sale_date, bill_no, contact_bill_no,
total_amount, total_amount_inc_tax,
payment_mode, payment_status,  -- 'paid', 'partial', 'pending'
market_fee, nirashrit, misc_fee,
loading_charges, unloading_charges, other_expenses,
cgst_amount, sgst_amount, igst_amount, gst_total,
discount_percent, discount_amount,
amount_received,  -- ⭐ Actual amount paid at entry time
is_cheque_cleared, cheque_no, cheque_date, bank_name,
created_at, updated_at, idempotency_key
```

**Key Fields for Day Book:**
- `payment_mode`: Category (cash, credit, cheque, upi, bank_transfer, card)
- `payment_status`: 'paid', 'partial', 'pending'
- `amount_received`: Actual cash/UPI/bank received at sale time

#### mandi.arrivals
```sql
id, organization_id, party_id, arrival_date, reference_no, arrival_type,
hire_charges, hamali_expenses, other_expenses,  -- Transport costs
created_at, updated_at
```

**Key Fields:**
- `arrival_type`: 'commission', 'commission_supplier', 'direct'
- Transport fields aggregate to determine deductions from party payable

#### mandi.lots
```sql
id, arrival_id, organization_id, item_id, contact_id,
initial_qty, current_qty, adjusted_qty,  -- Stock tracking
supplier_rate, sale_price,
less_percent, packing_cost, loading_cost, farmer_charges,
commission_percent,
advance, advance_payment_mode, advance_cheque_no,
arrival_type, payment_status
```

**Key Fields:**
- `advance` & `advance_payment_mode`: Track advance payments on purchases
- `commission_percent`, `less_percent`: Commission/discount calculations

#### mandi.vouchers
```sql
id, organization_id, date, type,  -- 'sales', 'receipt', 'purchase', 'payment'
voucher_no, narration, amount,
contact_id, party_id,  -- Party involved
account_id, invoice_id, arrival_id, reference_id,
payment_mode, cheque_no, cheque_date, cheque_status,  -- 'Pending', 'Cleared', 'Cancelled', 'Bounced'
bank_account_id, bank_name,
is_cleared, cleared_at,  -- For cheque tracking
created_at, updated_at
```

**Key Fields for Day Book:**
- `type`: Category (sales, receipt, purchase, payment)
- `payment_mode`: Sub-category (cash, cheque, upi, etc.)
- `cheque_status`: 'Pending', 'Cleared', 'Cancelled', 'Bounced'
- `invoice_id`: Links to sales transaction
- `reference_id`: Links to arrivals purchase transaction

#### mandi.ledger_entries
```sql
id, organization_id, voucher_id,
contact_id, account_id,  -- Who/what affected
debit, credit,  -- Amount
entry_date, description,
transaction_type,  -- 'sale', 'receipt', 'purchase', 'payment', 'payable', 'commission', 'expense', 'income'
reference_id, reference_no  -- Link to sale/arrival
```

---

## Day Book View Structure (Conceptual)

**Note:** No explicit `day_book` view found in migrations. The day book is built dynamically from:
- `mandi.sales` + `mandi.vouchers` (sales transactions)
- `mandi.arrivals` + `mandi.lots` + `mandi.vouchers` (purchase transactions)

### Sales Day Book Query (Conceptual)
```sql
SELECT
    s.sale_date,
    'Sales' as category,
    CONCAT('INV-', COALESCE(s.contact_bill_no, s.bill_no)) as reference,
    c.name as party_name,
    UPPER(s.payment_mode) as payment_method,
    s.payment_status,
    s.total_amount as item_amount,
    s.gst_total as tax,
    s.total_amount_inc_tax as total_amount,
    s.amount_received as amount_paid,
    (s.total_amount_inc_tax - s.amount_received) as balance_due
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
ORDER BY s.sale_date DESC;
```

**Columns:**
- **Category:** 'Sales'
- **Reference:** Invoice number
- **Party:** Buyer name
- **Payment Method:** cash, credit, cheque, upi, bank_transfer, card
- **Status:** paid (green), partial (orange), pending (red)
- **Amount:** Total with tax
- **Paid:** Amount received now
- **Balance:** Outstanding

### Purchase Day Book Query (Conceptual)
```sql
SELECT
    a.arrival_date,
    'Purchase' as category,
    CONCAT(UPPER(COALESCE(a.arrival_type, 'DIRECT')), ' - ', a.reference_no) as reference,
    c.name as party_name,
    CASE WHEN EXISTS (SELECT 1 FROM mandi.lots WHERE arrival_id = a.id AND advance > 0)
        THEN 'PARTIAL'
        ELSE 'FULL'
    END as payment_status,
    SUM(l.initial_qty * l.supplier_rate) as total_amount,
    a.hire_charges + a.hamali_expenses + a.other_expenses as transport_cost,
    -- Final payable calculated per arrival_type
    CASE
        WHEN a.arrival_type IN ('commission', 'commission_supplier')
        THEN (SUM(l.initial_qty * l.supplier_rate) * (1 - SUM(l.commission_percent)/100))
        ELSE SUM(l.initial_qty * l.supplier_rate)
    END - SUM(l.advance) as balance_due
FROM mandi.arrivals a
LEFT JOIN mandi.contacts c ON a.party_id = c.id
LEFT JOIN mandi.lots l ON a.id = l.arrival_id
GROUP BY a.id, c.name
ORDER BY a.arrival_date DESC;
```

**Columns:**
- **Category:** 'Purchase'
- **Type:** Commission / Commission_Supplier / Direct
- **Party:** Farmer/supplier name
- **Status:** Partial (if advances paid), Full (no advances)
- **Amount:** Total cost + tax
- **Transport:** Deducted from payable
- **Balance:** After all deductions and advances

---

## Transaction Categorization in Day Book

### By Source
1. **Sales Transactions** - From `mandi.sales` + `mandi.sales_items`
2. **Purchase Transactions** - From `mandi.arrivals` + `mandi.lots`

### By Payment Mode (from vouchers.payment_mode)
- **Cash** - Immediate payment in currency
- **Credit** - Udhaar (payment deferred, no due date)
- **Cheque** - Cheque payment (pending or cleared)
- **UPI** - Digital payment via UPI
- **Bank Transfer** - NEFT/RTGS transfer
- **Card** - Credit/debit card payment

### By Payment Status (from sales.payment_status / lots.payment_status)
- **Paid** - Full amount received (balance = 0)
- **Partial** - Some amount received (balance > 0, amount_paid > 0)
- **Pending** - No amount received (balance = total, amount_paid = 0)

### By Cheque Status (from vouchers.cheque_status)
- **Pending** - Cheque received, not yet cleared
- **Cleared** - Cheque verified, payment recorded
- **Cancelled** - Cheque cancelled, no payment
- **Bounced** - Cheque cleared then bounced, payment reversed

---

## Current Gaps & Issues

### Gap 1: Day Book View Not Explicit
- **Issue:** No dedicated `mandi.day_book` table or view in migrations
- **Impact:** Frontend must query `sales` + `vouchers` + `arrivals` + `lots` separately
- **Recommendation:** Create materialized view for performance
  ```sql
  CREATE MATERIALIZED VIEW mandi.mv_day_book AS
  -- Sales transactions
  SELECT ... FROM mandi.sales s ...
  UNION ALL
  -- Purchase transactions
  SELECT ... FROM mandi.arrivals a ...
  ```

### Gap 2: Partial Payment Tracking Incomplete
- **Issue:** `sales.amount_received` stores amount at entry time, but doesn't track multiple partial payments
- **Impact:** If buyer pays ₹5000 now, ₹3000 tomorrow, only ₹5000 is recorded
- **Recommendation:** Track payment history in separate `payment_transactions` table
  ```sql
  CREATE TABLE mandi.payment_transactions (
      id uuid, sale_id uuid, amount_received numeric, payment_date date, payment_mode text
  );
  ```

### Gap 3: Ledger Entry Linking Inconsistent
- **Issue:** `ledger_entries.reference_id` sometimes points to sale, sometimes to arrival; sometimes NULL
- **Impact:** Hard to trace ledger entry back to original transaction
- **Recommendation:** 
  - Always populate `reference_id` (sale_id or arrival_id)
  - Add `parent_transaction_type` explicit field ('sale' or 'purchase')

### Gap 4: Status Not Auto-Updated After Cheque Clear
- **Issue:** When cheque cleared, sales.payment_status updated but not in all code paths
- **Impact:** UI might show 'pending' even though payment recorded
- **Recommendation:** Trigger on `clear_cheque()` to always call `get_invoice_balance()` and update status
  ```sql
  -- After INSERT payment ledger entry, call:
  SELECT * FROM mandi.get_invoice_balance(sale_id) INTO v_balance;
  UPDATE mandi.sales
  SET payment_status = CASE
      WHEN v_balance.balance_due <= 0.01 THEN 'paid'
      WHEN v_balance.amount_paid > 0 THEN 'partial'
      ELSE 'pending'
  END
  WHERE id = sale_id;
  ```

### Gap 5: Commission Calculation Not in Ledger
- **Issue:** Commission amount calculated but not explicitly shown in UI ledger details
- **Impact:** Users can't easily see commission breakdown per lot
- **Recommendation:** Add view `mandi.v_lot_commission_breakdown` showing per-lot commission

### Gap 6: Transport Expense Allocation Not Explicit
- **Issue:** Transport costs aggregated at arrival level, not allocated per lot
- **Impact:** Users can't see per-lot transport cost in Day Book
- **Recommendation:** Calculate and show per-lot transport allocation

### Gap 7: Arrival Type (Commission/Direct) Not User-Selectable in Some Flows
- **Issue:** Arrival type is hardcoded in some code paths; not always passed by frontend
- **Impact:** New arrivals defaulting to 'direct' even if should be 'commission'
- **Recommendation:** Ensure all arrival entry forms have explicit arrival_type selector

### Gap 8: Account Selection for Receipt Vouchers Fragile
- **Issue:** Account lookup chain (1001 → 1002 → fallback) relies on specific codes
- **Impact:** If codes don't exist, defaults wrongly
- **Recommendation:** Enforce account code standards via RLS or constraints

### Gap 9: Discount/Settlement Terminology Inconsistent
- **Issue:** Code uses `discount_amount` in sales but logic calls it 'settlement'
- **Impact:** Confusing for users; unclear if discount is item-level or invoice-level
- **Recommendation:** Standardize terminology and schema column names

### Gap 10: Pending Cheque Payment Not Created on Entry
- **Issue:** For cheques marked 'Clear Later', no voucher created until cleared
- **Impact:** Day Book shows no payment record until cheque clears (expected, but users confused)
- **Recommendation:** Add explicit note in sales voucher narration: "Cheque Pending Clearing"

---

## Summary: Transaction Flow in Day Book

### Sale Entry (confirm_sale_transaction)
```
Step 1: Create sales record (payment_status = determined by p_amount_received vs total)
Step 2: Insert sales items (stock deducted)
Step 3: Create SALES voucher (type='sales')
Step 4: Create 2 ledger entries (DR buyer, CR sales revenue)
Step 5: IF v_receipt_amount > 0: Create RECEIPT voucher (type='receipt')
Step 6: IF receipt voucher: Create 2 ledger entries (DR cash/bank, CR buyer)

Day Book Shows:
- 1 sales entry (line item row showing goods & amount)
- 1 receipt entry IF payment recorded now (showing cash/upi/cheque in)
- Status: 'paid' (green) / 'partial' (orange) / 'pending' (red)
```

### Purchase Entry (post_arrival_ledger)
```
Step 1: Delete old ledger entries for this arrival (idempotent)
Step 2: Calculate lot totals per arrival_type (commission vs direct)
Step 3: Create PURCHASE voucher (type='purchase')
Step 4: Create N ledger entries based on type:
        - Commission: DR inventory, CR party, CR commission income, CR expense recovery
        - Direct: DR purchase account, CR accounts payable
Step 5: For each advance: Create 2 ledger entries (DR party, CR cash/cheque)

Day Book Shows:
- 1 purchase entry (showing goods cost & type)
- 1+ payment entries IF advances recorded (showing cash/cheque out)
- Status: 'paid' (all paid) / 'partial' (advances only) / 'pending' (no payment)
```

---

## Recommendations for Fixing

### P0 - Critical
1. **Create explicit `mandi.mv_day_book` materialized view** combining sales & purchases with consistent columns
2. **Add `payment_transaction_history` table** to track multiple partial payments properly
3. **Add trigger to update sales.payment_status after clear_cheque()** automatically
4. **Standardize ledger_entries.reference_id population** - always non-NULL, always points to source transaction

### P1 - Important
5. **Add explicit `parent_transaction_type` field** to ledger_entries
6. **Create `mandi.v_lot_commission_breakdown`** view for per-lot commission visibility
7. **Allocate transport costs per lot** in ledger (not just aggregated)
8. **Standardize discount/settlement terminology** in schema and code

### P2 - Nice to Have
9. **Add account code validation** via constraint or RLS
10. **Add cheque pending status notes** to sales narration automatically
11. **Create payment reconciliation view** for Finance module
12. **Add audit trail** for payment status changes

---

**End of Analysis**
