-- Phase 1: Database Schema & Logic Refinement
-- V13: Standardize Lot Codes and Metadata for Purchase + Sale module

-- 1. Add metadata columns to mandi.sales
ALTER TABLE mandi.sales ADD COLUMN IF NOT EXISTS vehicle_number TEXT;
ALTER TABLE mandi.sales ADD COLUMN IF NOT EXISTS book_no TEXT;
ALTER TABLE mandi.sales ADD COLUMN IF NOT EXISTS lot_no TEXT;

-- 2. Update mandi.confirm_sale_transaction
-- We recreate it with the new metadata parameters
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid,date,uuid,jsonb,numeric,numeric,numeric,numeric,text,text,text,date,text,uuid,boolean,numeric,date,numeric,numeric,numeric,numeric,numeric,numeric,boolean,numeric,numeric,numeric,numeric,text,text,boolean,text,uuid);

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
    p_cheque_number text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_bank text DEFAULT NULL,
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
    -- NEW METADATA PARAMS
    p_vehicle_number text DEFAULT NULL,
    p_book_no text DEFAULT NULL,
    p_lot_no text DEFAULT NULL
)
RETURNS uuid
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
            RETURN v_sale_id;
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
        organization_id,
        sale_date,
        buyer_id,
        total_amount,
        bill_no,
        contact_bill_no,
        payment_mode,
        narration,
        cheque_no,
        cheque_date,
        bank_name,
        bank_account_id,
        cheque_status,
        amount_received,
        due_date,
        market_fee,
        nirashrit,
        misc_fee,
        loading_charges,
        unloading_charges,
        other_expenses,
        status,
        payment_status,
        gst_enabled,
        cgst_amount,
        sgst_amount,
        igst_amount,
        gst_total,
        place_of_supply,
        buyer_gstin,
        is_igst,
        idempotency_key,
        created_by,
        -- NEW COLUMNS
        vehicle_number,
        book_no,
        lot_no
    ) VALUES (
        p_organization_id,
        p_sale_date,
        p_buyer_id,
        p_total_amount,
        v_bill_no,
        v_contact_bill_no,
        p_payment_mode,
        p_narration,
        p_cheque_number,
        p_cheque_date,
        p_cheque_bank,
        p_bank_account_id,
        p_cheque_status,
        p_amount_received,
        p_due_date,
        p_market_fee,
        p_nirashrit,
        p_misc_fee,
        p_loading_charges,
        p_unloading_charges,
        p_other_expenses,
        'completed',
        CASE 
            WHEN p_amount_received >= p_total_amount THEN 'paid'
            WHEN p_amount_received > 0 THEN 'partial'
            ELSE 'pending'
        END,
        p_gst_enabled,
        p_cgst_amount,
        p_sgst_amount,
        p_igst_amount,
        p_gst_total,
        p_place_of_supply,
        p_buyer_gstin,
        p_is_igst,
        p_idempotency_key,
        p_created_by,
        -- NEW VALUES
        p_vehicle_number,
        p_book_no,
        p_lot_no
    ) RETURNING id INTO v_sale_id;

    -- Create Sale Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO mandi.sale_items (
            sale_id,
            organization_id,
            item_id,
            lot_id,
            qty,
            rate,
            amount,
            unit,
            gst_rate,
            tax_amount,
            created_by
        ) VALUES (
            v_sale_id,
            p_organization_id,
            (v_item->>'item_id')::uuid,
            (v_item->>'lot_id')::uuid,
            (v_item->>'qty')::numeric,
            (v_item->>'rate')::numeric,
            (v_item->>'amount')::numeric,
            v_item->>'unit',
            COALESCE((v_item->>'gst_rate')::numeric, 0),
            COALESCE((v_item->>'tax_amount')::numeric, 0),
            p_created_by
        );

        -- Update Lot Quantity (Atomic Stock Update)
        IF (v_item->>'lot_id') IS NOT NULL THEN
            UPDATE mandi.lots
            SET current_qty = current_qty - (v_item->>'qty')::numeric
            WHERE id = (v_item->>'lot_id')::uuid;
        END IF;
    END LOOP;

    -- Trigger Financial Ledger Entries
    PERFORM mandi.post_sale_ledger(v_sale_id);

    RETURN v_sale_id;
END;
$$;

-- 3. Update mandi.commit_mandi_session
CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_session           RECORD;
    v_farmer            RECORD;
    v_org_id            UUID;
    v_lot_code          TEXT; -- renamed for clarity
    v_arrival_id        UUID;
    v_bill_no           BIGINT;
    v_net_qty           NUMERIC;
    v_total_net_qty     NUMERIC := 0;
    v_total_commission  NUMERIC := 0;
    v_total_purchase    NUMERIC := 0;
    v_item_amount       NUMERIC;
    v_sale_rate         NUMERIC;
    v_final_sale_items  JSONB := '[]'::JSONB;
    v_item              JSONB;
    v_sale_items_tmp    JSONB := '[]'::JSONB;
    v_lot_id            UUID;
    v_arrival_ids       UUID[] := '{}';
BEGIN
    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
    IF v_session.status = 'committed' THEN RAISE EXCEPTION 'Session already committed'; END IF;
    
    v_org_id := v_session.organization_id;
    
    -- CLEAN LOT CODE LOGIC: Use user input directly if provided, else generate default
    v_lot_code := COALESCE(NULLIF(v_session.lot_no, ''), 'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD'));

    FOR v_farmer IN SELECT * FROM mandi.mandi_session_farmers WHERE session_id = p_session_id ORDER BY sort_order ASC LOOP
        v_net_qty := GREATEST(v_farmer.qty - COALESCE(v_farmer.less_units, 0), 0);
        
        -- SEQUENTIAL BILL NO FOR ARRIVALS (MAX+1)
        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.arrivals WHERE organization_id = v_org_id;

        INSERT INTO mandi.arrivals (organization_id, arrival_date, party_id, arrival_type, lot_prefix, vehicle_number, reference_no, bill_no, status)
        VALUES (v_org_id, v_session.session_date, v_farmer.farmer_id, 'commission', v_lot_code, v_session.vehicle_no, v_session.book_no, v_bill_no, 'pending')
        RETURNING id INTO v_arrival_id;

        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, lot_code, contact_id, 
            initial_qty, current_qty, gross_quantity, unit, supplier_rate, 
            commission_percent, less_percent, less_units, 
            loading_cost, farmer_charges, variety, grade, 
            arrival_type, status,
            net_payable
        )
        VALUES (
            v_org_id, v_arrival_id, v_farmer.item_id, v_lot_code, v_farmer.farmer_id, -- REMOVED SUFFIX: Just v_lot_code
            v_net_qty, v_net_qty, v_farmer.qty, v_farmer.unit, v_farmer.rate, 
            v_farmer.commission_percent, v_farmer.less_percent, v_farmer.less_units, 
            v_farmer.loading_charges, v_farmer.other_charges, v_farmer.variety, v_farmer.grade, 
            'commission', 'active',
            COALESCE(v_farmer.net_payable, 0)
        )
        RETURNING id INTO v_lot_id;

        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
        
        v_total_net_qty := v_total_net_qty + v_net_qty;
        v_total_commission := v_total_commission + COALESCE(v_farmer.commission_amount, 0);
        v_total_purchase := v_total_purchase + COALESCE(v_farmer.net_amount, 0);
        v_arrival_ids := array_append(v_arrival_ids, v_arrival_id);
        
        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object('lot_id', v_lot_id, 'item_id', v_farmer.item_id, 'quantity', v_net_qty, 'unit', v_farmer.unit);
    END LOOP;

    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := v_session.buyer_payable - COALESCE(v_session.buyer_loading_charges, 0) - COALESCE(v_session.buyer_packing_charges, 0);
        v_sale_rate := CASE WHEN v_total_net_qty > 0 THEN ROUND(v_item_amount / v_total_net_qty, 2) ELSE 0 END;
        
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (v_item || jsonb_build_object('rate_per_unit', v_sale_rate, 'amount', ROUND((v_item->>'quantity')::NUMERIC * v_sale_rate, 2)));
        END LOOP;

        PERFORM mandi.confirm_sale_transaction(
            p_organization_id   := v_org_id,
            p_sale_date        := v_session.session_date,
            p_buyer_id         := v_session.buyer_id,
            p_items            := v_final_sale_items,
            p_total_amount     := v_item_amount,
            p_payment_mode     := 'credit',
            p_loading_charges  := COALESCE(v_session.buyer_loading_charges, 0),
            p_other_expenses   := COALESCE(v_session.buyer_packing_charges, 0),
            p_idempotency_key  := p_session_id::TEXT,
            -- NEW: PASS METADATA TO SALE
            p_vehicle_number   := v_session.vehicle_no,
            p_book_no         := v_session.book_no,
            p_lot_no          := v_lot_code
        );
    END IF;

    UPDATE mandi.mandi_sessions SET status = 'committed', total_purchase = v_total_purchase, total_commission = v_total_commission, updated_at = NOW() WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'purchase_bill_ids', to_jsonb(v_arrival_ids));
END;
$function$;
