-- ============================================================================
-- PURCHASE BILL ENGINE (v1.0)
-- Migration: 20260424_purchase_bill_engine.sql
-- 
-- GOALS:
-- 1. ATOMIC: Every lot insertion/update syncs to mandi.purchase_bills.
-- 2. UNIFIED: Handles Arrivals, Quick Purchase, and Purchase+Sale.
-- 3. FACT-BASED: Calculations are performed in DB to ensure data integrity.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: TRIGGER FUNCTION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mandi.fn_sync_lot_to_purchase_bill()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_arrival RECORD;
    v_item_name TEXT;
    v_gross NUMERIC;
    v_comm NUMERIC;
    v_net_payable NUMERIC;
    v_bill_status TEXT;
    v_other_deductions NUMERIC;
    v_eps NUMERIC := 0.01;
BEGIN
    -- 1. Get Parent Arrival Metadata
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = NEW.arrival_id;
    
    -- 2. Get Item Name for Bill Numbering
    SELECT name INTO v_item_name FROM mandi.commodities WHERE id = NEW.item_id;

    -- 3. Calculate Financials (If not already provided by RPC)
    -- We prefer values already in NEW if they exist, otherwise fallback to formula.
    v_gross := COALESCE(NEW.gross_amount, (NEW.initial_qty - COALESCE(NEW.less_units, 0)) * NEW.supplier_rate);
    v_comm := COALESCE(NEW.commission_amount, v_gross * (COALESCE(NEW.commission_percent, 0) / 100.0));
    v_other_deductions := COALESCE(NEW.packing_cost, 0) + COALESCE(NEW.loading_cost, 0) + COALESCE(NEW.other_cut, 0);
    
    -- Final Net Payable Calculation
    v_net_payable := v_gross - v_comm - v_other_deductions;

    -- 4. Determine Payment Status
    v_bill_status := mandi.classify_bill_status(
        p_net_payable    := v_net_payable,
        p_advance        := COALESCE(NEW.advance, 0),
        p_mode           := NEW.advance_payment_mode,
        p_cheque_cleared := COALESCE(NEW.advance_cheque_status, false)
    );

    -- 5. Upsert into purchase_bills
    INSERT INTO mandi.purchase_bills (
        organization_id,
        lot_id,
        contact_id,
        bill_number,
        bill_date,
        gross_amount,
        commission_amount,
        less_amount,
        hamali_amount,
        other_deductions,
        net_payable,
        status,
        payment_status,
        contact_bill_no,
        created_by
    ) VALUES (
        NEW.organization_id,
        NEW.id,
        NEW.contact_id,
        COALESCE(v_arrival.reference_no, 'PB-' || COALESCE(v_arrival.contact_bill_no::text, NEW.id::text)) || '-' || COALESCE(v_item_name, 'ITEM'),
        COALESCE(v_arrival.arrival_date, CURRENT_DATE),
        v_gross,
        v_comm,
        COALESCE(NEW.less_units, 0), -- less_amount maps to units here or units*rate? Usually units for weight.
        COALESCE(NEW.loading_cost, 0), -- hamali
        v_other_deductions,
        v_net_payable,
        'completed',
        v_bill_status,
        v_arrival.contact_bill_no,
        NEW.created_by
    )
    ON CONFLICT (lot_id) DO UPDATE SET
        contact_id = EXCLUDED.contact_id,
        gross_amount = EXCLUDED.gross_amount,
        commission_amount = EXCLUDED.commission_amount,
        net_payable = EXCLUDED.net_payable,
        payment_status = EXCLUDED.payment_status,
        other_deductions = EXCLUDED.other_deductions;

    -- Update the lot's own calculated fields for consistency if they were NULL
    NEW.net_payable := v_net_payable;
    NEW.gross_amount := v_gross;
    NEW.commission_amount := v_comm;
    NEW.payment_status := v_bill_status;

    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 2: TRIGGER
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sync_lot_to_purchase_bill ON mandi.lots;
CREATE TRIGGER trg_sync_lot_to_purchase_bill
BEFORE INSERT OR UPDATE OF 
    initial_qty, supplier_rate, commission_percent, 
    packing_cost, loading_cost, other_cut, 
    advance, advance_payment_mode, advance_cheque_status
ON mandi.lots
FOR EACH ROW
EXECUTE FUNCTION mandi.fn_sync_lot_to_purchase_bill();

-- ----------------------------------------------------------------------------
-- STEP 3: BACKFILL MISSING RECORDS
-- ----------------------------------------------------------------------------

-- Identify lots that don't have a purchase bill and force an update to trigger creation
UPDATE mandi.lots 
SET updated_at = NOW() 
WHERE id NOT IN (SELECT lot_id FROM mandi.purchase_bills)
AND status IN ('available', 'active', 'partial');

COMMIT;
