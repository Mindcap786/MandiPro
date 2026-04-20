-- Migration V7: Fix arrivals creation and metadata visibility
-- 1. Correct the create_mixed_arrival RPC to fix JSON syntax error and populate metadata

CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(p_arrival jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mandi', 'public'
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
    v_net_payable     NUMERIC;
    v_ledger_result   JSONB;
    v_lot_net         NUMERIC;
    v_arrival_type    TEXT;
    v_commission_pct  NUMERIC;
    v_metadata        JSONB := '{}'::jsonb;
    v_first_item      JSONB;
BEGIN
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id        := (p_arrival->>'party_id')::UUID;
    v_advance_amount  := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_advance_mode    := COALESCE(p_arrival->>'advance_payment_mode', 'cash');
    v_arrival_type    := COALESCE(p_arrival->>'arrival_type', 'commission');

    BEGIN
        v_idempotency_key := (p_arrival->>'idempotency_key')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_idempotency_key := NULL;
    END;

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required';
    END IF;

    -- Idempotency check
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, COALESCE(metadata, '{}'::jsonb) INTO v_arrival_id, v_metadata 
        FROM mandi.arrivals 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true, 'metadata', v_metadata);
        END IF;
    END IF;

    -- Extract metadata from first item for history summary
    v_first_item := p_arrival->'items'->0;
    IF v_first_item IS NOT NULL THEN
        v_metadata := jsonb_build_object(
            'item_name', (SELECT name FROM mandi.commodities WHERE id = (v_first_item->>'item_id')::UUID),
            'qty', (v_first_item->>'qty')::NUMERIC,
            'unit', COALESCE(v_first_item->>'unit', 'Box'),
            'supplier_rate', COALESCE((v_first_item->>'supplier_rate')::NUMERIC, 0)
        );
    END IF;

    -- Create arrival record
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_type, arrival_date,
        vehicle_number, driver_name, driver_mobile,
        loaders_count, hire_charges, hamali_expenses, other_expenses,
        advance_amount, advance_payment_mode, reference_no, 
        idempotency_key, created_by, metadata
    ) VALUES (
        v_organization_id, v_party_id, v_arrival_type, (p_arrival->>'arrival_date')::DATE,
        p_arrival->>'vehicle_number', p_arrival->>'driver_name', p_arrival->>'driver_mobile',
        COALESCE((p_arrival->>'loaders_count')::INT, 0), 
        COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), 
        COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, v_advance_mode, p_arrival->>'reference_no',
        v_idempotency_key, p_created_by, v_metadata
    ) RETURNING id INTO v_arrival_id;

    -- Create lots
    FOR v_lot IN SELECT value FROM jsonb_array_elements(p_arrival->'items')
    LOOP
        v_commission_pct := COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0);
        
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id,
            lot_code, initial_qty, current_qty, unit, supplier_rate,
            commission_percent, arrival_type, status, 
            advance, advance_payment_mode,
            created_by
        ) VALUES (
            v_organization_id, v_arrival_id, (v_lot.value->>'item_id')::UUID, v_party_id,
            COALESCE(v_lot.value->>'lot_code', 'LOT-' || COALESCE(p_arrival->>'reference_no', '') || '-' || substr(gen_random_uuid()::text, 1, 4)),
            (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, 
            COALESCE(v_lot.value->>'unit', 'Box'), 
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0),
            v_commission_pct, v_arrival_type, 'available',
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_amount ELSE 0 END,
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_mode ELSE 'cash' END,
            p_created_by
        ) RETURNING id INTO v_lot_id;

        -- Compute and store net_payable on lot immediately
        v_lot_net := mandi.compute_lot_net_payable(v_lot_id);
        
        UPDATE mandi.lots
        SET net_payable    = v_lot_net,
            payment_status = CASE
                WHEN v_lot_net <= 0.01                        THEN 'pending'
                WHEN jsonb_array_length(p_arrival->'items') = 1 THEN
                    CASE
                        WHEN v_advance_mode NOT IN ('cash', 'bank', 'upi') THEN 'pending'
                        WHEN ABS(v_lot_net - v_advance_amount) < 0.01     THEN 'paid'
                        WHEN v_advance_amount > 0.01                       THEN 'partial'
                        ELSE 'pending'
                    END
                ELSE 'pending'
            END
        WHERE id = v_lot_id;
    END LOOP;

    -- Record payment in mandi.payments (for ledger reference)
    IF v_advance_amount > 0 AND v_party_id IS NOT NULL THEN
        INSERT INTO mandi.payments (
            organization_id, party_id, arrival_id, amount,
            payment_type, payment_mode, payment_date,
            reference_number, idempotency_key, created_by
        ) VALUES (
            v_organization_id, v_party_id, v_arrival_id, v_advance_amount,
            'payment', v_advance_mode, (p_arrival->>'arrival_date')::DATE,
            p_arrival->>'reference_no', v_idempotency_key, p_created_by
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- Post ledger entries
    DECLARE
        v_has_rate BOOLEAN;
    BEGIN
        SELECT EXISTS(
            SELECT 1 FROM mandi.lots 
            WHERE arrival_id = v_arrival_id AND supplier_rate > 0
        ) INTO v_has_rate;

        IF v_has_rate AND v_party_id IS NOT NULL THEN
            PERFORM mandi.post_arrival_ledger(v_arrival_id);
            v_ledger_result := '{"status": "posted"}'::jsonb;
        END IF;
    END;

    RETURN jsonb_build_object(
        'success', true, 
        'arrival_id', v_arrival_id,
        'ledger_posted', v_ledger_result,
        'metadata', v_metadata
    );
END;
$function$;

-- 2. Retroactive Backfill for Metadata
UPDATE mandi.arrivals a
SET metadata = jsonb_build_object(
    'item_name', (SELECT c.name FROM mandi.lots l JOIN mandi.commodities c ON l.item_id = c.id WHERE l.arrival_id = a.id LIMIT 1),
    'qty', (SELECT l.initial_qty FROM mandi.lots l WHERE l.arrival_id = a.id LIMIT 1),
    'unit', (SELECT l.unit FROM mandi.lots l WHERE l.arrival_id = a.id LIMIT 1),
    'supplier_rate', (SELECT l.supplier_rate FROM mandi.lots l WHERE l.arrival_id = a.id LIMIT 1)
)
WHERE metadata IS NULL OR metadata = '{}'::jsonb;
