-- ============================================================================
-- PART 1 of 2: INTEGRITY REPAIR
-- Run this ENTIRE block in a fresh new Supabase SQL tab. Do NOT select partial lines.
-- ============================================================================

BEGIN;

-- Drop the deferred constraint trigger FIRST — this is the ONLY reliable bypass
DROP TRIGGER IF EXISTS trg_enforce_double_entry ON mandi.ledger_entries;

-- Create suspense account if it doesn't exist
INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
SELECT o.id, 'Integrity Repair Account', 'equity', '3001', true
FROM core.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM mandi.accounts a WHERE a.organization_id = o.id AND a.code = '3001'
);

-- Repair: Insert balancing offset entries for every imbalanced voucher
INSERT INTO mandi.ledger_entries (
    organization_id, voucher_id, account_id,
    debit, credit, entry_date, description, status, transaction_type
)
WITH imbalanced AS (
    SELECT voucher_id, organization_id,
           SUM(debit)         AS total_dr,
           SUM(credit)        AS total_cr,
           MAX(entry_date)    AS e_date
    FROM   mandi.ledger_entries
    WHERE  voucher_id IS NOT NULL AND status = 'active'
    GROUP  BY voucher_id, organization_id
    HAVING ABS(SUM(debit) - SUM(credit)) > 0.01
),
suspense AS (
    SELECT DISTINCT ON (organization_id) id, organization_id
    FROM   mandi.accounts
    WHERE  code = '3001'
    ORDER  BY organization_id, created_at
)
SELECT
    i.organization_id,
    i.voucher_id,
    s.id,
    CASE WHEN (i.total_dr - i.total_cr) < 0 THEN ABS(i.total_dr - i.total_cr) ELSE 0 END,
    CASE WHEN (i.total_dr - i.total_cr) > 0 THEN ABS(i.total_dr - i.total_cr) ELSE 0 END,
    i.e_date,
    'Automated Integrity Repair',
    'active',
    'adjustment'
FROM   imbalanced i
JOIN   suspense   s ON s.organization_id = i.organization_id;

-- Recreate the trigger NOW that all vouchers are balanced
CREATE CONSTRAINT TRIGGER trg_enforce_double_entry
AFTER INSERT OR UPDATE ON mandi.ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION mandi.check_voucher_balance();

COMMIT;


-- ============================================================================
-- PART 2 of 2: DASHBOARD VIEWS & RPCS
-- Run this ENTIRE block AFTER Part 1 succeeds.
-- ============================================================================

BEGIN;

-- Party Balances View (Dashboard list)
DROP VIEW IF EXISTS mandi.view_party_balances CASCADE;

CREATE VIEW mandi.view_party_balances AS
WITH party_sums AS (
    SELECT le.organization_id, le.contact_id,
           SUM(le.debit - le.credit) AS net_balance
    FROM   mandi.ledger_entries le
    WHERE  le.status = 'active' AND le.contact_id IS NOT NULL
    GROUP  BY le.organization_id, le.contact_id
)
SELECT
    c.id              AS contact_id,
    c.organization_id,
    c.name            AS contact_name,
    c.type            AS contact_type,
    c.city            AS contact_city,
    COALESCE(ps.net_balance, 0) AS net_balance
FROM   mandi.contacts c
LEFT   JOIN party_sums ps ON ps.contact_id = c.id;

GRANT SELECT ON mandi.view_party_balances TO anon, authenticated;


-- Financial Summary RPC (Dashboard cards: Cash, Bank, Receivables, Payables)
CREATE OR REPLACE FUNCTION mandi.get_financial_summary(
    p_org_id     UUID,
    _cache_bust  BIGINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = mandi, public
AS $$
DECLARE
    v_recv  NUMERIC := 0;
    v_fpay  NUMERIC := 0;
    v_spay  NUMERIC := 0;
    v_cash  NUMERIC := 0;
    v_bank  NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(net_balance), 0) INTO v_recv  FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type = 'buyer'    AND net_balance > 0;
    SELECT ABS(COALESCE(SUM(net_balance), 0)) INTO v_fpay FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type = 'farmer'   AND net_balance < 0;
    SELECT ABS(COALESCE(SUM(net_balance), 0)) INTO v_spay FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type = 'supplier' AND net_balance < 0;

    SELECT COALESCE(SUM(le.debit - le.credit), 0) + COALESCE(MAX(a.opening_balance), 0)
    INTO   v_cash
    FROM   mandi.accounts a
    LEFT   JOIN mandi.ledger_entries le ON a.id = le.account_id AND le.status = 'active'
    WHERE  a.organization_id = p_org_id
      AND  (a.code = '1001' OR a.account_sub_type = 'cash' OR a.name ILIKE '%cash%')
    GROUP  BY a.id LIMIT 1;

    SELECT SUM(balance) INTO v_bank FROM (
        SELECT COALESCE(SUM(le.debit - le.credit), 0) + COALESCE(a.opening_balance, 0) AS balance
        FROM   mandi.accounts a
        LEFT   JOIN mandi.ledger_entries le ON a.id = le.account_id AND le.status = 'active'
        WHERE  a.organization_id = p_org_id
          AND  (a.account_sub_type = 'bank' OR a.name ILIKE '%bank%' OR a.name ILIKE '%HDFC%' OR a.name ILIKE '%SBI%' OR a.name ILIKE '%ICICI%')
          AND  NOT (a.code = '1001' OR a.account_sub_type = 'cash' OR a.name ILIKE '%cash%')
        GROUP  BY a.id, a.opening_balance
    ) b;

    RETURN jsonb_build_object(
        'receivables',        v_recv,
        'farmer_payables',    v_fpay,
        'supplier_payables',  v_spay,
        'cash',  jsonb_build_object('balance', COALESCE(v_cash, 0)),
        'bank',  jsonb_build_object('balance', COALESCE(v_bank, 0)),
        'timestamp', now()
    );
END;
$$;


-- Ledger Statement RPC (Party drill-down with itemized products)
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id      UUID,
    p_from_date       TIMESTAMP WITH TIME ZONE,
    p_to_date         TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_open  NUMERIC := 0;
    v_close NUMERIC := 0;
    v_rows  JSONB;
BEGIN
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_open
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id AND contact_id = p_contact_id
      AND  entry_date < p_from_date AND status = 'active';

    WITH base_entries AS (
        SELECT le.*,
               v.type      AS voucher_header_type,
               v.voucher_no AS header_v_no,
               v.narration  AS header_narration,
               s.id AS sale_id, a.id AS arrival_id,
               v.arrival_id AS v_arrival_id, v.invoice_id AS v_sale_id
        FROM   mandi.ledger_entries le
        LEFT   JOIN mandi.vouchers  v ON le.voucher_id = v.id
        LEFT   JOIN mandi.sales     s ON s.id = le.reference_id OR s.id = v.invoice_id
        LEFT   JOIN mandi.arrivals  a ON a.id = le.reference_id OR a.id = v.arrival_id
        WHERE  le.organization_id = p_organization_id AND le.contact_id = p_contact_id
          AND  le.entry_date BETWEEN p_from_date AND p_to_date AND le.status = 'active'
    ),
    sale_products AS (
        SELECT st.sale_id,
               jsonb_agg(jsonb_build_object('name', c.name, 'qty', si.qty, 'rate', si.rate, 'amount', si.amount)) AS products
        FROM   (SELECT DISTINCT COALESCE(sale_id, v_sale_id) AS sale_id FROM base_entries WHERE sale_id IS NOT NULL OR v_sale_id IS NOT NULL) st
        JOIN   mandi.sale_items  si ON si.sale_id  = st.sale_id
        LEFT   JOIN mandi.commodities c ON c.id = si.item_id
        GROUP  BY st.sale_id
    ),
    arrival_products AS (
        SELECT at.arrival_id,
               jsonb_agg(jsonb_build_object('name', c.name, 'qty', l.initial_qty, 'rate', l.supplier_rate, 'amount', l.initial_qty * l.supplier_rate)) AS products
        FROM   (SELECT DISTINCT COALESCE(arrival_id, v_arrival_id) AS arrival_id FROM base_entries WHERE arrival_id IS NOT NULL OR v_arrival_id IS NOT NULL) at
        JOIN   mandi.lots l ON l.arrival_id = at.arrival_id
        LEFT   JOIN mandi.commodities c ON c.id = l.item_id
        GROUP  BY at.arrival_id
    ),
    rows AS (
        SELECT be.*,
               COALESCE(be.products, sp.products, ap.products, '[]'::jsonb) AS resolved_products,
               v_open + SUM(debit - credit) OVER (ORDER BY entry_date ASC, id ASC) AS running_balance
        FROM   base_entries be
        LEFT   JOIN sale_products    sp ON sp.sale_id    = COALESCE(be.sale_id,    be.v_sale_id)
        LEFT   JOIN arrival_products ap ON ap.arrival_id = COALESCE(be.arrival_id, be.v_arrival_id)
    )
    SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'date', entry_date, 'debit', debit, 'credit', credit,
        'description', COALESCE(description, header_narration, 'Transaction'),
        'voucher_no',  COALESCE(reference_no, header_v_no::text, '-'),
        'voucher_type', UPPER(COALESCE(transaction_type, voucher_header_type, 'TRX')),
        'products', resolved_products, 'running_balance', running_balance
    ) ORDER BY entry_date DESC, id DESC) INTO v_rows FROM rows;

    SELECT v_open + COALESCE(SUM(debit - credit), 0) INTO v_close
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id AND contact_id = p_contact_id
      AND  entry_date <= p_to_date AND status = 'active';

    RETURN jsonb_build_object(
        'opening_balance', v_open,
        'closing_balance', v_close,
        'transactions',    COALESCE(v_rows, '[]'::jsonb)
    );
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
