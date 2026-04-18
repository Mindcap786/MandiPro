-- MandiPro Transaction Hardening: Cheques & Arrivals
-- Removes deadlocks and improves performance

-- 1. Hardening Cheque Transitions (transition_cheque_with_ledger)
-- Replaces FOR UPDATE with an atomic condition to prevent deadlocks
CREATE OR REPLACE FUNCTION mandi.transition_cheque_with_ledger(
    p_cheque_id UUID,
    p_next_status TEXT,
    p_cleared_date DATE DEFAULT NULL,
    p_bounce_reason TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, core, public
AS $$
DECLARE
    v_cheque RECORD;
    v_updated_rows INT;
BEGIN
    -- ATOMIC UPDATE (No lock needed)
    UPDATE mandi.cheques 
    SET status = p_next_status, 
        cleared_date = p_cleared_date, 
        bounce_reason = p_bounce_reason, 
        updated_at = NOW() 
    WHERE id = p_cheque_id
      AND status != p_next_status -- Avoid redundant work
    RETURNING * INTO v_cheque;

    IF NOT FOUND THEN
        -- Check if it already has this status (idempotent success)
        IF EXISTS(SELECT 1 FROM mandi.cheques WHERE id = p_cheque_id AND status = p_next_status) THEN
            RETURN jsonb_build_object('success', true, 'next_status', p_next_status, 'idempotent', true);
        END IF;
        RAISE EXCEPTION 'Cheque not found or invalid transition'; 
    END IF;

    -- If cleared, record ledger entry
    IF p_next_status = 'cleared' THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, party_id, 
            transaction_date, transaction_type, 
            reference_type, reference_id, 
            credit, debit, narration, created_by
        ) VALUES (
            v_cheque.organization_id, v_cheque.party_id, 
            COALESCE(p_cleared_date, CURRENT_DATE), 'payment_receipt', 
            'cheque_clearance', p_cheque_id, 
            v_cheque.amount, 0, 'Cheque Cleared: ' || v_cheque.cheque_no, p_actor_id
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'next_status', p_next_status);
END;
$$;

-- 2. Hardening create_mixed_arrival
-- Ensures strict UUID casting and atomic head/lot insertions
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(
    p_arrival JSONB,
    p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, core, public
AS $$
DECLARE
    v_arrival_id UUID;
    v_party_id UUID;
    v_organization_id UUID;
    v_lot RECORD;
    v_lot_id UUID;
    v_advance_amount NUMERIC;
    v_idempotency_key UUID; -- Changed to UUID for strict casting
    v_payment_id UUID;
BEGIN
    -- Extract top level fields with strict casting
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id := (p_arrival->>'party_id')::UUID;
    v_advance_amount := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    
    -- Robust Idempotency casting
    BEGIN
        v_idempotency_key := (p_arrival->>'idempotency_key')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_idempotency_key := NULL;
    END;

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required';
    END IF;

    -- Idempotency Check (Arrival Head)
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_arrival_id FROM mandi.arrivals 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true);
        END IF;
    END IF;

    -- 1. Insert Arrival Head
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

    -- 2. Insert Lots
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
            COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0), 'Available', p_created_by
        ) RETURNING id INTO v_lot_id;
    END LOOP;

    -- 3. Process Advance Payment
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

NOTIFY pgrst, 'reload schema';
