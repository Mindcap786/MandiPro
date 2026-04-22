-- Hardened Financial Standardization & RPC Synchronization
-- Date: 2026-04-22
-- Author: MandiPro ERP Architect

-- 1. Schema Fixes (Missing Columns for Financial Integrity)
ALTER TABLE mandi.arrivals 
ADD COLUMN IF NOT EXISTS advance_bank_account_id UUID REFERENCES mandi.accounts(id),
ADD COLUMN IF NOT EXISTS advance_cheque_no TEXT,
ADD COLUMN IF NOT EXISTS advance_cheque_date DATE,
ADD COLUMN IF NOT EXISTS advance_bank_name TEXT,
ADD COLUMN IF NOT EXISTS advance_cheque_status BOOLEAN DEFAULT false;

ALTER TABLE mandi.lots 
ADD COLUMN IF NOT EXISTS advance_bank_account_id UUID REFERENCES mandi.accounts(id),
ADD COLUMN IF NOT EXISTS advance_cheque_no TEXT,
ADD COLUMN IF NOT EXISTS advance_cheque_date DATE,
ADD COLUMN IF NOT EXISTS advance_bank_name TEXT,
ADD COLUMN IF NOT EXISTS advance_cheque_status BOOLEAN DEFAULT false;

-- 2. Hardened Sale Ledger Function
CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_org_id UUID;
    v_buyer_id UUID;
    v_sale_date DATE;
    v_bill_no BIGINT;
    v_voucher_id UUID;
    v_total_inc_tax NUMERIC;
    v_amount_received NUMERIC;
    v_ar_acc_id UUID;
    v_sales_revenue_acc_id UUID;
    v_liquid_acc_id UUID;
    v_narration TEXT;
    v_item_summary TEXT;
    v_payment_mode TEXT;
    v_bank_acc_id_header UUID;
BEGIN
    SELECT 
        organization_id, buyer_id, sale_date, bill_no, payment_mode, 
        amount_received, bank_account_id,
        (total_amount + gst_total + market_fee + nirashrit + misc_fee + loading_charges + unloading_charges + other_expenses - discount_amount)
    INTO v_org_id, v_buyer_id, v_sale_date, v_bill_no, v_payment_mode, 
         v_amount_received, v_bank_acc_id_header, v_total_inc_tax
    FROM mandi.sales WHERE id = p_sale_id;

    DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id AND transaction_type IN ('sale', 'sale_payment');
    DELETE FROM mandi.vouchers WHERE reference_id = p_sale_id AND type = 'sale';

    IF COALESCE(v_total_inc_tax,0) = 0 AND COALESCE(v_amount_received,0) = 0 THEN RETURN; END IF;

    SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Receivable%' OR code = '1200') LIMIT 1;
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Sales Revenue%' OR code = '4001') LIMIT 1;
    
    SELECT string_agg(COALESCE(c.name, 'Item') || ' (' || qty || ' ' || COALESCE(unit, '') || ')', ', ')
    INTO v_item_summary FROM mandi.sale_items si JOIN mandi.commodities c ON c.id = si.item_id WHERE si.sale_id = p_sale_id;

    v_narration := 'Sale Bill #' || v_bill_no || ' | ' || COALESCE(v_item_summary, 'Goods Sold');

    INSERT INTO mandi.vouchers (organization_id, date, type, amount, narration, reference_id, invoice_id)
    VALUES (v_org_id, v_sale_date, 'sale', v_total_inc_tax, v_narration, p_sale_id, p_sale_id)
    RETURNING id INTO v_voucher_id;

    IF v_total_inc_tax > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_buyer_id, v_ar_acc_id, v_total_inc_tax, 0, v_sale_date, v_narration, v_narration, 'sale', p_sale_id);
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_sales_revenue_acc_id, 0, v_total_inc_tax, v_sale_date, v_narration, v_narration, 'sale', p_sale_id);
    END IF;

    IF v_amount_received > 0 THEN
        IF v_payment_mode = 'cash' THEN
            SELECT id INTO v_liquid_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Cash%' OR account_sub_type = 'cash') LIMIT 1;
        ELSE
            v_liquid_acc_id := COALESCE(v_bank_acc_id_header, (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Bank%' OR account_sub_type = 'bank') LIMIT 1));
        END IF;

        IF v_liquid_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_liquid_acc_id, v_amount_received, 0, v_sale_date, 'Payment Received', v_narration, 'sale_payment', p_sale_id);
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_buyer_id, v_ar_acc_id, 0, v_amount_received, v_sale_date, 'Payment Received', v_narration, 'sale_payment', p_sale_id);
        END IF;
    END IF;
END;
$function$;

-- 3. Hardened Arrival Ledger Function
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_org_id UUID;
    v_party_id UUID;
    v_arrival_date DATE;
    v_bill_no BIGINT;
    v_voucher_id UUID;
    v_total_payable NUMERIC := 0;
    v_total_paid NUMERIC := 0;
    v_ap_acc_id UUID;
    v_purchase_acc_id UUID;
    v_liquid_acc_id UUID;
    v_narration TEXT;
    v_item_summary TEXT;
    v_header_expenses NUMERIC := 0;
    v_payment_mode TEXT;
    v_bank_acc_id_header UUID;
BEGIN
    SELECT 
        organization_id, party_id, arrival_date, bill_no, advance_amount, advance_payment_mode, advance_bank_account_id,
        COALESCE(transport_amount,0) + COALESCE(loading_amount,0) + COALESCE(packing_amount,0) + COALESCE(hamali_expenses,0) + COALESCE(other_expenses,0)
    INTO v_org_id, v_party_id, v_arrival_date, v_bill_no, v_total_paid, v_payment_mode, v_bank_acc_id_header, v_header_expenses
    FROM mandi.arrivals WHERE id = p_arrival_id;

    SELECT SUM(
        (initial_qty * supplier_rate) 
        - (initial_qty * supplier_rate * (COALESCE(commission_percent, 0) / 100.0)) 
        - COALESCE(farmer_charges, 0)
        - COALESCE(loading_cost, 0)
        - COALESCE(packing_cost, 0)
    ) INTO v_total_payable
    FROM mandi.lots WHERE arrival_id = p_arrival_id;

    v_total_payable := COALESCE(v_total_payable, 0) - v_header_expenses;

    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type IN ('arrival', 'arrival_advance');
    DELETE FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type = 'arrival';

    IF COALESCE(v_total_payable,0) = 0 AND COALESCE(v_total_paid,0) = 0 THEN RETURN; END IF;

    SELECT id INTO v_ap_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Payable%' OR code = '2100') LIMIT 1;
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Purchase%' OR code = '5001') LIMIT 1;
    
    SELECT string_agg(COALESCE(c.name, 'Item') || ' (' || initial_qty || ' ' || COALESCE(unit, '') || ')', ', ')
    INTO v_item_summary FROM mandi.lots l JOIN mandi.commodities c ON c.id = l.item_id WHERE l.arrival_id = p_arrival_id;

    v_narration := 'Arrival Bill #' || v_bill_no || ' | ' || COALESCE(v_item_summary, 'Goods Received');

    INSERT INTO mandi.vouchers (organization_id, date, type, amount, narration, reference_id)
    VALUES (v_org_id, v_arrival_date, 'arrival', v_total_payable, v_narration, p_arrival_id)
    RETURNING id INTO v_voucher_id;

    IF v_total_payable > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_purchase_acc_id, v_total_payable, 0, v_arrival_date, v_narration, v_narration, 'arrival', p_arrival_id);
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_party_id, v_ap_acc_id, 0, v_total_payable, v_arrival_date, v_narration, v_narration, 'arrival', p_arrival_id);
    END IF;

    IF v_total_paid > 0 THEN
        IF v_payment_mode = 'cash' THEN
            SELECT id INTO v_liquid_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Cash%' OR account_sub_type = 'cash') LIMIT 1;
        ELSE
            v_liquid_acc_id := COALESCE(v_bank_acc_id_header, (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Bank%' OR account_sub_type = 'bank') LIMIT 1));
        END IF;

        IF v_liquid_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_party_id, v_ap_acc_id, v_total_paid, 0, v_arrival_date, 'Purchase Payment', v_narration, 'arrival_advance', p_arrival_id);
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_liquid_acc_id, 0, v_total_paid, v_arrival_date, 'Purchase Payment', v_narration, 'arrival_advance', p_arrival_id);
        END IF;
    END IF;
END;
$function$;

-- 4. Standardized RPC: create_mixed_arrival (Fixing initial_qty and current_qty)
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(p_arrival jsonb, p_created_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_arrival_id UUID;
    v_party_id UUID;
    v_organization_id UUID;
    v_lot RECORD;
    v_lot_id UUID;
    v_advance_amount NUMERIC;
    v_advance_mode TEXT;
    v_idempotency_key UUID;
    v_lot_codes JSONB := '[]'::jsonb;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_arrival_type TEXT;
    v_header_location TEXT;
    v_item_location TEXT;
    v_commission_pct NUMERIC;
BEGIN
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id := (p_arrival->>'party_id')::UUID;
    v_advance_amount := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_advance_mode := COALESCE(p_arrival->>'advance_payment_mode', 'cash');
    v_arrival_type := COALESCE(p_arrival->>'arrival_type', 'commission');
    v_header_location := p_arrival->>'storage_location';

    IF v_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
    IF v_party_id IS NULL THEN RAISE EXCEPTION 'Supplier/Party is required.'; END IF;

    BEGIN v_idempotency_key := (p_arrival->>'idempotency_key')::UUID; EXCEPTION WHEN OTHERS THEN v_idempotency_key := NULL; END;
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_arrival_id FROM mandi.arrivals WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true); END IF;
    END IF;

    v_bill_no := mandi.get_internal_sequence(v_organization_id, 'bill_no');
    v_contact_bill_no := mandi.get_contact_sequence(v_party_id, v_arrival_type || '_bill');

    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_date, lot_prefix, reference_no, bill_no, contact_bill_no,
        num_lots, gross_qty, less_percent, less_units, net_qty,
        commission_percent, transport_amount, loading_amount, packing_amount,
        advance_amount, advance_payment_mode, advance_bank_account_id, advance_cheque_status,
        status, hire_charges, hamali_expenses, other_expenses,
        arrival_type, created_by, idempotency_key, driver_name, driver_mobile, vehicle_number
    ) VALUES (
        v_organization_id, v_party_id, COALESCE((p_arrival->>'entry_date')::DATE, CURRENT_DATE),
        p_arrival->>'lot_prefix', p_arrival->>'reference_no', v_bill_no, v_contact_bill_no,
        (p_arrival->>'loaders_count')::INTEGER, (p_arrival->>'gross_qty')::NUMERIC,
        COALESCE((p_arrival->>'less_percent')::NUMERIC, 0), COALESCE((p_arrival->>'less_units')::NUMERIC, 0), COALESCE((p_arrival->>'net_qty')::NUMERIC, (p_arrival->>'gross_qty')::NUMERIC),
        COALESCE((p_arrival->>'commission_percent')::NUMERIC, 0),
        COALESCE((p_arrival->>'transport_amount')::NUMERIC, 0), COALESCE((p_arrival->>'loading_amount')::NUMERIC, 0), COALESCE((p_arrival->>'packing_amount')::NUMERIC, 0),
        v_advance_amount, v_advance_mode, (p_arrival->>'advance_bank_account_id')::UUID, (p_arrival->>'advance_cheque_status')::BOOLEAN,
        'received', COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0), COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_arrival_type, p_created_by, v_idempotency_key, p_arrival->>'driver_name', p_arrival->>'driver_mobile', p_arrival->>'vehicle_number'
    ) RETURNING id INTO v_arrival_id;

    FOR v_lot IN SELECT * FROM jsonb_array_elements(p_arrival->'items') LOOP
        INSERT INTO mandi.lots (
            arrival_id, item_id, initial_qty, current_qty, unit, unit_weight, sale_price,
            supplier_rate, commission_percent, farmer_charges, packing_cost, loading_cost,
            less_percent, less_units, status, created_by, storage_location, barcode, custom_attributes
        ) VALUES (
            v_arrival_id, (v_lot.value->>'item_id')::UUID, (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, 
            v_lot.value->>'unit', COALESCE((v_lot.value->>'unit_weight')::NUMERIC, 0), COALESCE((v_lot.value->>'sale_price')::NUMERIC, 0),
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0), COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0), 
            COALESCE((v_lot.value->>'farmer_charges')::NUMERIC, 0), COALESCE((v_lot.value->>'packing_cost')::NUMERIC, 0), COALESCE((v_lot.value->>'loading_cost')::NUMERIC, 0),
            COALESCE((v_lot.value->>'less_percent')::NUMERIC, 0), COALESCE((v_lot.value->>'less_units')::NUMERIC, 0),
            'available', p_created_by, COALESCE(v_lot.value->>'storage_location', v_header_location), v_lot.value->>'barcode',
            COALESCE(v_lot.value->'custom_attributes', jsonb_build_object('variety', v_lot.value->>'variety', 'grade', v_lot.value->>'grade'))
        ) RETURNING id INTO v_lot_id;
    END LOOP;

    PERFORM mandi.post_arrival_ledger(v_arrival_id);
    RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'bill_no', v_bill_no);
END;
$function$;

-- 5. Status Synchronization Triggers
CREATE OR REPLACE FUNCTION mandi.update_sale_payment_status_from_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_total_paid NUMERIC;
    v_total_bill NUMERIC;
    v_new_status TEXT;
    v_ref_id UUID;
BEGIN
    v_ref_id := COALESCE(NEW.reference_id, OLD.reference_id);
    IF NOT EXISTS (SELECT 1 FROM mandi.sales WHERE id = v_ref_id) THEN RETURN NULL; END IF;
    SELECT COALESCE(SUM(credit), 0) INTO v_total_paid FROM mandi.ledger_entries WHERE reference_id = v_ref_id AND transaction_type IN ('sale_payment', 'receipt', 'payment');
    SELECT COALESCE(SUM(debit), 0) INTO v_total_bill FROM mandi.ledger_entries WHERE reference_id = v_ref_id AND transaction_type = 'sale';
    IF v_total_bill = 0 THEN v_new_status := 'pending';
    ELSIF v_total_paid >= (v_total_bill - 0.1) THEN v_new_status := 'paid';
    ELSIF v_total_paid > 0.1 THEN v_new_status := 'partial';
    ELSE v_new_status := 'pending';
    END IF;
    UPDATE mandi.sales SET payment_status = v_new_status, amount_received = v_total_paid, balance_due = (v_total_bill - v_total_paid) WHERE id = v_ref_id;
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS sale_payment_status_auto_update ON mandi.ledger_entries;
CREATE TRIGGER sale_payment_status_auto_update AFTER INSERT OR UPDATE OR DELETE ON mandi.ledger_entries FOR EACH ROW EXECUTE FUNCTION mandi.update_sale_payment_status_from_ledger();
