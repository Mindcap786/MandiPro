-- ============================================================================
-- MIGRATION: Master Robustness Patch (April 18)
-- Date: 2026-04-18
--
-- RCA & FIXES IMPLEMENTED:
-- 1. `lot_code violates not-null`: Re-wrote `create_mixed_arrival` to compute
--    a randomized lot_code for safe tracking.
-- 2. `PGRST201 Multiple relationships between lots and contacts`: Dropped the 
--    erroneous `supplier_id` column from `lots`, reverting to the single standard
--    `contact_id` which acts as the unified Party ID across the system. This
--    restores the `lots?select=...,contacts(...)` query required by dashboard and POS.
-- 3. `why error in add contacts`: Added `created_by` to all missing master data
--    tables (contacts, commodities, accounts, etc.) to ensure complete API parity.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FIX A: Resolving PostgREST FK Ambiguity (PGRST201)
-- ----------------------------------------------------------------------------
-- Dropping the accidental duplicate foreign key mapping to contacts
ALTER TABLE mandi.lots DROP COLUMN IF EXISTS supplier_id;

-- ----------------------------------------------------------------------------
-- FIX B: Adding `created_by` Audit Columns to Master Tables
-- ----------------------------------------------------------------------------
ALTER TABLE mandi.contacts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE mandi.commodities ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE mandi.accounts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE mandi.vouchers ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE mandi.settings ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE mandi.organization_preferences ADD COLUMN IF NOT EXISTS created_by UUID;

GRANT SELECT, INSERT, UPDATE ON mandi.contacts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON mandi.commodities TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON mandi.accounts TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- FIX C: Resolving `lot_code` Null Constraint & Recompiling robust RPC
-- ----------------------------------------------------------------------------
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
    v_idempotency_key TEXT;
    v_payment_id UUID;
BEGIN
    -- Extract top level fields
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id := (p_arrival->>'party_id')::UUID;
    v_advance_amount := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_idempotency_key := p_arrival->>'idempotency_key';

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required';
    END IF;

    -- 1. Insert Arrival Head
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_type, arrival_date,
        vehicle_number, driver_name, driver_mobile,
        loaders_count, hire_charges, hamali_expenses, other_expenses,
        advance_amount, advance_payment_mode, reference_no, created_by
    ) VALUES (
        v_organization_id, v_party_id, p_arrival->>'arrival_type', (p_arrival->>'arrival_date')::DATE,
        p_arrival->>'vehicle_number', p_arrival->>'driver_name', p_arrival->>'driver_mobile',
        COALESCE((p_arrival->>'loaders_count')::INT, 0), COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, COALESCE(p_arrival->>'advance_payment_mode', 'cash'), p_arrival->>'reference_no', p_created_by
    ) RETURNING id INTO v_arrival_id;

    -- 2. Insert Lots (Items) - Fixed lot_code and contact_id mapping
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

    -- 3. Process Advance Payment Safely using Idempotency Key
    IF v_advance_amount > 0 AND v_idempotency_key IS NOT NULL AND v_party_id IS NOT NULL THEN
        -- Verify idempotency to prevent duplicate payments
        SELECT id INTO v_payment_id FROM mandi.payments 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        
        IF v_payment_id IS NULL THEN
            INSERT INTO mandi.payments (
                organization_id, party_id, arrival_id, amount,
                payment_type, payment_mode, payment_date,
                reference_number, idempotency_key, created_by
            ) VALUES (
                v_organization_id, v_party_id, v_arrival_id, v_advance_amount,
                'payment', COALESCE(p_arrival->>'advance_payment_mode', 'cash'), (p_arrival->>'arrival_date')::DATE,
                p_arrival->>'reference_no', v_idempotency_key, p_created_by
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id);
END;
$$;

-- Create Public Wrapper
CREATE OR REPLACE FUNCTION public.create_mixed_arrival(
    p_arrival JSONB,
    p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, core, public
AS $$
BEGIN
    RETURN mandi.create_mixed_arrival(p_arrival, p_created_by);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_mixed_arrival TO authenticated, service_role;

-- Force PostgREST schema cache reload to apply FK drops instantly
NOTIFY pgrst, 'reload schema';
