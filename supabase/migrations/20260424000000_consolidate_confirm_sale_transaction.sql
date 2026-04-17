-- ============================================================
-- MASTER SALE TRANSACTION RPC - PERMANENT FIX
-- Consolidated single function, no ambiguous overloads
-- ============================================================

-- Drop ALL existing versions to eliminate ambiguity
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction CASCADE;

-- Create ONE clean, complete version
CREATE FUNCTION mandi.confirm_sale_transaction(
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
    p_amount_received numeric DEFAULT 0,
    p_idempotency_key text DEFAULT NULL,
    p_due_date date DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_bank_name text DEFAULT NULL,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id UUID;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_gross_total NUMERIC;
    v_total_inc_tax NUMERIC;
    v_sales_revenue_acc_id UUID;
    v_payment_status TEXT;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_actual_cheque_status_text TEXT;
    v_existing_sale_id UUID;
    v_item JSONB;
    v_pay_v_no BIGINT;
    v_pay_v_id UUID;
    v_cash_bank_id UUID;
    v_rec_amt NUMERIC;
BEGIN
    -- 0. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key;
        IF v_existing_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'sale_id', v_existing_sale_id,
                'bill_no', (SELECT bill_no FROM mandi.sales WHERE id = v_existing_sale_id),
                'contact_bill_no', (SELECT contact_bill_no FROM mandi.sales WHERE id = v_existing_sale_id),
                'payment_status', (SELECT payment_status FROM mandi.sales WHERE id = v_existing_sale_id),
                'message', 'Duplicate sale detected and skipped.'
            );
        END IF;
    END IF;

    -- 1. Get Sales Revenue Account
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts 
    WHERE organization_id = p_organization_id AND code = '4001' AND type = 'income' LIMIT 1;

    -- 2. Calculate Totals with GST
    v_gross_total := COALESCE(p_total_amount, 0) 
                     - COALESCE(p_discount_amount, 0)
                     + COALESCE(p_market_fee, 0) 
                     + COALESCE(p_nirashrit, 0) 
                     + COALESCE(p_misc_fee, 0)
                     + COALESCE(p_loading_charges, 0) 
                     + COALESCE(p_unloading_charges, 0) 
                     + COALESCE(p_other_expenses, 0);
    
    v_total_inc_tax := v_gross_total + COALESCE(p_gst_total, 0);

    -- 3. PERMANENT FIX: Payment Status Calculation
    -- Ensure amount_received is never NULL
    IF p_amount_received IS NULL THEN
        p_amount_received := 0;
    END IF;

    -- Three-tier logic:
    -- pending: amount_received <= 0
    -- paid: amount_received >= total_inc_tax
    -- partial: 0 < amount_received < total_inc_tax
    IF COALESCE(p_amount_received, 0) <= 0 THEN
        v_payment_status := 'pending';
    ELSIF COALESCE(p_amount_received, 0) >= v_total_inc_tax THEN
        v_payment_status := 'paid';
    ELSE
        v_payment_status := 'partial';
    END IF;

    -- Cheque status text
    v_actual_cheque_status_text := CASE 
        WHEN lower(p_payment_mode) = 'cheque' AND p_cheque_status = true THEN 'Cleared'
        WHEN lower(p_payment_mode) = 'cheque' THEN 'Pending'
        ELSE NULL 
    END;

    -- 4. Create Sale - CRITICAL: Include amount_received column
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
        payment_mode, payment_status, amount_received, market_fee, nirashrit, misc_fee,
        loading_charges, unloading_charges, other_expenses, due_date,
        cheque_no, cheque_date, bank_name, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount, place_of_supply, buyer_gstin, idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status, COALESCE(p_amount_received, 0), p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses, p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_percent, p_discount_amount, p_place_of_supply, p_buyer_gstin, p_idempotency_key
    ) RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- 5. Create Sale Items and Decrement Lot Quantities
    INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount, gst_amount)
    SELECT v_sale_id, (i->>'lot_id')::uuid, (i->>'qty')::numeric, (i->>'rate')::numeric, (i->>'amount')::numeric, (i->>'gst_amount')::numeric
    FROM jsonb_array_elements(p_items) AS i;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        UPDATE mandi.lots 
        SET current_qty = current_qty - (v_item->>'qty')::numeric 
        WHERE id = (v_item->>'lot_id')::uuid AND organization_id = p_organization_id;
    END LOOP;

    -- 6. Create Sale Voucher and Ledger Entry
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers 
    WHERE organization_id = p_organization_id AND type = 'sale';
    
    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration, invoice_id, party_id, 
        payment_mode, cheque_no, cheque_date, cheque_status, bank_account_id
    ) VALUES (
        p_organization_id, p_sale_date, 'sale', v_voucher_no, v_total_inc_tax, 
        'Sale #' || v_bill_no, v_sale_id, p_buyer_id,
        p_payment_mode, p_cheque_no, p_cheque_date, v_actual_cheque_status_text, p_bank_account_id
    ) RETURNING id INTO v_voucher_id;

    -- Ledger: Debit Customer (Receivable)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit, entry_date, 
        description, transaction_type, reference_no, reference_id
    ) VALUES (
        p_organization_id, v_voucher_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, 
        'Sale Invoice #' || v_bill_no, 'sale', v_bill_no::text, v_sale_id
    );

    -- Ledger: Credit Sales Revenue
    IF v_sales_revenue_acc_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date, 
            description, transaction_type, reference_no, reference_id
        ) VALUES (
            p_organization_id, v_voucher_id, v_sales_revenue_acc_id, 0, p_total_amount, 
            p_sale_date, 'Sales Revenue #' || v_bill_no, 'sale', v_bill_no::text, v_sale_id
        );
    END IF;

    -- 7. If immediate payment (cash/upi/bank/cleared cheque), create receipt
    IF v_payment_status IN ('paid', 'partial') THEN
        v_rec_amt := COALESCE(p_amount_received, v_total_inc_tax);
        
        SELECT id INTO v_cash_bank_id FROM mandi.accounts 
        WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
        
        IF lower(p_payment_mode) <> 'cash' AND p_bank_account_id IS NOT NULL THEN
            v_cash_bank_id := p_bank_account_id;
        END IF;

        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_pay_v_no FROM mandi.vouchers 
        WHERE organization_id = p_organization_id AND type = 'receipt';
        
        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, narration, amount, contact_id, invoice_id, 
            bank_account_id, cheque_no, is_cleared, cleared_at, cheque_status
        ) VALUES (
            p_organization_id, p_sale_date, 'receipt', v_pay_v_no, 
            'Instant Receipt - Sale #' || v_bill_no, v_rec_amt, p_buyer_id, v_sale_id,
            v_cash_bank_id, p_cheque_no, 
            (lower(p_payment_mode) <> 'cheque'), 
            CASE WHEN lower(p_payment_mode) <> 'cheque' THEN p_sale_date ELSE NULL END, 
            v_actual_cheque_status_text
        ) RETURNING id INTO v_pay_v_id;

        -- Ledger: Credit Customer (Reduce Receivable)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, contact_id, debit, credit, entry_date, 
            description, transaction_type, reference_no, reference_id
        ) VALUES (
            p_organization_id, v_pay_v_id, p_buyer_id, 0, v_rec_amt, p_sale_date, 
            'Payment Received - Sale #' || v_bill_no, 'receipt', v_bill_no::text, v_sale_id
        );

        -- Ledger: Debit Cash/Bank (Increase Asset)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date, 
            description, transaction_type, reference_no, reference_id
        ) VALUES (
            p_organization_id, v_pay_v_id, v_cash_bank_id, v_rec_amt, 0, p_sale_date, 
            'Payment Deposit - Sale #' || v_bill_no, 'receipt', v_bill_no::text, v_sale_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no,
        'payment_status', v_payment_status,
        'amount_received', COALESCE(p_amount_received, 0),
        'total_amount_inc_tax', v_total_inc_tax
    );

END;
$function$;
