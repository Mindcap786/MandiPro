-- ============================================================
-- v5.17: Consolidate get_ledger_statement to ONE version
--
-- RCA for "No data in Michel's ledger":
-- Layer 1 (DB)     ✅ — ledger_entries correct (8 rows, contact_id set)
-- Layer 2 (RPC)    ❌ — 4 overloaded versions of get_ledger_statement
--                       PostgreSQL: "function is not unique"
--                       → returns nothing to frontend
-- Layer 3 (RPC)    ❌ — Query read only 'description' column
--                       Backfilled entries only have 'narration'
--                       → description was NULL → empty display
-- Layer 4 (UI)     ✅ — Would render correctly if RPC returned data
--
-- FIX:
-- 1. Drop all 4 overloads (3 mandi + 1 public)
-- 2. Create ONE canonical version accepting DATE params
-- 3. Read BOTH narration AND description columns
-- 4. Return last_activity field (previously missing)
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'get_ledger_statement'
          AND n.nspname IN ('mandi', 'public')
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.oid::regprocedure);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id      UUID,
    p_from_date       DATE,
    p_to_date         DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_closing_balance NUMERIC := 0;
    v_last_activity   TIMESTAMPTZ;
    v_rows            JSONB;
    v_start_ts        TIMESTAMPTZ;
    v_end_ts          TIMESTAMPTZ;
BEGIN
    v_start_ts := p_from_date::timestamptz;
    v_end_ts   := (p_to_date::text || ' 23:59:59')::timestamptz;

    SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
    INTO v_opening_balance
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id      = p_contact_id
      AND le.entry_date      < v_start_ts
      AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
      AND COALESCE(le.transaction_type, '') NOT IN ('sale_fee', 'sale_expense', 'gst');

    SELECT MAX(le.entry_date) INTO v_last_activity
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id      = p_contact_id;

    WITH base_entries AS (
        SELECT
            le.id,
            le.entry_date,
            COALESCE(NULLIF(le.narration, ''), NULLIF(le.description, ''), '') AS raw_description,
            COALESCE(le.debit, 0)  AS debit,
            COALESCE(le.credit, 0) AS credit,
            le.transaction_type,
            le.reference_no,
            le.voucher_id,
            le.products,
            v.type       AS header_type,
            v.voucher_no AS header_voucher_no,
            COALESCE(NULLIF(v.narration, ''), NULLIF(le.narration, ''), le.description) AS header_narration
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.vouchers v ON v.id = le.voucher_id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id      = p_contact_id
          AND le.entry_date      BETWEEN v_start_ts AND v_end_ts
          AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
          AND COALESCE(le.transaction_type, '') NOT IN ('sale_fee', 'sale_expense', 'gst')
    ),
    statement_rows AS (
        SELECT be.*,
            v_opening_balance + SUM(be.debit - be.credit) OVER (
                ORDER BY be.entry_date ASC,
                         COALESCE(be.header_voucher_no, 0) ASC,
                         be.id ASC
            ) AS running_balance
        FROM base_entries be
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id',               sr.id,
            'date',             sr.entry_date,
            'voucher_type',     UPPER(COALESCE(sr.header_type, sr.transaction_type, 'TX')),
            'voucher_no',       COALESCE(sr.reference_no, sr.header_voucher_no::text, '-'),
            'description',      COALESCE(sr.header_narration, sr.raw_description, 'Transaction'),
            'narration',        COALESCE(sr.header_narration, sr.raw_description, 'Transaction'),
            'debit',            sr.debit,
            'credit',           sr.credit,
            'products',         COALESCE(sr.products, '[]'::jsonb),
            'running_balance',  sr.running_balance,
            'transaction_type', sr.transaction_type
        )
        ORDER BY sr.entry_date ASC, sr.id ASC
    ) INTO v_rows
    FROM statement_rows sr;

    SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
    INTO v_closing_balance
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id      = p_contact_id
      AND le.entry_date      <= v_end_ts
      AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
      AND COALESCE(le.transaction_type, '') NOT IN ('sale_fee', 'sale_expense', 'gst');

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'last_activity',   v_last_activity,
        'transactions',    COALESCE(v_rows, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.get_ledger_statement TO authenticated;
