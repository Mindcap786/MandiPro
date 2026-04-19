-- ============================================================
-- FIX: MOVE COMMIT_MANDI_SESSION TO PUBLIC SCHEMA
-- Ensures it is reachable by the standard Supabase RPC client.
-- ============================================================

BEGIN;

-- 1. DROP old function from mandi schema (if it exists)
DROP FUNCTION IF EXISTS mandi.commit_mandi_session(UUID);

-- 2. CREATE core function in PUBLIC schema
-- This allows the Supabase JS client to find it without special configuration.
-- It still operates within the 'mandi' search_path for safety.
CREATE OR REPLACE FUNCTION public.commit_mandi_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $function$
DECLARE
    v_session           RECORD;
    v_farmer            RECORD;
    v_org_id            UUID;
    v_lot_prefix        TEXT;
    v_arrival_id        UUID;
    v_lot_id            UUID;
    v_bill_no           BIGINT;
    
    -- Computed per farmer
    v_net_qty           NUMERIC;
    v_net_amount        NUMERIC;
    v_commission_amount NUMERIC;
    v_net_payable       NUMERIC;
    v_gross_amount      NUMERIC;
    v_less_units_calc   NUMERIC;
    
    -- Aggregates for buyer
    v_total_net_qty     NUMERIC := 0;
    v_total_commission  NUMERIC := 0;
    v_total_purchase    NUMERIC := 0;
    v_buyer_sale_id     UUID;
    v_item_amount       NUMERIC;
    v_sale_rate         NUMERIC;
    v_final_sale_items  JSONB := '[]'::JSONB;
    v_item              JSONB;
    v_sale_items_tmp    JSONB := '[]'::JSONB;
    v_lot_code          TEXT;
    
    -- Result arrays
    v_arrival_ids       UUID[] := '{}';
BEGIN
    -- This function specifically only handles Mandi Sessions.
    -- It does NOT modify any existing sales/purchase flows outside of sessions.

    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session % not found', p_session_id;
    END IF;
    
    IF v_session.status = 'committed' THEN
        RAISE EXCEPTION 'Session already committed';
    END IF;
    
    v_org_id := v_session.organization_id;
    
    -- Lot prefix from lot_no header or date-based default
    v_lot_prefix := COALESCE(
        NULLIF(v_session.lot_no, ''),
        'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD')
    );
    
    -- ── STEP 1: Create one Arrival per farmer row ─────────────────
    FOR v_farmer IN
        SELECT * FROM mandi.mandi_session_farmers
        WHERE session_id = p_session_id
        ORDER BY sort_order ASC, created_at ASC
    LOOP
        v_less_units_calc := COALESCE(v_farmer.less_units, 0);
        
        v_net_qty       := GREATEST(v_farmer.qty - v_less_units_calc, 0);
        v_gross_amount  := ROUND(v_farmer.qty * v_farmer.rate, 2);
        v_net_amount    := ROUND(v_net_qty * v_farmer.rate, 2);
        v_commission_amount := ROUND(v_net_amount * COALESCE(v_farmer.commission_percent, 0) / 100.0, 2);
        v_net_payable   := v_net_amount - v_commission_amount 
                           - COALESCE(v_farmer.loading_charges, 0)
                           - COALESCE(v_farmer.other_charges, 0);
        
        -- ── Insert Arrival (isolation maintained) ──
        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no
        FROM mandi.arrivals WHERE organization_id = v_org_id;
        
        INSERT INTO mandi.arrivals (
            organization_id, arrival_date, party_id, arrival_type,
            lot_prefix, vehicle_number, reference_no, bill_no, status
        ) VALUES (
            v_org_id, v_session.session_date, v_farmer.farmer_id, 'commission',
            v_lot_prefix, v_session.vehicle_no, v_session.book_no, v_bill_no, 'pending'
        ) RETURNING id INTO v_arrival_id;
        
        -- ── Insert Lot ──
        v_lot_code := v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0');
        
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, lot_code, 
            initial_qty, current_qty, gross_quantity, unit, 
            supplier_rate, commission_percent, less_percent, less_units,
            loading_cost, farmer_charges, variety, grade,
            arrival_type, status
        ) VALUES (
            v_org_id, v_arrival_id, v_farmer.item_id, v_lot_code, 
            v_net_qty, v_net_qty, v_farmer.qty, v_farmer.unit, 
            v_farmer.rate, v_farmer.commission_percent, v_farmer.less_percent, v_less_units_calc,
            v_farmer.loading_charges, v_farmer.other_charges, v_farmer.variety, v_farmer.grade,
            'commission', 'active'
        ) RETURNING id INTO v_lot_id;
        
        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;
        
        -- Call standard ledger posting (does NOT touch existing sales)
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
        
        v_total_net_qty     := v_total_net_qty     + v_net_qty;
        v_total_commission  := v_total_commission  + v_commission_amount;
        v_total_purchase    := v_total_purchase    + v_net_amount;
        v_arrival_ids       := array_append(v_arrival_ids, v_arrival_id);
        
        -- Prep items for buyer sale
        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object(
            'lot_id',   v_lot_id,
            'item_id',  v_farmer.item_id,
            'qty',      v_net_qty,
            'unit',     v_farmer.unit
        );
    END LOOP;
    
    -- Call Buyer Bill with NAMED PARAMETERS for safety (Immune to signature changes)
    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := v_session.buyer_payable - COALESCE(v_session.buyer_loading_charges, 0) - COALESCE(v_session.buyer_packing_charges, 0);
        v_sale_rate := ROUND(v_item_amount / v_total_net_qty, 2);
        
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (v_item || jsonb_build_object('rate', v_sale_rate, 'amount', ROUND((v_item->>'qty')::NUMERIC * v_sale_rate, 2)));
        END LOOP;

        PERFORM mandi.confirm_sale_transaction(
            p_organization_id   := v_org_id,
            p_buyer_id         := v_session.buyer_id,
            p_sale_date        := v_session.session_date,
            p_payment_mode     := 'credit',
            p_total_amount     := v_item_amount,
            p_items            := v_final_sale_items,
            p_loading_charges  := COALESCE(v_session.buyer_loading_charges, 0),
            p_other_expenses   := COALESCE(v_session.buyer_packing_charges, 0),
            p_idempotency_key  := p_session_id::TEXT -- Cast to TEXT to match confirm_sale_transaction signature
        );
    END IF;

    UPDATE mandi.mandi_sessions SET status = 'committed', total_purchase = v_total_purchase, total_commission = v_total_commission, updated_at = NOW() WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'purchase_bill_ids', to_jsonb(v_arrival_ids), 'total_commission', v_total_commission, 'total_purchase', v_total_purchase);
END;
$function$;

-- Grant execute access
GRANT EXECUTE ON FUNCTION public.commit_mandi_session(UUID) TO authenticated;

COMMIT;
