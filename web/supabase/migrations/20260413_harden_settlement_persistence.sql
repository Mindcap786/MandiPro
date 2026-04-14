-- ============================================================
-- FINANCIAL HARDENING: Settlement Persistence & Precision
-- Migration: 20260413_harden_settlement_persistence.sql
--
-- GOAL: 
-- 1. Eliminate "Virtual Data Drift" by persisting Farmer legs.
-- 2. Enforce absolute 2-decimal precision in all postings.
-- 3. Automatic generation of Purchase entries for Commission Lots.
-- ============================================================

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
    p_idempotency_key uuid DEFAULT NULL::uuid,
    p_due_date date DEFAULT NULL::date,
    p_bank_account_id uuid DEFAULT NULL::uuid,
    p_cheque_no text DEFAULT NULL::text,
    p_cheque_date date DEFAULT NULL::date,
    p_cheque_status boolean DEFAULT false,
    p_amount_received numeric DEFAULT 0,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id          uuid;
    v_voucher_id       uuid;
    v_receipt_voucher_id uuid;
    v_bill_no          bigint;
    v_item             jsonb;
    v_account_id       uuid;
    v_total_invoice    numeric;
    v_existing_sale_id uuid;
    v_payment_status   text;
    
    -- Intermediate Calculation Vars
    v_item_qty         numeric;
    v_item_rate        numeric;
    v_line_gross       numeric;
    
    -- Settlement Vars
    v_lot              record;
    v_farmer_id        uuid;
    v_commission_amount numeric;
    v_farmer_net       numeric;
    v_comm_acc_id      uuid;
    v_pur_acc_id       uuid;
    v_sales_acc_id     uuid;
    v_tax_acc_id       uuid;
BEGIN
    -- 1. Idempotency guard
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key;
        IF v_existing_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale_id, 'bill_no', (SELECT bill_no FROM mandi.sales WHERE id = v_existing_sale_id), 'message', 'Duplicate skipped');
        END IF;
    END IF;

    -- 2. Basic Validation
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'No items in sale transaction';
    END IF;

    -- 3. Determine Payment Status
    v_payment_status := CASE
        WHEN p_payment_mode IN ('cash', 'upi', 'bank_transfer', 'UPI/BANK', 'bank_upi') THEN 'paid'
        WHEN p_payment_mode IN ('cheque', 'CHEQUE') AND p_cheque_status = true THEN 'paid'
        ELSE 'pending'
    END;

    -- 4. Insert Sale Shell
    v_bill_no := core.next_sale_no(p_organization_id);
    
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        payment_status, idempotency_key, due_date,
        cheque_no, cheque_date, is_cheque_cleared,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, 
        ROUND(p_total_amount::NUMERIC, 2), v_bill_no,
        ROUND(COALESCE(p_market_fee, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_nirashrit, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_misc_fee, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_loading_charges, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_unloading_charges, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_other_expenses, 0)::NUMERIC, 2),
        v_payment_status, p_idempotency_key, p_due_date,
        p_cheque_no, p_cheque_date, p_cheque_status,
        ROUND(COALESCE(p_cgst_amount, 0), 2),
        ROUND(COALESCE(p_sgst_amount, 0), 2),
        ROUND(COALESCE(p_igst_amount, 0), 2),
        ROUND(COALESCE(p_gst_total, 0), 2),
        ROUND(COALESCE(p_discount_percent, 0), 2),
        ROUND(COALESCE(p_discount_amount, 0), 2)
    ) RETURNING id INTO v_sale_id;

    -- 5. Main Voucher (Sales Invoice)
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, invoice_id)
    VALUES (p_organization_id, p_sale_date, 'sales', core.next_voucher_no(p_organization_id), 'Sales Bill #' || v_bill_no, ROUND(p_total_amount, 2), v_sale_id)
    RETURNING id INTO v_voucher_id;

    -- Fetch Account IDs
    SELECT id INTO v_sales_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '4001' OR name ILIKE 'Sales%') LIMIT 1;
    SELECT id INTO v_pur_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '5001' OR name ILIKE 'Purchases%') LIMIT 1;
    SELECT id INTO v_comm_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '4002' OR name ILIKE 'Commission Income%') LIMIT 1;

    -- 6. Process Items (Buyer Side & Farmer Settlement Leg)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_item_qty    := ROUND((v_item->>'qty')::numeric, 3);
        v_item_rate   := ROUND((v_item->>'rate')::numeric, 2);
        v_line_gross  := ROUND(v_item_qty * v_item_rate, 2);

        INSERT INTO mandi.sale_items (organization_id, sale_id, lot_id, qty, rate, amount, unit)
        VALUES (p_organization_id, v_sale_id, (v_item->>'lot_id')::uuid, v_item_qty, v_item_rate, v_line_gross, v_item->>'unit');

        -- ACID Stock Update
        UPDATE mandi.lots SET current_qty = ROUND(current_qty - v_item_qty, 3) WHERE id = (v_item->>'lot_id')::uuid;
        
        -- Farmer Settlement Logic (The missing piece preventing Virtual Drift)
        SELECT * INTO v_lot FROM mandi.lots WHERE id = (v_item->>'lot_id')::uuid;
        v_farmer_id := v_lot.contact_id;

        IF v_farmer_id IS NOT NULL THEN
            -- Calculate Commission for this line item (Simplified for now, can be expanded for specific charges)
            v_commission_amount := ROUND(v_line_gross * (COALESCE(v_lot.commission_percent, 0) / 100.0), 2);
            v_farmer_net := v_line_gross - v_commission_amount;

            -- Cr Farmer (Settlement Owed)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, transaction_type, description, reference_no)
            VALUES (p_organization_id, v_voucher_id, v_farmer_id, 0, v_farmer_net, p_sale_date, 'purchase', 'Settlement for Sale #' || v_bill_no, v_bill_no::text);

            -- Dr Purchase/Cost (Business Expense)
            IF v_pur_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, description, reference_no)
                VALUES (p_organization_id, v_voucher_id, v_pur_acc_id, v_line_gross, 0, p_sale_date, 'purchase', 'Cost for Sale #' || v_bill_no, v_bill_no::text);
            END IF;

            -- Cr Commission Income (Revenue)
            IF v_comm_acc_id IS NOT NULL AND v_commission_amount > 0 THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, description, reference_no)
                VALUES (p_organization_id, v_voucher_id, v_comm_acc_id, 0, v_commission_amount, p_sale_date, 'income', 'Comm from Sale #' || v_bill_no, v_bill_no::text);
            END IF;
        END IF;

        IF v_lot.current_qty < 0 THEN
            RAISE EXCEPTION 'Insufficient stock in Lot %: Current %', v_lot.lot_code, v_lot.current_qty;
        END IF;
    END LOOP;

    -- 7. Buyer Side Postings
    v_total_invoice := ROUND((p_total_amount + COALESCE(p_market_fee, 0) + COALESCE(p_nirashrit, 0) + COALESCE(p_misc_fee, 0) + COALESCE(p_loading_charges, 0) + COALESCE(p_unloading_charges, 0) + COALESCE(p_other_expenses, 0) + COALESCE(p_gst_total, 0) - COALESCE(p_discount_amount, 0))::NUMERIC, 2);

    -- Dr Buyer
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, transaction_type, description, reference_no)
    VALUES (p_organization_id, v_voucher_id, p_buyer_id, v_total_invoice, 0, p_sale_date, 'sale', 'Sales Bill #' || v_bill_no, v_bill_no::text);

    -- Cr Sales
    IF v_sales_acc_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, description, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_sales_acc_id, 0, p_total_amount, p_sale_date, 'sale', 'Sales Revenue #' || v_bill_no, v_bill_no::text);
    END IF;

    -- 8. Receipt Processing (If Paid)
    IF v_payment_status = 'paid' THEN
        IF p_bank_account_id IS NOT NULL THEN
            v_account_id := p_bank_account_id;
        ELSIF p_payment_mode = 'cash' THEN
            SELECT id INTO v_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1001' OR account_sub_type = 'cash' OR name ILIKE 'Cash%') ORDER BY (code = '1001') DESC LIMIT 1;
        ELSE
            SELECT id INTO v_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1002' OR account_sub_type = 'bank' OR name ILIKE 'Bank%') ORDER BY (code = '1002') DESC LIMIT 1;
        END IF;

        IF v_account_id IS NOT NULL THEN
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, invoice_id, is_cleared)
            VALUES (p_organization_id, p_sale_date, 'receipt', core.next_voucher_no(p_organization_id), 'Payment for Bill #' || v_bill_no, v_total_invoice, v_sale_id, p_cheque_status OR p_payment_mode != 'cheque')
            RETURNING id INTO v_receipt_voucher_id;

            -- Dr Bank/Cash
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, description, reference_no)
            VALUES (p_organization_id, v_receipt_voucher_id, v_account_id, v_total_invoice, 0, p_sale_date, 'receipt', 'Payment for Bill #' || v_bill_no, v_bill_no::text);

            -- Cr Buyer (Payment)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, transaction_type, description, reference_no)
            VALUES (p_organization_id, v_receipt_voucher_id, p_buyer_id, 0, v_total_invoice, p_sale_date, 'receipt', 'Payment for Bill #' || v_bill_no, v_bill_no::text);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$function$;
