-- Resolve MandiGrow Sale Transaction Ambiguity
-- This migration drops ALL known conflicting signatures of confirm_sale_transaction
-- to ensure the Postgres engine can clearly match the RPC call from the client.

-- 1. Drop known signatures in 'public' schema
DROP FUNCTION IF EXISTS public.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, uuid, date);
DROP FUNCTION IF EXISTS public.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, uuid);

-- 2. Drop known signatures in 'mandi' schema
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(p_organization_id uuid, p_buyer_id uuid, p_sale_date timestamp with time zone, p_payment_mode text, p_items jsonb, p_total_amount numeric, p_market_fee numeric, p_nirashrit numeric, p_misc_fee numeric, p_loading_charges numeric, p_unloading_charges numeric, p_other_expenses numeric, p_idempotency_key uuid, p_due_date timestamp with time zone);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(p_organization_id uuid, p_buyer_id uuid, p_sale_date date, p_payment_mode text, p_total_amount numeric, p_items jsonb, p_market_fee numeric, p_nirashrit numeric, p_misc_fee numeric, p_loading_charges numeric, p_unloading_charges numeric, p_other_expenses numeric, p_idempotency_key text, p_due_date date, p_bank_account_id uuid, p_cheque_no text, p_cheque_date date, p_cheque_status boolean);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(p_organization_id uuid, p_buyer_id uuid, p_sale_date date, p_payment_mode text, p_total_amount numeric, p_items jsonb, p_market_fee numeric, p_nirashrit numeric, p_misc_fee numeric, p_loading_charges numeric, p_unloading_charges numeric, p_other_expenses numeric, p_idempotency_key uuid, p_due_date date, p_bank_account_id uuid, p_cheque_no text, p_cheque_date date, p_cheque_status boolean);

-- 3. Re-create the single, canonical version in 'mandi' schema
-- This version includes both Commission and Direct Sale logic, and supports modern features like bank/cheque details.
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid,
    p_buyer_id uuid,
    p_sale_date date,
    p_payment_mode text,
    p_total_amount numeric,
    p_items jsonb,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_idempotency_key uuid DEFAULT NULL::uuid, -- Strictly UUID to resolve ambiguity
    p_due_date date DEFAULT NULL::date,
    p_bank_account_id uuid DEFAULT NULL::uuid,
    p_cheque_no text DEFAULT NULL::text,
    p_cheque_date date DEFAULT NULL::date,
    p_cheque_status boolean DEFAULT false
) RETURNS jsonb 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_journal_voucher_id UUID;
    v_receipt_voucher_id UUID;
    v_bill_no BIGINT;
    v_item JSONB;
    v_account_id UUID; 
    v_total_payable NUMERIC;
    v_existing_sale_id UUID;
    v_payment_status TEXT;
    
    -- Variables for Commission/Direct Logic
    v_lot_contact_id UUID;
    v_lot_arrival_type TEXT;
    v_lot_commission_percent NUMERIC;
    v_lot_less_percent NUMERIC;
    v_item_qty NUMERIC;
    v_item_rate NUMERIC;
    v_item_amount NUMERIC;
    v_adjusted_qty NUMERIC;
    v_base_adjusted_value NUMERIC;
    v_commission_amount NUMERIC;
    
    -- Account Lookups
    v_sales_revenue_account_id UUID;
    v_commission_account_id UUID;
BEGIN
    -- 0. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key;
        IF v_existing_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale_id, 'bill_no', (SELECT bill_no FROM mandi.sales WHERE id = v_existing_sale_id), 'message', 'Duplicate skipped');
        END IF;
    END IF;

    -- Standard Validation
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'No items in sale';
    END IF;

    -- Determine Payment Status
    v_payment_status := CASE 
        WHEN p_payment_mode IN ('cash', 'upi', 'bank_transfer', 'UPI/BANK', 'bank_upi') THEN 'paid' 
        WHEN p_payment_mode IN ('cheque', 'CHEQUE') AND p_cheque_status = true THEN 'paid'
        ELSE 'pending' 
    END;

    -- 1. Get Next Bill No
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;

    -- 2. Insert Sale Record
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no, 
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        payment_status, created_at, idempotency_key, due_date,
        cheque_no, cheque_date, is_cheque_cleared
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, v_bill_no, 
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        v_payment_status, NOW(), p_idempotency_key, p_due_date,
        p_cheque_no, p_cheque_date, p_cheque_status
    ) RETURNING id INTO v_sale_id;

    -- Total AR amount for Buyer
    v_total_payable := p_total_amount + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses;

    -- Lookup Accounts Once
    SELECT id INTO v_commission_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND name ILIKE '%Commission Income%' AND type = 'income' LIMIT 1;
    SELECT id INTO v_sales_revenue_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '4001' OR name ILIKE 'Sales%') LIMIT 1;

    -- 3. INITIAL BUYER LEDGER ENTRY (Debit AR)
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, source)
    VALUES (p_organization_id, p_sale_date, 'sales', v_bill_no, 'Sale Inv #' || v_bill_no, v_total_payable, 'automated')
    RETURNING id INTO v_journal_voucher_id;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type)
    VALUES (p_organization_id, v_journal_voucher_id, p_buyer_id, v_total_payable, 0, p_sale_date, 'Sale Inv #' || v_bill_no, 'sale');

    -- 4. Process Items (Stock + Revenue/Settlement)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_item_qty := (v_item->>'qty')::NUMERIC;
        v_item_rate := (v_item->>'rate')::NUMERIC;
        v_item_amount := (v_item->>'amount')::NUMERIC; -- Use the pre-calculated amount from client if available, else rate * qty
        IF v_item_amount IS NULL THEN v_item_amount := v_item_qty * v_item_rate; END IF;

        INSERT INTO mandi.sale_items (organization_id, sale_id, lot_id, quantity, rate, total_price, unit)
        VALUES (p_organization_id, v_sale_id, (v_item->>'lot_id')::UUID, v_item_qty, v_item_rate, v_item_amount, v_item->>'unit');

        UPDATE mandi.lots SET current_qty = current_qty - v_item_qty WHERE id = (v_item->>'lot_id')::UUID;
        
        -- Negative stock check
        IF EXISTS (SELECT 1 FROM mandi.lots WHERE id = (v_item->>'lot_id')::UUID AND current_qty < 0) THEN
            RAISE EXCEPTION 'Insufficient stock for Lot %. Transaction Aborted.', (v_item->>'lot_id');
        END IF;

        -- Fetch Lot Info for Commission Logic
        SELECT contact_id, arrival_type, commission_percent, less_percent
        INTO v_lot_contact_id, v_lot_arrival_type, v_lot_commission_percent, v_lot_less_percent
        FROM mandi.lots WHERE id = (v_item->>'lot_id')::UUID;

        -- SALES REVENUE leg (Credit)
        IF v_sales_revenue_account_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type)
            VALUES (p_organization_id, v_journal_voucher_id, v_sales_revenue_account_id, 0, v_item_amount, p_sale_date, 'Sale Revenue #' || v_bill_no, 'sale');
        END IF;

        IF v_lot_arrival_type IN ('commission', 'commission_supplier') THEN
            -- Comm. Income leg
            v_adjusted_qty := v_item_qty - (v_item_qty * COALESCE(v_lot_less_percent, 0) / 100.0);
            v_base_adjusted_value := v_adjusted_qty * v_item_rate;
            v_commission_amount := v_base_adjusted_value * (COALESCE(v_lot_commission_percent, 0) / 100.0);
            
            IF v_commission_amount > 0 AND v_commission_account_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type)
                VALUES (p_organization_id, v_journal_voucher_id, v_commission_account_id, 0, v_commission_amount, p_sale_date, 'Comm. Income #' || v_bill_no, 'income');
            END IF;
        END IF;
    END LOOP;

    -- 5. Handle Immediate Payments
    IF v_payment_status = 'paid' THEN
        IF p_bank_account_id IS NOT NULL THEN
            v_account_id := p_bank_account_id;
        ELSE
            IF p_payment_mode IN ('cash', 'CASH') THEN
                SELECT id INTO v_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1001' OR name ILIKE 'Cash%') LIMIT 1;
            ELSE
                SELECT id INTO v_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1002' OR name ILIKE 'Bank%') LIMIT 1;
            END IF;
        END IF;

        IF v_account_id IS NOT NULL THEN
            -- We reuse the same Sale date/bill_no context for the receipt.
            -- In newer optimized accounting, we can use the same voucher OR a linked receipt voucher.
            -- Following Function 1's pattern of a separate receipt voucher for clarity.
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, source, cheque_no, cheque_date, is_cleared)
            VALUES (p_organization_id, p_sale_date, 'receipt', v_bill_no, 'Sale Payment #' || v_bill_no, v_total_payable, 'automated', p_cheque_no, p_cheque_date, p_cheque_status)
            RETURNING id INTO v_receipt_voucher_id;

            -- Credit Buyer (Reduce AR)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type)
            VALUES (p_organization_id, v_receipt_voucher_id, p_buyer_id, 0, v_total_payable, p_sale_date, 'Sale Payment #' || v_bill_no, 'receipt');

            -- Debit Cash/Bank (Increase Asset)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type)
            VALUES (p_organization_id, v_receipt_voucher_id, v_account_id, v_total_payable, 0, p_sale_date, 'Sale Payment #' || v_bill_no, 'receipt');
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$$;
