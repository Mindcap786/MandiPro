-- ============================================================
-- UNIFIED SALE + PURCHASE ACCOUNTING (v4 - Standard Double Entry)
-- Migration: 20260427000000_unify_sale_purchase_accounting.sql
-- ============================================================

BEGIN;

-- [0] SCHEMA UPDATES
ALTER TABLE mandi.lots
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS net_payable NUMERIC DEFAULT 0;

ALTER TABLE mandi.sales
    ADD COLUMN IF NOT EXISTS amount_received NUMERIC DEFAULT 0;

-- [1] HELPERS
CREATE OR REPLACE FUNCTION mandi.normalize_payment_mode(p_mode TEXT, p_default TEXT DEFAULT 'credit')
RETURNS TEXT AS $$
    SELECT CASE
        WHEN p_mode IS NULL OR btrim(p_mode) = '' THEN lower(coalesce(p_default, 'credit'))
        WHEN lower(btrim(p_mode)) IN ('udhaar', 'credit') THEN 'credit'
        WHEN lower(btrim(p_mode)) = 'cash' THEN 'cash'
        WHEN lower(btrim(p_mode)) IN ('upi', 'upi/bank', 'upi_bank', 'upi bank') THEN 'upi'
        WHEN lower(btrim(p_mode)) IN ('bank', 'bank_transfer', 'bank transfer', 'bank_upi', 'neft', 'rtgs', 'imps') THEN 'bank'
        WHEN lower(btrim(p_mode)) = 'cheque' THEN 'cheque'
        ELSE lower(btrim(p_mode))
    END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION mandi.classify_bill_status(p_total_amount NUMERIC, p_paid_amount NUMERIC)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN COALESCE(p_total_amount, 0) <= 0.01 THEN 'pending'
    WHEN COALESCE(p_paid_amount, 0) >= COALESCE(p_total_amount, 0) - 0.01 THEN 'paid'
    WHEN COALESCE(p_paid_amount, 0) > 0.01 THEN 'partial'
    ELSE 'pending'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- [2] SALE TRANSACTION (Unified & Standardized)
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction CASCADE;
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   UUID,
    p_buyer_id          UUID,
    p_sale_date         DATE,
    p_payment_mode      TEXT,
    p_total_amount      NUMERIC, -- Goods Value before tax/charges
    p_items             JSONB,
    p_market_fee        NUMERIC DEFAULT 0,
    p_nirashrit         NUMERIC DEFAULT 0,
    p_misc_fee          NUMERIC DEFAULT 0,
    p_loading_charges   NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses    NUMERIC DEFAULT 0,
    p_amount_received   NUMERIC DEFAULT 0,
    p_bank_account_id   UUID DEFAULT NULL,
    p_cheque_no         TEXT DEFAULT NULL,
    p_cheque_date       DATE DEFAULT NULL,
    p_bank_name         TEXT DEFAULT NULL,
    p_narration         TEXT DEFAULT NULL,
    p_idempotency_key   TEXT DEFAULT NULL,
    p_created_by        UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_voucher_id UUID;
    v_receipt_voucher_id UUID;
    v_voucher_no BIGINT;
    v_receipt_voucher_no BIGINT;
    v_total_inc_tax NUMERIC;
    v_goods_revenue NUMERIC;
    v_recovery_credit NUMERIC;
    v_received NUMERIC;
    v_payment_status TEXT;
    v_mode TEXT;
    v_ar_acc_id UUID;
    v_sales_revenue_acc_id UUID;
    v_recovery_acc_id UUID;
    v_cash_acc_id UUID;
    v_bank_acc_id UUID;
    v_payment_acc_id UUID;
    v_item RECORD;
    v_qty NUMERIC;
    v_rate NUMERIC;
    v_amount NUMERIC;
    v_item_details TEXT := '';
    v_sale_narration TEXT;
    v_receipt_narration TEXT;
BEGIN
    -- Normalize mode
    v_mode := mandi.normalize_payment_mode(p_payment_mode);
    
    -- Calculations
    v_goods_revenue := ROUND(p_total_amount, 2);
    v_total_inc_tax := ROUND(p_total_amount + COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0), 2);
    v_recovery_credit := ROUND(v_total_inc_tax - v_goods_revenue, 2);
    v_received := COALESCE(p_amount_received, 0);
    
    v_payment_status := mandi.classify_bill_status(v_total_inc_tax, v_received);

    -- Check Idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, bill_no INTO v_sale_id, v_bill_no FROM mandi.sales WHERE idempotency_key = p_idempotency_key LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'idempotent', true);
        END IF;
    END IF;

    -- Sequence nos
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;
    SELECT COALESCE(MAX(contact_bill_no), 0) + 1 INTO v_contact_bill_no FROM mandi.sales WHERE organization_id = p_organization_id AND buyer_id = p_buyer_id;

    -- 1. Insert Sale record
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, bill_no, contact_bill_no,
        payment_mode, total_amount, total_amount_inc_tax, amount_received, payment_status,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        idempotency_key, bank_account_id, cheque_no, cheque_date, bank_name, created_by, status
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, v_bill_no, v_contact_bill_no,
        v_mode, v_goods_revenue, v_total_inc_tax, v_received, v_payment_status,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        p_idempotency_key, p_bank_account_id, p_cheque_no, p_cheque_date, p_bank_name, p_created_by, v_payment_status
    ) RETURNING id INTO v_sale_id;

    -- 2. Sale Items & Stock Update
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item->>'qty')::NUMERIC;
        v_rate := (v_item->>'rate')::NUMERIC;
        v_amount := ROUND(v_qty * v_rate, 2);
        
        INSERT INTO mandi.sale_items (sale_id, lot_id, item_id, qty, rate, amount, organization_id)
        VALUES (v_sale_id, (v_item->>'lot_id')::UUID, (v_item->>'item_id')::UUID, v_qty, v_rate, v_amount, p_organization_id);
        
        UPDATE mandi.lots SET current_qty = current_qty - v_qty, updated_at = NOW() WHERE id = (v_item->>'lot_id')::UUID;
        
        v_item_details := v_item_details || COALESCE(v_item->>'item_name', 'Item') || ', ';
    END LOOP;

    -- 3. Accounts Lookup (Standard Double Entry)
    SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (account_sub_type = 'accounts_receivable' OR code = '1003') LIMIT 1;
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (account_sub_type = 'operating_revenue' OR code = '4001') LIMIT 1;
    SELECT id INTO v_recovery_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (account_sub_type = 'fees' OR code = '4002') LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'cash' LIMIT 1;
    SELECT id INTO v_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'bank' LIMIT 1;

    v_sale_narration := 'Sale Bill #' || v_bill_no || ' | ' || rtrim(v_item_details, ', ');

    -- 4. Create Sale Voucher
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, reference_id)
    VALUES (p_organization_id, p_sale_date, 'sale', v_voucher_no, v_total_inc_tax, v_sale_narration, p_buyer_id, v_sale_id)
    RETURNING id INTO v_voucher_id;

    -- 5. Ledger Posting: Buyer DR (Asset), Revenue CR (Income)
    -- Party Side (Buyer)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
    VALUES (p_organization_id, v_voucher_id, p_buyer_id, v_ar_acc_id, v_total_inc_tax, 0, p_sale_date, v_sale_narration, 'sale', v_sale_id);
    
    -- Revenue Side
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
    VALUES (p_organization_id, v_voucher_id, COALESCE(v_sales_revenue_acc_id, v_ar_acc_id), 0, v_goods_revenue, p_sale_date, v_sale_narration, 'sale', v_sale_id);
    
    -- Charges Side
    IF v_recovery_credit > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
        VALUES (p_organization_id, v_voucher_id, COALESCE(v_recovery_acc_id, v_sales_revenue_acc_id), 0, v_recovery_credit, p_sale_date, 'Tax & Charges', 'sale', v_sale_id);
    END IF;

    -- 6. Receipt Posting (Payment received instantly)
    IF v_received > 0 THEN
        v_receipt_narration := 'Receipt for Bill #' || v_bill_no || ' (' || UPPER(v_mode) || ')';
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_receipt_voucher_no FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt';
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, reference_id, payment_mode, bank_account_id)
        VALUES (p_organization_id, p_sale_date, 'receipt', v_receipt_voucher_no, v_received, v_receipt_narration, p_buyer_id, v_sale_id, v_mode, p_bank_account_id)
        RETURNING id INTO v_receipt_voucher_id;

        v_payment_acc_id := CASE WHEN v_mode = 'cash' THEN v_cash_acc_id ELSE COALESCE(p_bank_account_id, v_bank_acc_id) END;
        
        -- Cash/Bank DR, Buyer CR
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
        VALUES (p_organization_id, v_receipt_voucher_id, v_payment_acc_id, v_received, 0, p_sale_date, v_receipt_narration, 'receipt', v_sale_id);
        
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
        VALUES (p_organization_id, v_receipt_voucher_id, p_buyer_id, v_ar_acc_id, 0, v_received, p_sale_date, v_receipt_narration, 'sale_payment', v_sale_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'status', v_payment_status);
END;
$$ LANGUAGE plpgsql;

-- [3] PURCHASE POSTING (post_arrival_ledger)
DROP FUNCTION IF EXISTS mandi.post_arrival_ledger CASCADE;
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id UUID)
RETURNS VOID AS $$
DECLARE
    v_arrival RECORD;
    v_lot RECORD;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_purchase_acc_id UUID;
    v_payables_acc_id UUID;
    v_comm_income_acc_id UUID;
    v_exp_recovery_acc_id UUID;
    v_total_bill_amount NUMERIC := 0; -- Net Payable
    v_total_goods_value NUMERIC := 0; -- Gross Value
    v_total_commission NUMERIC := 0;
    v_total_expenses NUMERIC := 0;
    v_arrival_expenses NUMERIC := 0;
    v_lot_count INTEGER := 0;
    v_narration TEXT;
    v_org_id UUID;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;
    
    v_org_id := v_arrival.organization_id;

    -- Idempotency: Clean old entries
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type = 'purchase';
    DELETE FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type = 'purchase';

    -- Arrival-level expenses (deducted from payout)
    v_arrival_expenses := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0) + COALESCE(v_arrival.other_expenses, 0);

    -- Calculate totals from lots
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        -- 1. Gross Value = Qty * Rate
        v_total_goods_value := v_total_goods_value + ROUND(v_lot.declared_qty * v_lot.rate, 2);
        
        -- 2. Deductions
        v_total_commission := v_total_commission + ROUND((v_lot.declared_qty * v_lot.rate * v_lot.commission_percent) / 100, 2);
        v_total_expenses := v_total_expenses + 
                           COALESCE(v_lot.packing_cost, 0) + 
                           COALESCE(v_lot.loading_cost, 0) + 
                           COALESCE(v_lot.farmer_charges, 0) +
                           ROUND((v_lot.declared_qty * v_lot.rate * v_lot.less_percent) / 100, 2);
        
        v_lot_count := v_lot_count + 1;
    END LOOP;

    -- Net Payable to Party
    v_total_bill_amount := v_total_goods_value - v_total_commission - v_total_expenses - v_arrival_expenses;

    -- Accounts Lookup
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'purchase' OR code = '5001') LIMIT 1;
    SELECT id INTO v_payables_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'accounts_payable' OR code = '2001') LIMIT 1;
    SELECT id INTO v_comm_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'commission_income' OR code = '4001') LIMIT 1;
    SELECT id INTO v_exp_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'other_income' OR code = '4002') LIMIT 1;

    v_narration := 'Purchase Arrival #' || v_arrival.arrival_no || ' (' || v_lot_count || ' lots)';

    -- 1. Purchase Voucher (Gross Amount)
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, reference_id)
    VALUES (v_org_id, v_arrival.arrival_date, 'purchase', v_voucher_no, v_total_goods_value, v_narration, v_arrival.party_id, p_arrival_id)
    RETURNING id INTO v_voucher_id;

    -- 2. Ledger Postings
    -- Purchase DR (Gross Expense)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
    VALUES (v_org_id, v_voucher_id, COALESCE(v_purchase_acc_id, v_payables_acc_id), v_total_goods_value, 0, v_arrival.arrival_date, 'Gross Purchase Value', 'purchase', p_arrival_id);
    
    -- Party CR (Net Payable Liability)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
    VALUES (v_org_id, v_voucher_id, v_arrival.party_id, v_payables_acc_id, 0, v_total_bill_amount, v_arrival.arrival_date, 'Net Payable to Supplier', 'purchase', p_arrival_id);
    
    -- Commission CR (Income)
    IF v_total_commission > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, COALESCE(v_comm_income_acc_id, v_exp_recovery_acc_id), 0, v_total_commission, v_arrival.arrival_date, 'Purchase Commission Income', 'purchase', p_arrival_id);
    END IF;

    -- Expenses/Deductions Recovery CR
    IF (v_total_expenses + v_arrival_expenses) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, COALESCE(v_exp_recovery_acc_id, v_purchase_acc_id), 0, (v_total_expenses + v_arrival_expenses), v_arrival.arrival_date, 'Charges Recovery', 'purchase', p_arrival_id);
    END IF;

    -- Trigger sync_transaction_status will auto-calculate payment status.
END;
$$ LANGUAGE plpgsql;

-- [4] PURCHASE CONFIRMATION (Handles Scenario 1 & 2)
DROP FUNCTION IF EXISTS mandi.confirm_purchase_transaction CASCADE;
CREATE OR REPLACE FUNCTION mandi.confirm_purchase_transaction(
    p_lot_id UUID,
    p_organization_id UUID,
    p_payment_mode TEXT,
    p_advance_amount NUMERIC,
    p_bank_account_id UUID DEFAULT NULL,
    p_cheque_no TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_lot RECORD;
    v_arrival_id UUID;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_cash_acc_id UUID;
    v_bank_acc_id UUID;
    v_payables_acc_id UUID;
    v_mode TEXT;
    v_narration TEXT;
BEGIN
    SELECT * INTO v_lot FROM mandi.lots WHERE id = p_lot_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Lot not found'); END IF;
    v_arrival_id := v_lot.arrival_id;

    v_mode := mandi.normalize_payment_mode(p_payment_mode);
    
    -- 1. Post/Update Purchase Ledger (Recalculates for whole arrival)
    PERFORM mandi.post_arrival_ledger(v_arrival_id);

    -- 2. Post Payment (Instant/Partial)
    IF p_advance_amount > 0 THEN
        v_narration := 'Payment for Lot ' || v_lot.lot_code || ' (' || UPPER(v_mode) || ')';
        SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'cash' LIMIT 1;
        SELECT id INTO v_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'bank' LIMIT 1;
        SELECT id INTO v_payables_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (account_sub_type = 'accounts_payable' OR code = '2001') LIMIT 1;

        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'payment';
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, reference_id, payment_mode, bank_account_id)
        VALUES (p_organization_id, CURRENT_DATE, 'payment', v_voucher_no, p_advance_amount, v_narration, (SELECT party_id FROM mandi.arrivals WHERE id = v_arrival_id), v_lot.id, v_mode, p_bank_account_id)
        RETURNING id INTO v_voucher_id;

        -- Supplier DR (Liability reduction), Cash/Bank CR (Asset reduction)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
        VALUES (p_organization_id, v_voucher_id, (SELECT party_id FROM mandi.arrivals WHERE id = v_arrival_id), v_payables_acc_id, p_advance_amount, 0, CURRENT_DATE, v_narration, 'purchase_payment', v_lot.id);
        
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, narration, transaction_type, reference_id)
        VALUES (p_organization_id, v_voucher_id, CASE WHEN v_mode = 'cash' THEN v_cash_acc_id ELSE COALESCE(p_bank_account_id, v_bank_acc_id) END, 0, p_advance_amount, CURRENT_DATE, v_narration, 'payment', v_lot.id);
    END IF;

    RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id);
END;
$$ LANGUAGE plpgsql;

COMMIT;
