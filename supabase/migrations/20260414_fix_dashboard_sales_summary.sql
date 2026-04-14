-- Fix dashboard cash sales display by correcting RPC descriptions
-- Issue: Dashboard not recognizing sales credit entries because descriptions don't match inferVoucherFlow 'sale_payment' pattern
-- Solution: Change descriptions to match: "Payment Received ... sale #" pattern

CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_contact_id UUID,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '90 days',
    p_to_date DATE DEFAULT CURRENT_DATE,
    p_organization_id UUID DEFAULT auth.uid(),
    p_status VARCHAR DEFAULT 'active'
)
RETURNS JSONB AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_closing_balance NUMERIC := 0;
    v_rows JSONB;
    v_contact_check INT;
BEGIN
    -- Permission check
    IF NOT mandi.check_access(p_organization_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Verify contact exists
    SELECT 1 INTO v_contact_check
    FROM mandi.contacts c
    WHERE c.id = p_contact_id
      AND c.organization_id = p_organization_id
    LIMIT 1;
    IF v_contact_check IS NULL THEN
        RAISE EXCEPTION 'Contact not found';
    END IF;

    -- Get opening balance (before p_from_date)
    SELECT SUM(debit) - SUM(credit)
    INTO v_opening_balance
    FROM mandi.ledger_entries
    WHERE contact_id = p_contact_id
      AND organization_id = p_organization_id
      AND entry_date < p_from_date;

    -- Main statement calculation
    WITH resolved_entries AS (
        SELECT
            le.id,
            le.entry_date,
            le.debit,
            le.credit,
            le.description,
            le.transaction_type,
            le.reference_no,
            le.header_voucher_no,
            le.header_narration,
            le.sale_id,
            le.arrival_id,
            le.raw_description,
            le.products,
            COALESCE(le.debit, 0) AS debit_amt,
            COALESCE(le.credit, 0) AS credit_amt
        FROM mandi.ledger_entries le
        WHERE le.contact_id = p_contact_id
          AND le.organization_id = p_organization_id
          AND (p_status = 'all' OR le.status IN ('active', 'posted'))
          AND le.entry_date BETWEEN p_from_date AND p_to_date
    ),
    sale_meta AS (
        SELECT
            s.id,
            s.bill_no,
            s.invoice_id,
            s.created_at
        FROM mandi.sales s
        WHERE s.organization_id = p_organization_id
    ),
    arrival_meta AS (
        SELECT
            a.id,
            a.bill_no,
            a.reference_no,
            a.created_at
        FROM mandi.arrivals a
        WHERE a.organization_id = p_organization_id
    ),
    sale_products AS (
        SELECT
            s.id,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'commodity', c.name,
                    'quantity', si.quantity::TEXT,
                    'unit', si.unit,
                    'rate', si.rate::NUMERIC,
                    'amount', (si.quantity * si.rate)::NUMERIC
                )
            ) AS products
        FROM mandi.sales s
        JOIN mandi.sale_items si ON si.sale_id = s.id
        JOIN mandi.commodities c ON c.id = si.commodity_id
        GROUP BY s.id
    ),
    sale_charges AS (
        SELECT
            s.id,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'name', sc.name,
                    'amount', COALESCE(sc.amount, 0)::NUMERIC
                )
            ) AS charges
        FROM mandi.sales s
        LEFT JOIN mandi.sale_charges sc ON sc.sale_id = s.id
        GROUP BY s.id
    ),
    arrival_products AS (
        SELECT
            a.id,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'commodity', c.name,
                    'quantity', ai.quantity::TEXT,
                    'unit', ai.unit,
                    'rate', ai.rate::NUMERIC,
                    'amount', (ai.quantity * ai.rate)::NUMERIC
                )
            ) AS products
        FROM mandi.arrivals a
        JOIN mandi.arrival_items ai ON ai.arrival_id = a.id
        JOIN mandi.commodities c ON c.id = ai.commodity_id
        GROUP BY a.id
    ),
    arrival_charges AS (
        SELECT
            a.id,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'name', ac.name,
                    'amount', COALESCE(ac.amount, 0)::NUMERIC
                )
            ) AS charges
        FROM mandi.arrivals a
        LEFT JOIN mandi.arrival_charges ac ON ac.arrival_id = a.id
        GROUP BY a.id
    ),
    statement_rows AS (
        SELECT
            re.id,
            re.entry_date,
            CASE
                WHEN re.sale_id IS NOT NULL THEN
                    CASE
                        WHEN re.debit_amt > 0 THEN 'SALE_INVOICE'
                        ELSE 'SALE_PAYMENT'
                    END
                WHEN re.arrival_id IS NOT NULL THEN
                    CASE
                        WHEN re.credit_amt > 0 THEN 'PURCHASE_BILL'
                        ELSE 'PURCHASE_PAYMENT'
                    END
                ELSE
                    'TRANSACTION'
            END AS voucher_type,
            CASE
                WHEN re.sale_id IS NOT NULL THEN
                    COALESCE(sm.bill_no::text, re.reference_no, re.header_voucher_no::text, '-')
                WHEN re.arrival_id IS NOT NULL THEN
                    COALESCE(NULLIF(am.reference_no, ''), am.bill_no::text, re.reference_no, re.header_voucher_no::text, '-')
                ELSE
                    COALESCE(re.reference_no, re.header_voucher_no::text, '-')
            END AS voucher_no,
            CASE
                -- Preserve custom raw descriptions if present
                WHEN NULLIF(re.raw_description, '') IS NOT NULL AND re.raw_description NOT ILIKE 'Invoice #%' AND re.raw_description NOT ILIKE 'Arrival Entry%' THEN re.raw_description
                -- Sales transactions
                WHEN re.sale_id IS NOT NULL AND re.debit_amt > 0 THEN
                    'Sale Invoice #' || COALESCE(sm.bill_no::text, re.header_voucher_no::text, '-')
                -- FIX: Changed from "Cash Received Against Sale #" to "Payment Received Against Sale #"
                -- This matches the dashboard's inferVoucherFlow 'sale_payment' pattern which expects 'payment received'
                WHEN re.sale_id IS NOT NULL AND re.credit_amt > 0 THEN
                    'Payment Received Against Sale #' || COALESCE(sm.bill_no::text, re.header_voucher_no::text, '-')
                -- Purchase transactions
                WHEN re.arrival_id IS NOT NULL AND re.credit_amt > 0 THEN
                    'Purchase Bill #' || COALESCE(NULLIF(am.reference_no, ''), am.bill_no::text, '-')
                WHEN re.arrival_id IS NOT NULL AND re.debit_amt > 0 THEN
                    'Payment Made for Purchase #' || COALESCE(NULLIF(am.reference_no, ''), am.bill_no::text, '-')
                ELSE
                    COALESCE(NULLIF(re.header_narration, ''), 'Transaction')
            END AS description,
            re.debit_amt AS debit,
            re.credit_amt AS credit,
            re.transaction_type,
            COALESCE(re.products, sp.products, ap.products, '[]'::jsonb) AS products,
            COALESCE(sc.charges, ac.charges, '[]'::jsonb) AS charges,
            v_opening_balance
                + SUM(re.debit_amt - re.credit_amt) OVER (
                    ORDER BY re.entry_date ASC, COALESCE(re.header_voucher_no, 0) ASC, re.id ASC
                ) AS running_balance
        FROM resolved_entries re
        LEFT JOIN sale_meta sm ON sm.id = re.sale_id
        LEFT JOIN arrival_meta am ON am.id = re.arrival_id
        LEFT JOIN sale_products sp ON sp.id = re.sale_id
        LEFT JOIN sale_charges sc ON sc.id = re.sale_id
        LEFT JOIN arrival_products ap ON ap.id = re.arrival_id
        LEFT JOIN arrival_charges ac ON ac.id = re.arrival_id
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', sr.id,
            'date', sr.entry_date,
            'voucher_type', sr.voucher_type,
            'voucher_no', sr.voucher_no,
            'description', sr.description,
            'narration', sr.description,
            'transaction_type', sr.transaction_type,
            'debit', sr.debit,
            'credit', sr.credit,
            'products', sr.products,
            'charges', sr.charges,
            'running_balance', sr.running_balance
        )
        ORDER BY sr.entry_date DESC, sr.id DESC
    )
    INTO v_rows
    FROM statement_rows sr;

    SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
    INTO v_closing_balance
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id = p_contact_id;

    RETURN jsonb_build_object(
        'data', COALESCE(v_rows, '[]'::jsonb),
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Also update get_daybook_transactions RPC with same description fixes
CREATE OR REPLACE FUNCTION mandi.get_daybook_transactions(
    p_organization_id UUID DEFAULT auth.uid(),
    p_from_date DATE DEFAULT CURRENT_DATE,
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT mandi.check_access(p_organization_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    WITH transaction_data AS (
        SELECT
            le.id,
            le.entry_date,
            le.contact_id,
            c.name AS contact_name,
            le.debit,
            le.credit,
            CASE
                -- FIX: Updated descriptions to match dashboard's sale_payment inference
                WHEN le.sale_id IS NOT NULL AND le.debit > 0 THEN
                    'Sale Invoice #' || COALESCE(s.bill_no::text, le.header_voucher_no::text, '-')
                WHEN le.sale_id IS NOT NULL AND le.credit > 0 THEN
                    'Payment Received Against Sale #' || COALESCE(s.bill_no::text, le.header_voucher_no::text, '-')
                WHEN le.arrival_id IS NOT NULL AND le.credit > 0 THEN
                    'Purchase Bill #' || COALESCE(NULLIF(a.reference_no, ''), a.bill_no::text, '-')
                WHEN le.arrival_id IS NOT NULL AND le.debit > 0 THEN
                    'Payment Made for Purchase #' || COALESCE(NULLIF(a.reference_no, ''), a.bill_no::text, '-')
                ELSE
                    COALESCE(NULLIF(le.header_narration, ''), 'Transaction')
            END AS description,
            le.transaction_type,
            CASE
                WHEN le.sale_id IS NOT NULL THEN 'SALE'
                WHEN le.arrival_id IS NOT NULL THEN 'PURCHASE'
                ELSE 'OTHER'
            END AS category,
            le.products
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.contacts c ON c.id = le.contact_id
        LEFT JOIN mandi.sales s ON s.id = le.sale_id
        LEFT JOIN mandi.arrivals a ON a.id = le.arrival_id
        WHERE le.organization_id = p_organization_id
          AND le.entry_date BETWEEN p_from_date AND p_to_date
          AND le.status IN ('active', 'posted')
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', td.id,
            'date', td.entry_date,
            'contact_name', td.contact_name,
            'description', td.description,
            'debit', td.debit,
            'credit', td.credit,
            'transaction_type', td.transaction_type,
            'category', td.category,
            'products', COALESCE(td.products, '[]'::jsonb)
        )
        ORDER BY td.entry_date DESC, td.id DESC
    )
    INTO v_result
    FROM transaction_data;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE;
