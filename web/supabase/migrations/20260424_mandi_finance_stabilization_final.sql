-- ============================================================
-- MANDIPRO FINAL STABILIZATION V7.3
-- Goal: Fix arrivals commit, Day Book grouping, and Ledger Rich Text.
-- Fix: Robust type handling for UUID and BIGINT aggregations.
-- ============================================================

BEGIN;

-- 1. CLEANUP PREVIOUS ATTEMPT
DROP FUNCTION IF EXISTS mandi.get_ledger_statement(uuid, uuid, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS mandi.get_ledger_statement(uuid, uuid, timestamp with time zone, timestamp with time zone) CASCADE;

-- 2. INSTALL DEFINITIVE GET_LEDGER_STATEMENT (Rich Text)
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id uuid, 
    p_contact_id uuid, 
    p_start_date timestamp with time zone, 
    p_end_date timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_rows            JSONB;
    v_closing_balance NUMERIC;
    v_last_activity   TIMESTAMPTZ;
    v_contact_type    TEXT;
BEGIN
    v_contact_type := (SELECT type FROM mandi.contacts WHERE id = p_contact_id);

    v_opening_balance := COALESCE(
        (SELECT SUM(debit) - SUM(credit)
         FROM mandi.ledger_entries
         WHERE organization_id = p_organization_id
           AND contact_id = p_contact_id
           AND entry_date < p_start_date), 
        0
    );

    v_last_activity := (
        SELECT MAX(entry_date)
        FROM mandi.ledger_entries
        WHERE organization_id = p_organization_id
          AND contact_id = p_contact_id
    );

    v_closing_balance := COALESCE(
        (SELECT SUM(debit) - SUM(credit)
         FROM mandi.ledger_entries
         WHERE organization_id = p_organization_id
           AND contact_id = p_contact_id
           AND entry_date <= p_end_date), 
        0
    );

    v_rows := (
        WITH raw_data AS (
            SELECT
                le.id, le.entry_date, le.voucher_id, le.transaction_type, le.description AS raw_description,
                le.debit, le.credit, le.reference_no, le.reference_id,
                COALESCE(a.id, v.arrival_id) AS arrival_id_calc,
                a.bill_no AS arrival_bill_no, a.reference_no AS arrival_ref_no,
                v.type AS v_type, v.voucher_no AS v_voucher_no, v.narration AS v_narration, v.invoice_id AS v_invoice_id,
                s.bill_no AS sale_bill_no, s.contact_bill_no AS sale_contact_bill_no,
                COALESCE(le.voucher_id::text, le.reference_id::text, le.id::text) AS group_id
            FROM  mandi.ledger_entries le
            LEFT  JOIN mandi.vouchers v ON le.voucher_id = v.id
            LEFT  JOIN mandi.sales s ON (le.reference_id = s.id OR v.invoice_id = s.id)
            LEFT  JOIN mandi.arrivals a ON (
                (le.transaction_type IN ('purchase', 'arrival', 'lot_purchase') AND le.reference_id = a.id)
                OR (le.reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = a.id))
                OR v.arrival_id = a.id
            )
            WHERE le.organization_id = p_organization_id
              AND le.contact_id      = p_contact_id
              AND le.entry_date BETWEEN p_start_date AND p_end_date
              AND COALESCE(le.status, 'active') != 'void'
        ),
        grouped_data AS (
            SELECT
                group_id,
                MIN(id::text)::uuid AS sort_id,
                MIN(entry_date) AS entry_date,
                SUM(debit)  AS debit,
                SUM(credit) AS credit,
                MAX(v_invoice_id::text)::uuid AS invoice_id,
                CASE
                    WHEN MAX(v_type) = 'sales' OR MAX(raw_description) ILIKE 'Invoice #%' THEN
                        CASE WHEN SUM(debit) > 0 THEN 'SALE (INVOICE)' ELSE 'SALE (CASH)' END
                    WHEN MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id_calc::text) IS NOT NULL THEN 'PURCHASE'
                    WHEN (MAX(v_type) IN ('receipt','payment') OR MAX(transaction_type) IN ('payment','receipt')) THEN
                        CASE WHEN v_contact_type = 'buyer' THEN 'RECEIPT' ELSE 'PAYMENT' END
                    ELSE UPPER(COALESCE(MAX(v_type), MAX(transaction_type), 'TRANSACTION'))
                END AS voucher_type,
                COALESCE(
                    'Bill #' || NULLIF(MAX(arrival_ref_no), ''),
                    'Bill #' || NULLIF(MAX(arrival_bill_no::text), ''),
                    'INV #'  || NULLIF(MAX(sale_contact_bill_no::text), ''),
                    'INV #'  || NULLIF(MAX(sale_bill_no::text), ''),
                    MAX(v_voucher_no::text),
                    MAX(reference_no),
                    '-'
                ) AS voucher_no,
                CASE
                    WHEN MAX(COALESCE(v_narration, raw_description)) IS NOT NULL 
                         AND MAX(COALESCE(v_narration, raw_description)) NOT IN ('sale', 'purchase', 'receipt', 'payment', 'Transaction') THEN 
                        MAX(COALESCE(v_narration, raw_description))
                    WHEN (MAX(v_type) = 'receipt' OR (v_contact_type = 'buyer' AND SUM(credit) > 0)) AND MAX(sale_bill_no::text) IS NOT NULL THEN
                        'Receipt against Inv #' || COALESCE(NULLIF(MAX(sale_contact_bill_no::text),''), MAX(sale_bill_no::text))
                    WHEN (MAX(v_type) = 'payment' OR (v_contact_type != 'buyer' AND SUM(debit) > 0)) AND MAX(arrival_bill_no::text) IS NOT NULL THEN
                        'Payment for Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no),''), MAX(arrival_bill_no::text))
                    WHEN MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id_calc::text) IS NOT NULL THEN
                        'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no),''), MAX(arrival_bill_no::text), '-')
                    ELSE MAX(COALESCE(v_narration, raw_description, 'Transaction'))
                END AS description,
                array_agg(DISTINCT voucher_id) FILTER (WHERE voucher_id IS NOT NULL) as voucher_ids,
                array_agg(DISTINCT reference_id) FILTER (WHERE reference_id IS NOT NULL) as reference_ids,
                array_agg(DISTINCT arrival_id_calc) FILTER (WHERE arrival_id_calc IS NOT NULL) as arrival_ids
            FROM raw_data
            GROUP BY group_id
        ),
        ranked_tx AS (
            SELECT *, SUM(COALESCE(debit,0) - COALESCE(credit,0)) OVER (ORDER BY entry_date, sort_id) AS running_diff
            FROM grouped_data
        )
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', group_id, 'date', entry_date, 'voucher_type', voucher_type, 'voucher_no', voucher_no,
                'description', description, 'debit', debit, 'credit', credit,
                'products', (
                    SELECT jsonb_agg(p) FROM (
                        SELECT DISTINCT ON (si.id) jsonb_build_object('name', i.name, 'qty', si.qty, 'unit', COALESCE(si.unit,'Units'), 'rate', si.rate, 'lot_no', l1.lot_code) as p
                        FROM mandi.sales s JOIN mandi.sale_items si ON si.sale_id = s.id LEFT JOIN mandi.lots l1 ON si.lot_id = l1.id JOIN mandi.commodities i ON si.item_id = i.id
                        WHERE s.id = OuterQuery.invoice_id OR s.id = ANY(OuterQuery.reference_ids) OR s.id IN (SELECT invoice_id FROM mandi.vouchers WHERE id = ANY(OuterQuery.voucher_ids))
                        UNION ALL
                        SELECT DISTINCT ON (l2.id) jsonb_build_object('name', i1.name, 'qty', l2.initial_qty, 'unit', l2.unit, 'rate', l2.supplier_rate, 'lot_no', l2.lot_code) as p
                        FROM mandi.lots l2 JOIN mandi.commodities i1 ON l2.item_id = i1.id JOIN mandi.arrivals a2 ON l2.arrival_id = a2.id
                        WHERE a2.id = ANY(OuterQuery.arrival_ids) OR l2.id = ANY(OuterQuery.reference_ids) OR a2.id IN (SELECT arrival_id FROM mandi.vouchers WHERE id = ANY(OuterQuery.voucher_ids))
                    ) t
                ),
                'running_balance', (v_opening_balance + running_diff)
            )
        ) FROM (SELECT * FROM ranked_tx ORDER BY entry_date DESC, sort_id DESC) OuterQuery
    );

    RETURN jsonb_build_object('opening_balance', v_opening_balance, 'closing_balance', v_closing_balance, 'last_activity', v_last_activity, 'transactions', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

COMMIT;
