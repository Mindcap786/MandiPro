-- ============================================================
-- RICH LEDGER DESCRIPTIONS FOR SALES AND PURCHASES
-- ============================================================
-- This migration updates the primary transaction functions to include 
-- exact items, lot numbers, quantities, and breakdown of charges 
-- in the ledger descriptions.
-- ============================================================

BEGIN;

-- 1. UPDATE confirm_sale_transaction to include dynamic descriptions
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid,uuid,date,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,date,uuid,text,date,boolean,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,boolean);

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   uuid,
    p_buyer_id          uuid,
    p_sale_date         date,
    p_payment_mode      text,
    p_total_amount      numeric,
    p_items             jsonb,
    p_market_fee        numeric  DEFAULT 0,
    p_nirashrit         numeric  DEFAULT 0,
    p_misc_fee          numeric  DEFAULT 0,
    p_loading_charges   numeric  DEFAULT 0,
    p_unloading_charges numeric  DEFAULT 0,
    p_other_expenses    numeric  DEFAULT 0,
    p_amount_received   numeric  DEFAULT NULL,
    p_idempotency_key   text     DEFAULT NULL,
    p_due_date          date     DEFAULT NULL,
    p_bank_account_id   uuid     DEFAULT NULL,
    p_cheque_no         text     DEFAULT NULL,
    p_cheque_date       date     DEFAULT NULL,
    p_cheque_status     boolean  DEFAULT false,
    p_bank_name         text     DEFAULT NULL,
    p_cgst_amount       numeric  DEFAULT 0,
    p_sgst_amount       numeric  DEFAULT 0,
    p_igst_amount       numeric  DEFAULT 0,
    p_gst_total         numeric  DEFAULT 0,
    p_discount_percent  numeric  DEFAULT 0,
    p_discount_amount   numeric  DEFAULT 0,
    p_place_of_supply   text     DEFAULT NULL,
    p_buyer_gstin       text     DEFAULT NULL,
    p_is_igst           boolean  DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_sale_id            UUID;
    v_bill_no            BIGINT;
    v_contact_bill_no    BIGINT;
    v_voucher_id         UUID;
    v_receipt_voucher_id UUID;
    v_item               JSONB;
    v_qty                NUMERIC;
    v_rate               NUMERIC;
    v_total_inc_tax      NUMERIC;
    v_ar_acc_id              UUID;
    v_sales_revenue_acc_id   UUID;
    v_cash_acc_id            UUID;
    v_bank_acc_id            UUID;
    v_cheques_transit_acc_id UUID;
    v_payment_acc_id         UUID;
    v_mode_lower      TEXT    := LOWER(COALESCE(p_payment_mode, ''));
    v_payment_status  TEXT;
    v_received        NUMERIC := 0;
    v_next_voucher_no BIGINT;
    v_rec             RECORD;
    
    -- Description variables
    v_item_details    TEXT := '';
    v_temp_lot_no     TEXT;
    v_temp_item_name  TEXT;
    v_charges_total   NUMERIC;
    v_sale_narration  TEXT;
    v_receipt_narration TEXT;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        FOR v_rec IN (SELECT id, bill_no, contact_bill_no, payment_status, amount_received
                      FROM mandi.sales WHERE idempotency_key = p_idempotency_key LIMIT 1) LOOP
            RETURN jsonb_build_object('success', true, 'sale_id', v_rec.id, 'bill_no', v_rec.bill_no,
                'contact_bill_no', v_rec.contact_bill_no, 'payment_status', v_rec.payment_status,
                'amount_received', v_rec.amount_received, 'message', 'Idempotent request ignored');
        END LOOP;
    END IF;

    v_ar_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1100' OR account_sub_type = 'accounts_receivable') ORDER BY (code = '1100') DESC LIMIT 1);
    v_sales_revenue_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '4001' OR name ILIKE 'Sales%Revenue%' OR name ILIKE 'Sale%') ORDER BY (code = '4001') DESC LIMIT 1);
    v_cash_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1001' OR account_sub_type = 'cash' OR name ILIKE 'Cash%') ORDER BY (code = '1001') DESC LIMIT 1);

    IF p_bank_account_id IS NOT NULL THEN
        v_bank_acc_id := p_bank_account_id;
    ELSE
        v_bank_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1002' OR account_sub_type = 'bank' OR name ILIKE 'Bank%') ORDER BY (code = '1002') DESC LIMIT 1);
    END IF;

    v_cheques_transit_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (account_sub_type IN ('cheque','cheques_in_transit') OR name ILIKE '%Cheque%') LIMIT 1);

    IF v_ar_acc_id IS NULL THEN v_ar_acc_id := v_cash_acc_id; END IF;
    IF v_sales_revenue_acc_id IS NULL THEN v_sales_revenue_acc_id := v_cash_acc_id; END IF;
    IF v_cash_acc_id IS NULL THEN RAISE EXCEPTION 'SETUP_ERROR: Cash account not found. Create a Cash account with code 1001.'; END IF;

    v_total_inc_tax := ROUND((COALESCE(p_total_amount,0) + COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0) + COALESCE(p_gst_total,0) - COALESCE(p_discount_amount,0))::NUMERIC, 2);

    IF v_mode_lower IN ('cash','upi','bank_transfer','upi_cash','bank_upi','upi/bank','neft','rtgs') THEN
        IF p_amount_received IS NOT NULL AND p_amount_received < (v_total_inc_tax - 0.01) THEN
            v_payment_status := 'partial'; v_received := p_amount_received;
        ELSE
            v_payment_status := 'paid'; v_received := COALESCE(p_amount_received, v_total_inc_tax);
        END IF;
    ELSIF v_mode_lower = 'cheque' THEN
        v_payment_status := CASE WHEN p_cheque_status THEN 'paid' ELSE 'pending' END; v_received := CASE WHEN p_cheque_status THEN COALESCE(p_amount_received, v_total_inc_tax) ELSE 0 END;
    ELSIF v_mode_lower IN ('udhaar','credit') THEN
        v_payment_status := 'pending'; v_received := 0;
    ELSIF COALESCE(p_amount_received, 0) > 0 THEN
        v_payment_status := CASE WHEN p_amount_received >= (v_total_inc_tax - 0.01) THEN 'paid' ELSE 'partial' END; v_received := p_amount_received;
    ELSE
        v_payment_status := 'pending'; v_received := 0;
    END IF;

    FOR v_rec IN (
        WITH new_sale AS (
            INSERT INTO mandi.sales (
                organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
                payment_mode, payment_status, amount_received,
                market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
                due_date, cheque_no, cheque_date, bank_name, bank_account_id,
                cgst_amount, sgst_amount, igst_amount, gst_total,
                discount_percent, discount_amount, place_of_supply, buyer_gstin, idempotency_key
            ) VALUES (
                p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
                p_payment_mode, v_payment_status, v_received,
                COALESCE(p_market_fee,0), COALESCE(p_nirashrit,0), COALESCE(p_misc_fee,0),
                COALESCE(p_loading_charges,0), COALESCE(p_unloading_charges,0), COALESCE(p_other_expenses,0),
                p_due_date, p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
                COALESCE(p_cgst_amount,0), COALESCE(p_sgst_amount,0), COALESCE(p_igst_amount,0), COALESCE(p_gst_total,0),
                COALESCE(p_discount_percent,0), COALESCE(p_discount_amount,0),
                p_place_of_supply, p_buyer_gstin, p_idempotency_key
            ) RETURNING id, bill_no, contact_bill_no
        )
        SELECT * FROM new_sale
    ) LOOP
        v_sale_id := v_rec.id; v_bill_no := v_rec.bill_no; v_contact_bill_no := v_rec.contact_bill_no;
    END LOOP;

    -- Build rich description
    FOR v_item IN (SELECT value FROM jsonb_array_elements(p_items)) LOOP
        v_qty  := COALESCE((v_item->>'qty')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'rate_per_unit')::NUMERIC, 0);
        
        IF (v_item->>'lot_id') IS NOT NULL THEN
            v_temp_lot_no := (SELECT COALESCE(lot_number, lot_code) FROM mandi.lots WHERE id = (v_item->>'lot_id')::UUID);
            v_temp_item_name := (SELECT items.name FROM mandi.items items JOIN mandi.lots lots ON lots.item_id = items.id WHERE lots.id = (v_item->>'lot_id')::UUID);
            v_item_details := v_item_details || COALESCE(v_temp_item_name,'Item') || ' (Lot: ' || COALESCE(v_temp_lot_no,'') || ', Qty: ' || v_qty ||'); ';
        END IF;

        IF v_qty > 0 THEN
            INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount, organization_id)
            VALUES (v_sale_id, CASE WHEN (v_item->>'lot_id') IS NOT NULL THEN (v_item->>'lot_id')::UUID ELSE NULL END, v_qty, v_rate, ROUND(v_qty * v_rate, 2), p_organization_id);
            IF (v_item->>'lot_id') IS NOT NULL THEN
                UPDATE mandi.lots SET current_qty = ROUND(COALESCE(current_qty,0) - v_qty, 3) WHERE id = (v_item->>'lot_id')::UUID;
            END IF;
        END IF;
    END LOOP;
    
    v_charges_total := COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0) + COALESCE(p_gst_total,0);
    v_sale_narration := 'Sale Bill #' || v_bill_no || ' (' || COALESCE(p_payment_mode,'Cash') || ')';
    IF LENGTH(v_item_details) > 0 THEN v_sale_narration := v_sale_narration || ' | Items: ' || v_item_details; END IF;
    IF v_charges_total > 0 THEN v_sale_narration := v_sale_narration || ' | Charges: ₹' || v_charges_total; END IF;
    IF COALESCE(p_discount_amount,0) > 0 THEN v_sale_narration := v_sale_narration || ' | Discount: ₹' || p_discount_amount; END IF;

    v_next_voucher_no := (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale');

    FOR v_rec IN (
        WITH new_voucher AS (
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id)
            VALUES (p_organization_id, p_sale_date, 'sale', v_next_voucher_no, v_total_inc_tax, v_sale_narration, v_sale_id) RETURNING id
        ) SELECT * FROM new_voucher
    ) LOOP v_voucher_id := v_rec.id; END LOOP;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES 
    (p_organization_id, v_voucher_id, v_ar_acc_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, v_sale_narration, 'sale', v_sale_id),
    (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, NULL, 0, v_total_inc_tax, p_sale_date, v_sale_narration, 'sale', v_sale_id);

    IF v_received > 0 AND v_mode_lower NOT IN ('udhaar','credit') THEN
        v_payment_acc_id := CASE
            WHEN v_mode_lower IN ('cash','upi','upi_cash','bank_upi','upi/bank') THEN v_cash_acc_id
            WHEN v_mode_lower IN ('bank_transfer','neft','rtgs') THEN COALESCE(v_bank_acc_id, v_cash_acc_id)
            WHEN v_mode_lower = 'cheque' THEN COALESCE(v_cheques_transit_acc_id, v_bank_acc_id, v_cash_acc_id)
            ELSE v_cash_acc_id END;

        v_receipt_narration := 'Payment on Sale #' || v_bill_no || ' (' || COALESCE(p_payment_mode,'') || ')';
        IF LENGTH(v_item_details) > 0 THEN v_receipt_narration := v_receipt_narration || ' | Items: ' || v_item_details; END IF;

        v_next_voucher_no := (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt');
        FOR v_rec IN (
            WITH new_receipt AS (
                INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id)
                VALUES (p_organization_id, p_sale_date, 'receipt', v_next_voucher_no, v_received, v_receipt_narration, v_sale_id) RETURNING id
            ) SELECT * FROM new_receipt
        ) LOOP v_receipt_voucher_id := v_rec.id; END LOOP;

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES
        (p_organization_id, v_receipt_voucher_id, v_payment_acc_id, NULL, v_received, 0, p_sale_date, v_receipt_narration, 'receipt', v_receipt_voucher_id),
        (p_organization_id, v_receipt_voucher_id, v_ar_acc_id, p_buyer_id, 0, v_received, p_sale_date, v_receipt_narration, 'receipt', v_receipt_voucher_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no, 'payment_status', v_payment_status, 'amount_received', v_received, 'voucher_id', v_voucher_id, 'receipt_voucher_id', v_receipt_voucher_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE);
END;
$$;


-- 2. UPDATE post_arrival_ledger to include dynamic descriptions
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_arrival RECORD; v_lot RECORD; v_org_id UUID; v_party_id UUID; v_arrival_date DATE; v_reference_no TEXT;
    v_purchase_acc_id UUID; v_expense_recovery_acc_id UUID; v_cash_acc_id UUID; v_commission_income_acc_id UUID; v_inventory_acc_id UUID;
    v_total_commission NUMERIC := 0; v_total_inventory NUMERIC := 0; v_total_transport NUMERIC := 0;
    v_main_voucher_id UUID; v_voucher_no BIGINT; v_gross_bill NUMERIC; v_total_advance_cleared NUMERIC := 0; v_final_status TEXT := 'pending';
    v_adv RECORD; v_contra_acc UUID; v_pend_vo_no BIGINT;
    
    -- Narrative variables
    v_lot_details TEXT := '';
    v_purchase_narration TEXT;
BEGIN
    SELECT a.*, c.name AS party_name INTO v_arrival FROM mandi.arrivals a LEFT JOIN mandi.contacts c ON a.party_id = c.id WHERE a.id = p_arrival_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival not found'); END IF;
    v_org_id := v_arrival.organization_id; v_party_id := v_arrival.party_id; v_arrival_date := v_arrival.arrival_date; v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);

    -- SAFE CLEANUP
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type = 'purchase';
    DELETE FROM mandi.ledger_entries WHERE reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id) AND transaction_type = 'purchase';
    DELETE FROM mandi.vouchers WHERE arrival_id = p_arrival_id AND type = 'purchase';

    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4002' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '1001' LIMIT 1;

    FOR v_lot IN SELECT lots.*, items.name AS item_name FROM mandi.lots lots LEFT JOIN mandi.items items ON lots.item_id = items.id WHERE arrival_id = p_arrival_id LOOP
        DECLARE 
            v_adj_qty NUMERIC := CASE WHEN COALESCE(v_lot.less_units, 0) > 0 THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0) ELSE COALESCE(v_lot.initial_qty, 0) * (1.0 - COALESCE(v_lot.less_percent, 0) / 100.0) END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            v_total_inventory := v_total_inventory + v_val;
            v_total_commission := v_total_commission + (v_val * COALESCE(v_lot.commission_percent, 0) / 100.0);
            v_lot_details := v_lot_details || COALESCE(v_lot.item_name,'Item') || ' (Lot: ' || COALESCE(v_lot.lot_code, v_lot.lot_number, '') || ', Qty: ' || v_adj_qty || '); ';
        END;
    END LOOP;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0);
    v_gross_bill := v_total_inventory;
    
    v_purchase_narration := 'Arrival Bill #' || v_reference_no;
    IF LENGTH(v_lot_details) > 0 THEN v_purchase_narration := v_purchase_narration || ' | Items: ' || v_lot_details; END IF;
    IF v_total_transport > 0 THEN v_purchase_narration := v_purchase_narration || ' | Transport/Hamali: ₹' || v_total_transport; END IF;
    IF COALESCE(v_arrival.amount_deducted, 0) > 0 THEN v_purchase_narration := v_purchase_narration || ' | Paid: ₹' || v_arrival.amount_deducted; END IF;

    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, arrival_id)
    VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no, v_purchase_narration, v_gross_bill, v_party_id, p_arrival_id) RETURNING id INTO v_main_voucher_id;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (v_org_id, v_main_voucher_id, v_purchase_acc_id, v_gross_bill, 0, v_arrival_date, v_purchase_narration, 'purchase', p_arrival_id);
    
    IF v_party_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_gross_bill, v_arrival_date, v_purchase_narration, 'purchase', p_arrival_id);
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_transport, 0, v_arrival_date, 'Transport Recovery for Bill #' || v_reference_no, 'purchase', p_arrival_id);
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery for Bill #' || v_reference_no, 'purchase', p_arrival_id);
        END IF;
    END IF;

    -- Handle Advances (Paid immediately)
    FOR v_adv IN SELECT COALESCE(advance_payment_mode, 'cash') AS mode, COALESCE(advance_cheque_status, false) AS chq_cleared, SUM(advance) AS total_adv FROM mandi.lots WHERE arrival_id = p_arrival_id AND advance > 0 GROUP BY 1, 2 LOOP
        IF v_adv.mode = 'cash' OR (v_adv.mode = 'cheque' AND v_adv.chq_cleared = true) THEN
            v_total_advance_cleared := v_total_advance_cleared + v_adv.total_adv;
            IF v_party_id IS NOT NULL THEN
                v_contra_acc := CASE WHEN v_adv.mode = 'cash' THEN v_cash_acc_id ELSE v_cash_acc_id END;
                SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_pend_vo_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';
                INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, party_id, amount, arrival_id, narration)
                VALUES (v_org_id, v_arrival_date, 'payment', v_pend_vo_no, v_party_id, v_adv.total_adv, p_arrival_id, 'Payment for Arrival Bill #' || v_reference_no || ' via Advance');
                INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES (v_org_id, v_main_voucher_id, v_party_id, v_adv.total_adv, 0, v_arrival_date, 'Payment for Arrival Bill #' || v_reference_no, 'payment', p_arrival_id);
                INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES (v_org_id, v_main_voucher_id, v_contra_acc, 0, v_adv.total_adv, v_arrival_date, 'Payment for Arrival Bill #' || v_reference_no, 'payment', p_arrival_id);
            END IF;
        END IF;
    END LOOP;

    IF v_total_advance_cleared >= (v_gross_bill - v_total_transport - 0.01) THEN v_final_status := 'paid';
    ELSIF v_total_advance_cleared > 0 THEN v_final_status := 'partial';
    ELSE v_final_status := 'pending'; END IF;

    UPDATE mandi.arrivals SET amount_deducted = v_total_advance_cleared, payment_status = v_final_status WHERE id = p_arrival_id;
    RETURN jsonb_build_object('success', true, 'message', 'Ledger posted successfully', 'purchase_voucher_id', v_main_voucher_id);
END;
$function$;

COMMIT;
