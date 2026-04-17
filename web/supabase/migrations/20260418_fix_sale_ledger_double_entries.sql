-- ============================================================
-- WORLD-CLASS SALES TRANSACTION ENGINE (FINAL AUDIT READY)
-- Migration: 20260418_fix_sale_ledger_double_entries.sql
-- ============================================================

-- 1. DROP THE OLD TRIGGER THAT CAUSED DOUBLE ENTRIES
DROP TRIGGER IF EXISTS trg_sync_sales_ledger ON mandi.sales;
DROP FUNCTION IF EXISTS mandi.sync_sales_ledger_fn CASCADE;
DROP TRIGGER IF EXISTS sync_sales_to_ledger ON mandi.sales;

-- 2. REPLACE THE FUNCTION WITH RECEIPT LOGIC
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, numeric, date, uuid);

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id UUID,
    p_buyer_id UUID,
    p_sale_date DATE,
    p_payment_mode TEXT,
    p_total_amount NUMERIC, -- Raw Sub-total
    p_items JSONB,
    p_market_fee NUMERIC DEFAULT 0,
    p_nirashrit NUMERIC DEFAULT 0,
    p_misc_fee NUMERIC DEFAULT 0,
    p_loading_charges NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_igst_amount NUMERIC DEFAULT 0,
    p_gst_total NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_percent NUMERIC DEFAULT 0,
    p_idempotency_key UUID DEFAULT NULL,
    p_amount_received NUMERIC DEFAULT 0,
    p_due_date DATE DEFAULT NULL,
    p_bank_account_id UUID DEFAULT NULL,
    p_place_of_supply TEXT DEFAULT NULL,
    p_buyer_gstin TEXT DEFAULT NULL,
    p_is_igst BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_voucher_id UUID;
    v_bill_no BIGINT;
    v_item JSONB;
    v_sales_acc UUID;
    v_cgst_acc UUID;
    v_sgst_acc UUID;
    v_igst_acc UUID;
    v_market_fee_acc UUID;
    v_bank_acc UUID;
    v_total_receivable NUMERIC;
    v_existing_sale_id UUID;
    v_my_org_id UUID;
BEGIN
    -- 1. Security Assertion
    v_my_org_id := core.get_my_org_id();
    IF v_my_org_id IS NULL OR v_my_org_id <> p_organization_id THEN
        RAISE EXCEPTION 'Unauthorized: Org Mismatch';
    END IF;

    -- 2. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key;
        IF v_existing_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale_id, 'bill_no', (SELECT bill_no FROM mandi.sales WHERE id = v_existing_sale_id), 'message', 'Duplicate stopped');
        END IF;
    END IF;

    -- 3. Grand Total Calculation
    v_total_receivable := (p_total_amount - p_discount_amount) + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses + p_gst_total;

    -- 4. Account Resolution
    SELECT id INTO v_sales_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '3001' OR name ILIKE 'Sales%') LIMIT 1;
    SELECT id INTO v_cgst_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%CGST Output%' OR name ILIKE '%CGST Payable%') LIMIT 1;
    SELECT id INTO v_sgst_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%SGST Output%' OR name ILIKE '%SGST Payable%') LIMIT 1;
    SELECT id INTO v_igst_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%IGST Output%' OR name ILIKE '%IGST Payable%') LIMIT 1;
    SELECT id INTO v_market_fee_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE 'Market Fee%' OR name ILIKE 'Mandi Tax%') LIMIT 1;

    -- Fallbacks
    v_sales_acc := COALESCE(v_sales_acc, (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id LIMIT 1));
    v_cgst_acc := COALESCE(v_cgst_acc, v_sales_acc);
    v_sgst_acc := COALESCE(v_sgst_acc, v_sales_acc);
    v_igst_acc := COALESCE(v_igst_acc, v_sales_acc);
    v_market_fee_acc := COALESCE(v_market_fee_acc, v_sales_acc);

    -- 5. Insert Sale Main Record
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;
    
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no, 
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, 
        other_expenses, cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_amount, discount_percent, idempotency_key, payment_status, 
        total_amount_inc_tax, due_date, created_at, place_of_supply, buyer_gstin, is_igst
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, v_bill_no,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges,
        p_other_expenses, p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_amount, p_discount_percent, p_idempotency_key, 
        CASE WHEN p_payment_mode = 'credit' THEN 'pending' ELSE 'paid' END,
        v_total_receivable, p_due_date, NOW(), p_place_of_supply, p_buyer_gstin, p_is_igst
    ) RETURNING id INTO v_sale_id;

    -- 6. Items & Stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO mandi.sale_items (organization_id, sale_id, lot_id, qty, rate, amount, unit)
        VALUES (p_organization_id, v_sale_id, (v_item->>'lot_id')::UUID, (v_item->>'qty')::NUMERIC, (v_item->>'rate')::NUMERIC, (v_item->>'amount')::NUMERIC, v_item->>'unit');

        UPDATE mandi.lots SET current_qty = current_qty - (v_item->>'qty')::NUMERIC WHERE id = (v_item->>'lot_id')::UUID;
    END LOOP;

    -- 7. LEDGER POSTING
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, invoice_id, amount)
    VALUES (p_organization_id, p_sale_date, 'sales', v_bill_no, 'Sale Invoice #' || v_bill_no, v_sale_id, v_total_receivable)
    RETURNING id INTO v_voucher_id;

    -- Entry 1: Debit Buyer (AR)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
    VALUES (p_organization_id, v_voucher_id, p_buyer_id, v_total_receivable, 0, p_sale_date, 'sale', v_sale_id, v_bill_no::TEXT);

    -- Entry 2: Credit Sales (Net Revenue)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
    VALUES (p_organization_id, v_voucher_id, v_sales_acc, 0, p_total_amount - p_discount_amount, p_sale_date, 'sale', v_sale_id, v_bill_no::TEXT);

    -- Entry 3: Credit Fees
    IF (p_market_fee + p_nirashrit + p_misc_fee) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_market_fee_acc, 0, p_market_fee + p_nirashrit + p_misc_fee, p_sale_date, 'sale_fee', v_sale_id, v_bill_no::TEXT);
    END IF;

    -- Entry 4: Credit Taxes
    IF p_cgst_amount > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_cgst_acc, 0, p_cgst_amount, p_sale_date, 'gst', v_sale_id, v_bill_no::TEXT);
    END IF;
    IF p_sgst_amount > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_sgst_acc, 0, p_sgst_amount, p_sale_date, 'gst', v_sale_id, v_bill_no::TEXT);
    END IF;
    IF p_igst_amount > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_igst_acc, 0, p_igst_amount, p_sale_date, 'gst', v_sale_id, v_bill_no::TEXT);
    END IF;

    -- Entry 5: Credit Expenses (Loading etc)
    IF (p_loading_charges + p_unloading_charges + p_other_expenses) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_sales_acc, 0, p_loading_charges + p_unloading_charges + p_other_expenses, p_sale_date, 'sale_expense', v_sale_id, v_bill_no::TEXT);
    END IF;

    -- 8. CASH RECEIPT GENERATION (FIX FOR RECEIVABLES WHEN PAID)
    IF p_amount_received > 0 THEN
        -- Resolve Bank/Cash Account
        IF p_bank_account_id IS NOT NULL THEN
            v_bank_acc := p_bank_account_id;
        ELSE
            SELECT id INTO v_bank_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1001' OR name ILIKE 'Cash%') LIMIT 1;
            v_bank_acc := COALESCE(v_bank_acc, v_sales_acc);
        END IF;

        -- Create Receipt Voucher
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, invoice_id, amount)
        VALUES (p_organization_id, p_sale_date, 'receipt', v_bill_no, 'Sale Payment #' || v_bill_no, v_sale_id, p_amount_received)
        RETURNING id INTO v_voucher_id;

        -- Debit Bank/Cash (Cash inflow)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_bank_acc, p_amount_received, 0, p_sale_date, 'sale_payment', v_sale_id, v_bill_no::TEXT);

        -- Credit Buyer (AR) (Paid off)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, p_buyer_id, 0, p_amount_received, p_sale_date, 'sale_payment', v_sale_id, v_bill_no::TEXT);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
