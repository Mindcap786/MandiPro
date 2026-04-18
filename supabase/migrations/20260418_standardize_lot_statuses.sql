-- ============================================================================
-- MIGRATION: 20260418_standardize_lot_statuses.sql
-- PURPOSE: Fixes case-sensitivity issue causing stock items to disappear.
-- Extracted from direct MCP database hotfix.
-- ============================================================================

BEGIN;

-- 1. Standardize existing lot statuses to strictly lowercase
UPDATE mandi.lots
SET status = 'available'
WHERE status IN ('Available', 'active') AND current_qty > 0;

UPDATE mandi.lots
SET status = 'sold'
WHERE status IN ('Sold', 'sold') OR current_qty <= 0;

UPDATE mandi.lots
SET status = 'partial'
WHERE current_qty > 0 AND current_qty < initial_qty;

-- 2. Fix confirm_sale_transaction to strictly use lowercase 'sold' and 'partial'
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid,
    p_buyer_id uuid,
    p_sale_date date,
    p_items jsonb,
    p_total_amount numeric,
    p_payment_mode text,
    p_amount_received numeric,
    p_idempotency_key uuid DEFAULT NULL::uuid,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_bank_account_id uuid DEFAULT NULL::uuid,
    p_cheque_no text DEFAULT NULL::text,
    p_cheque_number text DEFAULT NULL::text,
    p_cheque_date date DEFAULT NULL::date,
    p_bank_name text DEFAULT NULL::text,
    p_cheque_bank text DEFAULT NULL::text,
    p_cheque_status text DEFAULT 'pending'::text,
    p_gst_enabled boolean DEFAULT false,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL::text,
    p_buyer_gstin text DEFAULT NULL::text,
    p_is_igst boolean DEFAULT false,
    p_discount_amount numeric DEFAULT 0,
    p_header_discount numeric DEFAULT 0,
    p_narration text DEFAULT NULL::text,
    p_due_date date DEFAULT NULL::date,
    p_created_by uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_sale_id       UUID;
    v_invoice_no    TEXT;
    v_item          RECORD;
    v_total         NUMERIC := 0;
    v_gst_total     NUMERIC := COALESCE(p_gst_total, p_cgst_amount + p_sgst_amount + p_igst_amount);
    v_fee_total     NUMERIC := COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + 
                               COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0);
    v_payment_status TEXT;
    v_qty           NUMERIC;
    v_rate          NUMERIC;
    v_updated_rows  INT;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales 
        WHERE idempotency_key = p_idempotency_key AND organization_id = p_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'idempotent', true);
        END IF;
    END IF;

    -- Atomic Stock Deduction
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := COALESCE((v_item.value->>'qty')::NUMERIC, (v_item.value->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item.value->>'rate')::NUMERIC, (v_item.value->>'rate_per_unit')::NUMERIC, 0);

        IF v_qty > 0 THEN
            UPDATE mandi.lots 
            SET current_qty = current_qty - v_qty,
                status = CASE WHEN current_qty - v_qty <= 0 THEN 'sold' ELSE 'partial' END
            WHERE id = (v_item.value->>'lot_id')::UUID
              AND organization_id = p_organization_id
              AND current_qty >= v_qty;

            GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
            
            IF v_updated_rows = 0 THEN
                RETURN jsonb_build_object('success', false, 'error', FORMAT('Insufficient stock or invalid lot for ID: %s', v_item.value->>'lot_id'));
            END IF;
        END IF;

        v_total := v_total + (v_qty * v_rate);
    END LOOP;

    -- Generate Invoice Number safely
    v_invoice_no := 'INV-' || TO_CHAR(p_sale_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0');

    -- Determine Payment Status
    v_payment_status := CASE
        WHEN p_payment_mode IN ('udhaar', 'credit') THEN 'pending'
        WHEN COALESCE(p_amount_received, p_total_amount, v_total) >= COALESCE(p_total_amount, v_total) THEN 'paid'
        WHEN COALESCE(p_amount_received, 0) > 0 THEN 'partial'
        ELSE 'pending'
    END;

    -- Insert Sale Record
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, invoice_no,
        subtotal, discount_amount, gst_total, gst_amount, total_amount,
        payment_mode, payment_status, paid_amount, balance_due,
        narration, cheque_no, cheque_date, bank_name, bank_account_id,
        cheque_status, amount_received, due_date,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        gst_enabled, cgst_amount, sgst_amount, igst_amount,
        place_of_supply, buyer_gstin, is_igst,
        status, idempotency_key, created_by
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, v_invoice_no,
        COALESCE(p_total_amount, v_total), COALESCE(p_discount_amount, p_header_discount, 0), 
        v_gst_total, v_gst_total, 
        COALESCE(p_total_amount, v_total) + v_fee_total + v_gst_total,
        p_payment_mode, v_payment_status, 
        COALESCE(p_amount_received, CASE WHEN p_payment_mode NOT IN ('udhaar', 'credit') THEN p_total_amount ELSE 0 END),
        GREATEST(0, COALESCE(p_total_amount, v_total) - COALESCE(p_amount_received, 0)),
        p_narration, COALESCE(p_cheque_no, p_cheque_number), p_cheque_date, COALESCE(p_bank_name, p_cheque_bank), p_bank_account_id,
        p_cheque_status, COALESCE(p_amount_received, 0), p_due_date,
        COALESCE(p_market_fee,0), COALESCE(p_nirashrit,0), COALESCE(p_misc_fee,0),
        COALESCE(p_loading_charges,0), COALESCE(p_unloading_charges,0), COALESCE(p_other_expenses,0),
        COALESCE(p_gst_enabled, FALSE), COALESCE(p_cgst_amount,0), COALESCE(p_sgst_amount,0), COALESCE(p_igst_amount,0),
        p_place_of_supply, p_buyer_gstin, COALESCE(p_is_igst, FALSE),
        'confirmed', p_idempotency_key, p_created_by
    ) RETURNING id INTO v_sale_id;

    -- Insert Line Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := COALESCE((v_item.value->>'qty')::NUMERIC, (v_item.value->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item.value->>'rate')::NUMERIC, (v_item.value->>'rate_per_unit')::NUMERIC, 0);
        
        IF v_qty > 0 THEN
            INSERT INTO mandi.sale_items (
                organization_id, sale_id, lot_id,
                qty, rate, amount, discount_amount, created_by
            ) VALUES (
                p_organization_id, v_sale_id, (v_item.value->>'lot_id')::UUID,
                v_qty, v_rate, (v_qty * v_rate),
                COALESCE((v_item.value->>'discount_amount')::NUMERIC, 0),
                p_created_by
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'invoice_no', v_invoice_no
    );
END;
$$;


-- 3. Fix create_mixed_arrival to strictly use lowercase 'available'
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(
    p_arrival jsonb,
    p_created_by uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_arrival_id UUID;
    v_party_id UUID;
    v_organization_id UUID;
    v_lot RECORD;
    v_lot_id UUID;
    v_advance_amount NUMERIC;
    v_idempotency_key UUID; 
    v_payment_id UUID;
BEGIN
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id := (p_arrival->>'party_id')::UUID;
    v_advance_amount := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    
    BEGIN
        v_idempotency_key := (p_arrival->>'idempotency_key')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_idempotency_key := NULL;
    END;

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required';
    END IF;

    IF v_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_arrival_id FROM mandi.arrivals 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true);
        END IF;
    END IF;

    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_type, arrival_date,
        vehicle_number, driver_name, driver_mobile,
        loaders_count, hire_charges, hamali_expenses, other_expenses,
        advance_amount, advance_payment_mode, reference_no, 
        idempotency_key, created_by
    ) VALUES (
        v_organization_id, v_party_id, p_arrival->>'arrival_type', (p_arrival->>'arrival_date')::DATE,
        p_arrival->>'vehicle_number', p_arrival->>'driver_name', p_arrival->>'driver_mobile',
        COALESCE((p_arrival->>'loaders_count')::INT, 0), COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, COALESCE(p_arrival->>'advance_payment_mode', 'cash'), p_arrival->>'reference_no',
        v_idempotency_key, p_created_by
    ) RETURNING id INTO v_arrival_id;

    FOR v_lot IN SELECT value FROM jsonb_array_elements(p_arrival->'items')
    LOOP
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id,
            lot_code, initial_qty, current_qty, unit, supplier_rate,
            commission_percent, status, created_by
        ) VALUES (
            v_organization_id, v_arrival_id, (v_lot.value->>'item_id')::UUID, v_party_id,
            COALESCE(v_lot.value->>'lot_code', 'LOT-' || COALESCE(p_arrival->>'reference_no', '') || '-' || substr(gen_random_uuid()::text, 1, 4)),
            (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, COALESCE(v_lot.value->>'unit', 'Box'), 
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0),
            COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0), 'available', p_created_by
        ) RETURNING id INTO v_lot_id;
    END LOOP;

    IF v_advance_amount > 0 AND v_idempotency_key IS NOT NULL AND v_party_id IS NOT NULL THEN
        INSERT INTO mandi.payments (
            organization_id, party_id, arrival_id, amount,
            payment_type, payment_mode, payment_date,
            reference_number, idempotency_key, created_by
        ) VALUES (
            v_organization_id, v_party_id, v_arrival_id, v_advance_amount,
            'payment', COALESCE(p_arrival->>'advance_payment_mode', 'cash'), (p_arrival->>'arrival_date')::DATE,
            p_arrival->>'reference_no', v_idempotency_key, p_created_by
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id);
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
