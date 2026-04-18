-- ============================================================
-- v5.15: Universal Sales Ledger Backfill
-- Posts invoice + receipt vouchers for ALL orgs that have
-- confirmed sales but no corresponding ledger entries.
--
-- Root cause: confirm_sale_transaction RPC silently failed for
-- new orgs (schema mismatches, missing account sub_types etc)
-- causing confirmed sales to exist without ANY ledger entries.
-- This meant the Finance Dashboard showed ₹0 for all cards.
--
-- This migration:
-- 1. Detects all orgs with unposted sales
-- 2. Creates sales invoice vouchers (DR AR, CR Revenue)
-- 3. Creates receipt vouchers for paid amounts (DR Cash/Bank, CR AR)
-- 4. All entries posted with status='posted' (canonical status)
-- ============================================================

DO $$
DECLARE
    v_org_id UUID;
    v_sale RECORD;
    v_voucher_id UUID;
    v_receipt_voucher_id UUID;
    v_sales_revenue_acc UUID;
    v_ar_acc UUID;
    v_cash_acc UUID;
    v_bank_acc UUID;
    v_buyer_name TEXT;
    v_payment_acc UUID;
    v_paid NUMERIC;
    v_count INTEGER := 0;
    v_total_count INTEGER := 0;
BEGIN
    FOR v_org_id IN
        SELECT DISTINCT s.organization_id
        FROM mandi.sales s
        WHERE s.status IN ('confirmed', 'completed', 'delivered')
          AND NOT EXISTS (
              SELECT 1 FROM mandi.vouchers v
              WHERE v.organization_id = s.organization_id
                AND v.reference_id = s.id
          )
    LOOP
        SELECT id INTO v_sales_revenue_acc
        FROM mandi.accounts
        WHERE organization_id = v_org_id AND type = 'income'
          AND (account_sub_type = 'sales' OR name ILIKE '%sales%revenue%' OR name ILIKE '%direct%sales%')
        ORDER BY CASE WHEN account_sub_type = 'sales' THEN 1 ELSE 2 END LIMIT 1;

        IF v_sales_revenue_acc IS NULL THEN
            SELECT id INTO v_sales_revenue_acc FROM mandi.accounts
            WHERE organization_id = v_org_id AND type = 'income'
            ORDER BY created_at LIMIT 1;
        END IF;

        SELECT id INTO v_ar_acc FROM mandi.accounts
        WHERE organization_id = v_org_id AND type = 'asset'
          AND (account_sub_type = 'receivable' OR name ILIKE '%receivable%') LIMIT 1;

        SELECT id INTO v_cash_acc FROM mandi.accounts
        WHERE organization_id = v_org_id AND type = 'asset' AND account_sub_type = 'cash'
        ORDER BY created_at LIMIT 1;

        IF v_cash_acc IS NULL THEN
            SELECT id INTO v_cash_acc FROM mandi.accounts
            WHERE organization_id = v_org_id AND type = 'asset'
              AND name ILIKE '%cash%' AND name NOT ILIKE '%cheque%'
            ORDER BY created_at LIMIT 1;
        END IF;

        SELECT id INTO v_bank_acc FROM mandi.accounts
        WHERE organization_id = v_org_id AND type = 'asset' AND account_sub_type = 'bank'
          AND name NOT ILIKE '%cheque%' AND name NOT ILIKE '%transit%'
        ORDER BY created_at LIMIT 1;

        IF v_sales_revenue_acc IS NULL OR v_cash_acc IS NULL THEN
            RAISE WARNING 'Skipping org % - missing accounts', v_org_id;
            CONTINUE;
        END IF;
        IF v_ar_acc IS NULL THEN v_ar_acc := v_cash_acc; END IF;

        FOR v_sale IN
            SELECT s.*, c.name as contact_name
            FROM mandi.sales s
            LEFT JOIN mandi.contacts c ON c.id = s.buyer_id
            WHERE s.organization_id = v_org_id
              AND s.status IN ('confirmed', 'completed', 'delivered')
              AND NOT EXISTS (
                  SELECT 1 FROM mandi.vouchers v2
                  WHERE v2.organization_id = v_org_id AND v2.reference_id = s.id
              )
        LOOP
            v_buyer_name := COALESCE(v_sale.contact_name, 'Cash Buyer');

            INSERT INTO mandi.vouchers (
                organization_id, type, date, narration, amount, source, reference_id
            ) VALUES (
                v_org_id, 'sales',
                COALESCE(v_sale.sale_date, v_sale.created_at::date, CURRENT_DATE),
                'Sale Invoice - ' || v_buyer_name,
                v_sale.total_amount, 'backfill', v_sale.id
            ) RETURNING id INTO v_voucher_id;

            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, contact_id,
                debit, credit, entry_date, narration, status, transaction_type, reference_id
            ) VALUES
            (
                v_org_id, v_voucher_id, v_ar_acc, v_sale.buyer_id,
                v_sale.total_amount, 0,
                COALESCE(v_sale.sale_date, v_sale.created_at::date, CURRENT_DATE),
                'Sale to ' || v_buyer_name, 'posted', 'sale', v_sale.id
            ),
            (
                v_org_id, v_voucher_id, v_sales_revenue_acc, NULL,
                0, v_sale.total_amount,
                COALESCE(v_sale.sale_date, v_sale.created_at::date, CURRENT_DATE),
                'Sales Revenue - ' || v_buyer_name, 'posted', 'sale', v_sale.id
            );

            v_paid := COALESCE(v_sale.paid_amount, v_sale.amount_received, 0);
            IF v_paid > 0 THEN
                v_payment_acc := CASE
                    WHEN v_sale.payment_mode IN ('cash', 'upi', 'upi_cash') THEN v_cash_acc
                    WHEN v_sale.payment_mode IN ('bank_transfer', 'neft', 'rtgs', 'cheque') THEN COALESCE(v_bank_acc, v_cash_acc)
                    ELSE v_cash_acc
                END;

                INSERT INTO mandi.vouchers (
                    organization_id, type, date, narration, amount, source, reference_id
                ) VALUES (
                    v_org_id, 'receipt',
                    COALESCE(v_sale.sale_date, v_sale.created_at::date, CURRENT_DATE),
                    'Receipt from ' || v_buyer_name,
                    v_paid, 'backfill', v_sale.id
                ) RETURNING id INTO v_receipt_voucher_id;

                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, contact_id,
                    debit, credit, entry_date, narration, status, transaction_type, reference_id
                ) VALUES
                (
                    v_org_id, v_receipt_voucher_id, v_payment_acc, NULL,
                    v_paid, 0,
                    COALESCE(v_sale.sale_date, v_sale.created_at::date, CURRENT_DATE),
                    'Payment received (' || COALESCE(v_sale.payment_mode, 'cash') || ')',
                    'posted', 'receipt', v_receipt_voucher_id
                ),
                (
                    v_org_id, v_receipt_voucher_id, v_ar_acc, v_sale.buyer_id,
                    0, v_paid,
                    COALESCE(v_sale.sale_date, v_sale.created_at::date, CURRENT_DATE),
                    'Payment from ' || v_buyer_name,
                    'posted', 'receipt', v_receipt_voucher_id
                );
            END IF;

            v_count := v_count + 1;
        END LOOP;

        RAISE NOTICE 'Org %: backfilled % sales', v_org_id, v_count;
        v_total_count := v_total_count + v_count;
        v_count := 0;
    END LOOP;

    RAISE NOTICE 'TOTAL backfilled: % sales across all orgs', v_total_count;
END;
$$;
