-- Migration: Final Fix for Product Details & Sorting
-- Date: 2026-02-19
-- Author: Antigravity

-- 1. Drop the temporary debug function if it exists
DROP FUNCTION IF EXISTS get_ledger_statement_v2(UUID, UUID, DATE, DATE);

-- 2. Re-create the main function with correct logic and improved sorting
CREATE OR REPLACE FUNCTION get_ledger_statement(
    p_organization_id UUID,
    p_contact_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS JSONB AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_rows JSONB;
    v_contact RECORD;
BEGIN
    -- 1. Fetch Contact Details
    SELECT * INTO v_contact FROM contacts WHERE id = p_contact_id;
    
    -- 2. Calculate Opening Balance (Sum prior to start date)
    SELECT COALESCE(SUM(le.debit - le.credit), 0)
    INTO v_opening_balance
    FROM ledger_entries le
    LEFT JOIN vouchers v ON le.voucher_id = v.id
    WHERE le.organization_id = p_organization_id
    AND le.contact_id = p_contact_id
    AND COALESCE(v.date, le.entry_date::DATE) < p_start_date;

    -- 3. Fetch Transactions with Running Balance logic
    SELECT jsonb_agg(t) INTO v_rows FROM (
        SELECT 
            COALESCE(v.date, le.entry_date::DATE) as date,
            COALESCE(v.voucher_no::TEXT, le.reference_no) as voucher_no,
            COALESCE(v.type, le.transaction_type) as voucher_type,
            -- Append product names if it's a sale
            CASE 
                -- Case 1: Linked via Voucher
                WHEN v.invoice_id IS NOT NULL THEN
                    COALESCE(
                        COALESCE(v.narration, le.description) || ' (' || (
                            SELECT string_agg(i.name, ', ')
                            FROM sale_items si
                            JOIN lots l ON si.lot_id = l.id
                            JOIN items i ON l.item_id = i.id
                            WHERE si.sale_id = v.invoice_id
                        ) || ')',
                        COALESCE(v.narration, le.description)
                    )
                -- Case 2: Linked via Ledger Entry Reference (for direct Sales)
                WHEN (le.transaction_type ILIKE 'sale' OR le.transaction_type ILIKE 'invoice') AND le.reference_id IS NOT NULL THEN
                     COALESCE(
                        COALESCE(v.narration, le.description) || ' (' || (
                            SELECT string_agg(i.name, ', ')
                            FROM sale_items si
                            JOIN lots l ON si.lot_id = l.id
                            JOIN items i ON l.item_id = i.id
                            WHERE si.sale_id = le.reference_id
                        ) || ')',
                        COALESCE(v.narration, le.description)
                    )
                ELSE COALESCE(v.narration, le.description)
            END as narration,
            le.debit,
            le.credit,
            SUM(le.debit - le.credit) OVER (
                ORDER BY 
                    COALESCE(v.date, le.entry_date::DATE), 
                    COALESCE(v.created_at, le.entry_date) ASC, 
                    le.id 
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) + v_opening_balance as running_balance
        FROM ledger_entries le
        LEFT JOIN vouchers v ON le.voucher_id = v.id
        WHERE le.organization_id = p_organization_id
        AND le.contact_id = p_contact_id
        AND COALESCE(v.date, le.entry_date::DATE) >= p_start_date
        AND COALESCE(v.date, le.entry_date::DATE) <= p_end_date
        ORDER BY 
            COALESCE(v.date, le.entry_date::DATE), 
            COALESCE(v.created_at, le.entry_date) ASC, 
            le.id
    ) t;

    -- 4. Return Composite Object
    RETURN jsonb_build_object(
        'contact', jsonb_build_object(
            'name', v_contact.name,
            'mobile', v_contact.phone, 
            'city', v_contact.city,
            'type', v_contact.type
        ),
        'opening_balance', v_opening_balance,
        'transactions', COALESCE(v_rows, '[]'::JSONB),
        'closing_balance', (
            SELECT COALESCE(SUM(le.debit - le.credit), 0)
            FROM ledger_entries le
            LEFT JOIN vouchers v ON le.voucher_id = v.id
            WHERE le.organization_id = p_organization_id
            AND le.contact_id = p_contact_id
            AND COALESCE(v.date, le.entry_date::DATE) <= p_end_date
        )
    );
END;
$$ LANGUAGE plpgsql;
