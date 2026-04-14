-- ─── ENHANCED LEDGER STATEMENT WITH SMART ITEMIZATION ───────────
-- Finalize the integration of product details into the ledger for Buyers and Farmers.
-- Supports both direct reference links and voucher-based links (reference_id, invoice_id, arrival_id).

-- First, drop the old function to ensure clean signature update
DROP FUNCTION IF EXISTS mandi.get_ledger_statement(uuid, date, date, uuid, varchar);

CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_contact_id uuid,
    p_from_date date DEFAULT ((CURRENT_DATE - '180 days'::interval))::date,
    p_to_date date DEFAULT CURRENT_DATE,
    p_organization_id uuid DEFAULT NULL::uuid,
    p_status character varying DEFAULT 'active'::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_closing_balance NUMERIC := 0;
    v_rows JSONB;
    v_contact_type TEXT;
    v_org_id UUID;
    v_is_creditor BOOLEAN;
    v_last_activity TIMESTAMP;
BEGIN
    -- 1. Identify Context
    IF p_organization_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM mandi.contacts WHERE id = p_contact_id LIMIT 1;
    ELSE
        v_org_id := p_organization_id;
    END IF;

    SELECT COALESCE(type, 'customer') INTO v_contact_type FROM mandi.contacts WHERE id = p_contact_id;
    v_is_creditor := mandi.is_creditor_type(v_contact_type);

    -- 2. Opening Balance
    IF v_is_creditor THEN
        -- Creditor (Farmer/Supplier): Balance = Credit - Debit
        SELECT COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)
        INTO v_opening_balance
        FROM mandi.ledger_entries
        WHERE contact_id = p_contact_id
          AND organization_id = v_org_id
          AND entry_date < p_from_date;
    ELSE
        -- Debtor (Buyer/Customer): Balance = Debit - Credit
        SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
        INTO v_opening_balance
        FROM mandi.ledger_entries
        WHERE contact_id = p_contact_id
          AND organization_id = v_org_id
          AND entry_date < p_from_date;
    END IF;

    -- 3. Transactions with Itemized Injection
    WITH ledger_base AS (
        SELECT
            le.id,
            le.entry_date,
            le.debit,
            le.credit,
            COALESCE(le.description, 'Transaction') as description,
            le.transaction_type,
            le.voucher_id,
            COALESCE(le.reference_id, v.reference_id, v.invoice_id, v.arrival_id) as effective_ref_id,
            le.reference_no
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.vouchers v ON le.voucher_id = v.id
        WHERE le.contact_id = p_contact_id
          AND le.organization_id = v_org_id
          AND le.entry_date BETWEEN p_from_date AND p_to_date
          AND (le.status IN ('active', 'posted') OR p_status != 'active')
    ),
    ledger_with_items AS (
        SELECT 
            lb.*,
            CASE 
                WHEN lb.transaction_type IN ('sale', 'sale_payment') THEN (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'name', c.name,
                            'qty', si.qty,
                            'unit', si.unit,
                            'rate', si.rate,
                            'amount', si.amount,
                            'variety', l.variety,
                            'grade', l.grade
                        )
                    )
                    FROM mandi.sale_items si
                    JOIN mandi.commodities c ON si.item_id = c.id
                    LEFT JOIN mandi.lots l ON si.lot_id = l.id
                    WHERE si.sale_id = lb.effective_ref_id
                )
                WHEN lb.transaction_type IN ('arrival', 'purchase', 'supplier_payment') THEN (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'name', c.name,
                            'qty', l.initial_qty,
                            'unit', l.unit,
                            'rate', l.supplier_rate,
                            'amount', (l.initial_qty * l.supplier_rate),
                            'variety', l.variety,
                            'grade', l.grade
                        )
                    )
                    FROM mandi.lots l
                    JOIN mandi.commodities c ON l.item_id = c.id
                    WHERE l.arrival_id = lb.effective_ref_id
                )
                ELSE NULL
            END as products
        FROM ledger_base lb
    ),
    ledger_with_bal AS (
        SELECT
            *,
            CASE 
                WHEN v_is_creditor THEN
                    v_opening_balance + SUM(COALESCE(credit, 0) - COALESCE(debit, 0)) OVER (ORDER BY entry_date ASC, id ASC)
                ELSE
                    v_opening_balance + SUM(COALESCE(debit, 0) - COALESCE(credit, 0)) OVER (ORDER BY entry_date ASC, id ASC)
            END AS running_balance
        FROM ledger_with_items
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'date', entry_date,
            'description', description,
            'transaction_type', transaction_type,
            'debit', debit,
            'credit', credit,
            'balance', running_balance,
            'voucher_id', voucher_id,
            'reference_no', reference_no,
            'products', products
        )
        ORDER BY entry_date ASC, id ASC
    )
    INTO v_rows
    FROM ledger_with_bal;

    -- 4. Closing Balance
    IF v_is_creditor THEN
        SELECT COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)
        INTO v_closing_balance
        FROM mandi.ledger_entries
        WHERE contact_id = p_contact_id AND organization_id = v_org_id;
    ELSE
        SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
        INTO v_closing_balance
        FROM mandi.ledger_entries
        WHERE contact_id = p_contact_id AND organization_id = v_org_id;
    END IF;

    -- 5. Last Activity
    SELECT MAX(entry_date) INTO v_last_activity
    FROM mandi.ledger_entries
    WHERE contact_id = p_contact_id AND organization_id = v_org_id;

    RETURN jsonb_build_object(
        'transactions', COALESCE(v_rows, '[]'::jsonb),
        'opening_balance', COALESCE(v_opening_balance, 0),
        'closing_balance', COALESCE(v_closing_balance, 0),
        'contact_type', v_contact_type,
        'is_creditor', v_is_creditor,
        'last_activity', v_last_activity
    );
END;
$function$;
