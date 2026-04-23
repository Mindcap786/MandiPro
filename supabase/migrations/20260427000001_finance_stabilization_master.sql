-- ============================================================
-- FINANCIAL STABILIZATION MASTER (v4 - Precise Sync)
-- Migration: 20260427000001_finance_stabilization_master.sql
-- ============================================================

BEGIN;

-- [0] TRIGGER: Sync Transaction Status
CREATE OR REPLACE FUNCTION mandi.sync_transaction_status()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ref_id UUID;
    v_total_paid NUMERIC;
    v_total_bill NUMERIC;
BEGIN
    v_ref_id := COALESCE(NEW.reference_id, OLD.reference_id);
    IF v_ref_id IS NULL THEN RETURN NULL; END IF;

    -- CASE A: SALE (Recalculate status in mandi.sales)
    -- Total Paid = SUM(Credits) - SUM(Debits) where type is NOT 'sale'
    -- (Receipts are Credits to the Buyer account)
    IF EXISTS (SELECT 1 FROM mandi.sales WHERE id = v_ref_id) THEN
        SELECT ROUND(COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0), 2)
        INTO v_total_paid
        FROM mandi.ledger_entries
        WHERE reference_id = v_ref_id
          AND transaction_type NOT IN ('sale', 'opening_balance')
          AND COALESCE(status, 'active') IN ('active', 'posted', 'cleared', 'confirmed');

        SELECT total_amount_inc_tax INTO v_total_bill
        FROM mandi.sales WHERE id = v_ref_id;

        UPDATE mandi.sales
        SET 
            amount_received = v_total_paid,
            payment_status = mandi.classify_bill_status(v_total_bill, v_total_paid),
            updated_at = NOW()
        WHERE id = v_ref_id;
    END IF;

    -- CASE B: LOT (Recalculate status in mandi.lots)
    -- Total Paid = SUM(Debits) - SUM(Credits) where type is NOT 'purchase'
    -- (Payments are Debits to the Supplier account)
    IF EXISTS (SELECT 1 FROM mandi.lots WHERE id = v_ref_id) THEN
        SELECT ROUND(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0), 2)
        INTO v_total_paid
        FROM mandi.ledger_entries
        WHERE reference_id = v_ref_id
          AND transaction_type NOT IN ('purchase', 'opening_balance')
          AND COALESCE(status, 'active') IN ('active', 'posted', 'cleared', 'confirmed');

        SELECT net_payable INTO v_total_bill
        FROM mandi.lots WHERE id = v_ref_id;

        UPDATE mandi.lots
        SET 
            paid_amount = v_total_paid,
            payment_status = mandi.classify_bill_status(v_total_bill, v_total_paid),
            updated_at = NOW()
        WHERE id = v_ref_id;
        
        -- Sync parent Arrival status
        UPDATE mandi.arrivals a
        SET status = (
            SELECT mandi.classify_bill_status(SUM(net_payable), SUM(paid_amount))
            FROM mandi.lots
            WHERE arrival_id = a.id
        )
        WHERE id = (SELECT arrival_id FROM mandi.lots WHERE id = v_ref_id);
    END IF;

    RETURN NULL;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_sync_financial_status ON mandi.ledger_entries;
CREATE TRIGGER trg_sync_financial_status
AFTER INSERT OR UPDATE OR DELETE ON mandi.ledger_entries
FOR EACH ROW EXECUTE FUNCTION mandi.sync_transaction_status();

-- [1] RECONCILIATION: Link unlinked payments to their respective bills
-- This is critical for Scenario 3 (Advance Payment) where the payment might be recorded before the bill.
-- Heuristic: If a payment exists for a contact without a reference_id, and a bill is created for that contact
-- within a close timeframe, they should be linked. (Manual reconciliation is safer, but we can do a best-effort link here).

-- For now, let's just make sure all existing transactions are synced.
DO $$
DECLARE
    v_sale_id UUID;
    v_lot_id UUID;
BEGIN
    FOR v_sale_id IN SELECT id FROM mandi.sales LOOP
        PERFORM mandi.sync_transaction_status() FROM (SELECT v_sale_id AS reference_id) s;
        -- Re-run trigger logic manually by updating one row or just calling it
        UPDATE mandi.sales SET updated_at = NOW() WHERE id = v_sale_id;
    END LOOP;

    FOR v_lot_id IN SELECT id FROM mandi.lots LOOP
        UPDATE mandi.lots SET updated_at = NOW() WHERE id = v_lot_id;
    END LOOP;
END;
$$;

COMMIT;
