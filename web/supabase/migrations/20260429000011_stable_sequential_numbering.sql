-- Migration: 20260429000011_stable_sequential_numbering.sql

BEGIN;

-- 1. PREVENTIVE CLEANUP: Reset all numbering functions to eliminate duplicates/overloads
DROP FUNCTION IF EXISTS mandi.get_next_bill_no(uuid) CASCADE;
DROP FUNCTION IF EXISTS mandi.get_next_contact_bill_no(uuid, uuid, text) CASCADE;

-- 2. RE-IMPLEMENT PEEK (READ-ONLY)
CREATE OR REPLACE FUNCTION mandi.peek_internal_sequence(p_org_id UUID, p_type TEXT)
RETURNS BIGINT AS $$
DECLARE
    v_last_val BIGINT;
BEGIN
    SELECT last_number INTO v_last_val
    FROM mandi.id_sequences
    WHERE organization_id = p_org_id AND entity_type = p_type;
    
    RETURN COALESCE(v_last_val, 0) + 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. RE-IMPLEMENT CONSUME (DESTRUCTIVE)
CREATE OR REPLACE FUNCTION mandi.get_internal_sequence(p_org_id UUID, p_type TEXT)
RETURNS BIGINT AS $$
DECLARE
    v_new_val BIGINT;
BEGIN
    INSERT INTO mandi.id_sequences (organization_id, entity_type, last_number, updated_at)
    VALUES (p_org_id, p_type, 1, NOW())
    ON CONFLICT (organization_id, entity_type) 
    DO UPDATE SET last_number = id_sequences.last_number + 1, updated_at = NOW()
    RETURNING last_number INTO v_new_val;
    
    RETURN v_new_val;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 4. PUBLIC RPCs (NON-DESTRUCTIVE FOR UI)
-- Used by Arrivals Form
CREATE OR REPLACE FUNCTION mandi.get_next_bill_no(p_organization_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN mandi.peek_internal_sequence(p_organization_id, 'bill_no');
END; $$;

-- Used by many forms for contact-specific counts (falling back to global for arrivals)
CREATE OR REPLACE FUNCTION mandi.get_next_contact_bill_no(p_organization_id uuid, p_contact_id uuid, p_type text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_type = 'sale' THEN
        RETURN mandi.peek_internal_sequence(p_organization_id, 'sale_no');
    ELSE
        RETURN mandi.peek_internal_sequence(p_organization_id, 'bill_no');
    END IF;
END; $$;

-- 5. UPGRADE CREATE_MIXED_ARRIVAL (ATOMIC CONSUMPTION)
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
    BEGIN v_idempotency_key := (p_arrival->>'idempotency_key')::UUID; EXCEPTION WHEN OTHERS THEN v_idempotency_key := NULL; END;
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, COALESCE(metadata, '{}'::jsonb) INTO v_arrival_id, v_metadata FROM mandi.arrivals 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true, 'metadata', v_metadata); END IF;
    END IF;

    -- ATOMIC CONSUMPTION: Only happens here, once per successful log
    v_bill_no := (p_arrival->>'bill_no')::BIGINT;
    IF v_bill_no IS NULL OR v_bill_no <= 0 THEN
        v_bill_no := mandi.get_internal_sequence(v_organization_id, 'bill_no');
    END IF;

    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_type, arrival_date, vehicle_number, driver_name, driver_mobile,
        loaders_count, hire_charges, hamali_expenses, other_expenses, advance_amount, advance_payment_mode,
        reference_no, bill_no, idempotency_key, created_by, metadata, storage_location
    ) VALUES (
        v_organization_id, v_party_id, v_arrival_type, (p_arrival->>'arrival_date')::DATE,
        p_arrival->>'vehicle_number', p_arrival->>'driver_name', p_arrival->>'driver_mobile',
        COALESCE((p_arrival->>'loaders_count')::INT, 0), COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, v_advance_mode, p_arrival->>'reference_no', v_bill_no,
        v_idempotency_key, p_created_by, v_metadata, v_header_location
    ) RETURNING id INTO v_arrival_id;

    FOR v_lot IN SELECT value FROM jsonb_array_elements(p_arrival->'items')
    LOOP
        v_commission_pct := COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0);
        v_item_location := COALESCE(v_lot.value->>'storage_location', v_header_location);
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id, lot_code, initial_qty, current_qty, unit, supplier_rate,
            commission_percent, arrival_type, status, advance, advance_payment_mode, created_by, storage_location
        ) VALUES (
            v_organization_id, v_arrival_id, (v_lot.value->>'item_id')::UUID, v_party_id,
            COALESCE(v_lot.value->>'lot_code', 'LOT-' || COALESCE(v_bill_no::text, '') || '-' || substr(gen_random_uuid()::text, 1, 4)),
            (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, COALESCE(v_lot.value->>'unit', 'Box'), 
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0), v_commission_pct, v_arrival_type, 'available',
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_amount ELSE 0 END,
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_mode ELSE 'cash' END,
            p_created_by, v_item_location
        ) RETURNING id INTO v_lot_id;
        v_lot_net := mandi.compute_lot_net_payable(v_lot_id);
        UPDATE mandi.lots SET net_payable = v_lot_net WHERE id = v_lot_id;
    END LOOP;

    IF v_party_id IS NOT NULL THEN PERFORM mandi.post_arrival_ledger(v_arrival_id); END IF;

    RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'bill_no', v_bill_no);
END;
$function$;

-- 6. UPGRADE CONFIRM_SALE_TRANSACTION (ATOMIC CONSUMPTION)
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid, p_sale_date date, p_buyer_id uuid, p_items jsonb, p_total_amount numeric DEFAULT 0,
    p_header_discount numeric DEFAULT 0, p_discount_percent numeric DEFAULT 0, p_discount_amount numeric DEFAULT 0,
    p_payment_mode text DEFAULT 'credit', p_narration text DEFAULT NULL, p_idempotency_key text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL, p_vehicle_number text DEFAULT NULL, p_book_no text DEFAULT NULL, p_lot_no text DEFAULT NULL,
    p_amount_received numeric DEFAULT 0
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sale_id uuid; v_item jsonb; v_bill_no bigint;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key LIMIT 1;
        IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;
    END IF;

    -- ATOMIC CONSUMPTION: Only happens here
    v_bill_no := mandi.get_internal_sequence(p_organization_id, 'sale_no');

    INSERT INTO mandi.sales (
        organization_id, sale_date, buyer_id, total_amount, total_amount_inc_tax, bill_no, contact_bill_no, 
        payment_mode, payment_status, narration, amount_received, idempotency_key, created_by, vehicle_number, book_no, lot_no
    ) VALUES (
        p_organization_id, p_sale_date, p_buyer_id, p_total_amount, p_total_amount, v_bill_no, v_bill_no, 
        p_payment_mode, CASE WHEN p_amount_received >= p_total_amount THEN 'paid' WHEN p_amount_received > 0 THEN 'partial' ELSE 'pending' END,
        p_narration, p_amount_received, p_idempotency_key, p_created_by, p_vehicle_number, p_book_no, p_lot_no
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO mandi.sale_items (sale_id, organization_id, item_id, lot_id, qty, rate, amount, unit, created_by)
        VALUES (v_sale_id, p_organization_id, (v_item->>'item_id')::uuid, (v_item->>'lot_id')::uuid, (v_item->>'qty')::numeric, (v_item->>'rate')::numeric, (v_item->>'amount')::numeric, v_item->>'unit', p_created_by);
        IF (v_item->>'lot_id') IS NOT NULL THEN
            UPDATE mandi.lots SET current_qty = current_qty - (v_item->>'qty')::numeric WHERE id = (v_item->>'lot_id')::uuid;
        END IF;
    END LOOP;

    PERFORM mandi.post_sale_ledger(v_sale_id);
    RETURN v_sale_id;
END; $$;

COMMIT;
