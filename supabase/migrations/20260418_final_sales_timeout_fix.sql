-- Fixes the PosgreSQL Deadlock (FOR UPDATE) and JSON Parameter Mappings

DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    -- 1. Drop all previous overloads to prevent PostgREST PGRST202 errors
    FOR r IN (
        SELECT p.oid::regprocedure::text AS func_signature
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.proname = 'confirm_sale_transaction' AND n.nspname IN ('mandi', 'public')
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id       UUID,
    p_sale_date             DATE,
    p_buyer_id              UUID DEFAULT NULL,
    p_items                 JSONB DEFAULT '[]',
    p_total_amount          NUMERIC DEFAULT 0,
    p_header_discount       NUMERIC DEFAULT 0,
    p_discount_percent      NUMERIC DEFAULT 0,
    p_discount_amount       NUMERIC DEFAULT 0,
    p_payment_mode          TEXT DEFAULT 'cash',
    p_narration             TEXT DEFAULT NULL,
    p_cheque_no             TEXT DEFAULT NULL,
    p_cheque_number         TEXT DEFAULT NULL,
    p_cheque_date           DATE DEFAULT NULL,
    p_cheque_bank           TEXT DEFAULT NULL,
    p_bank_name             TEXT DEFAULT NULL,
    p_bank_account_id       UUID DEFAULT NULL,
    p_cheque_status         BOOLEAN DEFAULT FALSE,
    p_amount_received       NUMERIC DEFAULT 0,
    p_due_date              DATE DEFAULT NULL,
    p_market_fee            NUMERIC DEFAULT 0,
    p_nirashrit             NUMERIC DEFAULT 0,
    p_misc_fee              NUMERIC DEFAULT 0,
    p_loading_charges       NUMERIC DEFAULT 0,
    p_unloading_charges     NUMERIC DEFAULT 0,
    p_other_expenses        NUMERIC DEFAULT 0,
    p_gst_enabled           BOOLEAN DEFAULT FALSE,
    p_cgst_amount           NUMERIC DEFAULT 0,
    p_sgst_amount           NUMERIC DEFAULT 0,
    p_igst_amount           NUMERIC DEFAULT 0,
    p_gst_total             NUMERIC DEFAULT 0,
    p_place_of_supply       TEXT DEFAULT NULL,
    p_buyer_gstin           TEXT DEFAULT NULL,
    p_is_igst               BOOLEAN DEFAULT FALSE,
    p_idempotency_key       UUID DEFAULT NULL,
    p_created_by            UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, core, public
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
    -- 2. Idempotency Check (Stops duplicate network requests)
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales 
        WHERE idempotency_key = p_idempotency_key AND organization_id = p_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'idempotent', true);
        END IF;
    END IF;

    -- 3. Atomic Stock Deduction (NO FOR UPDATE DEADLOCKS)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := COALESCE((v_item.value->>'qty')::NUMERIC, (v_item.value->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item.value->>'rate')::NUMERIC, (v_item.value->>'rate_per_unit')::NUMERIC, 0);

        IF v_qty > 0 THEN
            UPDATE mandi.lots 
            SET current_qty = current_qty - v_qty,
                status = CASE WHEN current_qty - v_qty <= 0 THEN 'Sold' ELSE 'partial' END
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

    -- 4. Generate Invoice Number safely
    v_invoice_no := 'INV-' || TO_CHAR(p_sale_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0');

    -- 5. Determine Payment Status
    v_payment_status := CASE
        WHEN p_payment_mode IN ('udhaar', 'credit') THEN 'pending'
        WHEN COALESCE(p_amount_received, p_total_amount, v_total) >= COALESCE(p_total_amount, v_total) THEN 'paid'
        WHEN COALESCE(p_amount_received, 0) > 0 THEN 'partial'
        ELSE 'pending'
    END;

    -- 6. Insert Sale Record
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

    -- 7. Insert Line Items
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

GRANT EXECUTE ON FUNCTION mandi.confirm_sale_transaction TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
