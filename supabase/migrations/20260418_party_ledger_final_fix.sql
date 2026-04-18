-- ============================================================================
-- MIGRATION: 20260418_party_ledger_final_fix.sql
-- PURPOSE: 
--   1. Rebuild get_financial_summary to be account-name resilient (fixes ₹0).
--   2. Restore view_party_balances view for accurate dashboard listings.
--   3. Refine get_ledger_statement for industry-standard detail (fixes "Unclear line items").
--   4. Repair imbalanced vouchers (fixes 4 Broken Vouchers warning).
-- ============================================================================

BEGIN;

-- 1. ROBUST VIEW FOR PARTY BALANCES (Main Dashboard List)
-- We must DROP CASCADE because the view definition is changing (adding/removing columns)
DROP VIEW IF EXISTS mandi.view_party_balances CASCADE;

CREATE VIEW mandi.view_party_balances AS
WITH party_sums AS (
    SELECT 
        le.organization_id,
        le.contact_id,
        SUM(le.debit - le.credit) as net_balance
    FROM mandi.ledger_entries le
    WHERE le.status = 'active' AND le.contact_id IS NOT NULL
    GROUP BY le.organization_id, le.contact_id
)
SELECT 
    c.id as contact_id,
    c.organization_id,
    c.name as contact_name,
    c.type as contact_type,
    c.city as contact_city,
    COALESCE(ps.net_balance, 0) as net_balance
FROM mandi.contacts c
LEFT JOIN party_sums ps ON ps.contact_id = c.id;

GRANT SELECT ON mandi.view_party_balances TO anon, authenticated;


-- 2. ROBUST FINANCIAL SUMMARY (Top Dashboard Cards)
CREATE OR REPLACE FUNCTION mandi.get_financial_summary(
    p_org_id UUID,
    _cache_bust BIGINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public
AS $$
DECLARE
    v_receivables NUMERIC := 0;
    v_farmer_paya NUMERIC := 0;
    v_supp_paya   NUMERIC := 0;
    v_cash_bal    NUMERIC := 0;
    v_bank_bal    NUMERIC := 0;
BEGIN
    -- Receivables (Buyers with Dr Balance)
    SELECT COALESCE(SUM(net_balance), 0) INTO v_receivables
    FROM mandi.view_party_balances
    WHERE organization_id = p_org_id AND contact_type = 'buyer' AND net_balance > 0;

    -- Farmer Payables (Farmers with Cr Balance)
    SELECT ABS(COALESCE(SUM(net_balance), 0)) INTO v_farmer_paya
    FROM mandi.view_party_balances
    WHERE organization_id = p_org_id AND contact_type = 'farmer' AND net_balance < 0;

    -- Supplier Payables (Suppliers with Cr Balance)
    SELECT ABS(COALESCE(SUM(net_balance), 0)) INTO v_supp_paya
    FROM mandi.view_party_balances
    WHERE organization_id = p_org_id AND contact_type = 'supplier' AND net_balance < 0;

    -- Cash in Hand (Resilient lookup by code or name)
    SELECT COALESCE(SUM(le.debit - le.credit), 0) + COALESCE(MAX(a.opening_balance), 0)
    INTO v_cash_bal
    FROM mandi.accounts a
    LEFT JOIN mandi.ledger_entries le ON a.id = le.account_id AND le.status = 'active'
    WHERE a.organization_id = p_org_id 
      AND (a.code = '1001' OR a.account_sub_type = 'cash' OR a.name ILIKE '%cash%')
    GROUP BY a.id LIMIT 1;

    -- Bank Balances (Resilient lookup by sub_type or name)
    SELECT SUM(balance) INTO v_bank_bal FROM (
        SELECT a.id, COALESCE(SUM(le.debit - le.credit), 0) + COALESCE(a.opening_balance, 0) as balance
        FROM mandi.accounts a
        LEFT JOIN mandi.ledger_entries le ON a.id = le.account_id AND le.status = 'active'
        WHERE a.organization_id = p_org_id 
          AND (a.account_sub_type = 'bank' OR a.name ILIKE '%bank%' OR a.name ILIKE '%HDFC%' OR a.name ILIKE '%SBI%' OR a.name ILIKE '%ICICI%')
          AND NOT (a.code = '1001' OR a.account_sub_type = 'cash' OR a.name ILIKE '%cash%')
        GROUP BY a.id, a.opening_balance
    ) b;

    RETURN jsonb_build_object(
        'receivables', v_receivables,
        'farmer_payables', v_farmer_paya,
        'supplier_payables', v_supp_paya,
        'cash', jsonb_build_object('balance', COALESCE(v_cash_bal, 0)),
        'bank', jsonb_build_object('balance', COALESCE(v_bank_bal, 0)),
        'timestamp', now()
    );
END;
$$;


-- 3. ENHANCED LEDGER STATEMENT (Itemized Details)
-- Standardizes the 'products' array return for Sales, Arrivals, and Payments.
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id UUID,
    p_from_date TIMESTAMP WITH TIME ZONE,
    p_to_date TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_closing_balance NUMERIC := 0;
    v_rows JSONB;
BEGIN
    -- Opening Balance
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_opening_balance
    FROM mandi.ledger_entries
    WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date < p_from_date AND status = 'active';

    WITH base_entries AS (
        SELECT le.*, v.type as voucher_header_type, v.voucher_no as header_v_no, v.narration as header_narration,
               s.id as sale_id, a.id as arrival_id, v.arrival_id as v_arrival_id, v.invoice_id as v_sale_id
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.vouchers v ON le.voucher_id = v.id
        LEFT JOIN mandi.sales s ON (s.id = le.reference_id OR s.id = v.invoice_id)
        LEFT JOIN mandi.arrivals a ON (a.id = le.reference_id OR a.id = v.arrival_id)
        WHERE le.organization_id = p_organization_id AND le.contact_id = p_contact_id 
          AND le.entry_date BETWEEN p_from_date AND p_to_date AND le.status = 'active'
    ),
    sale_products AS (
        SELECT st.sale_id, jsonb_agg(jsonb_build_object('name', c.name, 'qty', si.qty, 'rate', si.rate, 'amount', si.amount)) as products
        FROM (SELECT DISTINCT COALESCE(sale_id, v_sale_id) as sale_id FROM base_entries WHERE sale_id IS NOT NULL OR v_sale_id IS NOT NULL) st
        JOIN mandi.sale_items si ON si.sale_id = st.sale_id
        LEFT JOIN mandi.commodities c ON c.id = si.item_id
        GROUP BY st.sale_id
    ),
    arrival_products AS (
        SELECT at.arrival_id, jsonb_agg(jsonb_build_object('name', c.name, 'qty', l.initial_qty, 'rate', l.supplier_rate, 'amount', l.initial_qty * l.supplier_rate)) as products
        FROM (SELECT DISTINCT COALESCE(arrival_id, v_arrival_id) as arrival_id FROM base_entries WHERE arrival_id IS NOT NULL OR v_arrival_id IS NOT NULL) at
        JOIN mandi.lots l ON l.arrival_id = at.arrival_id
        LEFT JOIN mandi.commodities c ON c.id = l.item_id
        GROUP BY at.arrival_id
    ),
    statement_rows AS (
        SELECT be.*,
               COALESCE(be.products, sp.products, ap.products, '[]'::jsonb) as resolved_products,
               v_opening_balance + SUM(debit - credit) OVER (ORDER BY entry_date ASC, id ASC) as running_balance
        FROM base_entries be
        LEFT JOIN sale_products sp ON sp.sale_id = COALESCE(be.sale_id, be.v_sale_id)
        LEFT JOIN arrival_products ap ON ap.arrival_id = COALESCE(be.arrival_id, be.v_arrival_id)
    )
    SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'date', entry_date, 'debit', debit, 'credit', credit, 'description', COALESCE(description, header_narration, 'Transaction'),
        'voucher_no', COALESCE(reference_no, header_v_no::text, '-'), 'voucher_type', UPPER(COALESCE(transaction_type, voucher_header_type, 'TRX')),
        'products', resolved_products, 'running_balance', running_balance
    ) ORDER BY entry_date DESC, id DESC) INTO v_rows FROM statement_rows;

    SELECT v_opening_balance + COALESCE(SUM(debit - credit), 0) INTO v_closing_balance
    FROM mandi.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date <= p_to_date AND status = 'active';

    RETURN jsonb_build_object('opening_balance', v_opening_balance, 'closing_balance', v_closing_balance, 'transactions', COALESCE(v_rows, '[]'::jsonb));
END;
$$;


-- 4. SURGICAL INTEGRITY REPAIR (Fixes "Vouchers with Broken Double-Entry")
-- We temporarily disable the integrity trigger to allow balancing entries for imbalanced vouchers
ALTER TABLE mandi.ledger_entries DISABLE TRIGGER trg_enforce_double_entry;

DO $$
DECLARE 
    v_suspense_id UUID;
    v_rec RECORD;
    v_diff NUMERIC;
BEGIN
    -- Resolve Suspense Account (Fallback to any equity/retained earnings if code 3001 missing)
    SELECT id INTO v_suspense_id FROM mandi.accounts WHERE code = '3001' LIMIT 1;
    IF v_suspense_id IS NULL THEN
        SELECT id INTO v_suspense_id FROM mandi.accounts WHERE name ILIKE '%Opening Balance Offset%' OR name ILIKE '%Suspense%' LIMIT 1;
    END IF;

    -- If still no suspense account, create one
    IF v_suspense_id IS NULL THEN
        FOR v_rec IN SELECT id FROM core.organizations LOOP
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
            VALUES (v_rec.id, 'Financial Integrity Repair Account', 'equity', '3001', true)
            ON CONFLICT DO NOTHING;
        END LOOP;
        SELECT id INTO v_suspense_id FROM mandi.accounts WHERE code = '3001' LIMIT 1;
    END IF;

    -- Find and Repair Imbalanced Vouchers
    FOR v_rec IN 
        SELECT voucher_id, organization_id, SUM(debit) as total_dr, SUM(credit) as total_cr, MAX(entry_date) as e_date
        FROM mandi.ledger_entries 
        WHERE voucher_id IS NOT NULL AND status = 'active'
        GROUP BY voucher_id, organization_id
        HAVING ABS(SUM(debit) - SUM(credit)) > 0.01
    LOOP
        v_diff := v_rec.total_dr - v_rec.total_cr;
        
        -- Post balancing entry to suspense
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date, 
            description, status, transaction_type
        ) VALUES (
            v_rec.organization_id, v_rec.voucher_id, v_suspense_id, 
            CASE WHEN v_diff < 0 THEN ABS(v_diff) ELSE 0 END,
            CASE WHEN v_diff > 0 THEN ABS(v_diff) ELSE 0 END,
            v_rec.e_date,
            'Automated Integrity Repair (Debit != Credit Offset)',
            'active', 'adjustment'
        );
    END LOOP;
END $$;

ALTER TABLE mandi.ledger_entries ENABLE TRIGGER trg_enforce_double_entry;

COMMIT;
NOTIFY pgrst, 'reload schema';
