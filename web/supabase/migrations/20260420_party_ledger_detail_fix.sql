-- ============================================================
-- PARTY LEDGER DETAIL + ATTACHMENT FIX
-- Migration: 20260420_party_ledger_detail_fix.sql
--
-- Goals:
-- 1. Remove internal revenue/contra rows accidentally attached to parties.
-- 2. Rebuild party rollups so Finance Overview matches corrected ledgers.
-- 3. Return statement rows per party-facing ledger entry, not over-grouped
--    vouchers, with invoice/purchase item detail and charge breakdowns.
-- ============================================================

-- 1) Clean historic internal rows that should never stay attached to parties
UPDATE mandi.ledger_entries
SET contact_id = NULL
WHERE contact_id IS NOT NULL
  AND (
      (transaction_type IN ('sale_fee', 'sale_expense', 'gst') AND account_id IS NOT NULL)
      OR COALESCE(description, '') ILIKE 'Sales Revenue%'
      OR COALESCE(description, '') ILIKE 'Sale Revenue%'
      OR COALESCE(description, '') ILIKE 'Commission Income%'
      OR COALESCE(description, '') ILIKE 'Transport Expense Recovery%'
      OR COALESCE(description, '') ILIKE 'Transport Recovery Income%'
      OR COALESCE(description, '') ILIKE 'Advance Contra (%'
      OR COALESCE(description, '') ILIKE 'Receipt Mode:%'
      OR COALESCE(description, '') ILIKE 'Payment Mode:%'
      OR COALESCE(description, '') ILIKE 'Stock In - %'
      OR COALESCE(description, '') ILIKE 'Purchase Cost (Direct Buy)%'
  );

-- 2) Rebuild party rollup from corrected ledger rows
TRUNCATE mandi.party_daily_balances;

INSERT INTO mandi.party_daily_balances
    (organization_id, contact_id, summary_date, total_debit, total_credit)
SELECT
    organization_id,
    contact_id,
    entry_date::date,
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
FROM mandi.ledger_entries
WHERE contact_id IS NOT NULL
  AND COALESCE(status, 'active') = 'active'
GROUP BY organization_id, contact_id, entry_date::date
ON CONFLICT (organization_id, contact_id, summary_date)
DO UPDATE SET
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    updated_at = NOW();

-- 3) Rich per-entry ledger statement for buyer / supplier / farmer
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
    v_opening_balance numeric := 0;
    v_closing_balance numeric := 0;
    v_last_activity timestamptz;
    v_rows jsonb;
BEGIN
    SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
    INTO v_opening_balance
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id = p_contact_id
      AND le.entry_date < p_start_date
      AND COALESCE(le.status, 'active') = 'active'
      AND NOT (
          le.transaction_type IN ('sale_fee', 'sale_expense', 'gst')
          OR COALESCE(le.description, '') ILIKE ANY (
              ARRAY[
                  'Sales Revenue%',
                  'Sale Revenue%',
                  'Commission Income%',
                  'Transport Expense Recovery%',
                  'Transport Recovery Income%',
                  'Advance Contra (%',
                  'Receipt Mode:%',
                  'Payment Mode:%',
                  'Stock In - %',
                  'Purchase Cost (Direct Buy)%'
              ]
          )
      );

    SELECT MAX(le.entry_date)
    INTO v_last_activity
    FROM mandi.ledger_entries le
    WHERE le.organization_id = p_organization_id
      AND le.contact_id = p_contact_id
      AND COALESCE(le.status, 'active') = 'active'
      AND NOT (
          le.transaction_type IN ('sale_fee', 'sale_expense', 'gst')
          OR COALESCE(le.description, '') ILIKE ANY (
              ARRAY[
                  'Sales Revenue%',
                  'Sale Revenue%',
                  'Commission Income%',
                  'Transport Expense Recovery%',
                  'Transport Recovery Income%',
                  'Advance Contra (%',
                  'Receipt Mode:%',
                  'Payment Mode:%',
                  'Stock In - %',
                  'Purchase Cost (Direct Buy)%'
              ]
          )
      );

    WITH base_entries AS (
        SELECT
            le.id,
            le.entry_date,
            COALESCE(le.description, '') AS raw_description,
            COALESCE(le.debit, 0) AS debit,
            COALESCE(le.credit, 0) AS credit,
            le.transaction_type,
            le.reference_id,
            le.reference_no,
            le.voucher_id,
            v.type AS header_type,
            v.voucher_no AS header_voucher_no,
            v.narration AS header_narration,
            s_inv.id AS sale_id_from_invoice,
            s_ref.id AS sale_id_from_reference,
            s_vref.id AS sale_id_from_voucher_reference,
            a_ref.id AS arrival_id_from_reference,
            a_vref.id AS arrival_id_from_voucher_reference,
            l_ref.arrival_id AS arrival_id_from_lot_reference,
            l_vref.arrival_id AS arrival_id_from_voucher_lot_reference
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.vouchers v
               ON v.id = le.voucher_id
        LEFT JOIN mandi.sales s_inv
               ON s_inv.id = v.invoice_id
        LEFT JOIN mandi.sales s_ref
               ON s_ref.id = le.reference_id
        LEFT JOIN mandi.sales s_vref
               ON s_vref.id = v.reference_id
        LEFT JOIN mandi.arrivals a_ref
               ON a_ref.id = le.reference_id
        LEFT JOIN mandi.arrivals a_vref
               ON a_vref.id = v.reference_id
        LEFT JOIN mandi.lots l_ref
               ON l_ref.id = le.reference_id
        LEFT JOIN mandi.lots l_vref
               ON l_vref.id = v.reference_id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id = p_contact_id
          AND le.entry_date BETWEEN p_start_date AND p_end_date
          AND COALESCE(le.status, 'active') = 'active'
          AND NOT (
              le.transaction_type IN ('sale_fee', 'sale_expense', 'gst')
              OR COALESCE(le.description, '') ILIKE ANY (
                  ARRAY[
                      'Sales Revenue%',
                      'Sale Revenue%',
                      'Commission Income%',
                      'Transport Expense Recovery%',
                      'Transport Recovery Income%',
                      'Advance Contra (%',
                      'Receipt Mode:%',
                      'Payment Mode:%',
                      'Stock In - %',
                      'Purchase Cost (Direct Buy)%'
                  ]
              )
          )
    ),
    resolved_entries AS (
        SELECT
            be.id,
            be.entry_date,
            be.raw_description,
            be.debit,
            be.credit,
            be.transaction_type,
            be.reference_id,
            be.reference_no,
            be.voucher_id,
            be.header_type,
            be.header_voucher_no,
            be.header_narration,
            COALESCE(
                be.sale_id_from_invoice,
                be.sale_id_from_reference,
                be.sale_id_from_voucher_reference
            ) AS sale_id,
            COALESCE(
                be.arrival_id_from_reference,
                be.arrival_id_from_voucher_reference,
                be.arrival_id_from_lot_reference,
                be.arrival_id_from_voucher_lot_reference
            ) AS arrival_id
        FROM base_entries be
    ),
    sale_targets AS (
        SELECT DISTINCT sale_id
        FROM resolved_entries
        WHERE sale_id IS NOT NULL
    ),
    arrival_targets AS (
        SELECT DISTINCT arrival_id
        FROM resolved_entries
        WHERE arrival_id IS NOT NULL
    ),
    sale_meta AS (
        SELECT s.id AS sale_id, s.bill_no
        FROM mandi.sales s
        JOIN sale_targets st ON st.sale_id = s.id
    ),
    arrival_meta AS (
        SELECT a.id AS arrival_id, a.bill_no, a.reference_no, a.arrival_type
        FROM mandi.arrivals a
        JOIN arrival_targets at ON at.arrival_id = a.id
    ),
    sale_products AS (
        SELECT
            st.sale_id,
            jsonb_agg(
                jsonb_build_object(
                    'name', COALESCE(c.name, 'Item'),
                    'qty', COALESCE(si.qty, si.quantity, 0),
                    'unit', COALESCE(si.unit, l.unit, c.default_unit, 'Kg'),
                    'rate', COALESCE(si.rate, 0),
                    'amount', COALESCE(si.amount, si.total_price, COALESCE(si.qty, si.quantity, 0) * COALESCE(si.rate, 0)),
                    'line_amount', COALESCE(si.amount, si.total_price, COALESCE(si.qty, si.quantity, 0) * COALESCE(si.rate, 0)),
                    'lot_no', l.lot_code
                )
                ORDER BY COALESCE(c.name, 'Item'), l.lot_code, si.id
            ) AS products
        FROM sale_targets st
        JOIN mandi.sale_items si ON si.sale_id = st.sale_id
        LEFT JOIN mandi.lots l ON l.id = si.lot_id
        LEFT JOIN mandi.commodities c ON c.id = COALESCE(si.item_id, l.item_id)
        GROUP BY st.sale_id
    ),
    sale_charges AS (
        SELECT
            s.id AS sale_id,
            jsonb_agg(
                jsonb_build_object(
                    'label', charge.label,
                    'amount', charge.amount
                )
                ORDER BY charge.sort_order
            ) FILTER (WHERE charge.amount <> 0) AS charges
        FROM mandi.sales s
        JOIN sale_targets st ON st.sale_id = s.id
        CROSS JOIN LATERAL (
            VALUES
                (1, 'Market Fee', COALESCE(s.market_fee, 0)),
                (2, 'Nirashrit', COALESCE(s.nirashrit, 0)),
                (3, 'Misc Fee', COALESCE(s.misc_fee, 0)),
                (4, 'Loading', COALESCE(s.loading_charges, 0)),
                (5, 'Unloading', COALESCE(s.unloading_charges, 0)),
                (6, 'Other Expenses', COALESCE(s.other_expenses, 0)),
                (7, 'CGST', COALESCE(s.cgst_amount, 0)),
                (8, 'SGST', COALESCE(s.sgst_amount, 0)),
                (9, 'IGST', COALESCE(s.igst_amount, 0)),
                (10, 'Discount', COALESCE(s.discount_amount, 0) * -1)
        ) AS charge(sort_order, label, amount)
        GROUP BY s.id
    ),
    arrival_products AS (
        SELECT
            at.arrival_id,
            jsonb_agg(
                jsonb_build_object(
                    'name', COALESCE(c.name, 'Item'),
                    'qty', qty_calc.billed_qty,
                    'gross_qty', COALESCE(l.initial_qty, l.current_qty, l.gross_quantity, 0),
                    'unit', COALESCE(l.unit, c.default_unit, 'Kg'),
                    'rate', COALESCE(l.supplier_rate, 0),
                    'amount', COALESCE(pb.gross_amount, qty_calc.billed_qty * COALESCE(l.supplier_rate, 0)),
                    'gross_amount', COALESCE(pb.gross_amount, qty_calc.billed_qty * COALESCE(l.supplier_rate, 0)),
                    'net_amount', COALESCE(pb.net_payable, qty_calc.billed_qty * COALESCE(l.supplier_rate, 0)),
                    'commission_amount', COALESCE(pb.commission_amount, 0),
                    'less_amount', COALESCE(pb.less_amount, 0),
                    'lot_no', l.lot_code
                )
                ORDER BY COALESCE(c.name, 'Item'), l.lot_code, l.id
            ) AS products
        FROM arrival_targets at
        JOIN mandi.lots l ON l.arrival_id = at.arrival_id
        CROSS JOIN LATERAL (
            SELECT
                CASE
                    WHEN COALESCE(l.less_units, 0) > 0 THEN
                        GREATEST(COALESCE(l.initial_qty, l.current_qty, l.gross_quantity, 0) - COALESCE(l.less_units, 0), 0)
                    ELSE
                        ROUND(
                            COALESCE(l.initial_qty, l.current_qty, l.gross_quantity, 0)
                            * (1 - (COALESCE(l.less_percent, 0) / 100.0)),
                            2
                        )
                END AS billed_qty
        ) AS qty_calc
        LEFT JOIN mandi.purchase_bills pb ON pb.lot_id = l.id
        LEFT JOIN mandi.commodities c ON c.id = COALESCE(l.item_id, l.commodity_id)
        GROUP BY at.arrival_id
    ),
    arrival_charges AS (
        SELECT
            a.id AS arrival_id,
            jsonb_agg(
                jsonb_build_object(
                    'label', charge.label,
                    'amount', charge.amount
                )
                ORDER BY charge.sort_order
            ) FILTER (WHERE charge.amount <> 0) AS charges
        FROM mandi.arrivals a
        JOIN arrival_targets at ON at.arrival_id = a.id
        CROSS JOIN LATERAL (
            VALUES
                (1, 'Hire', COALESCE(a.hire_charges, 0)),
                (2, 'Hamali', COALESCE(a.hamali_expenses, 0)),
                (3, 'Other Expenses', COALESCE(a.other_expenses, 0))
        ) AS charge(sort_order, label, amount)
        GROUP BY a.id
    ),
    statement_rows AS (
        SELECT
            re.id,
            re.entry_date,
            re.debit,
            re.credit,
            re.transaction_type,
            CASE
                WHEN re.sale_id IS NOT NULL AND re.debit > 0 AND re.transaction_type = 'sale' THEN 'SALE'
                WHEN re.sale_id IS NOT NULL AND re.credit > 0 THEN 'RECEIPT'
                WHEN re.arrival_id IS NOT NULL AND re.credit > 0 THEN 'PURCHASE'
                WHEN re.arrival_id IS NOT NULL AND re.debit > 0 THEN
                    CASE
                        WHEN re.raw_description ILIKE 'Advance Paid%' OR COALESCE(re.header_type, '') = 'payment' THEN 'PAYMENT'
                        ELSE 'PURCHASE ADJUSTMENT'
                    END
                WHEN COALESCE(re.header_type, '') <> '' THEN UPPER(re.header_type)
                WHEN re.transaction_type IN ('sale_payment', 'receipt') THEN 'RECEIPT'
                WHEN re.transaction_type = 'payment' THEN 'PAYMENT'
                WHEN re.transaction_type IN ('purchase', 'lot_purchase', 'arrival') THEN 'PURCHASE'
                ELSE UPPER(COALESCE(NULLIF(re.transaction_type, ''), 'TRANSACTION'))
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
                WHEN NULLIF(re.raw_description, '') IS NOT NULL THEN re.raw_description
                WHEN re.sale_id IS NOT NULL AND re.debit > 0 THEN
                    'Sale Invoice #' || COALESCE(sm.bill_no::text, re.header_voucher_no::text, '-')
                WHEN re.sale_id IS NOT NULL AND re.credit > 0 THEN
                    'Receipt Against Sale #' || COALESCE(sm.bill_no::text, re.header_voucher_no::text, '-')
                WHEN re.arrival_id IS NOT NULL AND re.credit > 0 THEN
                    'Purchase Bill #' || COALESCE(NULLIF(am.reference_no, ''), am.bill_no::text, '-')
                WHEN re.arrival_id IS NOT NULL AND re.debit > 0 THEN
                    'Payment Against Purchase #' || COALESCE(NULLIF(am.reference_no, ''), am.bill_no::text, '-')
                ELSE
                    COALESCE(NULLIF(re.header_narration, ''), 'Transaction')
            END AS description,
            COALESCE(sp.products, ap.products, '[]'::jsonb) AS products,
            COALESCE(sc.charges, ac.charges, '[]'::jsonb) AS charges,
            v_opening_balance
                + SUM(re.debit - re.credit) OVER (
                    ORDER BY re.entry_date ASC, COALESCE(re.header_voucher_no, 0) ASC, re.id ASC
                  ) AS running_balance
        FROM resolved_entries re
        LEFT JOIN sale_meta sm ON sm.sale_id = re.sale_id
        LEFT JOIN arrival_meta am ON am.arrival_id = re.arrival_id
        LEFT JOIN sale_products sp ON sp.sale_id = re.sale_id
        LEFT JOIN sale_charges sc ON sc.sale_id = re.sale_id
        LEFT JOIN arrival_products ap ON ap.arrival_id = re.arrival_id
        LEFT JOIN arrival_charges ac ON ac.arrival_id = re.arrival_id
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
      AND le.contact_id = p_contact_id
      AND le.entry_date <= p_end_date
      AND COALESCE(le.status, 'active') = 'active'
      AND NOT (
          le.transaction_type IN ('sale_fee', 'sale_expense', 'gst')
          OR COALESCE(le.description, '') ILIKE ANY (
              ARRAY[
                  'Sales Revenue%',
                  'Sale Revenue%',
                  'Commission Income%',
                  'Transport Expense Recovery%',
                  'Transport Recovery Income%',
                  'Advance Contra (%',
                  'Receipt Mode:%',
                  'Payment Mode:%',
                  'Stock In - %',
                  'Purchase Cost (Direct Buy)%'
              ]
          )
      );

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'last_activity', v_last_activity,
        'transactions', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$function$;
