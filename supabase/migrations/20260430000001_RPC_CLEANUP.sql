-- ============================================================================
-- RPC CLEANUP (v6.0)
-- Migration: 20260430000001_RPC_CLEANUP.sql
-- 
-- GOAL: Remove all manual ledger posting from RPCs.
--       Let the triggers in 20260430000000 handle the accounting.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Redefine confirm_sale_transaction (REMOVES MANUAL POSTING)
-- ----------------------------------------------------------------------------
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
    p_amount_received numeric DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL,
    p_due_date date DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT FALSE,
    p_bank_name text DEFAULT NULL,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT FALSE,
    p_vehicle_number text DEFAULT NULL,
    p_book_no text DEFAULT NULL,
    p_lot_no text DEFAULT NULL,
    p_narration text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_gst_enabled boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_bill_no BIGINT;
    v_item RECORD;
    v_total_inc_tax NUMERIC;
    v_received NUMERIC := COALESCE(p_amount_received, 0);
BEGIN
    -- 1. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key;
        IF FOUND THEN RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'idempotent', true); END IF;
    END IF;

    -- 2. Generate Bill No
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;

    -- 3. Calculate Calculated Total for Status
    v_total_inc_tax := COALESCE(p_total_amount, 0) + COALESCE(p_gst_total, 0) + 
                       COALESCE(p_market_fee, 0) + COALESCE(p_nirashrit, 0) + 
                       COALESCE(p_misc_fee, 0) + COALESCE(p_loading_charges, 0) + 
                       COALESCE(p_unloading_charges, 0) + COALESCE(p_other_expenses, 0) - 
                       COALESCE(p_discount_amount, 0);

    -- 4. Insert Sale Header
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        amount_received, balance_due, payment_status, total_amount_inc_tax,
        idempotency_key, due_date, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount, vehicle_number, book_no, created_by
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, LOWER(p_payment_mode), p_total_amount, v_bill_no,
        COALESCE(p_market_fee, 0), COALESCE(p_nirashrit, 0), COALESCE(p_misc_fee, 0),
        COALESCE(p_loading_charges, 0), COALESCE(p_unloading_charges, 0), COALESCE(p_other_expenses, 0),
        v_received, GREATEST(v_total_inc_tax - v_received, 0),
        CASE WHEN v_received >= v_total_inc_tax - 0.01 THEN 'paid' WHEN v_received > 0 THEN 'partial' ELSE 'pending' END,
        v_total_inc_tax,
        p_idempotency_key, p_due_date, p_bank_account_id,
        COALESCE(p_cgst_amount, 0), COALESCE(p_sgst_amount, 0), COALESCE(p_igst_amount, 0), COALESCE(p_gst_total, 0),
        COALESCE(p_discount_percent, 0), COALESCE(p_discount_amount, 0), p_vehicle_number, p_book_no, p_created_by
    ) RETURNING id INTO v_sale_id;

    -- 5. Insert Items & Deduct Stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount)
        VALUES (v_sale_id, (v_item.value->>'lot_id')::UUID, (v_item.value->>'qty')::NUMERIC, (v_item.value->>'rate')::NUMERIC, (v_item.value->>'amount')::NUMERIC);
        
        UPDATE mandi.lots SET 
            current_qty = current_qty - (v_item.value->>'qty')::NUMERIC,
            status = CASE WHEN current_qty - (v_item.value->>'qty')::NUMERIC <= 0 THEN 'sold' ELSE 'partial' END
        WHERE id = (v_item.value->>'lot_id')::UUID;
    END LOOP;

    -- 6. Receipt Voucher (Optional - for payments)
    IF v_received > 0 THEN
        PERFORM mandi.create_voucher(
            p_organization_id, 'receipt', p_sale_date, v_received, 
            p_buyer_id, NULL, v_sale_id, 'Receipt against Bill #' || v_bill_no,
            p_payment_mode, p_bank_account_id, v_sale_id
        );
    END IF;

    -- [CRITICAL] NO MANUAL LEDGER INSERTIONS HERE.
    -- The trg_sync_sale_ledger trigger will fire automatically on the INSERT into mandi.sales.

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Redefine record_quick_purchase (REMOVES MANUAL POSTING)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.record_quick_purchase(
    p_organization_id uuid,
    p_supplier_id uuid,
    p_arrival_date date,
    p_arrival_type text,
    p_items jsonb,
    p_advance numeric DEFAULT 0,
    p_advance_payment_mode text DEFAULT 'credit'::text,
    p_advance_bank_account_id uuid DEFAULT NULL::uuid,
    p_advance_cheque_no text DEFAULT NULL::text,
    p_advance_cheque_date date DEFAULT NULL::date,
    p_advance_bank_name text DEFAULT NULL::text,
    p_advance_cheque_status boolean DEFAULT false,
    p_clear_instantly boolean DEFAULT false,
    p_created_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_arrival_id UUID;
    v_arrival_bill_no BIGINT;
    v_item RECORD;
    v_first_lot_id UUID;
    v_net_payable NUMERIC;
BEGIN
    -- 1. Insert Arrival Header
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_arrival_bill_no FROM mandi.arrivals WHERE organization_id = p_organization_id;
    
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_date, arrival_type, status, created_at, bill_no
    ) VALUES (
        p_organization_id, p_supplier_id, p_arrival_date, p_arrival_type, 'completed', NOW(), v_arrival_bill_no
    ) RETURNING id INTO v_arrival_id;

    -- 2. Insert Lots
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id uuid, qty numeric, unit text, rate numeric, 
        commission numeric, less_units numeric, lot_code text
    ) LOOP
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, lot_code, initial_qty, current_qty, 
            unit, supplier_rate, commission_percent, status, arrival_type, created_at, contact_id
        ) VALUES (
            p_organization_id, v_arrival_id, v_item.item_id, 
            COALESCE(v_item.lot_code, 'LOT-' || v_arrival_bill_no || '-' || substr(gen_random_uuid()::text, 1, 4)), 
            v_item.qty, v_item.qty, v_item.unit, v_item.rate, v_item.commission, 
            'active', p_arrival_type, NOW(), p_supplier_id
        ) RETURNING id INTO v_first_lot_id;
    END LOOP;

    -- 3. Advance Payment (Optional)
    IF p_advance > 0 THEN
        PERFORM mandi.create_voucher(
            p_organization_id, 'payment', p_arrival_date, p_advance,
            p_supplier_id, NULL, v_arrival_id, 'Advance for Arrival #' || v_arrival_bill_no,
            p_advance_payment_mode, p_advance_bank_account_id, NULL,
            p_advance_cheque_no, p_advance_cheque_date, 
            CASE WHEN p_advance_cheque_status THEN 'Cleared' ELSE 'Pending' END,
            0, p_created_by, v_arrival_id
        );
    END IF;

    -- [CRITICAL] NO MANUAL LEDGER INSERTIONS HERE.
    -- The trg_sync_arrival_ledger trigger will fire automatically on the INSERT into mandi.arrivals.

    RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'bill_no', v_arrival_bill_no);
END;
$$;

COMMIT;
