-- ============================================================
-- MANDIGROW FINAL HARMONY & VISIBILITY FIX (v5.5)
-- PURPOSE: Fix Frontend-Backend Parameter Mismatch
--          Restore Ledger, Sales Lots, and Purchase Sync.
-- ============================================================

BEGIN;

-- 1. ALIGN: get_ledger_statement
-- Renaming parameters to match what the UI (statement-viewer.tsx) actually sends.
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id uuid,
    p_contact_id uuid,
    p_from_date date,
    p_to_date date
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_opening_balance numeric := 0;
    v_closing_balance numeric := 0;
    v_last_activity timestamptz;
    v_rows jsonb;
    v_start_ts timestamp with time zone;
    v_end_ts timestamp with time zone;
BEGIN
    -- Convert input dates to full timestamps
    v_start_ts := p_from_date::timestamp with time zone;
    v_end_ts := (p_to_date::text || ' 23:59:59')::timestamp with time zone;

    -- 1. Opening Balance (Status Aware)
    SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
    INTO v_opening_balance
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id = p_contact_id
      AND le.entry_date < v_start_ts
      AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
      AND NOT (le.transaction_type IN ('sale_fee', 'sale_expense', 'gst'));

    -- 2. Last Activity (Status Aware)
    SELECT MAX(le.entry_date)
    INTO v_last_activity
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id = p_contact_id
      AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
      AND NOT (le.transaction_type IN ('sale_fee', 'sale_expense', 'gst'));

    -- 3. Detail Rows (Status Aware)
    WITH base_entries AS (
        SELECT
            le.id,
            le.entry_date,
            COALESCE(le.description, '') AS raw_description,
            COALESCE(le.debit, 0) AS debit,
            COALESCE(le.credit, 0) AS credit,
            le.transaction_type,
            le.reference_id,
            le.reference_no,
            le.voucher_id,
            le.products,
            v.type AS header_type,
            v.voucher_no AS header_voucher_no,
            v.narration AS header_narration
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.vouchers v ON v.id = le.voucher_id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id = p_contact_id
          AND le.entry_date BETWEEN v_start_ts AND v_end_ts
          AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
          AND NOT (le.transaction_type IN ('sale_fee', 'sale_expense', 'gst'))
    ),
    statement_rows AS (
        SELECT
            be.*,
            v_opening_balance
                + SUM(be.debit - be.credit) OVER (
                    ORDER BY be.entry_date ASC, COALESCE(be.header_voucher_no, 0) ASC, be.id ASC
                ) AS running_balance
        FROM base_entries be
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', sr.id,
            'date', sr.entry_date,
            'voucher_type', UPPER(COALESCE(sr.header_type, sr.transaction_type, 'TX')),
            'voucher_no', COALESCE(sr.reference_no, sr.header_voucher_no::text, '-'),
            'description', COALESCE(sr.header_narration, sr.raw_description, 'Transaction'),
            'debit', sr.debit,
            'credit', sr.credit,
            'products', COALESCE(sr.products, '[]'::jsonb),
            'running_balance', sr.running_balance
        )
        ORDER BY sr.entry_date DESC, sr.id DESC
    )
    INTO v_rows
    FROM statement_rows sr;

    -- 4. Closing Balance (Status Aware)
    SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
    INTO v_closing_balance
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id = p_contact_id
      AND le.entry_date <= v_end_ts
      AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
      AND NOT (le.transaction_type IN ('sale_fee', 'sale_expense', 'gst'));

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'last_activity', v_last_activity,
        'transactions', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$function$;

COMMIT;
