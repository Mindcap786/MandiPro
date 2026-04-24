-- Fix arrival_type assignment in record_quick_purchase RPC
BEGIN;

CREATE OR REPLACE FUNCTION mandi.record_quick_purchase(
    p_org_id UUID,
    p_party_id UUID,
    p_arrival_date DATE,
    p_notes TEXT DEFAULT '',
    p_vehicle_number TEXT DEFAULT '',
    p_lot_no TEXT DEFAULT '',
    p_storage_location TEXT DEFAULT '',
    p_vehicle_type TEXT DEFAULT '',
    p_guarantor TEXT DEFAULT '',
    p_driver_name TEXT DEFAULT '',
    p_driver_mobile TEXT DEFAULT '',
    p_loading_amount NUMERIC DEFAULT 0,
    p_advance_amount NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_payment_mode TEXT DEFAULT 'credit',
    p_lots JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_arrival_id UUID;
    v_lot JSONB;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_idx INTEGER := 0;
    v_lot_code TEXT;
    v_arrival_type TEXT;
BEGIN
    -- 1. Consume sequences
    v_bill_no := mandi.get_internal_sequence(p_org_id, 'bill_no');
    v_contact_bill_no := mandi.next_contact_bill_no(p_org_id, p_party_id, 'purchase');

    -- Derive arrival_type from first lot if available
    v_arrival_type := COALESCE((p_lots->0->>'arrival_type'), 'direct');

    -- 2. Create Header Arrival record
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_date, arrival_type, bill_no, contact_bill_no,
        vehicle_number, lot_no, storage_location, 
        vehicle_type, guarantor, driver_name, driver_mobile,
        trip_loading_amount, advance_amount, trip_other_expenses,
        advance_payment_mode, status, notes
    ) VALUES (
        p_org_id, p_party_id, p_arrival_date, v_arrival_type, v_bill_no, v_contact_bill_no,
        p_vehicle_number, p_lot_no, p_storage_location,
        p_vehicle_type, p_guarantor, p_driver_name, p_driver_mobile,
        p_loading_amount, p_advance_amount, p_other_expenses,
        p_payment_mode, 'completed', p_notes
    ) RETURNING id INTO v_arrival_id;

    -- 3. Create Child Lot records
    FOR v_lot IN SELECT * FROM jsonb_array_elements(p_lots)
    LOOP
        v_idx := v_idx + 1;
        v_lot_code := 'LOT-' || v_bill_no || '-' || v_idx;

        INSERT INTO mandi.lots (
            organization_id, arrival_id, contact_id, item_id, 
            lot_code, initial_qty, current_qty, unit, supplier_rate, 
            commission_percent, less_units,
            packing_cost, loading_cost, other_cut,
            arrival_type, advance, advance_payment_mode,
            status
        ) VALUES (
            p_org_id, v_arrival_id, p_party_id, (v_lot->>'item_id')::UUID,
            v_lot_code, (v_lot->>'qty')::NUMERIC, (v_lot->>'qty')::NUMERIC, COALESCE(v_lot->>'unit', 'Box'), (v_lot->>'rate')::NUMERIC,
            COALESCE((v_lot->>'commission')::NUMERIC, 0), COALESCE((v_lot->>'less_units')::NUMERIC, 0),
            COALESCE((v_lot->>'packing_cost')::NUMERIC, 0), COALESCE((v_lot->>'loading_cost')::NUMERIC, 0), COALESCE((v_lot->>'other_cut')::NUMERIC, 0),
            COALESCE(v_lot->>'arrival_type', v_arrival_type),
            CASE WHEN v_idx = 1 THEN p_advance_amount ELSE 0 END,
            CASE WHEN v_idx = 1 THEN p_payment_mode ELSE 'credit' END,
            'active'
        );
    END LOOP;

    -- 4. Return summary
    RETURN jsonb_build_object(
        'success', true, 
        'arrival_id', v_arrival_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

COMMIT;
