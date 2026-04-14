-- Final refinement of get_ledger_statement to support Sales parsing from Description
DROP FUNCTION IF EXISTS get_ledger_statement(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);

CREATE OR REPLACE FUNCTION get_ledger_statement(
    p_organization_id UUID,
    p_contact_id UUID,
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_rows JSONB;
    v_closing_balance NUMERIC;
BEGIN
    -- 1. Calculate Opening Balance
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_opening_balance
    FROM ledger_entries
    WHERE organization_id = p_organization_id
      AND contact_id = p_contact_id
      AND entry_date < p_start_date;

    -- 2. Fetch Transactions with Enhanced Descriptions
    WITH ranked_tx AS (
        SELECT 
            le.id,
            le.entry_date,
            le.voucher_id,
            le.debit,
            le.credit,
            
            -- Enhanced Transaction Type Classification
            CASE 
                -- Sales usually match 'Invoice #XX' in description or have type 'sales'
                WHEN le.description ILIKE 'Invoice #%' OR v.type = 'sales' THEN 
                    CASE WHEN le.debit > 0 THEN 'SALE (CREDIT)' ELSE 'SALE (CASH)' END
                WHEN (v.type IN ('receipt', 'payment') OR le.transaction_type = 'payment') AND le.credit > 0 THEN 'PAYMENT'
                WHEN le.credit > 0 AND v.type IS NULL THEN 'RECEIPT'
                ELSE UPPER(COALESCE(v.type, le.transaction_type, 'TRANSACTION'))
            END as voucher_type,
            
            -- Keep original description but append narrated data if needed
            COALESCE(le.description, v.narration, 'Transaction') as description,

            -- Use the products column directly if available
            le.products as products,
            
            COALESCE(
                NULLIF(regexp_replace(le.description, '^Invoice #(\d+).*$', 'SALE / \1'), le.description),
                v.voucher_no::TEXT, 
                le.reference_no, 
                '-'
            ) as voucher_no,
            SUM(COALESCE(le.debit, 0) - COALESCE(le.credit, 0)) OVER (ORDER BY le.entry_date, le.id) as running_diff
            
        FROM ledger_entries le
        LEFT JOIN vouchers v ON le.voucher_id = v.id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id = p_contact_id
          AND le.entry_date BETWEEN p_start_date AND p_end_date
        ORDER BY le.entry_date, le.id
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'date', entry_date,
            'voucher_type', voucher_type,
            'voucher_no', voucher_no,
            'description', description,
            'debit', debit,
            'credit', credit,
            'products', products,
            'running_balance', (v_opening_balance + running_diff)
        )
    ) INTO v_rows
    FROM ranked_tx;

    -- 3. Calculate Closing Balance
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_closing_balance
    FROM ledger_entries
    WHERE organization_id = p_organization_id
      AND contact_id = p_contact_id
      AND entry_date <= p_end_date;

    -- 4. Return Composite Object
    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'transactions', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$$;
