-- Migration: 20260429000005_multi_location_and_relocation.sql

BEGIN;

-- 1. Update create_mixed_arrival to support per-item storage location
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(p_arrival jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival_id      UUID;
    v_party_id        UUID;
    v_organization_id UUID;
    v_lot             RECORD;
    v_lot_id          UUID;
    v_advance_amount  NUMERIC;
    v_advance_mode    TEXT;
    v_idempotency_key UUID;
    v_lot_net         NUMERIC;
    v_arrival_type    TEXT;
    v_commission_pct  NUMERIC;
    v_metadata        JSONB := '{}'::jsonb;
    v_first_item      JSONB;
    v_bill_no         BIGINT;
    v_header_location TEXT;
    v_item_location   TEXT;
BEGIN
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id        := (p_arrival->>'party_id')::UUID;
    v_advance_amount  := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_advance_mode    := COALESCE(p_arrival->>'advance_payment_mode', 'cash');
    v_arrival_type    := COALESCE(p_arrival->>'arrival_type', 'commission');
    v_header_location := p_arrival->>'storage_location';

    IF v_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
    IF v_party_id IS NULL THEN RAISE EXCEPTION 'Supplier/Party is required.'; END IF;

    -- Handle idempotency
    BEGIN
        v_idempotency_key := (p_arrival->>'idempotency_key')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_idempotency_key := NULL;
    END;

    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, COALESCE(metadata, '{}'::jsonb) INTO v_arrival_id, v_metadata 
        FROM mandi.arrivals 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true, 'metadata', v_metadata);
        END IF;
    END IF;

    -- Consume sequence
    v_bill_no := (p_arrival->>'bill_no')::BIGINT;
    IF v_bill_no IS NULL OR v_bill_no = 0 THEN
        v_bill_no := mandi.get_internal_sequence(v_organization_id, 'bill_no');
    END IF;

    -- Create arrival record
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_type, arrival_date,
        vehicle_number, driver_name, driver_mobile,
        loaders_count, hire_charges, hamali_expenses, other_expenses,
        advance_amount, advance_payment_mode, reference_no, bill_no,
        idempotency_key, created_by, metadata,
        storage_location
    ) VALUES (
        v_organization_id, v_party_id, v_arrival_type, (p_arrival->>'arrival_date')::DATE,
        p_arrival->>'vehicle_number', p_arrival->>'driver_name', p_arrival->>'driver_mobile',
        COALESCE((p_arrival->>'loaders_count')::INT, 0), 
        COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), 
        COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, v_advance_mode, p_arrival->>'reference_no', v_bill_no,
        v_idempotency_key, p_created_by, v_metadata,
        v_header_location
    ) RETURNING id INTO v_arrival_id;

    -- Create lots
    FOR v_lot IN SELECT value FROM jsonb_array_elements(p_arrival->'items')
    LOOP
        v_commission_pct := COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0);
        v_item_location := COALESCE(v_lot.value->>'storage_location', v_header_location);
        
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id,
            lot_code, initial_qty, current_qty, unit, supplier_rate,
            commission_percent, arrival_type, status, 
            advance, advance_payment_mode,
            created_by, storage_location
        ) VALUES (
            v_organization_id, v_arrival_id, (v_lot.value->>'item_id')::UUID, v_party_id,
            COALESCE(v_lot.value->>'lot_code', 'LOT-' || COALESCE(v_bill_no::text, '') || '-' || substr(gen_random_uuid()::text, 1, 4)),
            (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, 
            COALESCE(v_lot.value->>'unit', 'Box'), 
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0),
            v_commission_pct, v_arrival_type, 'available',
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_amount ELSE 0 END,
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_mode ELSE 'cash' END,
            p_created_by, v_item_location
        ) RETURNING id INTO v_lot_id;

        -- Update net payable
        v_lot_net := mandi.compute_lot_net_payable(v_lot_id);
        UPDATE mandi.lots SET net_payable = v_lot_net WHERE id = v_lot_id;
    END LOOP;

    -- Post ledger
    IF v_party_id IS NOT NULL THEN
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'arrival_id', v_arrival_id,
        'bill_no', v_bill_no
    );
END;
$function$;

-- 2. Add Relocation RPC
CREATE OR REPLACE FUNCTION mandi.relocate_lot(p_lot_id UUID, p_new_location TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE mandi.lots
    SET storage_location = p_new_location,
        updated_at = NOW()
    WHERE id = p_lot_id;
    
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.relocate_lot(UUID, TEXT) TO authenticated, service_role;

COMMIT;
