-- ============================================================
-- STRICT PARTIAL PAYMENT STATUS CALCULATIONS
-- Migration: 20260421130000_strict_partial_payment_status.sql
-- Goal: 
-- 1. Fix Sales (confirm_sale_transaction) to use p_amount_received
--    for exact partial generation, and correctly flag as 'partial' or 'paid'.
-- 2. Fix Purchases (post_arrival_ledger) to use v_advance_total 
--    to accurately flag 'paid', 'partial', or 'pending' statuses.
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
    p_amount_received numeric DEFAULT NULL::numeric,
    p_idempotency_key text DEFAULT NULL,
    p_due_date date DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_bank_name text DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0
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
BEGIN
    -- 1. Get accounts
    SELECT id INTO v_sales_revenue_acc_id
    FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND code = '4001'
      AND type = 'income'
    LIMIT 1;

    IF v_sales_revenue_acc_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sales Revenue account not found');
    END IF;

    -- 2. Calculate totals
    v_gross_total := p_total_amount + p_market_fee + p_nirashrit + p_misc_fee
                     + p_loading_charges + p_unloading_charges + p_other_expenses;
    v_total_inc_tax := v_gross_total + p_gst_total;

    -- 3. FIX: Calculate Payment Status CORRECTLY based on amount received
    -- This logic should work for ALL payment modes (credit, cash, partial, etc.)
    -- NOT just instant payments
    v_payment_status := 'pending'; -- default to pending
    
    IF COALESCE(p_amount_received, 0) > 0 THEN
        -- Buyer paid something
        IF p_amount_received >= v_total_inc_tax THEN
            -- Buyer paid full amount or more
            v_payment_status := 'paid';
        ELSE
            -- Buyer paid partial amount
            v_payment_status := 'partial';
        END IF;
    ELSE
        -- No payment received - stays pending (e.g., UDHAAR/credit)
        v_payment_status := 'pending';
    END IF;

    -- Determine the textual status for the cheque purely for Vouchers tracking
    v_actual_cheque_status_text := CASE 
        WHEN p_payment_mode = 'cheque' AND p_cheque_status = true THEN 'Cleared'
        WHEN p_payment_mode = 'cheque' THEN 'Pending'
        ELSE NULL 
    END;

    -- 4. Create sale record
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date,
        total_amount, total_amount_inc_tax,
        payment_mode, payment_status,
        market_fee, nirashrit, misc_fee,
        loading_charges, unloading_charges, other_expenses,
        due_date,
        cheque_no, cheque_date, bank_name, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date,
        p_total_amount, v_total_inc_tax,
        p_payment_mode, 'pending', -- Hardcode pending initially to be updated below
        p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses,
        p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_idempotency_key
    ) RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- 5. Create sale items
    INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount, gst_amount)
    SELECT
        v_sale_id,
        (item->>'lot_id')::uuid,
        (item->>'qty')::numeric,
        (item->>'rate')::numeric,
        (item->>'amount')::numeric,
        (item->>'gst_amount')::numeric
    FROM jsonb_array_elements(p_items) AS item;

    -- 6. Create SINGLE goods transaction (voucher)
    SELECT COALESCE(MAX(voucher_no), 0) + 1
    INTO v_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = p_organization_id AND type = 'sale';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration,
        invoice_id, party_id, payment_mode, cheque_no, cheque_date,
        cheque_status, bank_account_id
    ) VALUES (
        p_organization_id, p_sale_date, 'sale', v_voucher_no, v_total_inc_tax,
        'Sale #' || v_bill_no,
        v_sale_id, p_buyer_id, p_payment_mode, p_cheque_no, p_cheque_date,
        v_actual_cheque_status_text, p_bank_account_id
    ) RETURNING id INTO v_voucher_id;

    -- 7. Auto-Generate Receipt for INSTANT PAYMENTS (Cash, UPI, Instantly Cleared Cheques)
    IF p_payment_mode IN ('cash', 'upi', 'UPI/BANK', 'bank_transfer') OR (p_payment_mode = 'cheque' AND p_cheque_status = true) THEN
        DECLARE
            v_payment_voucher_no BIGINT;
            v_payment_voucher_id UUID;
            v_cash_bank_acc_id UUID;
            v_receipt_amount NUMERIC := 0;
        BEGIN
            -- Detect exactly what amount was received. Default to total if it wasn't specified but was a cash transaction entirely.
            IF COALESCE(p_amount_received, 0) > 0 THEN
                v_receipt_amount := p_amount_received;
            ELSE
                v_receipt_amount := v_total_inc_tax;
            END IF;

            -- Calculate status mathematically based on how much was received!
            IF v_receipt_amount >= v_total_inc_tax THEN
                v_payment_status := 'paid';
            ELSE
                v_payment_status := 'partial';
            END IF;

            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_payment_voucher_no
            FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt';

            IF p_payment_mode = 'cash' THEN
                SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
            ELSE
                v_cash_bank_acc_id := p_bank_account_id;
            END IF;

            -- Safety default to cash account if bank account somehow wasn't provided
            IF v_cash_bank_acc_id IS NULL THEN
                SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
            END IF;

            IF v_cash_bank_acc_id IS NOT NULL THEN
                INSERT INTO mandi.vouchers (
                    organization_id, date, type, voucher_no, narration, amount,
                    contact_id, invoice_id, bank_account_id,
                    cheque_no, is_cleared, cleared_at, cheque_status
                ) VALUES (
                    p_organization_id, p_sale_date, 'receipt', v_payment_voucher_no,
                    'Instant Receipt - Sale #' || v_bill_no, v_receipt_amount,
                    p_buyer_id, v_sale_id, v_cash_bank_acc_id,
                    p_cheque_no, 
                    CASE WHEN p_payment_mode = 'cheque' THEN true ELSE false END, 
                    CASE WHEN p_payment_mode = 'cheque' THEN p_sale_date ELSE NULL END,
                    v_actual_cheque_status_text
                ) RETURNING id INTO v_payment_voucher_id;

                -- Credit Buyer (Decrease Receivables)
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id
                ) VALUES (
                    p_organization_id, v_payment_voucher_id, p_buyer_id, 0, v_receipt_amount, p_sale_date,
                    'Payment Received', 'receipt', v_bill_no::text, v_sale_id
                );

                -- Debit Bank/Cash (Asset decrease)
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id
                ) VALUES (
                    p_organization_id, v_payment_voucher_id, v_cash_bank_acc_id, v_receipt_amount, 0, p_sale_date,
                    'Payment Deposit', 'receipt', v_bill_no::text, v_sale_id
                );
            END IF;
        END;
    END IF;

    -- 8. Finalize Sale Record Status
    UPDATE mandi.sales
    SET payment_status = v_payment_status,
        is_cheque_cleared = CASE WHEN p_payment_mode = 'cheque' THEN p_cheque_status ELSE false END
    WHERE id = v_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no,
        'payment_status', v_payment_status,
        'message', 'Sale created. Payment status: ' || v_payment_status
    );
END;
$function$;

-- ============================================================
-- PURCHASE POST ARRIVAL LEDGER
-- ============================================================
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_lot RECORD;
    v_org_id UUID;
    v_party_id UUID;
    v_grand_total NUMERIC := 0;
    v_arrival_date DATE;
    v_lot_count INT := 0;
    
    v_purchase_acc_id UUID;
    v_misc_acc_id UUID;
    v_freight_acc_id UUID;
    v_unloading_acc_id UUID;
    v_cash_acc_id UUID;
    v_cheque_issued_acc_id UUID;
    
    v_main_voucher_id UUID;
    v_voucher_no BIGINT;
    v_bill_no TEXT;
    
    v_adv RECORD;
    
    v_total_advance NUMERIC := 0;
    v_final_status TEXT := 'pending';
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Arrival not found'); END IF;

    v_org_id := v_arrival.organization_id;
    v_arrival_date := v_arrival.arrival_date;
    v_party_id := COALESCE(v_arrival.supplier_id, v_arrival.farmer_id);
    v_bill_no := COALESCE(v_arrival.contact_bill_no::text, v_arrival.bill_no::text);

    -- 1. Gather all required standard accounts dynamically
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' AND type = 'expense' LIMIT 1;
    SELECT id INTO v_misc_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5004' AND type = 'expense' LIMIT 1;
    SELECT id INTO v_freight_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5002' AND type = 'expense' LIMIT 1;
    SELECT id INTO v_unloading_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5003' AND type = 'expense' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '1001' AND type = 'asset' LIMIT 1;
    SELECT id INTO v_cheque_issued_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '2004' AND type = 'liability' LIMIT 1;

    -- 2. Verify all accounts exist
    IF v_purchase_acc_id IS NULL OR v_misc_acc_id IS NULL OR v_freight_acc_id IS NULL OR 
       v_unloading_acc_id IS NULL OR v_cash_acc_id IS NULL OR v_cheque_issued_acc_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'One or more required system accounts missing.');
    END IF;

    -- ─── 3. Pre-calculate Grand Total & Validate Lots ───────
    FOR v_lot IN
        SELECT l.*, p.name as product_name
        FROM mandi.lots l
        LEFT JOIN mandi.products p ON l.product_id = p.id
        WHERE l.arrival_id = p_arrival_id AND COALESCE(l.amount, 0) > 0
    LOOP
        v_lot_count := v_lot_count + 1;
        
        v_grand_total := v_grand_total + v_lot.amount;
        
        IF v_lot.market_fee > 0 THEN v_grand_total := v_grand_total + v_lot.market_fee; END IF;
        IF v_lot.niranshrit > 0 THEN v_grand_total := v_grand_total + v_lot.niranshrit; END IF;
        IF v_lot.misc_fee > 0 THEN v_grand_total := v_grand_total + v_lot.misc_fee; END IF;
        IF v_lot.freight > 0 THEN v_grand_total := v_grand_total + v_lot.freight; END IF;
        IF v_lot.unloading_charges > 0 THEN v_grand_total := v_grand_total + v_lot.unloading_charges; END IF;
        IF v_lot.gst_amount > 0 THEN v_grand_total := v_grand_total + v_lot.gst_amount; END IF;
    END LOOP;

    IF v_lot_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No valid priced lots found. Cannot post to ledger.');
    END IF;

    -- ─── 4. Create ONE main Voucher for the entire Arrival ───────
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no 
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers
        (organization_id, date, type, voucher_no, arrival_id, party_id, amount, narration)
    VALUES
        (v_org_id, v_arrival_date, 'purchase', v_voucher_no, p_arrival_id, v_party_id, v_grand_total, 'Arrival Purchase #' || v_bill_no)
    RETURNING id INTO v_main_voucher_id;

    -- ─── 5. Record Itemized Sub-Ledger Entries (Goods coming in) ───────
    FOR v_lot IN
        SELECT l.*, p.name as product_name
        FROM mandi.lots l
        LEFT JOIN mandi.products p ON l.product_id = p.id
        WHERE l.arrival_id = p_arrival_id AND COALESCE(l.amount, 0) > 0
    LOOP
        -- Dr Purchases / Goods
        INSERT INTO mandi.ledger_entries
            (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_purchase_acc_id,
                v_lot.amount, 0, v_arrival_date,
                v_lot.qty || ' ' || COALESCE(v_lot.unit, 'units') || ' ' || COALESCE(v_lot.product_name, 'Items'), 
                'purchase', v_bill_no, p_arrival_id);
        
        -- Cr Supplier/Farmer
        IF v_party_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries
                (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id,
                    0, v_lot.amount, v_arrival_date,
                    'Items Purchased: ' || v_lot.qty || ' ' || COALESCE(v_lot.unit, 'units') || ' ' || COALESCE(v_lot.product_name, 'Items'), 
                    'purchase', v_bill_no, p_arrival_id);
        END IF;

        -- Record Expenses dynamically if greater than 0
        IF v_lot.misc_fee > 0 THEN
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id) 
            VALUES (v_org_id, v_main_voucher_id, v_misc_acc_id, v_lot.misc_fee, 0, v_arrival_date, 'Misc Fee', 'purchase', v_bill_no, p_arrival_id);
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id) 
                VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_lot.misc_fee, v_arrival_date, 'Misc Fee', 'purchase', v_bill_no, p_arrival_id);
            END IF;
        END IF;

        IF v_lot.freight > 0 THEN
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id) 
            VALUES (v_org_id, v_main_voucher_id, v_freight_acc_id, v_lot.freight, 0, v_arrival_date, 'Freight Charges', 'purchase', v_bill_no, p_arrival_id);
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id) 
                VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_lot.freight, v_arrival_date, 'Freight Charges', 'purchase', v_bill_no, p_arrival_id);
            END IF;
        END IF;

        IF v_lot.unloading_charges > 0 THEN
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id) 
            VALUES (v_org_id, v_main_voucher_id, v_unloading_acc_id, v_lot.unloading_charges, 0, v_arrival_date, 'Unloading Charges', 'purchase', v_bill_no, p_arrival_id);
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id) 
                VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_lot.unloading_charges, v_arrival_date, 'Unloading Charges', 'purchase', v_bill_no, p_arrival_id);
            END IF;
        END IF;
    END LOOP;

    -- ─── 6. Handle Advances (all arrival types) under same Purchase Voucher ───────
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
            DECLARE
                v_contra_id UUID;
            BEGIN
                v_contra_id := CASE WHEN v_adv.mode = 'cheque' THEN v_cheque_issued_acc_id ELSE v_cash_acc_id END;
                
                v_total_advance := v_total_advance + v_adv.total_adv;

                IF v_party_id IS NOT NULL THEN
                    -- Dr Party (reduces their payable balance)
                    INSERT INTO mandi.ledger_entries
                        (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                    VALUES (v_org_id, v_main_voucher_id, v_party_id,
                            v_adv.total_adv, 0, v_arrival_date,
                            'Advance Paid (' || v_adv.mode || ')', 'purchase', p_arrival_id);
                END IF;

                -- Cr Cash/Cheque (money went out)
                INSERT INTO mandi.ledger_entries
                    (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_contra_id,
                        0, v_adv.total_adv, v_arrival_date,
                        'Advance Contra (' || v_adv.mode || ')', 'purchase', p_arrival_id);
            END;
        END LOOP;
    END IF;

    -- ─── 7. Calculate exact mathematical state (Paid / Partial / Pending) ───────
    IF v_total_advance >= v_grand_total AND v_grand_total > 0 THEN
        v_final_status := 'paid';
    ELSIF v_total_advance > 0 THEN
        v_final_status := 'partial';
    ELSE
        v_final_status := 'pending';
    END IF;

    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.purchase_bills SET payment_status = v_final_status WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id);

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status, 'message', 'Arrival recorded. Payment status: ' || v_final_status);
END;
$function$;
