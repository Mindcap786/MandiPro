-- 'Ultra-Detailed' Unified Ledger Statement
-- Migration: 20260411_world_class_ledger.sql
-- Goal: Fix mismatch (₹3.9L vs ₹62k) and provide full line-item + charge audit

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
    v_rows JSONB;
    v_closing_balance NUMERIC;
    v_last_activity_date TIMESTAMPTZ;
BEGIN
    -- 1. Unified Opening Balance Calculation (Searching both schemas for historical accuracy)
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_opening_balance
    FROM (
        SELECT debit, credit FROM mandi.ledger_entries 
        WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date < p_start_date
        UNION ALL
        SELECT debit, credit FROM public.ledger_entries 
        WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date < p_start_date
    ) combined_ledger;

    -- Get Last Activity Date
    SELECT MAX(entry_date) INTO v_last_activity_date
    FROM (
        SELECT entry_date FROM mandi.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id
        UNION ALL
        SELECT entry_date FROM public.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id
    ) combined_activity;

    -- 2. Fetch & Group Transactions (Unified)
    WITH raw_data AS (
        SELECT 
            le.id,
            le.entry_date,
            le.voucher_id,
            le.transaction_type,
            le.description as raw_description,
            le.debit,
            le.credit,
            le.reference_no,
            le.reference_id,
            l.arrival_id,
            l.lot_code,
            a.bill_no as arrival_bill_no,
            a.reference_no as arrival_ref_no,
            v.type as v_type,
            v.voucher_no as v_voucher_no,
            v.narration as v_narration,
            v.invoice_id as v_invoice_id,
            COALESCE(le.voucher_id::text, l.arrival_id::text, le.id::text) as group_id
        FROM (
            SELECT * FROM mandi.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date BETWEEN p_start_date AND p_end_date
            UNION ALL
            SELECT * FROM public.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date BETWEEN p_start_date AND p_end_date
        ) le
        LEFT JOIN mandi.lots l ON ( (le.transaction_type = 'lot_purchase' AND le.reference_id = l.id) OR (le.reference_id = l.id) )
        LEFT JOIN mandi.arrivals a ON l.arrival_id = a.id
        LEFT JOIN mandi.vouchers v ON le.voucher_id = v.id
    ),
    grouped_data AS (
        SELECT
            group_id,
            MIN(id::text)::uuid as sort_id, 
            MIN(entry_date) as entry_date,
            SUM(debit) as debit,
            SUM(credit) as credit,
            MAX(v_invoice_id) as invoice_id,
            CASE 
                WHEN MAX(v_type) = 'sales' OR MAX(raw_description) ILIKE 'Invoice #%' THEN 
                    CASE WHEN SUM(debit) > 0 THEN 'SALE (CREDIT)' ELSE 'SALE (CASH)' END
                WHEN MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL THEN 'PURCHASE'
                WHEN (MAX(v_type) IN ('receipt', 'payment') OR MAX(transaction_type) = 'payment') AND SUM(credit) > 0 THEN 'PAYMENT'
                WHEN SUM(credit) > 0 AND MAX(v_type) IS NULL THEN 'RECEIPT'
                ELSE UPPER(COALESCE(MAX(v_type), MAX(transaction_type), 'TRANSACTION'))
            END as voucher_type,
            COALESCE(
                'Bill #' || NULLIF(MAX(arrival_ref_no), ''),
                'Bill #' || MAX(arrival_bill_no)::TEXT,
                MAX(v_voucher_no)::TEXT,
                MAX(reference_no),
                '-'
            ) as voucher_no,
            CASE 
                WHEN COUNT(*) > 1 AND (MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL) THEN 
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no), ''), MAX(arrival_bill_no)::TEXT, 'Multi') || ' (Multi-item)'
                WHEN COUNT(*) = 1 AND (MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL) THEN
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no), ''), MAX(arrival_bill_no)::TEXT, '-') || ' | LOT: ' || COALESCE(MAX(lot_code), '-')
                WHEN COUNT(*) > 1 THEN 'Grouped Transaction'
                ELSE MAX(COALESCE(raw_description, v_narration, 'Transaction'))
            END as description,
            array_agg(DISTINCT voucher_id) FILTER (WHERE voucher_id IS NOT NULL) as voucher_ids,
            array_agg(DISTINCT reference_id) FILTER (WHERE reference_id IS NOT NULL) as reference_ids,
            array_agg(DISTINCT arrival_id) FILTER (WHERE arrival_id IS NOT NULL) as arrival_ids
        FROM raw_data
        GROUP BY group_id
    ),
    ranked_tx AS (
        SELECT 
            *,
            SUM(COALESCE(debit, 0) - COALESCE(credit, 0)) OVER (ORDER BY entry_date, sort_id) as running_diff
        FROM grouped_data
    ),
    ordered_tx AS (
        SELECT * FROM ranked_tx
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', group_id,
            'date', entry_date,
            'voucher_type', voucher_type,
            'voucher_no', voucher_no,
            'description', description,
            'debit', debit,
            'credit', credit,
            'products', (
                SELECT jsonb_agg(p) FROM (
                    -- Items from Sales Invoices
                    SELECT DISTINCT ON (si.id) jsonb_build_object('name', i.name, 'qty', si.quantity, 'unit', COALESCE(l1.unit, 'Units'), 'rate', si.rate, 'lot_no', l1.lot_code) as p
                    FROM mandi.sales s
                    JOIN mandi.sale_items si ON si.sale_id = s.id
                    JOIN mandi.lots l1 ON si.lot_id = l1.id
                    JOIN mandi.commodities i ON l1.item_id = i.id
                    WHERE s.id = OuterQuery.invoice_id
                       OR s.id = ANY(OuterQuery.reference_ids)
                       OR s.id IN (SELECT invoice_id FROM mandi.vouchers WHERE id = ANY(OuterQuery.voucher_ids))
                    
                    UNION ALL
                    
                    -- Items from Purchase Arrivals / Lots
                    SELECT DISTINCT ON (l2.id) jsonb_build_object('name', i1.name, 'qty', l2.initial_qty, 'unit', l2.unit, 'rate', l2.supplier_rate, 'lot_no', l2.lot_code) as p
                    FROM mandi.lots l2
                    JOIN mandi.commodities i1 ON l2.item_id = i1.id
                    WHERE l2.arrival_id = ANY(OuterQuery.arrival_ids)
                       OR l2.id = ANY(OuterQuery.reference_ids)
                ) t
            ),
            'charges', (
                SELECT jsonb_agg(c) FROM (
                    -- Buyer Charges (Sales)
                    SELECT jsonb_build_object('label', label, 'amount', amount) as c
                    FROM (
                        SELECT 'Market Fee' as label, market_fee::numeric as amount FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                        UNION ALL
                        SELECT 'Nirashrit' as label, nirashrit::numeric as amount FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                        UNION ALL
                        SELECT 'Loading' as label, loading_charges::numeric as amount FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                        UNION ALL
                        SELECT 'Misc' as label, misc_fee::numeric as amount FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                    ) bc WHERE amount > 0
                    
                    UNION ALL
                    
                    -- Supplier/Farmer Charges (Arrivals/Lots)
                    SELECT jsonb_build_object('label', label, 'amount', amount) as c
                    FROM (
                        SELECT 'Hire' as label, hire_charges::numeric as amount FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids)
                        UNION ALL
                        SELECT 'Labor' as label, hamali_expenses::numeric as amount FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids)
                        UNION ALL
                        SELECT 'Other Exp' as label, other_expenses::numeric as amount FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids)
                    ) sc WHERE amount > 0
                ) t2
            ),
            'running_balance', (v_opening_balance + running_diff)
        )
    ) INTO v_rows
    FROM (SELECT * FROM ordered_tx ORDER BY entry_date DESC, sort_id DESC) OuterQuery;

    -- 3. Calculate Closing Balance (Unified)
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_closing_balance
    FROM (
        SELECT debit, credit FROM mandi.ledger_entries 
        WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date <= p_end_date
        UNION ALL
        SELECT debit, credit FROM public.ledger_entries 
        WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date <= p_end_date
    ) combined_closing;

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'last_activity', v_last_activity_date,
        'transactions', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$function$;
