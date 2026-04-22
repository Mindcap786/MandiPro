-- 20260428000003_stabilize_invoice_metadata.sql
-- Goal: Add lot_no to mandi.sales and stabilize metadata propagation RPCs

-- 1. SCHEMA UPDATE
ALTER TABLE mandi.sales ADD COLUMN IF NOT EXISTS lot_no text;

-- 2. CLEAN UP LEGACY FUNCTIONS
-- Drop any conflicting public schema versions
DROP FUNCTION IF EXISTS public.commit_mandi_session(uuid);

-- Drop all overloaded versions of confirm_sale_transaction to clear ambiguity
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT oid FROM pg_proc WHERE proname = 'confirm_sale_transaction' AND pronamespace = 'mandi'::regnamespace)
    LOOP
        EXECUTE 'DROP FUNCTION mandi.confirm_sale_transaction(' || pg_get_function_identity_arguments(r.oid) || ')';
    END LOOP;
END $$;

-- 3. UPDATED RPC: confirm_sale_transaction
-- Aligned with frontend payload (p_cheque_no, p_bank_name)
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid,
    p_sale_date date,
    p_buyer_id uuid,
    p_items jsonb,
    p_total_amount numeric DEFAULT 0,
    p_header_discount numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_payment_mode text DEFAULT 'credit',
    p_narration text DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_bank_name text DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_amount_received numeric DEFAULT 0,
    p_due_date date DEFAULT NULL,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_gst_enabled boolean DEFAULT false,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT false,
    p_idempotency_key text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_vehicle_number text DEFAULT NULL,
    p_book_no text DEFAULT NULL,
    p_lot_no text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id uuid;
    v_item jsonb;
    v_bill_no bigint;
    v_contact_bill_no bigint;
BEGIN
    -- Check for existing idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key LIMIT 1;
        IF v_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'is_duplicate', true);
        END IF;
    END IF;

    -- Generate global bill number (MAX+1 logic)
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no 
    FROM mandi.sales 
    WHERE organization_id = p_organization_id;

    -- Generate contact-specific bill number
    IF p_buyer_id IS NOT NULL THEN
        v_contact_bill_no := mandi.get_next_contact_bill_no(p_organization_id, p_buyer_id, 'sale');
    END IF;

    -- Create Sales Header
    INSERT INTO mandi.sales (
        organization_id, sale_date, buyer_id, total_amount, bill_no, contact_bill_no, 
        payment_mode, narration, cheque_no, cheque_date, bank_name, bank_account_id, 
        cheque_status, amount_received, due_date, market_fee, nirashrit, misc_fee, 
        loading_charges, unloading_charges, other_expenses, status, payment_status, 
        gst_enabled, cgst_amount, sgst_amount, igst_amount, gst_total, place_of_supply, 
        buyer_gstin, is_igst, idempotency_key, created_by, vehicle_number, book_no, lot_no
    ) VALUES (
        p_organization_id, p_sale_date, p_buyer_id, p_total_amount, v_bill_no, v_contact_bill_no,
        p_payment_mode, p_narration, p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        p_cheque_status, p_amount_received, p_due_date, p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses, 'completed',
        CASE WHEN p_amount_received >= p_total_amount THEN 'paid' WHEN p_amount_received > 0 THEN 'partial' ELSE 'pending' END,
        p_gst_enabled, p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total, p_place_of_supply,
        p_buyer_gstin, p_is_igst, p_idempotency_key, p_created_by, p_vehicle_number, p_book_no, p_lot_no
    ) RETURNING id INTO v_sale_id;

    -- Create Sale Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO mandi.sale_items (
            sale_id, organization_id, item_id, lot_id, qty, rate, amount, unit, gst_rate, tax_amount, created_by
        ) VALUES (
            v_sale_id, p_organization_id, (v_item->>'item_id')::uuid, (v_item->>'lot_id')::uuid, 
            (v_item->>'qty')::numeric, (v_item->>'rate')::numeric, (v_item->>'amount')::numeric, 
            COALESCE(v_item->>'unit', 'Kg'), COALESCE((v_item->>'gst_rate')::numeric, 0), 
            COALESCE((v_item->>'tax_amount')::numeric, 0), p_created_by
        );

        -- Update Lot Quantity
        IF (v_item->>'lot_id') IS NOT NULL THEN
            UPDATE mandi.lots SET current_qty = current_qty - (v_item->>'qty')::numeric WHERE id = (v_item->>'lot_id')::uuid;
        END IF;
    END LOOP;

    PERFORM mandi.post_sale_ledger(v_sale_id);
    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
END;
$$;

-- 4. UPDATED RPC: commit_mandi_session
CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session           RECORD;
    v_farmer            RECORD;
    v_org_id            UUID;
    v_lot_prefix        TEXT;
    v_arrival_id        UUID;
    v_lot_id            UUID;
    v_bill_no           BIGINT;
    v_less_units_calc   NUMERIC;
    v_net_qty           NUMERIC;
    v_gross_amount      NUMERIC;
    v_less_amount       NUMERIC;
    v_net_amount        NUMERIC;
    v_commission_amount NUMERIC;
    v_net_payable       NUMERIC;
    v_total_net_qty     NUMERIC := 0;
    v_total_commission  NUMERIC := 0;
    v_total_purchase    NUMERIC := 0;
    v_sale_items_tmp    JSONB := '[]'::JSONB;
    v_final_sale_items  JSONB := '[]'::JSONB;
    v_item              JSONB;
    v_item_amount       NUMERIC := 0;
    v_sale_rate         NUMERIC := 0;
    v_buyer_sale_id     UUID;
    v_arrival_ids       UUID[] := '{}';
BEGIN
    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
    IF v_session.status = 'committed' THEN RAISE EXCEPTION 'Session already committed'; END IF;

    v_org_id := v_session.organization_id;
    v_lot_prefix := COALESCE(NULLIF(v_session.lot_no, ''), 'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD'));

    FOR v_farmer IN
        SELECT * FROM mandi.mandi_session_farmers WHERE session_id = p_session_id ORDER BY sort_order, created_at
    LOOP
        IF COALESCE(v_farmer.less_units, 0) > 0 THEN v_less_units_calc := v_farmer.less_units;
        ELSIF COALESCE(v_farmer.less_percent, 0) > 0 THEN v_less_units_calc := ROUND(v_farmer.qty * v_farmer.less_percent / 100.0, 3);
        ELSE v_less_units_calc := 0; END IF;

        v_net_qty := GREATEST(COALESCE(v_farmer.qty, 0) - v_less_units_calc, 0);
        v_gross_amount := ROUND(COALESCE(v_farmer.qty, 0) * COALESCE(v_farmer.rate, 0), 2);
        v_less_amount := ROUND(v_less_units_calc * COALESCE(v_farmer.rate, 0), 2);
        v_net_amount := ROUND(v_net_qty * COALESCE(v_farmer.rate, 0), 2);
        v_commission_amount := ROUND(v_net_amount * COALESCE(v_farmer.commission_percent, 0) / 100.0, 2);
        v_net_payable := ROUND(v_net_amount - v_commission_amount - COALESCE(v_farmer.loading_charges, 0) - COALESCE(v_farmer.other_charges, 0), 2);

        UPDATE mandi.mandi_session_farmers
        SET less_units = v_less_units_calc, net_qty = v_net_qty, gross_amount = v_gross_amount,
            less_amount = v_less_amount, net_amount = v_net_amount, commission_amount = v_commission_amount, net_payable = v_net_payable
        WHERE id = v_farmer.id;

        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.arrivals WHERE organization_id = v_org_id;

        INSERT INTO mandi.arrivals (
            organization_id, arrival_date, party_id, arrival_type, lot_prefix, vehicle_number, reference_no, bill_no, status, advance, advance_payment_mode
        ) VALUES (
            v_org_id, v_session.session_date, v_farmer.farmer_id, 'commission', v_lot_prefix, NULLIF(v_session.vehicle_no, ''), NULLIF(v_session.book_no, ''), v_bill_no, 'pending', 0, 'credit'
        ) RETURNING id INTO v_arrival_id;

        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id, lot_code, initial_qty, current_qty, gross_quantity, unit, supplier_rate, commission_percent, less_percent, less_units, packing_cost, loading_cost, farmer_charges, arrival_type, status, net_payable, payment_status
        ) VALUES (
            v_org_id, v_arrival_id, v_farmer.item_id, v_farmer.farmer_id, v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0'), v_net_qty, v_net_qty, v_farmer.qty, COALESCE(v_farmer.unit, 'Kg'), COALESCE(v_farmer.rate, 0), COALESCE(v_farmer.commission_percent, 0), COALESCE(v_farmer.less_percent, 0), v_less_units_calc, 0, COALESCE(v_farmer.loading_charges, 0), COALESCE(v_farmer.other_charges, 0), 'commission', 'active', GREATEST(v_net_payable, 0), 'pending'
        ) RETURNING id INTO v_lot_id;

        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;
        PERFORM mandi.post_arrival_ledger(v_arrival_id);

        v_total_net_qty := v_total_net_qty + v_net_qty;
        v_total_commission := v_total_commission + v_commission_amount;
        v_total_purchase := v_total_purchase + GREATEST(v_net_payable, 0);
        v_arrival_ids := array_append(v_arrival_ids, v_arrival_id);

        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object('lot_id', v_lot_id, 'item_id', v_farmer.item_id, 'qty', v_net_qty, 'unit', COALESCE(v_farmer.unit, 'Kg'));
    END LOOP;

    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := ROUND(COALESCE(v_session.buyer_payable, 0) - COALESCE(v_session.buyer_loading_charges, 0) - COALESCE(v_session.buyer_packing_charges, 0), 2);
        v_sale_rate := ROUND(v_item_amount / v_total_net_qty, 2);

        FOR v_item IN SELECT value FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (v_item || jsonb_build_object('rate', v_sale_rate, 'amount', ROUND((v_item->>'qty')::NUMERIC * v_sale_rate, 2)));
        END LOOP;

        SELECT (mandi.confirm_sale_transaction(
            p_organization_id := v_org_id, p_buyer_id := v_session.buyer_id, p_sale_date := v_session.session_date, 
            p_payment_mode := 'credit', p_total_amount := v_item_amount, p_items := v_final_sale_items, 
            p_loading_charges := COALESCE(v_session.buyer_loading_charges, 0), p_other_expenses := COALESCE(v_session.buyer_packing_charges, 0), 
            p_amount_received := 0, p_idempotency_key := 'mcs-' || p_session_id::TEXT,
            p_vehicle_number := v_session.vehicle_no, p_book_no := v_session.book_no, p_lot_no := v_session.lot_no
        ))->>'sale_id'::TEXT INTO v_buyer_sale_id;
    END IF;

    UPDATE mandi.mandi_sessions SET status = 'committed', buyer_sale_id = v_buyer_sale_id, total_purchase = v_total_purchase, total_commission = v_total_commission, updated_at = NOW() WHERE id = p_session_id;
    RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'purchase_bill_ids', to_jsonb(v_arrival_ids), 'sale_bill_id', v_buyer_sale_id, 'total_commission', v_total_commission, 'total_purchase', v_total_purchase, 'total_net_qty', v_total_net_qty);
END;
$$;
