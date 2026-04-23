-- ============================================================================
-- QR REFACTOR: Move QR from Lot-level to Arrival-level
-- Goal: One QR code for the entire consignment (all commodities).
-- ============================================================================

-- 1. Remove QR from lots
ALTER TABLE mandi.lots DROP COLUMN IF EXISTS qr_code;

-- 2. Add QR to arrivals
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS qr_code TEXT;

-- 3. Update the RPC to generate QR at the Arrival level
DROP FUNCTION IF EXISTS mandi.record_quick_purchase(uuid,uuid,date,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,jsonb);

CREATE OR REPLACE FUNCTION mandi.record_quick_purchase(
    p_org_id UUID,
    p_party_id UUID,
    p_arrival_date DATE,
    p_bill_no TEXT,
    p_vehicle_number TEXT,
    p_lot_no TEXT DEFAULT NULL,
    p_storage_location TEXT DEFAULT NULL,
    p_vehicle_type TEXT DEFAULT NULL,
    p_guarantor TEXT DEFAULT NULL,
    p_driver_name TEXT DEFAULT NULL,
    p_driver_mobile TEXT DEFAULT NULL,
    p_loading_amount NUMERIC DEFAULT 0,
    p_advance_amount NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_payment_mode TEXT DEFAULT 'udhaar',
    p_lots JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_arrival_id UUID;
    v_lot JSONB;
    v_total_payable NUMERIC := 0;
    v_arrival_qr TEXT;
BEGIN
    -- 1. Generate ONE QR for the entire arrival
    v_arrival_qr := mandi.generate_lot_qr();

    -- 2. Insert Arrival (Trip Level) with the QR Code
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_date, bill_no, 
        vehicle_number, lot_no, storage_location, 
        vehicle_type, guarantor, driver_name, driver_mobile,
        trip_loading_amount, trip_advance_amount, trip_other_expenses,
        advance_payment_mode, qr_code, status 
    ) VALUES (
        p_org_id, p_party_id, p_arrival_date, COALESCE(p_bill_no, '0')::BIGINT, 
        p_vehicle_number, p_lot_no, p_storage_location,
        p_vehicle_type, p_guarantor, p_driver_name, p_driver_mobile,
        p_loading_amount, p_advance_amount, p_other_expenses,
        p_payment_mode, v_arrival_qr, 'completed'
    ) RETURNING id INTO v_arrival_id;

    -- 3. Insert Lots
    FOR v_lot IN SELECT * FROM jsonb_array_elements(p_lots)
    LOOP
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, 
            initial_qty, supplier_rate, 
            less_percent, less_units,
            gross_amount, adjusted_amount, commission_amount,
            packing_cost, loading_cost, other_cut,
            total_expenses, net_payable, unit_cost,
            status
        ) VALUES (
            p_org_id, v_arrival_id, (v_lot->>'item_id')::UUID,
            (v_lot->>'qty')::NUMERIC, (v_lot->>'rate')::NUMERIC,
            COALESCE((v_lot->>'less_percent')::NUMERIC, 0),
            COALESCE((v_lot->>'less_units')::NUMERIC, 0),
            COALESCE((v_lot->>'gross_value')::NUMERIC, 0),
            COALESCE((v_lot->>'adjusted_value')::NUMERIC, 0),
            COALESCE((v_lot->>'commission_amount')::NUMERIC, 0),
            COALESCE((v_lot->>'packing_cost')::NUMERIC, 0),
            COALESCE((v_lot->>'loading_cost')::NUMERIC, 0),
            COALESCE((v_lot->>'other_cut')::NUMERIC, 0),
            COALESCE((v_lot->>'expenses_total')::NUMERIC, 0),
            COALESCE((v_lot->>'net_payable')::NUMERIC, 0),
            COALESCE((v_lot->>'unit_cost')::NUMERIC, 0),
            'active'
        );
        
        v_total_payable := v_total_payable + COALESCE((v_lot->>'net_payable')::NUMERIC, 0);
    END LOOP;

    -- 4. Final Total Update
    UPDATE mandi.arrivals SET total_amount = v_total_payable WHERE id = v_arrival_id;

    RETURN jsonb_build_object(
        'success', true, 
        'arrival_id', v_arrival_id,
        'qr_code', v_arrival_qr,
        'message' , 'Consignment recorded with shared QR: ' || v_arrival_qr
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
