CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id uuid,
    p_contact_id      uuid,
    p_start_date      timestamp with time zone,
    p_end_date        timestamp with time zone
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
BEGIN
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO   v_opening_balance
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id
      AND  contact_id      = p_contact_id
      AND  entry_date      < p_start_date;

    SELECT MAX(entry_date)
    INTO   v_last_activity
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id
      AND  contact_id      = p_contact_id;

    WITH raw_data AS (
        SELECT
            le.id,
            le.entry_date,
            le.voucher_id,
            le.transaction_type,
            le.description          AS raw_description,
            le.debit,
            le.credit,
            le.reference_no,
            le.reference_id,
            a.id                    AS arrival_id,
            a.bill_no               AS arrival_bill_no,
            a.reference_no          AS arrival_ref_no,
            v.type                  AS v_type,
            v.voucher_no            AS v_voucher_no,
            v.narration             AS v_narration,
            v.invoice_id            AS v_invoice_id,
            COALESCE(
                 a.id::text,
                 (CASE WHEN le.transaction_type LIKE 'sale%' THEN le.reference_id::text ELSE NULL END),
                 le.voucher_id::text,
                 le.reference_id::text,
                 le.id::text
            ) AS group_id
        FROM  mandi.ledger_entries le
        LEFT  JOIN mandi.arrivals a ON (
            (le.transaction_type IN ('purchase', 'arrival', 'lot_purchase') AND le.reference_id = a.id)
            OR (le.reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = a.id))
        )
        LEFT  JOIN mandi.vouchers v ON le.voucher_id = v.id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id      = p_contact_id
          AND le.entry_date BETWEEN p_start_date AND p_end_date
    ),
    grouped_data AS (
        SELECT
            group_id,
            MIN(id::text)::uuid                                         AS sort_id,
            MIN(entry_date)                                             AS entry_date,
            SUM(debit)                                                  AS debit,
            SUM(credit)                                                 AS credit,
            MAX(v_invoice_id)                                           AS invoice_id,
            MAX(reference_id)                                           AS primary_ref_id,
            CASE
                WHEN MAX(v_type) = 'sales' OR MAX(raw_description) ILIKE 'Invoice #%' THEN
                    CASE WHEN SUM(debit) > 0 THEN 'SALE (CREDIT)' ELSE 'SALE (CASH)' END
                WHEN MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL THEN 'PURCHASE'
                WHEN (MAX(v_type) IN ('receipt','payment') OR MAX(transaction_type) = 'payment') AND SUM(credit) > 0 THEN 'PAYMENT'
                WHEN SUM(credit) > 0 AND MAX(v_type) IS NULL THEN 'RECEIPT'
                ELSE UPPER(COALESCE(MAX(v_type), MAX(transaction_type), 'TRANSACTION'))
            END                                                         AS voucher_type,
            COALESCE(
                'Bill #' || NULLIF(MAX(arrival_ref_no), ''),
                'Bill #' || MAX(arrival_bill_no)::text,
                MAX(v_voucher_no)::text,
                MAX(reference_no),
                '-'
            )                                                           AS voucher_no,
            CASE
                WHEN COUNT(*) > 1 AND (MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL) THEN
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no),''), MAX(arrival_bill_no)::text, 'Multi') || ' (Multi-item)'
                WHEN COUNT(*) = 1 AND (MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL) THEN
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no),''), MAX(arrival_bill_no)::text, '-')
                WHEN MAX(transaction_type) LIKE 'sale%' THEN
                    MAX(COALESCE(raw_description, v_narration, 'Sale Transaction'))
                WHEN COUNT(*) > 1 THEN 'Grouped Transaction'
                ELSE MAX(COALESCE(raw_description, v_narration, 'Transaction'))
            END                                                         AS description,
            array_agg(DISTINCT voucher_id)   FILTER (WHERE voucher_id   IS NOT NULL) AS voucher_ids,
            array_agg(DISTINCT reference_id) FILTER (WHERE reference_id IS NOT NULL) AS reference_ids,
            array_agg(DISTINCT arrival_id)   FILTER (WHERE arrival_id   IS NOT NULL) AS arrival_ids
        FROM raw_data
        GROUP BY group_id
    ),
    ranked_tx AS (
        SELECT
            *,
            SUM(COALESCE(debit,0) - COALESCE(credit,0))
                OVER (ORDER BY entry_date, sort_id)    AS running_diff
        FROM grouped_data
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id',              group_id,
            'date',            entry_date,
            'voucher_type',    voucher_type,
            'voucher_no',      voucher_no,
            'description',     description,
            'debit',           debit,
            'credit',          credit,
            'products', (
                SELECT jsonb_agg(p) FROM (
                    -- Sales invoice items
                    SELECT DISTINCT ON (si.id)
                        jsonb_build_object(
                            'name',   i.name,
                            'qty',    si.qty,
                            'unit',   COALESCE(si.unit,'Units'),
                            'rate',   si.rate,
                            'lot_no', l1.lot_code
                        ) AS p
                    FROM  mandi.sales      s
                    JOIN  mandi.sale_items si ON si.sale_id = s.id
                    JOIN  mandi.lots       l1 ON si.lot_id  = l1.id
                    JOIN  mandi.commodities i ON l1.item_id = i.id
                    WHERE s.id = OuterQuery.invoice_id
                       OR s.id = ANY(OuterQuery.reference_ids)
                       OR s.id = OuterQuery.primary_ref_id

                    UNION ALL

                    -- Purchase lot items
                    SELECT DISTINCT ON (l2.id)
                        jsonb_build_object(
                            'name',   i1.name,
                            'qty',    l2.initial_qty,
                            'unit',   l2.unit,
                            'rate',   l2.supplier_rate,
                            'lot_no', l2.lot_code
                        ) AS p
                    FROM  mandi.lots        l2
                    JOIN  mandi.commodities i1 ON l2.item_id = i1.id
                    JOIN  mandi.arrivals    a2 ON l2.arrival_id = a2.id
                    WHERE a2.id = ANY(OuterQuery.arrival_ids)
                       OR l2.id = ANY(OuterQuery.reference_ids)
                       OR l2.id = OuterQuery.primary_ref_id
                ) t
            ),
            'charges', (
                SELECT jsonb_agg(c) FROM (
                    SELECT jsonb_build_object('label', label, 'amount', amount) AS c
                    FROM (
                        SELECT 'Market Fee' AS label, market_fee::numeric      AS amount FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids) OR id = OuterQuery.primary_ref_id
                        UNION ALL
                        SELECT 'Nirashrit',           nirashrit::numeric                  FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids) OR id = OuterQuery.primary_ref_id
                        UNION ALL
                        SELECT 'Loading',             loading_charges::numeric            FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids) OR id = OuterQuery.primary_ref_id
                        UNION ALL
                        SELECT 'Transportation',      hire_charges::numeric               FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids) OR id = OuterQuery.primary_ref_id
                        UNION ALL
                        SELECT 'Hamali',              hamali_expenses::numeric            FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids) OR id = OuterQuery.primary_ref_id
                    ) charges WHERE amount > 0
                ) t2
            ),
            'running_balance', (v_opening_balance + running_diff)
        )
    )
    INTO v_rows
    FROM (SELECT * FROM ranked_tx ORDER BY entry_date ASC, sort_id ASC) OuterQuery;

    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO   v_closing_balance
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id
      AND  contact_id      = p_contact_id
      AND  entry_date      <= p_end_date;

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'last_activity',   v_last_activity,
        'transactions',    COALESCE(v_rows, '[]'::jsonb)
    );
END;
$function$;
