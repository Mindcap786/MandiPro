-- ============================================================
-- FINANCIAL STABILIZATION MASTER FIX
-- Migration: 20260427000001_finance_stabilization_master.sql
--
-- Goals:
-- 1. Automatic Payment Status Sync (Triggered by Ledger)
-- 2. Prevent Day Book Double Debits (Voucher Grouping)
-- 3. Clean Consolidated Ledger Statement (String Aggregation)
-- ============================================================

BEGIN;

-- [0] HELPERS: Logic for status classification
CREATE OR REPLACE FUNCTION mandi.classify_bill_status(
    p_bill_amount NUMERIC,
    p_paid_amount NUMERIC
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_bill_amount, 0) <= 0.01 THEN 'pending'
        WHEN COALESCE(p_paid_amount, 0) >= COALESCE(p_bill_amount, 0) - 0.01 THEN 'paid'
        WHEN COALESCE(p_paid_amount, 0) > 0.01 THEN 'partial'
        ELSE 'pending'
    END;
$$;

-- [1] TRIGGER: Sync Transaction Status Always
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
    -- Only act if reference_id is set
    v_ref_id := COALESCE(NEW.reference_id, OLD.reference_id);
    IF v_ref_id IS NULL THEN RETURN NULL; END IF;

    -- CASE A: SALE (Recalculate status in mandi.sales)
    IF EXISTS (SELECT 1 FROM mandi.sales WHERE id = v_ref_id) THEN
        -- Sum credits (payments/receipts) minus debits (returns/adjustments)
        SELECT ROUND(COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0), 2)
        INTO v_total_paid
        FROM mandi.ledger_entries
        WHERE reference_id = v_ref_id
          AND transaction_type NOT IN ('sale', 'opening_balance') -- Exclude the bill itself
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
    IF EXISTS (SELECT 1 FROM mandi.lots WHERE id = v_ref_id) THEN
        -- Sum debits (payments/made) minus credits (returns/adjustments)
        SELECT ROUND(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0), 2)
        INTO v_total_paid
        FROM mandi.ledger_entries
        WHERE reference_id = v_ref_id
          AND transaction_type NOT IN ('purchase', 'opening_balance') -- Exclude the bill itself
          AND COALESCE(status, 'active') IN ('active', 'posted', 'cleared', 'confirmed');

        SELECT net_payable INTO v_total_bill
        FROM mandi.lots WHERE id = v_ref_id;

        UPDATE mandi.lots
        SET 
            paid_amount = v_total_paid,
            payment_status = mandi.classify_bill_status(v_total_bill, v_total_paid),
            updated_at = NOW()
        WHERE id = v_ref_id;
        
        -- Also bubble up to the parent Arrival
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

DROP TRIGGER IF EXISTS trg_sync_financial_status ON mandi.ledger_entries;
CREATE TRIGGER trg_sync_financial_status
AFTER INSERT OR UPDATE OR DELETE ON mandi.ledger_entries
FOR EACH ROW EXECUTE FUNCTION mandi.sync_transaction_status();

-- [2] BACKFILL HISTORY: Link payments with missing reference_ids
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT le.id, le.narration, le.organization_id, le.contact_id
        FROM mandi.ledger_entries le
        WHERE le.reference_id IS NULL 
          AND le.transaction_type IN ('sale_payment', 'receipt', 'payment')
          AND le.narration ILIKE '%Sale #%'
    LOOP
        UPDATE mandi.ledger_entries
        SET reference_id = (
            SELECT s.id 
            FROM mandi.sales s
            WHERE s.organization_id = r.organization_id
              AND s.buyer_id = r.contact_id
              AND s.bill_no::text = split_part(r.narration, 'Sale #', 2)
            ORDER BY s.created_at DESC
            LIMIT 1
        )
        WHERE id = r.id;
    END LOOP;
END;
$$;

-- One-time full sync for all existing transactions
DO $$
DECLARE
    v_sale_id UUID;
    v_lot_id UUID;
BEGIN
    -- Sync Sales
    FOR v_sale_id IN SELECT id FROM mandi.sales LOOP
        UPDATE mandi.sales s SET 
            amount_received = (
                SELECT ROUND(COALESCE(SUM(credit - debit), 0), 2) 
                FROM mandi.ledger_entries 
                WHERE reference_id = v_sale_id 
                  AND transaction_type NOT IN ('sale', 'opening_balance')
                  AND COALESCE(status, 'active') IN ('active', 'posted', 'cleared')
            )
        WHERE id = v_sale_id;
        
        UPDATE mandi.sales s SET
            payment_status = mandi.classify_bill_status(total_amount_inc_tax, amount_received)
        WHERE id = v_sale_id;
    END LOOP;

    -- Sync Lots
    FOR v_lot_id IN SELECT id FROM mandi.lots LOOP
        UPDATE mandi.lots l SET 
            paid_amount = (
                SELECT ROUND(COALESCE(SUM(debit - credit), 0), 2) 
                FROM mandi.ledger_entries 
                WHERE reference_id = v_lot_id 
                  AND transaction_type NOT IN ('purchase', 'opening_balance')
                  AND COALESCE(status, 'active') IN ('active', 'posted', 'cleared')
            )
        WHERE id = v_lot_id;
        
        UPDATE mandi.lots l SET
            payment_status = mandi.classify_bill_status(net_payable, paid_amount)
        WHERE id = v_lot_id;
    END LOOP;
END;
$$;

-- [3] REBUILD DAYBOOK: Grouped by Voucher to avoid double-debiting
CREATE OR REPLACE FUNCTION mandi.get_daybook_transactions(
    p_organization_id UUID DEFAULT auth.uid(),
    p_from_date DATE DEFAULT CURRENT_DATE,
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO mandi, public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH grouped_voucher_summary AS (
        SELECT
            v.id AS transaction_id,
            v.date AS transaction_date,
            v.type AS transaction_type,
            COALESCE(v.narration, 'Transaction') AS description,
            c.name AS party_name,
            -- Heuristic: Sales/Purchases are Debits (mostly), Receipts/Payments are Credits
            -- We show the AMOUNT from the Voucher table which is the single source of truth for the TX value.
            CASE WHEN v.type IN ('sale', 'purchase') THEN v.amount ELSE 0 END AS debit,
            CASE WHEN v.type IN ('receipt', 'payment') THEN v.amount ELSE 0 END AS credit,
            -- Extra fields for UI details
            jsonb_build_object(
                'voucher_no', v.voucher_no,
                'payment_mode', v.payment_mode,
                'is_cleared', v.is_cleared
            ) AS metadata
        FROM mandi.vouchers v
        LEFT JOIN mandi.contacts c ON c.id = v.party_id
        WHERE v.organization_id = p_organization_id
          AND v.date BETWEEN p_from_date AND p_to_date
          AND COALESCE(v.status, 'active') = 'active'
    )
    SELECT jsonb_agg(row_to_json(gv))
    INTO v_result
    FROM (
        SELECT * FROM grouped_voucher_summary ORDER BY transaction_date DESC, transaction_id DESC
    ) gv;
    
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- [4] REBUILD LEDGER: Consolidated rows with aggregated particulars
DROP FUNCTION IF EXISTS mandi.get_ledger_statement(UUID, UUID, DATE, DATE);
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id      UUID,
    p_from_date       DATE,
    p_to_date         DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO mandi, public
AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_closing_balance NUMERIC := 0;
    v_last_activity   TIMESTAMPTZ;
    v_rows            JSONB;
    v_start_ts        TIMESTAMPTZ := p_from_date::timestamptz;
    v_end_ts          TIMESTAMPTZ := (p_to_date::text || ' 23:59:59')::timestamptz;
BEGIN
    -- Opening Balance
    SELECT COALESCE(SUM(debit) - SUM(credit), 0)
    INTO v_opening_balance
    FROM mandi.ledger_entries
    WHERE organization_id = p_organization_id
      AND contact_id = p_contact_id
      AND entry_date < v_start_ts
      AND COALESCE(status, 'active') IN ('active', 'posted', 'cleared', 'confirmed');

    -- Last Activity
    SELECT MAX(entry_date) INTO v_last_activity
    FROM mandi.ledger_entries
    WHERE organization_id = p_organization_id AND contact_id = p_contact_id;

    -- Grouped Statement Rows
    WITH voucher_aggregation AS (
        SELECT
            le.voucher_id,
            le.entry_date,
            SUM(le.debit) AS debit_total,
            SUM(le.credit) AS credit_total,
            -- Aggregate particulars
            string_agg(
                DISTINCT CASE 
                    WHEN JSONB_ARRAY_LENGTH(le.products) > 0 THEN
                        (SELECT string_agg(p->>'name' || ' (' || (p->>'qty') || ' @ ' || (p->>'rate') || ', ' || (p->>'lot_no') || ')', ', ') 
                         FROM jsonb_array_elements(le.products) p)
                    ELSE NULL
                END, 
                ' | '
            ) AS product_narration,
            -- Aggregate other details
            COALESCE(v.narration, string_agg(DISTINCT le.narration, ' | '), 'Transaction') AS header_narration,
            v.type AS voucher_type,
            v.voucher_no AS voucher_no,
            le.reference_id
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.vouchers v ON v.id = le.voucher_id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id = p_contact_id
          AND le.entry_date BETWEEN v_start_ts AND v_end_ts
          AND COALESCE(le.status, 'active') IN ('active', 'posted', 'cleared', 'confirmed')
        GROUP BY le.voucher_id, le.entry_date, v.narration, v.type, v.voucher_no, le.reference_id
    ),
    sorted_rows AS (
        SELECT
            va.*,
            v_opening_balance + SUM(debit_total - credit_total) OVER (ORDER BY entry_date ASC, voucher_id ASC) AS running_balance
        FROM voucher_aggregation va
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'date', sr.entry_date,
            'voucher_type', UPPER(sr.voucher_type),
            'voucher_no', sr.voucher_no,
            'description', 
                CASE 
                    WHEN sr.product_narration IS NOT NULL THEN sr.header_narration || ' | ' || sr.product_narration
                    ELSE sr.header_narration
                END,
            'debit', sr.debit_total,
            'credit', sr.credit_total,
            'running_balance', sr.running_balance
        )
        ORDER BY sr.entry_date DESC, sr.id ASC -- Use id for deterministic sort
    ) INTO v_rows
    FROM (SELECT *, row_number() over() as id FROM sorted_rows) sr;

    -- Closing Balance
    SELECT v_opening_balance + COALESCE(SUM(debit) - SUM(credit), 0)
    INTO v_closing_balance
    FROM mandi.ledger_entries
    WHERE organization_id = p_organization_id
      AND contact_id = p_contact_id
      AND entry_date BETWEEN v_start_ts AND v_end_ts
      AND COALESCE(status, 'active') IN ('active', 'posted', 'cleared', 'confirmed');

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'last_activity', v_last_activity,
        'transactions', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$$;

COMMIT;
