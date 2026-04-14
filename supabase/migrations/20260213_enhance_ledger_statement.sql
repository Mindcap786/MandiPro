-- Fix function signature conflict by dropping old version first
DROP FUNCTION IF EXISTS get_ledger_statement(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);

-- Enhanced Ledger Statement RPC Function (Recreated with correct signature)
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
                WHEN v.type = 'sales' AND EXISTS (
                    SELECT 1 FROM ledger_entries le2 
                    WHERE le2.voucher_id = le.voucher_id 
                    AND le2.contact_id = le.contact_id 
                    AND le2.credit > 0 
                    AND le2.id != le.id
                ) THEN 'SALE (CASH)'
                WHEN v.type = 'sales' AND le.debit > 0 THEN 'SALE (CREDIT)'
                WHEN (v.type IN ('receipt', 'payment') OR le.transaction_type = 'payment') AND le.credit > 0 THEN 'PAYMENT'
                WHEN le.credit > 0 AND v.type IS NULL THEN 'RECEIPT'
                ELSE UPPER(COALESCE(v.type, le.transaction_type, 'TRANSACTION'))
            END as voucher_type,
            
            -- Enhanced Description with Item Details
            CASE
                WHEN v.type = 'sales' THEN (
                    SELECT 
                        'Sale Invoice #' || s.bill_no || 
                        CASE 
                            WHEN COUNT(si.id) > 0 THEN 
                                ' - ' || 
                                CASE 
                                    WHEN COUNT(si.id) = 1 THEN 
                                        (SELECT i.name || ' (' || si2.qty || ' ' || si2.unit || ')' 
                                         FROM sale_items si2 
                                         JOIN lots l ON si2.lot_id = l.id
                                         JOIN items i ON l.item_id = i.id 
                                         WHERE si2.sale_id = s.id 
                                         LIMIT 1)
                                    WHEN COUNT(si.id) <= 3 THEN 
                                        STRING_AGG(i.name, ', ')
                                    ELSE 
                                        COUNT(si.id)::TEXT || ' items'
                                END
                            ELSE ''
                        END
                    FROM sales s
                    LEFT JOIN sale_items si ON si.sale_id = s.id
                    LEFT JOIN lots l ON si.lot_id = l.id
                    LEFT JOIN items i ON l.item_id = i.id
                    WHERE s.organization_id = p_organization_id
                    AND v.voucher_no = s.bill_no
                    GROUP BY s.bill_no, s.id
                )
                WHEN v.type IN ('receipt', 'payment') OR le.transaction_type = 'payment' THEN 
                    COALESCE(
                        'Payment for Invoice #' || v.voucher_no || 
                        CASE 
                            WHEN v.narration IS NOT NULL AND v.narration != '' 
                            THEN ' - ' || v.narration 
                            ELSE '' 
                        END,
                        le.description,
                        'Payment Received'
                    )
                ELSE COALESCE(le.description, v.narration, 'Transaction')
            END as description,
            
            COALESCE(v.voucher_no::TEXT, le.reference_no, '-') as voucher_no,
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

COMMENT ON FUNCTION get_ledger_statement IS 'Returns ledger statement with user-friendly descriptions and proper transaction classification';
