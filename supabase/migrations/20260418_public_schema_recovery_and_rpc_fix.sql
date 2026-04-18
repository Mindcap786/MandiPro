-- ============================================================================
-- MIGRATION: CRITICAL PUBLIC SCHEMA RECOVERY & RPC RESTORATION
-- Date: 2026-04-18
--
-- This script safely rebuilds the public schema architecture that was severed
-- and restores the missing transactional RPCs required by the dashboard and UI.
-- ============================================================================

-- ============================================================================
-- PART 1: PUBLIC SCHEMA RECOVERY & PERMISSIONS
-- Ensures zero-downtime routing from PostgREST cache.
-- ============================================================================

-- 1. Recreate schema if absolutely missing (safe operation)
CREATE SCHEMA IF NOT EXISTS public;
COMMENT ON SCHEMA public IS 'Standard public schema. Vital for PostgREST default routing.';

-- 2. Restore essential PostgREST routing roles to ensure no 'schema does not exist' errors
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- 3. Restore default schema privileges for API roles
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- 4. Re-bind extensions to ensure they survived the drop.
-- Supabase keeps these in 'extensions', but we ensure they map safely.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;


-- ============================================================================
-- PART 2: DIAGNOSTIC QUERIES (For your records/testing later)
-- Run these in Supabase SQL editor to identify severed dependencies safely
-- ============================================================================
/*
-- Q1: Check for severed Auth Triggers targeting public schema
SELECT trigger_name, event_object_schema, action_statement 
FROM information_schema.triggers 
WHERE action_statement ILIKE '%public.%';

-- Q2: Check if any default extensions went missing
SELECT extname, extnamespace::regnamespace 
FROM pg_extension;
*/


-- ============================================================================
-- PART 3: REBUILDING MISSING CORE API RPCs
-- These were lost during the schema drop or never committed on April 15th-17th.
-- We are recreating them in the 'mandi' schema, and wrapping them in 'public'
-- for seamless backwards compatibility with older API callers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1: get_pnl_summary (Mandi Schema Core)
-- Implements PNL_CALCULATION_MODEL.md
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.get_pnl_summary(
    p_organization_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, core, public
AS $$
DECLARE
    v_total_revenue NUMERIC := 0;
    v_total_cost NUMERIC := 0;
    v_total_expenses NUMERIC := 0;
    v_total_commission NUMERIC := 0;
BEGIN
    -- Wait to aggregate only from finalized sale transactions
    -- Formula: Profit = Sale Price - Cost - Expenses + Commission
    
    -- 1. Calculate Total Revenue from Sales
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_revenue
    FROM mandi.sales
    WHERE organization_id = p_organization_id
      AND (p_start_date IS NULL OR sale_date >= p_start_date)
      AND (p_end_date IS NULL OR sale_date <= p_end_date);

    -- 2. Calculate Costs, Expenses, and Commission from Purchase Bills (Lots)
    -- Grouped safely against the organization to prevent cross-tenant data leaks.
    SELECT 
        COALESCE(SUM(pb.net_payable), 0),
        COALESCE(SUM(l.expense_paid_by_mandi), 0),
        COALESCE(SUM(pb.commission_amount), 0)
    INTO 
        v_total_cost, 
        v_total_expenses, 
        v_total_commission
    FROM mandi.purchase_bills pb
    JOIN mandi.lots l ON pb.lot_id = l.id
    WHERE pb.organization_id = p_organization_id
      AND (p_start_date IS NULL OR pb.bill_date >= p_start_date)
      AND (p_end_date IS NULL OR pb.bill_date <= p_end_date);

    RETURN jsonb_build_object(
        'revenue', v_total_revenue,
        'cost_of_goods', v_total_cost + v_total_expenses,
        'expenses_paid', v_total_expenses,
        'commission_earned', v_total_commission,
        'gross_profit', v_total_revenue - (v_total_cost + v_total_expenses),
        'net_profit', (v_total_revenue - (v_total_cost + v_total_expenses)) + v_total_commission
    );
END;
$$;

-- Create Public Wrapper
CREATE OR REPLACE FUNCTION public.get_pnl_summary(
    p_organization_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, core, public
AS $$
BEGIN
    RETURN mandi.get_pnl_summary(p_organization_id, p_start_date, p_end_date);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_pnl_summary TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3.2: create_mixed_arrival (Mandi Schema Core)
-- Atomically inserts arrival, lots, and dynamic advance payments.
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

    -- 2. Insert Lots (Items)
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


-- ----------------------------------------------------------------------------
-- Final Force PostgREST Cache Reload
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- 3.3: transition_cheque_with_ledger (Mandi Schema Core)
-- Atomically transitions cheque status and updates ledger if cleared.
-- ----------------------------------------------------------------------------
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
    v_party_id UUID;
BEGIN
    SELECT * INTO v_cheque FROM mandi.cheques WHERE id = p_cheque_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cheque not found'; END IF;
    
    v_party_id := v_cheque.party_id;

    -- Update cheque status
    UPDATE mandi.cheques 
    SET status = p_next_status, 
        cleared_date = p_cleared_date, 
        bounce_reason = p_bounce_reason, 
        updated_at = NOW() 
    WHERE id = p_cheque_id;

    -- If cleared, record ledger entry
    IF p_next_status = 'cleared' THEN
        -- Ledger entries are normally handled by triggers, but if explicitly required:
        INSERT INTO mandi.ledger_entries (
            organization_id, party_id, 
            transaction_date, transaction_type, 
            reference_type, reference_id, 
            credit, debit, narration, created_by
        ) VALUES (
            v_cheque.organization_id, v_party_id, 
            COALESCE(p_cleared_date, CURRENT_DATE), 'payment_receipt', 
            'cheque_clearance', p_cheque_id, 
            v_cheque.amount, 0, 'Cheque Cleared: ' || v_cheque.cheque_number, p_actor_id
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'next_status', p_next_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_cheque_with_ledger(
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
BEGIN
    RETURN mandi.transition_cheque_with_ledger(p_cheque_id, p_next_status, p_cleared_date, p_bounce_reason, p_actor_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.transition_cheque_with_ledger TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
