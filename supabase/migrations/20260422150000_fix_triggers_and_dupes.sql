-- ============================================================
-- FINANCIAL STABILIZATION: FIX TRIGGERS & CLEAN DUPLICATES
-- Migration: 20260422150000_fix_triggers_and_dupes.sql
-- ============================================================

BEGIN;

-- 1. FIX THE LEDGER SYNC TRIGGER (PG_EXCEPTION_DETAIL Error)
CREATE OR REPLACE FUNCTION mandi.populate_ledger_bill_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_bill_number TEXT;
    v_lot_items JSONB;
    v_sales_bill_no TEXT;
    v_arrival_bill_no TEXT;
    v_err_detail TEXT;
    v_err_context TEXT;
    v_error_details JSONB;
BEGIN
    BEGIN
        IF NEW.reference_id IS NOT NULL AND NEW.transaction_type IN ('sale', 'goods') THEN
            SELECT s.bill_no INTO v_sales_bill_no FROM mandi.sales s WHERE s.id = NEW.reference_id;
            IF v_sales_bill_no IS NOT NULL THEN
                v_bill_number := 'SL-' || v_sales_bill_no;
                SELECT jsonb_agg(si) INTO v_lot_items FROM mandi.sale_items si WHERE si.sale_id = NEW.reference_id;
                NEW.bill_number := v_bill_number;
                NEW.lot_items_json := COALESCE(v_lot_items, '[]'::jsonb);
                NEW.was_synced_successfully := TRUE;
            END IF;
        ELSIF NEW.reference_id IS NOT NULL AND NEW.transaction_type IN ('arrival', 'goods_arrival') THEN
            SELECT a.bill_no INTO v_arrival_bill_no FROM mandi.arrivals a WHERE a.id = NEW.reference_id;
            IF v_arrival_bill_no IS NOT NULL THEN
                v_bill_number := 'ARR-' || v_arrival_bill_no;
                SELECT jsonb_agg(l) INTO v_lot_items FROM mandi.lots l WHERE l.arrival_id = NEW.reference_id;
                NEW.bill_number := v_bill_number;
                NEW.lot_items_json := COALESCE(v_lot_items, '[]'::jsonb);
                NEW.was_synced_successfully := TRUE;
            END IF;
        END IF;
        RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_detail = PG_EXCEPTION_DETAIL, v_err_context = PG_EXCEPTION_CONTEXT;
        v_error_details := jsonb_build_object('code', SQLSTATE, 'msg', SQLERRM, 'det', v_err_detail);
        INSERT INTO mandi.ledger_sync_errors (error_timestamp, transaction_type, reference_id, error_code, error_message, error_details)
        VALUES (NOW(), COALESCE(NEW.transaction_type, 'UNKNOWN'), NEW.reference_id, SQLSTATE, SQLERRM, v_error_details);
        NEW.was_synced_successfully := FALSE;
        RETURN NEW;
    END;
END;
$$;

-- 2. FIX THE SHARED TRIGGER (Table-Aware ID resolving)
CREATE OR REPLACE FUNCTION mandi.auto_update_arrival_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_total_paid NUMERIC;
    v_total_bill NUMERIC;
    v_new_status TEXT;
    v_ref_id UUID;
    v_table_name TEXT;
BEGIN
    v_table_name := TG_TABLE_NAME;

    -- Resolve ID based on which table triggered this
    IF (TG_OP = 'DELETE') THEN
        IF v_table_name = 'ledger_entries' THEN v_ref_id := OLD.reference_id;
        ELSIF v_table_name = 'payments' THEN v_ref_id := OLD.arrival_id;
        ELSE RETURN OLD; END IF;
    ELSE
        IF v_table_name = 'ledger_entries' THEN v_ref_id := NEW.reference_id;
        ELSIF v_table_name = 'payments' THEN v_ref_id := NEW.arrival_id;
        ELSE RETURN NEW; END IF;
    END IF;

    IF v_ref_id IS NULL THEN 
        IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- Only proceed if the ID actually exists in arrivals
    IF NOT EXISTS (SELECT 1 FROM mandi.arrivals WHERE id = v_ref_id) THEN
        IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- Calculate Totals from Ledger
    SELECT COALESCE(SUM(debit), 0) INTO v_total_paid FROM mandi.ledger_entries WHERE reference_id = v_ref_id AND transaction_type IN ('arrival_advance', 'payment', 'purchase_payment');
    SELECT COALESCE(SUM(credit), 0) INTO v_total_bill FROM mandi.ledger_entries WHERE reference_id = v_ref_id AND transaction_type IN ('arrival', 'purchase');

    -- Status Logic
    IF v_total_bill = 0 THEN v_new_status := 'pending';
    ELSIF v_total_paid >= (v_total_bill - 0.1) THEN v_new_status := 'paid';
    ELSIF v_total_paid > 0.1 THEN v_new_status := 'partial';
    ELSE v_new_status := 'pending'; END IF;

    -- Sync back to Header
    UPDATE mandi.arrivals SET payment_status = v_new_status, advance_amount = v_total_paid WHERE id = v_ref_id;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- 3. MERGE DUPLICATE CASH ACCOUNTS
-- Using a safer script that doesn't crash on ID mismatch
DO $$
DECLARE
    v_master_id UUID;
    v_dup_id UUID;
    v_org_id UUID;
BEGIN
    FOR v_org_id IN SELECT DISTINCT organization_id FROM mandi.accounts LOOP
        -- Master is the one with the MOST entries or oldest
        SELECT a.id INTO v_master_id 
        FROM mandi.accounts a 
        LEFT JOIN mandi.ledger_entries le ON le.account_id = a.id
        WHERE a.organization_id = v_org_id AND a.name = 'Cash in Hand' 
        GROUP BY a.id, a.created_at
        ORDER BY count(le.id) DESC, a.created_at ASC LIMIT 1;
        
        IF v_master_id IS NOT NULL THEN
            FOR v_dup_id IN SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND name = 'Cash in Hand' AND id <> v_master_id LOOP
                -- 1. Move Ledger Entries
                UPDATE mandi.ledger_entries SET account_id = v_master_id WHERE account_id = v_dup_id;
                -- 2. Move Payments (if any)
                UPDATE mandi.payments SET account_id = v_master_id WHERE account_id = v_dup_id;
                -- 3. Delete Duplicate
                DELETE FROM mandi.accounts WHERE id = v_dup_id;
            END LOOP;
        END IF;
    END LOOP;
END;
$$;

-- 4. LOCK DOWN DUPLICATES
DROP INDEX IF EXISTS idx_unique_cash_in_hand_per_org;
CREATE UNIQUE INDEX idx_unique_cash_in_hand_per_org 
ON mandi.accounts (organization_id, name) 
WHERE name = 'Cash in Hand';

COMMIT;
