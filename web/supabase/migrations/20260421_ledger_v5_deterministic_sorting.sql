-- V12: Deterministic Transaction Sorting & Un-collapsing
-- This migration fixes the random sorting issue caused by UUIDs and ensures
-- that Sales and Payments (even if in the same voucher) appear as distinct rows.

-- 1. Refactor get_ledger_statement
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_rows            JSONB;
    v_closing_balance NUMERIC;
    v_last_activity   TIMESTAMPTZ;
    v_contact_type    TEXT;
BEGIN
    SELECT type INTO v_contact_type FROM mandi.contacts WHERE id = p_contact_id;

    v_opening_balance := COALESCE(
        (SELECT SUM(debit) - SUM(credit)
         FROM mandi.ledger_entries
         WHERE organization_id = p_organization_id
           AND contact_id = p_contact_id
           AND entry_date < p_start_date), 
        0
    );

    v_last_activity := (SELECT MAX(entry_date) FROM mandi.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id);

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
                le.created_at, -- CRITICAL for deterministic sorting
                COALESCE(a.id, v.arrival_id) AS arrival_id_calc,
                a.bill_no AS arrival_bill_no, a.reference_no AS arrival_ref_no,
                v.type AS v_type, v.voucher_no AS v_voucher_no, v.narration AS v_narration, v.invoice_id AS v_invoice_id,
                s.bill_no AS sale_bill_no, s.contact_bill_no AS sale_contact_bill_no,
                -- Split by voucher AND type to show details separately (Systematic Fix)
                COALESCE(le.voucher_id::text, le.reference_id::text, le.id::text) || '-' || COALESCE(le.transaction_type, 'tx') AS group_id
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
                MIN(created_at) AS sort_time, -- Order by recording time
                MIN(id::text) AS tie_breaker,
                MIN(entry_date) AS entry_date,
                SUM(debit)  AS debit,
                SUM(credit) AS credit,
                MAX(v_invoice_id::text)::uuid AS invoice_id,
                CASE
                    WHEN MAX(transaction_type) IN ('sale','sales_revenue') THEN 'SALE'
                    WHEN MAX(transaction_type) IN ('purchase', 'lot_purchase', 'arrival') THEN 'PURCHASE'
                    WHEN MAX(transaction_type) IN ('receipt','payment','sale_payment','purchase_payment') THEN 
                        CASE WHEN v_contact_type = 'buyer' THEN 'RECEIPT' ELSE 'PAYMENT' END
                    ELSE UPPER(COALESCE(MAX(v_type), MAX(transaction_type), 'TXN'))
                END AS voucher_type,
                COALESCE(
                    'Bill #' || NULLIF(MAX(arrival_ref_no), ''),
                    'Bill #' || NULLIF(MAX(arrival_bill_no::text), ''),
                    'INV #'  || NULLIF(MAX(sale_contact_bill_no::text), ''),
                    'INV #'  || NULLIF(MAX(sale_bill_no::text), ''),
                    MAX(v_voucher_no::text),
                    '-'
                ) AS voucher_no,
                COALESCE(
                    NULLIF(TRIM(MAX(raw_description)), ''),
                    NULLIF(TRIM(MAX(v_narration)), ''),
                    'Transaction'
                ) AS description
            FROM raw_data
            GROUP BY group_id
        ),
        ranked_tx AS (
            SELECT *, SUM(COALESCE(debit,0) - COALESCE(credit,0)) OVER (ORDER BY entry_date, sort_time, tie_breaker) AS running_diff
            FROM grouped_data
        )
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', group_id, 'date', entry_date, 'voucher_type', voucher_type, 'voucher_no', voucher_no,
                'description', description, 'debit', debit, 'credit', credit,
                'running_balance', ROUND((v_opening_balance + running_diff)::NUMERIC, 2)
            )
        ) FROM (SELECT * FROM ranked_tx ORDER BY entry_date DESC, sort_time DESC, tie_breaker DESC) t
    );

    RETURN jsonb_build_object('opening_balance', v_opening_balance, 'closing_balance', v_closing_balance, 'last_activity', v_last_activity, 'transactions', COALESCE(v_rows, '[]'::jsonb));
END;
$$ LANGUAGE plpgsql;

-- 2. Refactor get_daybook_transactions (Using correct parameter names: p_from_date, p_to_date)
CREATE OR REPLACE FUNCTION mandi.get_daybook_transactions(
    p_organization_id uuid,
    p_from_date date,
    p_to_date date
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_rows jsonb;
BEGIN
    WITH daybook_base AS (
        SELECT 
            le.id,
            le.entry_date,
            le.created_at, -- deterministic sorting
            le.contact_id,
            c.name as party_name,
            le.description,
            le.debit,
            le.credit,
            le.transaction_type,
            le.voucher_id,
            le.products,
            CASE 
                WHEN le.transaction_type IN ('sale', 'sales_revenue', 'sale_payment') THEN 'SALE'
                WHEN le.transaction_type IN ('purchase', 'purchase_payment', 'lot_purchase', 'arrival') THEN 'PURCHASE'
                WHEN le.transaction_type IN ('receipt', 'cash_receipt', 'sale_payment') AND le.credit > 0 THEN 'RECEIPT'
                WHEN le.transaction_type IN ('payment', 'purchase_payment') AND le.debit > 0 THEN 'PAYMENT'
                ELSE 'OTHER'
            END as section_type,
            CASE 
                WHEN le.transaction_type IN ('sale', 'sales_revenue') AND le.debit > 0 THEN 'Sale Invoice'
                WHEN le.transaction_type IN ('sale', 'sales_revenue', 'sale_payment', 'receipt', 'cash_receipt') AND le.credit > 0 THEN 'Cash Collected'
                WHEN le.transaction_type IN ('purchase', 'purchase_payment', 'lot_purchase', 'arrival') AND le.credit > 0 THEN 'Purchase Bill'
                WHEN le.transaction_type IN ('purchase', 'purchase_payment') AND le.debit > 0 THEN 'Purchase Payment'
                WHEN le.transaction_type IN ('receipt', 'cash_receipt') THEN 'Cash Received'
                WHEN le.transaction_type = 'payment' THEN 'Payment Made'
                ELSE le.description
            END as category,
            -- Group by voucher and type to match ledger view
            ROW_NUMBER() OVER (PARTITION BY le.voucher_id, le.transaction_type ORDER BY le.id) as entry_seq
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.contacts c ON c.id = le.contact_id
        WHERE le.organization_id = p_organization_id
            AND le.entry_date BETWEEN p_from_date AND p_to_date
            AND COALESCE(le.status, 'active') IN ('active', 'posted')
            AND NOT (le.transaction_type IN ('sale_fee', 'sale_expense', 'gst')
                OR COALESCE(le.description, '') ILIKE ANY (ARRAY[
                    'Sales Revenue%', 'Sale Revenue%', 'Commission Income%',
                    'Transport Expense Recovery%', 'Transport Recovery Income%',
                    'Advance Contra (%', 'Stock In - %'
                ]))
    ),
    distinct_txns AS (
        SELECT 
            db.id,
            db.entry_date,
            db.created_at,
            db.section_type,
            db.category,
            db.party_name,
            db.description,
            db.debit,
            db.credit,
            db.voucher_id,
            db.products
        FROM daybook_base db
        WHERE db.entry_seq = 1
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', dt.id::text,
            'date', TO_CHAR(dt.entry_date, 'DD Mon YYYY'),
            'time', TO_CHAR(dt.created_at, 'HH24:MI'),
            'section', dt.section_type,
            'category', dt.category,
            'party', COALESCE(dt.party_name, '-'),
            'description', COALESCE(dt.description, ''),
            'reference', '#' || COALESCE(dt.voucher_id::text, '-'),
            'naam', dt.debit,
            'jama', dt.credit,
            'products', COALESCE(dt.products, '[]'::jsonb)
        )
        ORDER BY dt.entry_date DESC, dt.created_at DESC, dt.id DESC
    ) INTO v_rows
    FROM distinct_txns dt;

    RETURN jsonb_build_object(
        'success', true,
        'transactions', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$function$;
