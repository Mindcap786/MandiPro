-- ============================================================
-- FULL STANDARDIZATION OF FINANCIAL LEDGERS
-- Migration: 20260421100000_ledger_details_standardization.sql
-- Goals:
-- 1. Ensure get_ledger_statement returns explicit products for ALL historical rows.
-- 2. Ensure post_arrival_ledger directly inserts products into ledger_entries.
-- 3. Replace generic "Arrival Entry" with "Purchase Bill #" in post_arrival_ledger.
-- ============================================================

-- 1) UPDATE POST_ARRIVAL_LEDGER TO INSERT PRODUCTS AND BETTER DESCRIPTIONS
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_lot RECORD;
    v_org_id UUID;
    v_party_id UUID;
    v_arrival_date DATE;
    v_reference_no TEXT;
    v_arrival_type TEXT;

    -- Accounts
    v_purchase_acc_id UUID;
    v_expense_recovery_acc_id UUID;
    v_cash_acc_id UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id UUID;

    -- Aggregates
    v_total_commission NUMERIC := 0;
    v_total_inventory NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;
    v_total_transport NUMERIC := 0;
    v_total_paid_advance NUMERIC := 0;
    v_lot_count INT := 0;
    v_products JSONB := '[]'::jsonb;
    v_summary_desc TEXT;

    -- Voucher
    v_main_voucher_id UUID;
    v_voucher_no BIGINT;
    v_gross_bill NUMERIC;
    v_net_payable NUMERIC;
    v_final_status TEXT := 'pending';
BEGIN
    -- 0. Get arrival and party
    SELECT a.*, c.name as party_name INTO v_arrival
    FROM mandi.arrivals a
    LEFT JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Arrival not found');
    END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type := CASE v_arrival.arrival_type WHEN 'farmer' THEN 'commission' WHEN 'purchase' THEN 'direct' ELSE v_arrival.arrival_type END;

    -- Pre-fetch enriched product details for the arrival
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', COALESCE(comm.name, 'Item'),
            'variety', COALESCE(l.variety, ''),
            'grade', COALESCE(l.grade, ''),
            'lot_no', l.lot_code,
            'qty', CASE WHEN COALESCE(l.less_units, 0) > 0 THEN COALESCE(l.initial_qty, 0) - COALESCE(l.less_units, 0) ELSE COALESCE(l.initial_qty, 0) * (1.0 - COALESCE(l.less_percent, 0) / 100.0) END,
            'unit', COALESCE(l.unit, comm.default_unit, 'Kg'),
            'rate', COALESCE(l.supplier_rate, 0),
            'amount', (CASE WHEN COALESCE(l.less_units, 0) > 0 THEN COALESCE(l.initial_qty, 0) - COALESCE(l.less_units, 0) ELSE COALESCE(l.initial_qty, 0) * (1.0 - COALESCE(l.less_percent, 0) / 100.0) END) * COALESCE(l.supplier_rate, 0)
        )
    ) INTO v_products
    FROM mandi.lots l
    LEFT JOIN mandi.commodities comm ON l.item_id = comm.id
    WHERE l.arrival_id = p_arrival_id;

    IF v_products IS NULL THEN
        v_products := '[]'::jsonb;
    END IF;

    -- Construct Summary Description for the Ledger
    IF jsonb_array_length(v_products) = 1 THEN
        -- "Apple (Kashmiri) 100 Box @ 500 #Ref:102"
        v_summary_desc := (v_products->0->>'name') || 
                          CASE WHEN NULLIF(v_products->0->>'variety', '') IS NOT NULL THEN ' (' || (v_products->0->>'variety') || ')' ELSE '' END || ' ' ||
                          (v_products->0->>'qty') || ' ' || (v_products->0->>'unit') || ' @ ' || (v_products->0->>'rate') ||
                          ' #Ref:' || v_reference_no;
    ELSE
        -- "Purchase Bill #102 (3 Lots: Apple, Mango...)"
        v_summary_desc := 'Purchase Bill #' || v_reference_no || ' (' || jsonb_array_length(v_products) || ' Items)';
    END IF;

    -- Cleanup old entries
    WITH deleted_vouchers AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
          AND transaction_type = 'purchase'
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers
    WHERE id IN (SELECT voucher_id FROM deleted_vouchers WHERE voucher_id IS NOT NULL);

    -- 1. Get accounts
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4002' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '1001' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' LIMIT 1;

    -- 2. Calculate aggregates
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;
        DECLARE
            v_adj_qty NUMERIC := CASE WHEN COALESCE(v_lot.less_units, 0) > 0 THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0) ELSE COALESCE(v_lot.initial_qty, 0) * (1.0 - COALESCE(v_lot.less_percent, 0) / 100.0) END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            v_total_paid_advance := v_total_paid_advance + COALESCE(v_lot.advance, 0);

            IF v_arrival_type = 'commission' THEN
                v_total_commission := v_total_commission + (v_val * COALESCE(v_lot.commission_percent, 0) / 100.0);
                v_total_inventory := v_total_inventory + v_val;
            ELSE
                v_total_direct_cost := v_total_direct_cost + (v_val - COALESCE(v_lot.farmer_charges, 0));
                v_total_commission := v_total_commission + ((v_val - COALESCE(v_lot.farmer_charges, 0)) * COALESCE(v_lot.commission_percent, 0) / 100.0);
            END IF;
        END;
    END LOOP;

    IF v_lot_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'msg', 'No lots');
    END IF;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0) + COALESCE(v_arrival.other_expenses, 0);
    v_gross_bill := (CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END);
    v_net_payable := v_gross_bill - v_total_commission - v_total_transport;

    -- 3. Create SINGLE goods transaction (voucher)
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount,
        party_id, arrival_id
    ) VALUES (
        v_org_id, v_arrival_date, 'purchase', v_voucher_no,
        'Arrival ' || v_reference_no,
        v_gross_bill,
        v_party_id, p_arrival_id  
    ) RETURNING id INTO v_main_voucher_id;

    -- Debit Inventory/Purchase account (always, regardless of party)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
    VALUES (v_org_id, v_main_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, v_gross_bill, 0, v_arrival_date, 'Fruit Value', 'purchase', p_arrival_id, v_products);

    -- Credit Party (only if a party is linked)
    IF v_party_id IS NOT NULL THEN
        -- **ROBUST CONSOLIDATED CREDIT: Net Payable with Rich description**
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_net_payable, v_arrival_date, v_summary_desc, 'purchase', p_arrival_id, v_products);

        -- Transport Recovery (Credit to Recovery Account, NOT involving party ledger rows anymore)
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id, NULL);
        END IF;

        -- Commission Income (Credit to Income Account, NOT involving party ledger rows anymore)
        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income', 'purchase', p_arrival_id, NULL);
        END IF;
    ELSE
        -- No party: record transport and commission normally
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery (No Party)', 'purchase', p_arrival_id, NULL);
        END IF;

        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income (No Party)', 'purchase', p_arrival_id, NULL);
        END IF;
    END IF;

    -- 4. Set arrival status (preserve if exists)
    v_final_status := COALESCE(v_arrival.status, 'pending');
    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.purchase_bills SET payment_status = v_final_status WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id);

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status, 'message', 'Arrival recorded. Net Payable: ' || v_net_payable);
END;
$function$;


-- 2) ROBUST GET_LEDGER_STATEMENT WITH DYNAMIC FALLBACK
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
            le.products,
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
            be.products,
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
                -- 1. If we have a rich raw description (not just Arrival Entry/Invoice #), use it.
                WHEN NULLIF(re.raw_description, '') IS NOT NULL 
                     AND re.raw_description NOT ILIKE 'Arrival Entry%' 
                     AND re.raw_description NOT ILIKE 'Invoice #%' 
                     THEN re.raw_description
                
                -- 2. If it's a purchase credit, build a standard descriptive label from arrival meta
                WHEN re.arrival_id IS NOT NULL AND re.credit > 0 THEN
                    'Purchase Bill #' || COALESCE(NULLIF(am.reference_no, ''), am.bill_no::text, '-')
                
                -- 3. If it's a sale debit, build a standard descriptive label from sale meta
                WHEN re.sale_id IS NOT NULL AND re.debit > 0 THEN
                    'Sale Invoice #' || COALESCE(sm.bill_no::text, re.header_voucher_no::text, '-')
                
                -- 4. Payment/Receipt fallbacks
                WHEN re.sale_id IS NOT NULL AND re.credit > 0 THEN
                    'Cash Received Against Sale #' || COALESCE(sm.bill_no::text, re.header_voucher_no::text, '-')
                WHEN re.arrival_id IS NOT NULL AND re.debit > 0 THEN
                    'Payment to Supplier #' || COALESCE(NULLIF(am.reference_no, ''), am.bill_no::text, '-')
                
                -- 5. Final fallback to narration
                ELSE
                    COALESCE(NULLIF(re.header_narration, ''), 'Transaction')
            END AS description,
            COALESCE(re.products, sp.products, ap.products, '[]'::jsonb) AS products,
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
