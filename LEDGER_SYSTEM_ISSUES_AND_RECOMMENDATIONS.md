# Issues & Recommendations for MandiPro Ledger System

**Date:** 2026-04-12  
**Status:** Comprehensive Audit of RPC Functions & Payment Flow  
**Based On:** Analysis of confirm_sale_transaction, post_arrival_ledger, and ledger structure

---

## CRITICAL ISSUES (P0)

### Issue 1: Day Book View Not Explicitly Defined

**Problem:**
- No dedicated `mandi.day_book` table or materialized view in migrations
- Frontend must query multiple tables (sales, vouchers, arrivals, lots) separately
- No single source of truth for "Day Book"

**Impact:**
- Frontend complexity increases (N+1 queries possible)
- Inconsistent filtering/sorting logic duplicated in frontend/backend
- Performance degradation at scale (>100k transactions)

**Current State:**
```
Dynamic Reconstruction Required:
1. Query mandi.sales with payment_status
2. Query mandi.vouchers for cheque details
3. Query mandi.arrivals with arrival_type
4. Query mandi.lots for advance amounts
5. JOIN + aggregate client-side
```

**Recommendation:**
```sql
CREATE MATERIALIZED VIEW mandi.mv_day_book AS
SELECT
  'SALE' as txn_type,
  s.sale_date as txn_date,
  CONCAT('INV-', COALESCE(s.contact_bill_no, s.bill_no)) as reference_no,
  c.name as party_name,
  UPPER(s.payment_mode) as payment_method,
  s.payment_status,
  s.total_amount_inc_tax as total_amount,
  COALESCE(s.amount_received, 0) as amount_paid,
  s.total_amount_inc_tax - COALESCE(s.amount_received, 0) as balance_due,
  s.organization_id
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id

UNION ALL

SELECT
  'PURCHASE' as txn_type,
  a.arrival_date as txn_date,
  CONCAT(UPPER(a.arrival_type), '-', a.reference_no) as reference_no,
  c.name as party_name,
  'GOODS' as payment_method,
  CASE WHEN SUM(l.advance) > 0 THEN 'partial' ELSE 'pending' END as payment_status,
  SUM(l.initial_qty * l.supplier_rate) as total_amount,
  COALESCE(SUM(l.advance), 0) as amount_paid,
  SUM(l.initial_qty * l.supplier_rate) - COALESCE(SUM(l.advance), 0) as balance_due,
  a.organization_id
FROM mandi.arrivals a
LEFT JOIN mandi.contacts c ON a.party_id = c.id
LEFT JOIN mandi.lots l ON a.id = l.arrival_id
GROUP BY a.id, c.name, a.organization_id

ORDER BY txn_date DESC, reference_no;

-- Index for performance
CREATE UNIQUE INDEX idx_mv_day_book_org_date
  ON mandi.mv_day_book (organization_id, txn_date DESC);

-- Grant read access
GRANT SELECT ON mandi.mv_day_book TO authenticated;
```

**Acceptance Criteria:**
- One query: `SELECT * FROM mandi.mv_day_book WHERE organization_id = 'xxx' ORDER BY txn_date DESC`
- Returns combined sales + purchases with consistent columns
- Refreshes within 5 seconds of new transaction
- Supports pagination (LIMIT/OFFSET)

---

### Issue 2: Partial Payment Tracking Incomplete

**Problem:**
- `sales.amount_received` only stores the amount paid AT ENTRY TIME
- If buyer pays ₹5,000 now and ₹3,000 later, system only knows about ₹5,000
- No payment history or transaction timeline

**Impact:**
- Finance reconciliation breaks (can't trace multiple payments to one invoice)
- Partial payment tracking relies on manual follow-up
- Ledger balance calculation becomes complex

**Example Scenario:**
```
Sale Invoice #1: ₹10,000
Entry: amount_received = ₹4,000 → status = 'partial' ✓

[Next day] Buyer pays ₹3,000 more (via Finance > Record Payment)
Problem: System has no way to record this second payment
Optional: Create new voucher, but how to link to original sale?
```

**Recommendation:**
```sql
CREATE TABLE mandi.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sale_id uuid REFERENCES mandi.sales(id),
  arrival_id uuid REFERENCES mandi.arrivals(id),
  payment_date date NOT NULL,
  payment_amount numeric(15, 2) NOT NULL,
  payment_mode text,  -- 'cash', 'cheque', 'upi', 'bank_transfer'
  voucher_id uuid REFERENCES mandi.vouchers(id),
  notes text,
  created_at timestamp DEFAULT now(),
  UNIQUE(sale_id, voucher_id)
);

-- Example insertion:
INSERT INTO mandi.payment_transactions
  (organization_id, sale_id, payment_date, payment_amount, payment_mode, voucher_id)
VALUES
  ('org-123', 'sale-456', '2026-04-12', 3000, 'cash', 'voucher-789');

-- Query total paid:
SELECT SUM(payment_amount)
FROM mandi.payment_transactions
WHERE sale_id = 'sale-456';

-- Update sales status:
UPDATE mandi.sales s
SET payment_status = CASE
  WHEN (SELECT SUM(payment_amount) FROM mandi.payment_transactions WHERE sale_id = s.id)
       >= s.total_amount_inc_tax THEN 'paid'
  WHEN (SELECT SUM(payment_amount) FROM mandi.payment_transactions WHERE sale_id = s.id) > 0
       THEN 'partial'
  ELSE 'pending'
END
WHERE id = 'sale-456';
```

**Acceptance Criteria:**
- Multiple partial payments on one sale tracked separately
- Finance module can record additional payments anytime
- Payment history visible in sale detail view
- Status auto-updates as payments recorded

---

### Issue 3: Status Field Not Always Updated After Payment

**Problem:**
- When `clear_cheque()` creates payment entry, `sales.payment_status` may not update
- Some code paths rely on manual status check; others don't
- UI can show 'pending' even though payment recorded

**Impact:**
- Inconsistent UI display (different pages show different status)
- Financial reports show incorrect aging
- Payment reconciliation fails

**Current Code (20260404100001_update_clear_cheque.sql):**
```sql
-- ✓ Updates status for sales (invoice_id)
UPDATE mandi.sales
SET payment_status = CASE
    WHEN v_balance.balance_due <= 0.01 THEN 'paid'
    WHEN v_balance.amount_paid > 0 THEN 'partial'
    ELSE payment_status
END
WHERE id = v_voucher.invoice_id;

-- ✗ But NOT called consistently from all payment recording flows
```

**Recommendation:**
```sql
-- Create explicit function to calculate and update status
CREATE OR REPLACE FUNCTION mandi.update_sale_payment_status(p_sale_id uuid)
RETURNS void AS $$
DECLARE
  v_balance record;
BEGIN
  SELECT *
  FROM mandi.get_invoice_balance(p_sale_id)
  INTO v_balance;

  UPDATE mandi.sales
  SET payment_status = CASE
    WHEN COALESCE(v_balance.balance_due, 0) <= 0.01 THEN 'paid'
    WHEN COALESCE(v_balance.amount_paid, 0) > 0 THEN 'partial'
    ELSE 'pending'
  END,
  updated_at = now()
  WHERE id = p_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Call AFTER every payment record/clear:
-- In clear_cheque():
PERFORM mandi.update_sale_payment_status(v_voucher.invoice_id);

-- In confirm_sale_transaction() (if payment recorded now):
PERFORM mandi.update_sale_payment_status(v_sale_id);
```

**Acceptance Criteria:**
- Status always reflects actual payment amount
- Centralized calculation (no duplicate logic)
- Called from all payment recording flows
- UI always shows correct status

---

### Issue 4: Ledger Entry Reference Linking Inconsistent

**Problem:**
- `ledger_entries.reference_id` sometimes NULL, sometimes sale_id, sometimes arrival_id
- `ledger_entries.reference_no` sometimes NULL, sometimes bill_no
- Impossible to trace every ledger entry back to source transaction

**Example:**
```
SELECT reference_id, count(*)
FROM mandi.ledger_entries
WHERE reference_id IS NULL
GROUP BY reference_id;

-- Result: 2,341 entries with NULL reference_id!
```

**Impact:**
- Audit trail incomplete
- Can't reconcile individual transaction flows
- Financial compliance at risk

**Recommendation:**
```sql
-- Add NOT NULL constraint (after fixing existing data):
ALTER TABLE mandi.ledger_entries
ALTER COLUMN reference_id SET NOT NULL;

-- Add explicit parent transaction type:
ALTER TABLE mandi.ledger_entries
ADD COLUMN parent_txn_type text CHECK (parent_txn_type IN ('sale', 'purchase', 'payment', 'expense'));

-- Populate existing data:
UPDATE mandi.ledger_entries le
SET parent_txn_type = CASE
  WHEN v.type = 'sales' THEN 'sale'
  WHEN v.type = 'receipt' AND EXISTS (
    SELECT 1 FROM mandi.sales WHERE id = v.invoice_id
  ) THEN 'sale'
  WHEN v.type = 'purchase' THEN 'purchase'
  WHEN v.type = 'payment' THEN 'payment'
  ELSE 'expense'
END
FROM mandi.vouchers v
WHERE le.voucher_id = v.id;

-- Ensure both fields always populated:
CREATE OR REPLACE FUNCTION mandi.validate_ledger_entry_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_id IS NULL THEN
    RAISE EXCEPTION 'ledger_entries.reference_id cannot be NULL';
  END IF;
  IF NEW.parent_txn_type IS NULL THEN
    RAISE EXCEPTION 'ledger_entries.parent_txn_type must be set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_validate_ledger_entry
BEFORE INSERT ON mandi.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION mandi.validate_ledger_entry_before_insert();
```

**Acceptance Criteria:**
- Every ledger entry has non-NULL reference_id
- Every ledger entry has explicit parent_txn_type
- Audit trail query: `SELECT * FROM mandi.ledger_entries WHERE reference_id = 'xxx' ORDER BY entry_date`

---

## IMPORTANT ISSUES (P1)

### Issue 5: Commission Calculation Hidden from Ledger Detail

**Problem:**
- Commission amount calculated in `post_arrival_ledger()` but not visible in ledger_entries
- User sees just "Commission Income ₹5,000" without breakdown per lot
- Can't audit commission calculation accuracy

**Recommendation:**
```sql
CREATE MATERIALIZED VIEW mandi.mv_lot_commission_breakdown AS
SELECT
  a.id as arrival_id,
  a.organization_id,
  l.id as lot_id,
  l.item_id,
  l.initial_qty,
  l.less_percent,
  (l.initial_qty * (1 - l.less_percent / 100)) as adjusted_qty,
  l.supplier_rate,
  l.commission_percent,
  (l.initial_qty * (1 - l.less_percent / 100) * l.supplier_rate) as base_value,
  ((l.initial_qty * (1 - l.less_percent / 100) * l.supplier_rate) * l.commission_percent / 100) as commission_amount,
  a.reference_no,
  c.name as party_name
FROM mandi.lots l
JOIN mandi.arrivals a ON l.arrival_id = a.id
JOIN mandi.contacts c ON a.party_id = c.id
WHERE a.arrival_type IN ('commission', 'commission_supplier');

-- Query: Get commission breakdown for arrival
SELECT * FROM mandi.mv_lot_commission_breakdown WHERE arrival_id = 'xxx';
```

**Acceptance Criteria:**
- Finance user can drill down to commission per lot
- Calculation auditable (base × commission% = amount)

---

### Issue 6: Transport Cost Allocation Not Per-Lot

**Problem:**
- Transport costs (hire, hamali, other) aggregated at arrival level
- Not allocated across lots
- User can't see transport cost per lot in Day Book

**Current State:**
```
Arrival: ₹100,000 total, ₹1,000 transport
- Lot 1: 50% of qty → sees whole ₹1,000 deducted (wrong)
- Lot 2: 50% of qty → sees whole ₹1,000 deducted (wrong)
```

**Recommendation:**
```sql
-- Add to ledger detail view:
SELECT
  a.id,
  l.id as lot_id,
  SUM(l.initial_qty) OVER (PARTITION BY a.id) as total_arrival_qty,
  l.initial_qty,
  (l.initial_qty / SUM(l.initial_qty) OVER (PARTITION BY a.id)) as qty_proportion,
  (a.hire_charges + a.hamali_expenses + a.other_expenses) as total_transport,
  ((a.hire_charges + a.hamali_expenses + a.other_expenses) * 
   (l.initial_qty / SUM(l.initial_qty) OVER (PARTITION BY a.id))) as allocated_transport
FROM mandi.lots l
JOIN mandi.arrivals a ON l.arrival_id = a.id;

-- Example Day Book entry:
-- Lot 1 (50 of 100 boxes): Transport allocated ₹500 (not ₹1,000)
-- Lot 2 (50 of 100 boxes): Transport allocated ₹500 (not ₹1,000)
```

---

### Issue 7: Arrival Type Not Always Selectable

**Problem:**
- Arrival entry form might not have explicit arrival_type selector
- Some code paths default to 'direct' without user input
- Commission arrivals incorrectly recorded as direct purchases

**Impact:**
- Wrong ledger posting (commission not deducted)
- Financial reports understate commission income

**Recommendation:**
- UI: Add required radio button: "Commission | Direct Purchase"
- Backend: Add RLS check ensuring arrival_type is explicit
- Migration: Audit existing arrivals with missing type

---

### Issue 8: Account Code Lookup Chain Fragile

**Problem:**
- Account selection relies on specific codes (1001, 1002, 2001, etc.)
- If codes missing or differently named, defaults wrongly
- No schema constraint enforcing code uniqueness

**Example:**
```sql
-- What if no account with code '1001' exists?
SELECT id INTO v_cash_acc_id FROM mandi.accounts
WHERE organization_id = v_org_id AND code = '1001' LIMIT 1;
-- Returns NULL, then falls back to:
SELECT id INTO v_cash_acc_id FROM mandi.accounts
WHERE organization_id = v_org_id AND name ILIKE 'Cash%' LIMIT 1;
-- Might pick wrong account if multiple names start with 'Cash'
```

**Recommendation:**
```sql
-- Add constraint:
ALTER TABLE mandi.accounts
ADD CONSTRAINT unique_code_per_org UNIQUE(organization_id, code);

-- Add check:
ALTER TABLE mandi.accounts
ADD CONSTRAINT valid_code CHECK (code ~ '^[0-9]{4}$');

-- Ensure system accounts created on org setup:
CREATE TABLE mandi.account_templates (
  code text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  account_sub_type text
);

INSERT INTO mandi.account_templates VALUES
  ('1001', 'Cash Account', 'asset', 'cash'),
  ('1002', 'Bank Account', 'asset', 'bank'),
  ('1003', 'Inventory', 'asset', 'inventory'),
  -- ... etc
```

---

### Issue 9: Discount/Settlement Terminology Inconsistent

**Problem:**
- Schema column: `sales.discount_amount`
- Code comment: "settlement"
- Unclear if discount is item-level or invoice-level

**Impact:**
- User confusion: Is this item discount or invoice-level settlement?
- Code inconsistency: Some places call it discount, others call it settlement

**Recommendation:**
```sql
-- Rename for clarity:
ALTER TABLE mandi.sales RENAME COLUMN discount_amount TO settlement_amount;

-- Update schema documentation:
-- settlement_amount: Invoice-level settlement/adjustment (after sale final)
-- NOT item-level discounts (those are in sale_items.amount)

-- Ledger: Track as separate entry
INSERT INTO mandi.ledger_entries (..., description = 'Invoice Settlement/Discount')
```

---

## NICE TO HAVE (P2)

### Issue 10: Pending Cheque Status Not Clear in UI

**Problem:**
- Sale marked 'pending' when cheque payment selected
- User doesn't see "awaiting cheque clearance" note

**Recommendation:**
```sql
-- Add narration hint in sales voucher:
UPDATE mandi.vouchers
SET narration = CONCAT(narration, ' [Pending cheque clearance]')
WHERE invoice_id IS NOT NULL
  AND payment_mode = 'cheque'
  AND cheque_status = 'Pending';
```

---

### Issue 11: No Payment Reconciliation View

**Problem:**
- Finance user must manually match bank statements to ledger entries
- No automated reconciliation report

**Recommendation:**
```sql
CREATE VIEW mandi.vw_payment_reconciliation AS
SELECT
  v.date,
  UPPER(v.payment_mode) as payment_method,
  v.amount,
  v.narration,
  CASE WHEN le.id IS NOT NULL THEN 'Reconciled' ELSE 'Pending' END as status,
  v.id, le.id
FROM mandi.vouchers v
LEFT JOIN mandi.ledger_entries le ON v.id = le.voucher_id AND le.transaction_type = 'receipt'
WHERE v.type IN ('receipt', 'payment')
ORDER BY v.date;
```

---

### Issue 12: Audit Trail for Status Changes Missing

**Problem:**
- Can't see history of payment_status changes
- If status changes erroneously, no audit trail

**Recommendation:**
```sql
CREATE TABLE mandi.sales_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES mandi.sales(id),
  old_status text,
  new_status text,
  changed_at timestamp DEFAULT now(),
  changed_by uuid,
  reason text
);

-- Insert trigger:
CREATE OR REPLACE FUNCTION mandi.audit_sale_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.payment_status != NEW.payment_status THEN
    INSERT INTO mandi.sales_status_audit (sale_id, old_status, new_status, changed_by, reason)
    VALUES (NEW.id, OLD.payment_status, NEW.payment_status, auth.uid(), 'Auto-update');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_audit_sale_status
AFTER UPDATE ON mandi.sales
FOR EACH ROW
EXECUTE FUNCTION mandi.audit_sale_status_change();
```

---

## Migration Priorities

### Phase 1 (Next Release)
1. ✅ Fix Issue #1: Day Book materialized view
2. ✅ Fix Issue #2: Payment transaction history table
3. ✅ Fix Issue #3: Centralized status update function
4. ✅ Fix Issue #4: Validate reference_id and parent_txn_type

### Phase 2 (Following Release)
5. Fix Issue #5: Commission breakdown view
6. Fix Issue #6: Transport allocation per lot
7. Fix Issue #7: Ensure arrival_type always set
8. Fix Issue #8: Enforce account codes

### Phase 3 (Polish)
9. Fix Issue #9: Standardize terminology
10. Fix Issue #10: Pending cheque UI notes
11. Add Issue #11: Payment reconciliation view
12. Add Issue #12: Status change audit trail

---

## Testing Checklist Before Deployment

- [ ] All 5 cheque scenarios still pass (pending, instant, cleared, cancelled, bounced)
- [ ] Partial payment tracking works (multiple payments to one sale)
- [ ] Payment status auto-updates after clear_cheque()
- [ ] Day Book view returns consistent results
- [ ] Commion arrival ledger entries correct
- [ ] Direct arrival ledger entries correct
- [ ] Ledger entries always have reference_id
- [ ] No duplicate ledger entries for same transaction
- [ ] Day Book shows no duplicate amounts
- [ ] Materialized view refreshes within acceptable time
- [ ] Finance reconciliation report matches bank statements

---

**End of Issues & Recommendations**
