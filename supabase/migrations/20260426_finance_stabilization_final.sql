-- ============================================================================
-- MIGRATION: Final Financial Stabilization
-- Date:     2026-04-26
-- Goal:     Fix "Zero Balance" (Grants), Loading Spinners (RPC), and Data Opacity.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. BASE GRANTS (The "Zero Balance" Fix)
--    The dashboard queries views like v_arrivals_fast and view_party_balances.
--    In Supabase, for a view to work with RLS on underlying tables, the caller
--    MUST have SELECT permissions on those base tables.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN ARRAY ARRAY['ledger_entries', 'vouchers', 'accounts', 'contacts', 'commodities', 'lots', 'sale_items', 'arrival_items']
    LOOP
        EXECUTE format('GRANT SELECT ON mandi.%I TO authenticated, anon', tbl);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. REBUILD: get_financial_summary (The "Spinner" & "Accuracy" Fix)
--    - Marked SECURITY DEFINER to bypass RLS and internal lookup loops.
--    - Handles multiple cash/bank accounts by summing them.
--    - Accurate payables/receivables via view_party_balances.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.get_financial_summary(p_org_id UUID, _cache_bust BIGINT DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, pg_temp
AS $$
DECLARE
    v_recv  NUMERIC := 0;
    v_f_pay NUMERIC := 0;
    v_s_pay NUMERIC := 0;
    v_cash  NUMERIC := 0;
    v_bank  NUMERIC := 0;
    v_cash_acct JSONB;
    v_bank_acct JSONB;
BEGIN
    -- 1. Receivables & Payables (from optimized view)
    SELECT COALESCE(SUM(CASE WHEN net_balance > 0 THEN net_balance ELSE 0 END), 0) INTO v_recv
      FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type = 'buyer';
      
    SELECT COALESCE(SUM(CASE WHEN net_balance < 0 THEN ABS(net_balance) ELSE 0 END), 0) INTO v_f_pay
      FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type = 'farmer';
      
    SELECT COALESCE(SUM(CASE WHEN net_balance < 0 THEN ABS(net_balance) ELSE 0 END), 0) INTO v_s_pay
      FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type = 'supplier';

    -- 2. Liquid Assets (Sum all relevant accounts)
    -- Cash: Priority by code '1001', then by sub_type, then name
    SELECT COALESCE(SUM(bal), 0) INTO v_cash
    FROM (
        SELECT (a.opening_balance + COALESCE(SUM(le.debit - le.credit), 0)) as bal
        FROM mandi.accounts a
        LEFT JOIN mandi.ledger_entries le ON a.id = le.account_id AND le.status = 'active'
        WHERE a.organization_id = p_org_id
          AND (a.code = '1001' OR a.account_sub_type = 'cash' OR a.name ILIKE '%cash%')
        GROUP BY a.id, a.opening_balance
    ) sub;

    -- Bank: Priority by code '1002', then by type/sub_type/name
    SELECT COALESCE(SUM(bal), 0) INTO v_bank
    FROM (
        SELECT (a.opening_balance + COALESCE(SUM(le.debit - le.credit), 0)) as bal
        FROM mandi.accounts a
        LEFT JOIN mandi.ledger_entries le ON a.id = le.account_id AND le.status = 'active'
        WHERE a.organization_id = p_org_id
          AND (a.code = '1002' OR a.type = 'bank' OR a.account_sub_type = 'bank' OR a.name ILIKE '%bank%')
        GROUP BY a.id, a.opening_balance
    ) sub;

    -- 3. Representative Primary Accounts (for quick-action icons)
    SELECT jsonb_build_object('id', id, 'name', name, 'balance', v_cash) INTO v_cash_acct
    FROM mandi.accounts WHERE organization_id = p_org_id AND (code='1001' OR account_sub_type='cash') LIMIT 1;
    
    SELECT jsonb_build_object('id', id, 'name', name, 'balance', v_bank) INTO v_bank_acct
    FROM mandi.accounts WHERE organization_id = p_org_id AND (code='1002' OR type='bank' OR account_sub_type='bank') LIMIT 1;

    RETURN jsonb_build_object(
        'receivables',       v_recv,
        'farmer_payables',   v_f_pay,
        'supplier_payables', v_s_pay,
        'cash',              COALESCE(v_cash_acct, jsonb_build_object('id', null, 'name', 'Cash', 'balance', v_cash)),
        'bank',              COALESCE(v_bank_acct, jsonb_build_object('id', null, 'name', 'Bank', 'balance', v_bank)),
        'timestamp',         NOW()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. REBUILD: get_ledger_statement (The "Opacity" Fix)
--    - Enhanced product resolution for both Sales and Arrivals.
--    - Standardized output for product names, units, and rates.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id UUID,
    p_from_date DATE,
    p_to_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, pg_temp
AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_closing_balance NUMERIC := 0;
    v_transactions JSONB;
BEGIN
    -- 1. Opening Balance (sum up everything before p_from_date)
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_opening_balance
    FROM mandi.ledger_entries
    WHERE organization_id = p_organization_id
      AND contact_id = p_contact_id
      AND entry_date < p_from_date
      AND status = 'active';

    -- 2. Transactions (period specified)
    SELECT jsonb_agg(t) INTO v_transactions
    FROM (
        SELECT 
            le.id,
            le.entry_date as date,
            le.description,
            le.debit,
            le.credit,
            le.transaction_type,
            le.reference_id,
            v.voucher_no,
            v.type as voucher_type,
            -- Detailed Product Resolution
            CASE
                -- Sales Items
                WHEN le.transaction_type = 'sale' OR le.transaction_type = 'sales' THEN
                    (SELECT jsonb_agg(jsonb_build_object(
                        'name', c.name,
                        'qty', si.qty,
                        'unit', si.unit,
                        'rate', si.rate,
                        'amount', si.amount
                    )) FROM mandi.sale_items si
                      JOIN mandi.lots l ON l.id = si.lot_id
                      JOIN mandi.commodities c ON c.id = l.commodity_id
                     WHERE si.sale_id = le.reference_id)
                -- Arrival Items (Purchases)
                WHEN le.transaction_type = 'arrival' OR le.transaction_type = 'purchase' THEN
                    (SELECT jsonb_agg(jsonb_build_object(
                        'name', c.name,
                        'qty', ai.qty,
                        'unit', ai.unit,
                        'rate', ai.rate,
                        'amount', (ai.qty * ai.rate)
                    )) FROM mandi.arrival_items ai
                      JOIN mandi.commodities c ON c.id = ai.commodity_id
                     WHERE ai.arrival_id = le.reference_id)
                ELSE NULL
            END as products,
            -- Running Balance Calculation (window function)
            v_opening_balance + SUM(le.debit - le.credit) OVER (ORDER BY le.entry_date, le.created_at) as running_balance
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.vouchers v ON v.id = le.voucher_id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id = p_contact_id
          AND le.entry_date BETWEEN p_from_date AND p_to_date
          AND le.status = 'active'
        ORDER BY le.entry_date ASC, le.created_at ASC
    ) t;

    -- 3. Closing Balance
    v_closing_balance := v_opening_balance + COALESCE((
        SELECT SUM(debit - credit)
        FROM mandi.ledger_entries
        WHERE organization_id = p_organization_id
          AND contact_id = p_contact_id
          AND entry_date BETWEEN p_from_date AND p_to_date
          AND status = 'active'
    ), 0);

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'transactions',    COALESCE(v_transactions, '[]'::jsonb),
        'last_activity',   (SELECT MAX(entry_date) FROM mandi.ledger_entries WHERE contact_id = p_contact_id AND status = 'active')
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RE-ASSERT GRANTS FOR PUBLIC WRAPPERS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION mandi.get_financial_summary(UUID, BIGINT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION mandi.get_ledger_statement(UUID, UUID, DATE, DATE) TO authenticated, anon;

-- Ensure public wrapper exists for standard API access
CREATE OR REPLACE FUNCTION public.get_financial_summary(p_org_id UUID, _cache_bust BIGINT DEFAULT 0)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER AS $$ SELECT mandi.get_financial_summary(p_org_id, _cache_bust); $$;

GRANT EXECUTE ON FUNCTION public.get_financial_summary(UUID, BIGINT) TO authenticated, anon;

COMMIT;
NOTIFY pgrst, 'reload schema';
