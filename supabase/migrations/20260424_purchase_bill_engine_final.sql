-- ============================================================================
-- PURCHASE BILL ENGINE (v12.0 - CONSOLIDATED & STABILIZED)
-- Migration: 20260424_purchase_bill_engine_final.sql
-- 
-- GOALS:
-- 1. ATOMIC: Every lot insertion/update syncs to mandi.purchase_bills.
-- 2. STABLE: Uses SPLIT triggers (BEFORE/AFTER) to avoid FK violations.
-- 3. ACCURATE: Implements user-requested math: Net = Gross - Commission - Exp - Other.
-- 4. ROBUST: Standardizes record_quick_purchase RPC with strict schema compliance.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: CONSTRAINTS
-- ----------------------------------------------------------------------------
-- Ensure we can use ON CONFLICT (lot_id) for atomic synchronization
ALTER TABLE mandi.purchase_bills DROP CONSTRAINT IF EXISTS purchase_bills_lot_id_key;
ALTER TABLE mandi.purchase_bills ADD CONSTRAINT purchase_bills_lot_id_key UNIQUE (lot_id);

-- ----------------------------------------------------------------------------
-- STEP 2: TRIGGER FUNCTIONS
-- ----------------------------------------------------------------------------

-- 2a. Financial Calculation (BEFORE INSERT/UPDATE)
CREATE OR REPLACE FUNCTION mandi.fn_calculate_lot_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_gross NUMERIC;
    v_comm NUMERIC;
    v_net_payable NUMERIC;
    v_bill_status TEXT;
    v_lot_expenses NUMERIC;
    v_other_deductions NUMERIC;
BEGIN
    -- 1. Gross Amount (Qty * Rate)
    v_gross := (COALESCE(NEW.initial_qty, 0) - COALESCE(NEW.less_units, 0)) * COALESCE(NEW.supplier_rate, 0);
    
    -- 2. Commission (Subtracted from supplier payment if entered)
    v_comm := (v_gross * COALESCE(NEW.commission_percent, 0)) / 100.0;
    
    -- 3. Expenses (Subtracted from supplier payment)
    v_lot_expenses := COALESCE(NEW.packing_cost, 0) + COALESCE(NEW.loading_cost, 0);
    
    -- 4. Other Deductions (e.g. Farmer Charges or Manual Cuts)
    v_other_deductions := COALESCE(NEW.other_cut, NEW.farmer_charges, 0);

    -- 5. Final Net Payable (Mandi's liability to Supplier)
    -- Formula: Net = Gross - Commission - Expenses - OtherDeductions
    v_net_payable := GREATEST(0, v_gross - v_comm - v_lot_expenses - v_other_deductions);

    -- 6. Determine Payment Status (Paid, Partial, Pending)
    v_bill_status := mandi.classify_bill_status(
        p_net_payable    := v_net_payable,
        p_advance        := COALESCE(NEW.advance, 0),
        p_mode           := NEW.advance_payment_mode,
        p_cheque_cleared := COALESCE(NEW.advance_cheque_status, false)
    );

    -- 7. Propagate back to LOT record for dashboard visibility
    NEW.net_payable := v_net_payable;
    NEW.gross_amount := v_gross;
    NEW.commission_amount := v_comm;
    NEW.payment_status := v_bill_status;
    NEW.paid_amount := COALESCE(NEW.advance, 0);

    RETURN NEW;
END;
$$;

-- 2b. Audit Synchronization (AFTER INSERT/UPDATE)
CREATE OR REPLACE FUNCTION mandi.fn_sync_lot_to_purchase_bill()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_arrival RECORD;
    v_item_name TEXT;
    v_lot_expenses NUMERIC;
BEGIN
    -- 1. Fetch Metadata for the Bill
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = NEW.arrival_id;
    SELECT name INTO v_item_name FROM mandi.commodities WHERE id = NEW.item_id;

    v_lot_expenses := COALESCE(NEW.packing_cost, 0) + COALESCE(NEW.loading_cost, 0);

    -- 2. Upsert into Purchase Bills Ledger
    INSERT INTO mandi.purchase_bills (
        organization_id, lot_id, contact_id, bill_number, bill_date,
        gross_amount, commission_amount, less_amount, hamali_amount,
        other_deductions, net_payable, status, payment_status,
        contact_bill_no, created_by
    ) VALUES (
        NEW.organization_id, NEW.id, NEW.contact_id,
        COALESCE(v_arrival.reference_no, 'PB-' || COALESCE(v_arrival.contact_bill_no::text, NEW.id::text)) || '-' || COALESCE(v_item_name, 'ITEM'),
        COALESCE(v_arrival.arrival_date, CURRENT_DATE),
        NEW.gross_amount, NEW.commission_amount, COALESCE(NEW.less_units, 0), COALESCE(NEW.loading_cost, 0),
        CASE 
            WHEN NEW.arrival_type = 'direct' THEN COALESCE(NEW.other_cut, NEW.farmer_charges, 0) 
            ELSE (v_lot_expenses + COALESCE(NEW.other_cut, NEW.farmer_charges, 0)) 
        END,
        NEW.net_payable, 'draft', NEW.payment_status, v_arrival.contact_bill_no, NEW.created_by
    )
    ON CONFLICT (lot_id) DO UPDATE SET
        contact_id = EXCLUDED.contact_id,
        gross_amount = EXCLUDED.gross_amount,
        commission_amount = EXCLUDED.commission_amount,
        net_payable = EXCLUDED.net_payable,
        payment_status = EXCLUDED.payment_status,
        other_deductions = EXCLUDED.other_deductions;

    RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 3: TRIGGERS
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_calculate_lot_financials ON mandi.lots;
CREATE TRIGGER trg_calculate_lot_financials
BEFORE INSERT OR UPDATE OF 
    initial_qty, supplier_rate, commission_percent, 
    packing_cost, loading_cost, other_cut, 
    advance, advance_payment_mode, advance_cheque_status
ON mandi.lots
FOR EACH ROW
EXECUTE FUNCTION mandi.fn_calculate_lot_financials();

DROP TRIGGER IF EXISTS trg_sync_lot_to_purchase_bill ON mandi.lots;
CREATE TRIGGER trg_sync_lot_to_purchase_bill
AFTER INSERT OR UPDATE OF 
    net_payable, payment_status
ON mandi.lots
FOR EACH ROW
EXECUTE FUNCTION mandi.fn_sync_lot_to_purchase_bill();

-- ----------------------------------------------------------------------------
-- STEP 4: RPC CONSOLIDATION
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS mandi.record_quick_purchase(uuid, uuid, date, text, text, text, text, text, text, text, text, numeric, numeric, numeric, text, jsonb);

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
BEGIN
    -- 1. Consume sequences
    v_bill_no := mandi.get_internal_sequence(p_org_id, 'bill_no');
    v_contact_bill_no := mandi.next_contact_bill_no(p_org_id, p_party_id, 'purchase');

    -- 2. Create Header Arrival record
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_date, bill_no, contact_bill_no,
        vehicle_number, lot_no, storage_location, 
        vehicle_type, guarantor, driver_name, driver_mobile,
        trip_loading_amount, advance_amount, trip_other_expenses,
        advance_payment_mode, status, notes
    ) VALUES (
        p_org_id, p_party_id, p_arrival_date, v_bill_no, v_contact_bill_no,
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
            COALESCE(v_lot->>'arrival_type', 'direct'),
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
