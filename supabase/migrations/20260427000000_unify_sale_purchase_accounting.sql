-- ============================================================
-- UNIFIED SALE + PURCHASE ACCOUNTING
-- Migration: 20260427000000_unify_sale_purchase_accounting.sql
--
-- Goals:
-- 1. Sales must classify strictly by actual payment received:
--    paid / partial / pending (udhaar).
-- 2. Arrivals + Quick Purchase must drive purchase ledgers/daybook
--    from purchase-bill math, not mixed gross-only logic.
-- 3. Purchase + Sale (Mandi Commission) remains udhaar-only on both
--    sides because that flow has no payment mode selector.
-- 4. Sale receipts must link back to the same sale invoice so daybook
--    shows one grouped sale, not duplicate sale + receipt rows.
-- ============================================================

BEGIN;

ALTER TABLE mandi.lots
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS net_payable NUMERIC DEFAULT 0;

ALTER TABLE mandi.sales
    ADD COLUMN IF NOT EXISTS amount_received NUMERIC DEFAULT 0;

CREATE OR REPLACE FUNCTION mandi.normalize_payment_mode(
    p_mode TEXT,
    p_default TEXT DEFAULT 'credit'
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_mode IS NULL OR btrim(p_mode) = '' THEN lower(coalesce(p_default, 'credit'))
        WHEN lower(btrim(p_mode)) IN ('udhaar', 'credit') THEN 'credit'
        WHEN lower(btrim(p_mode)) = 'cash' THEN 'cash'
        WHEN lower(btrim(p_mode)) IN ('upi', 'upi/bank', 'upi_bank', 'upi bank') THEN 'upi'
        WHEN lower(btrim(p_mode)) IN ('bank', 'bank_transfer', 'bank transfer', 'bank_upi', 'neft', 'rtgs', 'imps') THEN 'bank'
        WHEN lower(btrim(p_mode)) = 'cheque' THEN 'cheque'
        ELSE lower(btrim(p_mode))
    END;
$$;

CREATE OR REPLACE FUNCTION mandi.compute_effective_lot_qty(
    p_initial_qty NUMERIC,
    p_less_units NUMERIC,
    p_less_percent NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT GREATEST(
        CASE
            WHEN COALESCE(p_less_units, 0) > 0
                THEN COALESCE(p_initial_qty, 0) - COALESCE(p_less_units, 0)
            ELSE COALESCE(p_initial_qty, 0) * (1 - COALESCE(p_less_percent, 0) / 100.0)
        END,
        0
    );
$$;

DROP FUNCTION IF EXISTS mandi.get_lot_bill_components(UUID) CASCADE;
CREATE FUNCTION mandi.get_lot_bill_components(p_lot_id UUID)
RETURNS TABLE (
    goods_value NUMERIC,
    commission_amount NUMERIC,
    recovery_amount NUMERIC,
    net_payable NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_lot RECORD;
    v_effective_qty NUMERIC;
    v_base_value NUMERIC;
    v_goods_value NUMERIC;
    v_commission NUMERIC;
    v_recovery NUMERIC;
    v_arrival_kind TEXT;
BEGIN
    SELECT
        l.*,
        CASE
            WHEN COALESCE(l.arrival_type, a.arrival_type, 'direct') IN ('commission', 'farmer', 'commission_supplier')
                THEN 'commission'
            ELSE 'direct'
        END AS resolved_arrival_type,
        COALESCE((
            SELECT SUM(si.amount)
            FROM mandi.sale_items si
            WHERE si.lot_id = l.id
        ), 0) AS sales_sum
    INTO v_lot
    FROM mandi.lots l
    LEFT JOIN mandi.arrivals a ON a.id = l.arrival_id
    WHERE l.id = p_lot_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_arrival_kind := v_lot.resolved_arrival_type;
    v_effective_qty := mandi.compute_effective_lot_qty(v_lot.initial_qty, v_lot.less_units, v_lot.less_percent);
    v_base_value := ROUND(v_effective_qty * COALESCE(v_lot.supplier_rate, 0), 2);

    v_goods_value := CASE
        WHEN v_arrival_kind = 'commission' AND COALESCE(v_lot.sales_sum, 0) > 0
            THEN ROUND(v_lot.sales_sum, 2)
        ELSE v_base_value
    END;

    v_commission := CASE
        WHEN v_arrival_kind = 'commission'
            THEN ROUND(v_goods_value * COALESCE(v_lot.commission_percent, 0) / 100.0, 2)
        ELSE 0
    END;

    v_recovery := ROUND(
        COALESCE(v_lot.farmer_charges, 0)
        + CASE
            WHEN v_arrival_kind = 'commission'
                THEN COALESCE(v_lot.loading_cost, 0) + COALESCE(v_lot.packing_cost, 0)
            ELSE 0
          END,
        2
    );

    RETURN QUERY
    SELECT
        v_goods_value,
        v_commission,
        v_recovery,
        GREATEST(ROUND(v_goods_value - v_commission - v_recovery, 2), 0);
END;
$$;

CREATE OR REPLACE FUNCTION mandi.classify_bill_status(
    p_bill_amount NUMERIC,
    p_paid_amount NUMERIC
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_bill_amount, 0) <= 0.01 THEN 'pending'
        WHEN COALESCE(p_paid_amount, 0) >= COALESCE(p_bill_amount, 0) - 0.01 THEN 'paid'
        WHEN COALESCE(p_paid_amount, 0) > 0.01 THEN 'partial'
        ELSE 'pending'
    END;
$$;

CREATE OR REPLACE FUNCTION mandi.refresh_lot_payment_status(p_lot_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_lot RECORD;
    v_components RECORD;
    v_mode TEXT;
    v_cleared_advance NUMERIC := 0;
    v_total_paid NUMERIC := 0;
BEGIN
    SELECT *
    INTO v_lot
    FROM mandi.lots
    WHERE id = p_lot_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT *
    INTO v_components
    FROM mandi.get_lot_bill_components(p_lot_id);

    v_mode := mandi.normalize_payment_mode(v_lot.advance_payment_mode);

    IF COALESCE(v_lot.advance, 0) > 0 THEN
        IF v_mode IN ('cash', 'upi', 'bank') THEN
            v_cleared_advance := COALESCE(v_lot.advance, 0);
        ELSIF v_mode = 'cheque' AND COALESCE(v_lot.advance_cheque_status, false) THEN
            v_cleared_advance := COALESCE(v_lot.advance, 0);
        END IF;
    END IF;

    v_total_paid := COALESCE(v_lot.paid_amount, 0) + v_cleared_advance;

    UPDATE mandi.lots
    SET
        net_payable = COALESCE(v_components.net_payable, 0),
        payment_status = mandi.classify_bill_status(COALESCE(v_components.net_payable, 0), v_total_paid),
        updated_at = NOW()
    WHERE id = p_lot_id;
END;
$$;

DROP FUNCTION IF EXISTS mandi.post_arrival_ledger(UUID) CASCADE;
CREATE FUNCTION mandi.post_arrival_ledger(p_arrival_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public', 'extensions'
AS $$
DECLARE
    v_arrival RECORD;
    v_lot RECORD;
    v_component RECORD;
    v_org_id UUID;
    v_party_id UUID;
    v_arrival_date DATE;
    v_reference_label TEXT;

    v_purchase_acc_id UUID;
    v_inventory_acc_id UUID;
    v_expense_recovery_acc_id UUID;
    v_commission_income_acc_id UUID;
    v_cash_acc_id UUID;
    v_bank_acc_id UUID;
    v_payables_acc_id UUID;

    v_purchase_voucher_id UUID;
    v_voucher_no BIGINT;
    v_pending_voucher_no BIGINT;

    v_goods_total NUMERIC := 0;
    v_commission_total NUMERIC := 0;
    v_recovery_total NUMERIC := 0;
    v_purchase_bill_total NUMERIC := 0;
    v_arrival_level_recovery NUMERIC := 0;
    v_cleared_advance_total NUMERIC := 0;
    v_all_paid_total NUMERIC := 0;
    v_payment_mode TEXT;
    v_payment_account_id UUID;
    v_final_status TEXT := 'pending';
    v_products JSONB := '[]'::JSONB;
BEGIN
    SELECT a.*, c.name AS party_name
    INTO v_arrival
    FROM mandi.arrivals a
    LEFT JOIN mandi.contacts c ON c.id = a.party_id
    WHERE a.id = p_arrival_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Arrival not found');
    END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;
    v_arrival_date := COALESCE(v_arrival.arrival_date, CURRENT_DATE);
    v_reference_label := COALESCE(NULLIF(v_arrival.reference_no, ''), '#' || COALESCE(v_arrival.contact_bill_no::TEXT, v_arrival.bill_no::TEXT, p_arrival_id::TEXT));

    SELECT jsonb_agg(
        jsonb_build_object(
            'name', COALESCE(c.name, 'Item'),
            'qty', mandi.compute_effective_lot_qty(l.initial_qty, l.less_units, l.less_percent),
            'unit', COALESCE(l.unit, c.default_unit, 'Kg'),
            'rate', COALESCE(l.supplier_rate, 0),
            'lot_no', l.lot_code
        )
        ORDER BY COALESCE(c.name, 'Item'), l.lot_code
    )
    INTO v_products
    FROM mandi.lots l
    LEFT JOIN mandi.commodities c ON c.id = l.item_id
    WHERE l.arrival_id = p_arrival_id;

    IF v_products IS NULL THEN
        v_products := '[]'::JSONB;
    END IF;

    DELETE FROM mandi.ledger_entries
    WHERE (
            reference_id = p_arrival_id
            OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id)
          )
      AND transaction_type IN ('purchase', 'purchase_payment');

    DELETE FROM mandi.vouchers
    WHERE arrival_id = p_arrival_id
      AND type IN ('purchase')
      AND NOT EXISTS (
          SELECT 1
          FROM mandi.ledger_entries le
          WHERE le.voucher_id = mandi.vouchers.id
      );

    DELETE FROM mandi.vouchers
    WHERE arrival_id = p_arrival_id
      AND type = 'payment'
      AND COALESCE(is_cleared, false) = false
      AND COALESCE(cheque_status, '') = 'Pending'
      AND COALESCE(narration, '') ILIKE 'Pending Cheque%';

    SELECT id INTO v_purchase_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (
          account_sub_type = 'cost_of_goods'
          OR code IN ('5001', '4001')
          OR (type = 'expense' AND name ILIKE '%purchase%')
      )
    ORDER BY
        CASE WHEN account_sub_type = 'cost_of_goods' THEN 0 ELSE 1 END,
        created_at
    LIMIT 1;

    SELECT id INTO v_inventory_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (
          account_sub_type = 'inventory'
          OR name ILIKE '%inventory%'
      )
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_expense_recovery_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (
          account_sub_type = 'fees'
          OR code IN ('4002', '4300')
          OR name ILIKE '%recovery%'
          OR name ILIKE '%charges%'
      )
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_commission_income_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (
          account_sub_type = 'commission'
          OR code IN ('3002', '4100', '4110')
          OR name ILIKE '%commission income%'
      )
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_cash_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (
          account_sub_type = 'cash'
          OR code = '1001'
          OR name ILIKE '%cash%'
      )
      AND name NOT ILIKE '%charges%'
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_bank_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (
          account_sub_type = 'bank'
          OR code = '1002'
          OR name ILIKE '%bank%'
      )
      AND name NOT ILIKE '%transit%'
      AND name NOT ILIKE '%cheque%'
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_payables_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (
          account_sub_type IN ('accounts_payable', 'payable')
          OR code = '2001'
          OR name ILIKE '%payable%'
      )
    ORDER BY created_at
    LIMIT 1;

    FOR v_lot IN
        SELECT *
        FROM mandi.lots
        WHERE arrival_id = p_arrival_id
        ORDER BY created_at, id
    LOOP
        SELECT *
        INTO v_component
        FROM mandi.get_lot_bill_components(v_lot.id);

        PERFORM mandi.refresh_lot_payment_status(v_lot.id);

        v_goods_total := v_goods_total + COALESCE(v_component.goods_value, 0);
        v_commission_total := v_commission_total + COALESCE(v_component.commission_amount, 0);
        v_recovery_total := v_recovery_total + COALESCE(v_component.recovery_amount, 0);
        v_purchase_bill_total := v_purchase_bill_total + COALESCE(v_component.net_payable, 0);

        v_payment_mode := mandi.normalize_payment_mode(v_lot.advance_payment_mode);
        IF v_payment_mode IN ('cash', 'upi', 'bank')
           OR (v_payment_mode = 'cheque' AND COALESCE(v_lot.advance_cheque_status, false)) THEN
            v_cleared_advance_total := v_cleared_advance_total + COALESCE(v_lot.advance, 0);
        END IF;

        v_all_paid_total := v_all_paid_total
            + COALESCE(v_lot.paid_amount, 0)
            + CASE
                WHEN v_payment_mode IN ('cash', 'upi', 'bank')
                     OR (v_payment_mode = 'cheque' AND COALESCE(v_lot.advance_cheque_status, false))
                    THEN COALESCE(v_lot.advance, 0)
                ELSE 0
              END;
    END LOOP;

    v_arrival_level_recovery := ROUND(
        COALESCE(v_arrival.hire_charges, 0)
        + COALESCE(v_arrival.hamali_expenses, 0)
        + COALESCE(v_arrival.other_expenses, 0),
        2
    );

    v_recovery_total := v_recovery_total + v_arrival_level_recovery;
    v_purchase_bill_total := ROUND(v_purchase_bill_total - v_arrival_level_recovery, 2);

    IF v_purchase_bill_total < 0 THEN
        v_recovery_total := GREATEST(ROUND(v_recovery_total + v_purchase_bill_total, 2), 0);
        v_purchase_bill_total := 0;
    END IF;

    IF v_goods_total <= 0.01 AND v_purchase_bill_total <= 0.01 THEN
        UPDATE mandi.arrivals
        SET status = 'pending'
        WHERE id = p_arrival_id;

        UPDATE mandi.purchase_bills pb
        SET
            net_payable = COALESCE(l.net_payable, pb.net_payable),
            payment_status = COALESCE(l.payment_status, pb.payment_status)
        FROM mandi.lots l
        WHERE pb.lot_id = l.id
          AND l.arrival_id = p_arrival_id;

        RETURN jsonb_build_object(
            'success', true,
            'arrival_id', p_arrival_id,
            'status', 'pending',
            'bill_total', 0,
            'paid_total', 0
        );
    END IF;

    SELECT COALESCE(MAX(voucher_no), 0) + 1
    INTO v_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = v_org_id
      AND type = 'purchase';

    INSERT INTO mandi.vouchers (
        organization_id,
        date,
        type,
        voucher_no,
        amount,
        narration,
        arrival_id,
        party_id,
        reference_id
    ) VALUES (
        v_org_id,
        v_arrival_date,
        'purchase',
        v_voucher_no,
        GREATEST(ROUND(v_goods_total, 2), ROUND(v_purchase_bill_total, 2)),
        'Purchase Bill #' || v_reference_label,
        p_arrival_id,
        v_party_id,
        p_arrival_id
    ) RETURNING id INTO v_purchase_voucher_id;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit,
        entry_date, description, narration, transaction_type, reference_id, products
    ) VALUES (
        v_org_id,
        v_purchase_voucher_id,
        COALESCE(v_inventory_acc_id, v_purchase_acc_id),
        ROUND(v_goods_total, 2),
        0,
        v_arrival_date,
        'Purchase Bill #' || v_reference_label,
        'Purchase Bill #' || v_reference_label,
        'purchase',
        p_arrival_id,
        v_products
    );

    IF v_purchase_bill_total > 0.01 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, contact_id, debit, credit,
            entry_date, description, narration, transaction_type, reference_id, products
        ) VALUES (
            v_org_id,
            v_purchase_voucher_id,
            CASE WHEN v_party_id IS NULL THEN v_payables_acc_id ELSE NULL END,
            v_party_id,
            0,
            ROUND(v_purchase_bill_total, 2),
            v_arrival_date,
            'Purchase Bill #' || v_reference_label,
            'Purchase Bill #' || v_reference_label,
            'purchase',
            p_arrival_id,
            v_products
        );
    END IF;

    IF v_commission_total > 0.01 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit,
            entry_date, description, narration, transaction_type, reference_id
        ) VALUES (
            v_org_id,
            v_purchase_voucher_id,
            COALESCE(v_commission_income_acc_id, v_expense_recovery_acc_id, v_purchase_acc_id),
            0,
            ROUND(v_commission_total, 2),
            v_arrival_date,
            'Commission Deduction - ' || v_reference_label,
            'Commission Deduction - ' || v_reference_label,
            'purchase',
            p_arrival_id
        );
    END IF;

    IF v_recovery_total > 0.01 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit,
            entry_date, description, narration, transaction_type, reference_id
        ) VALUES (
            v_org_id,
            v_purchase_voucher_id,
            COALESCE(v_expense_recovery_acc_id, v_commission_income_acc_id, v_purchase_acc_id),
            0,
            ROUND(v_recovery_total, 2),
            v_arrival_date,
            'Charges Recovery - ' || v_reference_label,
            'Charges Recovery - ' || v_reference_label,
            'purchase',
            p_arrival_id
        );
    END IF;

    FOR v_lot IN
        SELECT *
        FROM mandi.lots
        WHERE arrival_id = p_arrival_id
          AND COALESCE(advance, 0) > 0
        ORDER BY created_at, id
    LOOP
        v_payment_mode := mandi.normalize_payment_mode(v_lot.advance_payment_mode);

        IF v_payment_mode = 'cheque' AND NOT COALESCE(v_lot.advance_cheque_status, false) THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1
            INTO v_pending_voucher_no
            FROM mandi.vouchers
            WHERE organization_id = v_org_id
              AND type = 'payment';

            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, amount, narration,
                arrival_id, party_id, cheque_no, cheque_date, bank_name,
                cheque_status, is_cleared, bank_account_id, reference_id
            ) VALUES (
                v_org_id,
                v_arrival_date,
                'payment',
                v_pending_voucher_no,
                COALESCE(v_lot.advance, 0),
                'Pending Cheque - Purchase Bill #' || v_reference_label,
                p_arrival_id,
                v_party_id,
                v_lot.advance_cheque_no,
                v_lot.advance_cheque_date,
                v_lot.advance_bank_name,
                'Pending',
                false,
                v_lot.advance_bank_account_id,
                p_arrival_id
            );
        ELSE
            v_payment_account_id := CASE
                WHEN v_payment_mode = 'cash' THEN v_cash_acc_id
                WHEN v_payment_mode IN ('upi', 'bank') THEN COALESCE(v_lot.advance_bank_account_id, v_bank_acc_id, v_cash_acc_id)
                WHEN v_payment_mode = 'cheque' THEN COALESCE(v_lot.advance_bank_account_id, v_bank_acc_id, v_cash_acc_id)
                ELSE v_cash_acc_id
            END;

            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit,
                    entry_date, description, narration, transaction_type, reference_id
                ) VALUES (
                    v_org_id,
                    v_purchase_voucher_id,
                    v_party_id,
                    ROUND(COALESCE(v_lot.advance, 0), 2),
                    0,
                    v_arrival_date,
                    'Advance Paid (' || upper(v_payment_mode) || ') - ' || v_reference_label,
                    'Advance Paid (' || upper(v_payment_mode) || ') - ' || v_reference_label,
                    'purchase',
                    p_arrival_id
                );
            END IF;

            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit,
                entry_date, description, narration, transaction_type, reference_id
            ) VALUES (
                v_org_id,
                v_purchase_voucher_id,
                COALESCE(v_payment_account_id, v_cash_acc_id, v_bank_acc_id),
                0,
                ROUND(COALESCE(v_lot.advance, 0), 2),
                v_arrival_date,
                'Advance Paid (' || upper(v_payment_mode) || ') - ' || v_reference_label,
                'Advance Paid (' || upper(v_payment_mode) || ') - ' || v_reference_label,
                'purchase',
                p_arrival_id
            );
        END IF;
    END LOOP;

    v_final_status := mandi.classify_bill_status(v_purchase_bill_total, v_all_paid_total);

    UPDATE mandi.arrivals
    SET status = v_final_status
    WHERE id = p_arrival_id;

    UPDATE mandi.purchase_bills pb
    SET
        net_payable = COALESCE(l.net_payable, pb.net_payable),
        payment_status = COALESCE(l.payment_status, pb.payment_status)
    FROM mandi.lots l
    WHERE pb.lot_id = l.id
      AND l.arrival_id = p_arrival_id;

    RETURN jsonb_build_object(
        'success', true,
        'arrival_id', p_arrival_id,
        'status', v_final_status,
        'bill_total', ROUND(v_purchase_bill_total, 2),
        'paid_total', ROUND(v_all_paid_total, 2),
        'goods_total', ROUND(v_goods_total, 2)
    );
END;
$$;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'confirm_sale_transaction'
          AND n.nspname IN ('mandi', 'public')
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.oid::regprocedure);
    END LOOP;
END;
$$;

CREATE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   UUID,
    p_buyer_id          UUID,
    p_sale_date         DATE,
    p_payment_mode      TEXT,
    p_total_amount      NUMERIC,
    p_items             JSONB,
    p_market_fee        NUMERIC DEFAULT 0,
    p_nirashrit         NUMERIC DEFAULT 0,
    p_misc_fee          NUMERIC DEFAULT 0,
    p_loading_charges   NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses    NUMERIC DEFAULT 0,
    p_amount_received   NUMERIC DEFAULT NULL,
    p_idempotency_key   TEXT DEFAULT NULL,
    p_due_date          DATE DEFAULT NULL,
    p_bank_account_id   UUID DEFAULT NULL,
    p_cheque_no         TEXT DEFAULT NULL,
    p_cheque_date       DATE DEFAULT NULL,
    p_cheque_status     BOOLEAN DEFAULT FALSE,
    p_bank_name         TEXT DEFAULT NULL,
    p_cgst_amount       NUMERIC DEFAULT 0,
    p_sgst_amount       NUMERIC DEFAULT 0,
    p_igst_amount       NUMERIC DEFAULT 0,
    p_gst_total         NUMERIC DEFAULT 0,
    p_discount_percent  NUMERIC DEFAULT 0,
    p_discount_amount   NUMERIC DEFAULT 0,
    p_place_of_supply   TEXT DEFAULT NULL,
    p_buyer_gstin       TEXT DEFAULT NULL,
    p_is_igst           BOOLEAN DEFAULT FALSE,
    p_header_discount   NUMERIC DEFAULT 0,
    p_narration         TEXT DEFAULT NULL,
    p_cheque_number     TEXT DEFAULT NULL,
    p_cheque_bank       TEXT DEFAULT NULL,
    p_gst_enabled       BOOLEAN DEFAULT FALSE,
    p_created_by        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public', 'extensions'
AS $$
DECLARE
    v_sale_id UUID;
    v_existing_sale_id UUID;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_discount_value NUMERIC := 0;
    v_goods_revenue NUMERIC := 0;
    v_total_before_tax NUMERIC := 0;
    v_total_inc_tax NUMERIC := 0;
    v_recovery_credit NUMERIC := 0;
    v_received NUMERIC := 0;
    v_payment_status TEXT := 'pending';
    v_mode TEXT;
    v_store_mode TEXT;
    v_effective_cheque_no TEXT;
    v_effective_bank_name TEXT;

    v_ar_acc_id UUID;
    v_sales_revenue_acc_id UUID;
    v_recovery_acc_id UUID;
    v_cash_acc_id UUID;
    v_bank_acc_id UUID;
    v_cheques_transit_acc_id UUID;
    v_payment_acc_id UUID;

    v_sale_voucher_id UUID;
    v_receipt_voucher_id UUID;
    v_voucher_no BIGINT;
    v_receipt_voucher_no BIGINT;

    v_item JSONB;
    v_qty NUMERIC;
    v_rate NUMERIC;
    v_amount NUMERIC;
    v_item_name TEXT;
    v_lot_code TEXT;
    v_arrival_id UUID;
    v_item_details TEXT := '';
    v_sale_narration TEXT;
    v_receipt_narration TEXT;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, bill_no, contact_bill_no
        INTO v_existing_sale_id, v_bill_no, v_contact_bill_no
        FROM mandi.sales
        WHERE organization_id = p_organization_id
          AND idempotency_key = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'sale_id', v_existing_sale_id,
                'bill_no', v_bill_no,
                'contact_bill_no', v_contact_bill_no,
                'idempotent', true
            );
        END IF;
    END IF;

    v_mode := mandi.normalize_payment_mode(p_payment_mode);
    v_store_mode := CASE v_mode
        WHEN 'credit' THEN 'credit'
        WHEN 'cash' THEN 'cash'
        WHEN 'upi' THEN 'upi'
        WHEN 'bank' THEN 'bank_transfer'
        WHEN 'cheque' THEN 'cheque'
        ELSE COALESCE(NULLIF(lower(p_payment_mode), ''), 'credit')
    END;

    v_effective_cheque_no := COALESCE(NULLIF(p_cheque_no, ''), NULLIF(p_cheque_number, ''));
    v_effective_bank_name := COALESCE(NULLIF(p_bank_name, ''), NULLIF(p_cheque_bank, ''));
    v_discount_value := COALESCE(NULLIF(p_discount_amount, 0), NULLIF(p_header_discount, 0), 0);
    v_goods_revenue := ROUND(GREATEST(COALESCE(p_total_amount, 0) - v_discount_value, 0), 2);

    v_total_before_tax := ROUND(
        v_goods_revenue
        + COALESCE(p_market_fee, 0)
        + COALESCE(p_nirashrit, 0)
        + COALESCE(p_misc_fee, 0)
        + COALESCE(p_loading_charges, 0)
        + COALESCE(p_unloading_charges, 0)
        + COALESCE(p_other_expenses, 0),
        2
    );
    v_total_inc_tax := ROUND(v_total_before_tax + COALESCE(p_gst_total, 0), 2);

    IF v_mode IN ('cash', 'upi', 'bank') THEN
        IF COALESCE(p_amount_received, 0) > 0 AND p_amount_received < v_total_inc_tax - 0.01 THEN
            v_payment_status := 'partial';
            v_received := ROUND(p_amount_received, 2);
        ELSE
            v_payment_status := 'paid';
            v_received := ROUND(COALESCE(NULLIF(p_amount_received, 0), v_total_inc_tax), 2);
        END IF;
    ELSIF v_mode = 'cheque' THEN
        IF COALESCE(p_cheque_status, false) THEN
            IF COALESCE(p_amount_received, 0) > 0 AND p_amount_received < v_total_inc_tax - 0.01 THEN
                v_payment_status := 'partial';
                v_received := ROUND(p_amount_received, 2);
            ELSE
                v_payment_status := 'paid';
                v_received := ROUND(COALESCE(NULLIF(p_amount_received, 0), v_total_inc_tax), 2);
            END IF;
        ELSE
            v_payment_status := 'pending';
            v_received := 0;
        END IF;
    ELSIF COALESCE(p_amount_received, 0) > 0 THEN
        v_received := ROUND(p_amount_received, 2);
        v_payment_status := CASE
            WHEN v_received >= v_total_inc_tax - 0.01 THEN 'paid'
            ELSE 'partial'
        END;
    ELSE
        v_payment_status := 'pending';
        v_received := 0;
    END IF;

    SELECT id INTO v_sales_revenue_acc_id
    FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (
          account_sub_type IN ('sales', 'operating_revenue')
          OR code = '4001'
          OR (type = 'income' AND name ILIKE '%sales%')
      )
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_recovery_acc_id
    FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (
          account_sub_type = 'fees'
          OR code IN ('4002', '4300')
          OR name ILIKE '%recovery%'
      )
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_ar_acc_id
    FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (
          account_sub_type IN ('accounts_receivable', 'receivable')
          OR name ILIKE '%receivable%'
      )
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_cash_acc_id
    FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (
          account_sub_type = 'cash'
          OR code = '1001'
          OR name ILIKE '%cash%'
      )
      AND name NOT ILIKE '%charges%'
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_bank_acc_id
    FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (
          account_sub_type = 'bank'
          OR code = '1002'
          OR name ILIKE '%bank%'
      )
      AND name NOT ILIKE '%transit%'
      AND name NOT ILIKE '%cheque%'
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_cheques_transit_acc_id
    FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (
          account_sub_type = 'cheques_in_transit'
          OR code = '1004'
          OR name ILIKE '%transit%'
          OR name ILIKE '%cheque%'
      )
    ORDER BY created_at
    LIMIT 1;

    IF v_ar_acc_id IS NULL THEN
        v_ar_acc_id := COALESCE(v_cash_acc_id, v_bank_acc_id);
    END IF;

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
    LOOP
        v_qty := COALESCE((v_item->>'qty')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'rate_per_unit')::NUMERIC, 0);

        IF v_qty <= 0 THEN
            CONTINUE;
        END IF;

        IF (v_item->>'lot_id') IS NOT NULL THEN
            UPDATE mandi.lots
            SET
                current_qty = ROUND(COALESCE(current_qty, 0) - v_qty, 3),
                status = CASE
                    WHEN COALESCE(current_qty, 0) - v_qty <= 0.01 THEN 'Sold'
                    ELSE 'partial'
                END
            WHERE id = (v_item->>'lot_id')::UUID
              AND organization_id = p_organization_id
              AND COALESCE(current_qty, 0) >= v_qty;

            IF NOT FOUND THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Insufficient stock for lot ' || COALESCE(v_item->>'lot_id', 'unknown')
                );
            END IF;
        END IF;
    END LOOP;

    INSERT INTO mandi.sales (
        organization_id,
        buyer_id,
        sale_date,
        total_amount,
        total_amount_inc_tax,
        payment_mode,
        payment_status,
        amount_received,
        market_fee,
        nirashrit,
        misc_fee,
        loading_charges,
        unloading_charges,
        other_expenses,
        due_date,
        cheque_no,
        cheque_date,
        bank_name,
        bank_account_id,
        cgst_amount,
        sgst_amount,
        igst_amount,
        gst_total,
        discount_percent,
        discount_amount,
        place_of_supply,
        buyer_gstin,
        idempotency_key
    ) VALUES (
        p_organization_id,
        p_buyer_id,
        p_sale_date,
        COALESCE(p_total_amount, 0),
        v_total_inc_tax,
        v_store_mode,
        v_payment_status,
        v_received,
        COALESCE(p_market_fee, 0),
        COALESCE(p_nirashrit, 0),
        COALESCE(p_misc_fee, 0),
        COALESCE(p_loading_charges, 0),
        COALESCE(p_unloading_charges, 0),
        COALESCE(p_other_expenses, 0),
        p_due_date,
        v_effective_cheque_no,
        p_cheque_date,
        v_effective_bank_name,
        p_bank_account_id,
        COALESCE(p_cgst_amount, 0),
        COALESCE(p_sgst_amount, 0),
        COALESCE(p_igst_amount, 0),
        COALESCE(p_gst_total, 0),
        COALESCE(p_discount_percent, 0),
        v_discount_value,
        p_place_of_supply,
        p_buyer_gstin,
        p_idempotency_key
    )
    RETURNING id, bill_no, contact_bill_no
    INTO v_sale_id, v_bill_no, v_contact_bill_no;

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
    LOOP
        v_qty := COALESCE((v_item->>'qty')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'rate_per_unit')::NUMERIC, 0);
        v_amount := ROUND(COALESCE((v_item->>'amount')::NUMERIC, v_qty * v_rate), 2);

        IF v_qty <= 0 THEN
            CONTINUE;
        END IF;

        SELECT l.arrival_id, l.lot_code, c.name
        INTO v_arrival_id, v_lot_code, v_item_name
        FROM mandi.lots l
        LEFT JOIN mandi.commodities c ON c.id = l.item_id
        WHERE l.id = (v_item->>'lot_id')::UUID;

        IF v_item_name IS NULL THEN
            SELECT name
            INTO v_item_name
            FROM mandi.commodities
            WHERE id = (v_item->>'item_id')::UUID;
        END IF;

        v_item_details := v_item_details
            || COALESCE(v_item_name, 'Item')
            || ' (' || v_qty || ' @ ₹' || v_rate
            || CASE WHEN v_lot_code IS NOT NULL THEN ', Lot: ' || v_lot_code ELSE '' END
            || ') ';

        INSERT INTO mandi.sale_items (
            sale_id, lot_id, item_id, qty, rate, amount
        ) VALUES (
            v_sale_id,
            CASE WHEN (v_item->>'lot_id') IS NOT NULL THEN (v_item->>'lot_id')::UUID ELSE NULL END,
            CASE WHEN (v_item->>'item_id') IS NOT NULL THEN (v_item->>'item_id')::UUID ELSE NULL END,
            v_qty,
            v_rate,
            v_amount
        );
    END LOOP;

    v_recovery_credit := ROUND(GREATEST(v_total_inc_tax - v_goods_revenue, 0), 2);
    v_sale_narration := COALESCE(NULLIF(p_narration, ''), 'Sale Invoice #' || COALESCE(v_contact_bill_no::TEXT, v_bill_no::TEXT));

    IF btrim(v_item_details) <> '' THEN
        v_sale_narration := v_sale_narration || ' | ' || btrim(v_item_details);
    END IF;

    SELECT COALESCE(MAX(voucher_no), 0) + 1
    INTO v_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = p_organization_id
      AND type = 'sale';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration,
        invoice_id, party_id, payment_mode, reference_id
    ) VALUES (
        p_organization_id,
        p_sale_date,
        'sale',
        v_voucher_no,
        v_total_inc_tax,
        v_sale_narration,
        v_sale_id,
        p_buyer_id,
        v_store_mode,
        v_sale_id
    ) RETURNING id INTO v_sale_voucher_id;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, contact_id, debit, credit,
        entry_date, description, narration, transaction_type, reference_id
    ) VALUES (
        p_organization_id,
        v_sale_voucher_id,
        v_ar_acc_id,
        p_buyer_id,
        v_total_inc_tax,
        0,
        p_sale_date,
        'Sale Invoice #' || COALESCE(v_contact_bill_no::TEXT, v_bill_no::TEXT),
        v_sale_narration,
        'sale',
        v_sale_id
    );

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit,
        entry_date, description, narration, transaction_type, reference_id
    ) VALUES (
        p_organization_id,
        v_sale_voucher_id,
        v_sales_revenue_acc_id,
        0,
        v_goods_revenue,
        p_sale_date,
        'Sales Revenue #' || COALESCE(v_contact_bill_no::TEXT, v_bill_no::TEXT),
        v_sale_narration,
        'sale',
        v_sale_id
    );

    IF v_recovery_credit > 0.01 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit,
            entry_date, description, narration, transaction_type, reference_id
        ) VALUES (
            p_organization_id,
            v_sale_voucher_id,
            COALESCE(v_recovery_acc_id, v_sales_revenue_acc_id),
            0,
            v_recovery_credit,
            p_sale_date,
            'Sales Charges Recovery #' || COALESCE(v_contact_bill_no::TEXT, v_bill_no::TEXT),
            v_sale_narration,
            'sale',
            v_sale_id
        );
    END IF;

    IF v_received > 0.01 AND v_mode NOT IN ('credit') THEN
        v_payment_acc_id := CASE
            WHEN v_mode = 'cash' THEN COALESCE(v_cash_acc_id, v_bank_acc_id)
            WHEN v_mode IN ('upi', 'bank') THEN COALESCE(p_bank_account_id, v_bank_acc_id, v_cash_acc_id)
            WHEN v_mode = 'cheque' THEN COALESCE(p_bank_account_id, v_bank_acc_id, v_cash_acc_id, v_cheques_transit_acc_id)
            ELSE COALESCE(v_cash_acc_id, v_bank_acc_id)
        END;

        v_receipt_narration := 'Receipt against Sale #' || COALESCE(v_contact_bill_no::TEXT, v_bill_no::TEXT);

        SELECT COALESCE(MAX(voucher_no), 0) + 1
        INTO v_receipt_voucher_no
        FROM mandi.vouchers
        WHERE organization_id = p_organization_id
          AND type = 'receipt';

        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, amount, narration,
            invoice_id, party_id, payment_mode, bank_account_id,
            cheque_no, cheque_date, bank_name, is_cleared, cheque_status, reference_id
        ) VALUES (
            p_organization_id,
            p_sale_date,
            'receipt',
            v_receipt_voucher_no,
            v_received,
            v_receipt_narration,
            v_sale_id,
            p_buyer_id,
            v_store_mode,
            p_bank_account_id,
            v_effective_cheque_no,
            p_cheque_date,
            v_effective_bank_name,
            CASE WHEN v_mode = 'cheque' THEN COALESCE(p_cheque_status, false) ELSE true END,
            CASE
                WHEN v_mode = 'cheque' AND NOT COALESCE(p_cheque_status, false) THEN 'Pending'
                WHEN v_mode = 'cheque' THEN 'Cleared'
                ELSE NULL
            END,
            v_sale_id
        ) RETURNING id INTO v_receipt_voucher_id;

        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit,
            entry_date, description, narration, transaction_type, reference_id
        ) VALUES (
            p_organization_id,
            v_receipt_voucher_id,
            v_payment_acc_id,
            v_received,
            0,
            p_sale_date,
            v_receipt_narration,
            v_receipt_narration,
            'receipt',
            v_sale_id
        );

        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, contact_id, debit, credit,
            entry_date, description, narration, transaction_type, reference_id
        ) VALUES (
            p_organization_id,
            v_receipt_voucher_id,
            v_ar_acc_id,
            p_buyer_id,
            0,
            v_received,
            p_sale_date,
            v_receipt_narration,
            v_receipt_narration,
            'receipt',
            v_sale_id
        );
    END IF;

    FOR v_arrival_id IN
        SELECT DISTINCT l.arrival_id
        FROM mandi.sale_items si
        JOIN mandi.lots l ON l.id = si.lot_id
        WHERE si.sale_id = v_sale_id
          AND l.arrival_id IS NOT NULL
    LOOP
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no,
        'payment_status', v_payment_status,
        'amount_received', v_received
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

CREATE FUNCTION public.confirm_sale_transaction(
    p_organization_id   UUID,
    p_buyer_id          UUID,
    p_sale_date         DATE,
    p_payment_mode      TEXT,
    p_total_amount      NUMERIC,
    p_items             JSONB,
    p_market_fee        NUMERIC DEFAULT 0,
    p_nirashrit         NUMERIC DEFAULT 0,
    p_misc_fee          NUMERIC DEFAULT 0,
    p_loading_charges   NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses    NUMERIC DEFAULT 0,
    p_amount_received   NUMERIC DEFAULT NULL,
    p_idempotency_key   TEXT DEFAULT NULL,
    p_due_date          DATE DEFAULT NULL,
    p_bank_account_id   UUID DEFAULT NULL,
    p_cheque_no         TEXT DEFAULT NULL,
    p_cheque_date       DATE DEFAULT NULL,
    p_cheque_status     BOOLEAN DEFAULT FALSE,
    p_bank_name         TEXT DEFAULT NULL,
    p_cgst_amount       NUMERIC DEFAULT 0,
    p_sgst_amount       NUMERIC DEFAULT 0,
    p_igst_amount       NUMERIC DEFAULT 0,
    p_gst_total         NUMERIC DEFAULT 0,
    p_discount_percent  NUMERIC DEFAULT 0,
    p_discount_amount   NUMERIC DEFAULT 0,
    p_place_of_supply   TEXT DEFAULT NULL,
    p_buyer_gstin       TEXT DEFAULT NULL,
    p_is_igst           BOOLEAN DEFAULT FALSE,
    p_header_discount   NUMERIC DEFAULT 0,
    p_narration         TEXT DEFAULT NULL,
    p_cheque_number     TEXT DEFAULT NULL,
    p_cheque_bank       TEXT DEFAULT NULL,
    p_gst_enabled       BOOLEAN DEFAULT FALSE,
    p_created_by        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
    SELECT mandi.confirm_sale_transaction(
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, p_items,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        p_amount_received, p_idempotency_key, p_due_date, p_bank_account_id,
        p_cheque_no, p_cheque_date, p_cheque_status, p_bank_name,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_percent, p_discount_amount, p_place_of_supply, p_buyer_gstin, p_is_igst,
        p_header_discount, p_narration, p_cheque_number, p_cheque_bank, p_gst_enabled, p_created_by
    );
$$;

CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public', 'extensions'
AS $$
DECLARE
    v_session RECORD;
    v_farmer RECORD;
    v_org_id UUID;
    v_lot_prefix TEXT;
    v_arrival_id UUID;
    v_lot_id UUID;
    v_bill_no BIGINT;
    v_less_units_calc NUMERIC;
    v_net_qty NUMERIC;
    v_gross_amount NUMERIC;
    v_less_amount NUMERIC;
    v_net_amount NUMERIC;
    v_commission_amount NUMERIC;
    v_net_payable NUMERIC;
    v_total_net_qty NUMERIC := 0;
    v_total_commission NUMERIC := 0;
    v_total_purchase NUMERIC := 0;
    v_sale_items_tmp JSONB := '[]'::JSONB;
    v_final_sale_items JSONB := '[]'::JSONB;
    v_item JSONB;
    v_item_amount NUMERIC := 0;
    v_sale_rate NUMERIC := 0;
    v_buyer_sale_id UUID;
    v_arrival_ids UUID[] := '{}';
BEGIN
    SELECT *
    INTO v_session
    FROM mandi.mandi_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session % not found', p_session_id;
    END IF;

    IF v_session.status = 'committed' THEN
        RAISE EXCEPTION 'Session already committed';
    END IF;

    v_org_id := v_session.organization_id;
    v_lot_prefix := COALESCE(NULLIF(v_session.lot_no, ''), 'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD'));

    FOR v_farmer IN
        SELECT *
        FROM mandi.mandi_session_farmers
        WHERE session_id = p_session_id
        ORDER BY sort_order, created_at
    LOOP
        IF COALESCE(v_farmer.less_units, 0) > 0 THEN
            v_less_units_calc := v_farmer.less_units;
        ELSIF COALESCE(v_farmer.less_percent, 0) > 0 THEN
            v_less_units_calc := ROUND(v_farmer.qty * v_farmer.less_percent / 100.0, 3);
        ELSE
            v_less_units_calc := 0;
        END IF;

        v_net_qty := GREATEST(COALESCE(v_farmer.qty, 0) - v_less_units_calc, 0);
        v_gross_amount := ROUND(COALESCE(v_farmer.qty, 0) * COALESCE(v_farmer.rate, 0), 2);
        v_less_amount := ROUND(v_less_units_calc * COALESCE(v_farmer.rate, 0), 2);
        v_net_amount := ROUND(v_net_qty * COALESCE(v_farmer.rate, 0), 2);
        v_commission_amount := ROUND(v_net_amount * COALESCE(v_farmer.commission_percent, 0) / 100.0, 2);
        v_net_payable := ROUND(
            v_net_amount
            - v_commission_amount
            - COALESCE(v_farmer.loading_charges, 0)
            - COALESCE(v_farmer.other_charges, 0),
            2
        );

        UPDATE mandi.mandi_session_farmers
        SET
            less_units = v_less_units_calc,
            net_qty = v_net_qty,
            gross_amount = v_gross_amount,
            less_amount = v_less_amount,
            net_amount = v_net_amount,
            commission_amount = v_commission_amount,
            net_payable = v_net_payable
        WHERE id = v_farmer.id;

        SELECT COALESCE(MAX(bill_no), 0) + 1
        INTO v_bill_no
        FROM mandi.arrivals
        WHERE organization_id = v_org_id;

        INSERT INTO mandi.arrivals (
            organization_id,
            arrival_date,
            party_id,
            arrival_type,
            lot_prefix,
            vehicle_number,
            reference_no,
            bill_no,
            status,
            advance,
            advance_payment_mode
        ) VALUES (
            v_org_id,
            v_session.session_date,
            v_farmer.farmer_id,
            'commission',
            v_lot_prefix,
            NULLIF(v_session.vehicle_no, ''),
            NULLIF(v_session.book_no, ''),
            v_bill_no,
            'pending',
            0,
            'credit'
        ) RETURNING id INTO v_arrival_id;

        INSERT INTO mandi.lots (
            organization_id,
            arrival_id,
            item_id,
            contact_id,
            lot_code,
            initial_qty,
            current_qty,
            gross_quantity,
            unit,
            supplier_rate,
            commission_percent,
            less_percent,
            less_units,
            packing_cost,
            loading_cost,
            farmer_charges,
            variety,
            grade,
            arrival_type,
            status,
            net_payable,
            payment_status
        ) VALUES (
            v_org_id,
            v_arrival_id,
            v_farmer.item_id,
            v_farmer.farmer_id,
            v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0'),
            v_net_qty,
            v_net_qty,
            v_farmer.qty,
            COALESCE(v_farmer.unit, 'Kg'),
            COALESCE(v_farmer.rate, 0),
            COALESCE(v_farmer.commission_percent, 0),
            COALESCE(v_farmer.less_percent, 0),
            v_less_units_calc,
            0,
            COALESCE(v_farmer.loading_charges, 0),
            COALESCE(v_farmer.other_charges, 0),
            NULLIF(v_farmer.variety, ''),
            COALESCE(NULLIF(v_farmer.grade, ''), 'A'),
            'commission',
            'active',
            GREATEST(v_net_payable, 0),
            'pending'
        ) RETURNING id INTO v_lot_id;

        UPDATE mandi.mandi_session_farmers
        SET arrival_id = v_arrival_id
        WHERE id = v_farmer.id;

        PERFORM mandi.post_arrival_ledger(v_arrival_id);

        v_total_net_qty := v_total_net_qty + v_net_qty;
        v_total_commission := v_total_commission + v_commission_amount;
        v_total_purchase := v_total_purchase + GREATEST(v_net_payable, 0);
        v_arrival_ids := array_append(v_arrival_ids, v_arrival_id);

        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object(
            'lot_id', v_lot_id,
            'item_id', v_farmer.item_id,
            'qty', v_net_qty,
            'unit', COALESCE(v_farmer.unit, 'Kg')
        );
    END LOOP;

    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := ROUND(
            COALESCE(v_session.buyer_payable, 0)
            - COALESCE(v_session.buyer_loading_charges, 0)
            - COALESCE(v_session.buyer_packing_charges, 0),
            2
        );
        v_sale_rate := ROUND(v_item_amount / v_total_net_qty, 2);

        FOR v_item IN
            SELECT value
            FROM jsonb_array_elements(v_sale_items_tmp)
        LOOP
            v_final_sale_items := v_final_sale_items || (
                v_item || jsonb_build_object(
                    'rate', v_sale_rate,
                    'amount', ROUND((v_item->>'qty')::NUMERIC * v_sale_rate, 2)
                )
            );
        END LOOP;

        SELECT (mandi.confirm_sale_transaction(
            p_organization_id := v_org_id,
            p_buyer_id := v_session.buyer_id,
            p_sale_date := v_session.session_date,
            p_payment_mode := 'credit',
            p_total_amount := v_item_amount,
            p_items := v_final_sale_items,
            p_loading_charges := COALESCE(v_session.buyer_loading_charges, 0),
            p_other_expenses := COALESCE(v_session.buyer_packing_charges, 0),
            p_amount_received := 0,
            p_idempotency_key := 'mcs-' || p_session_id::TEXT
        ))->>'sale_id'::TEXT
        INTO v_buyer_sale_id;
    END IF;

    UPDATE mandi.mandi_sessions
    SET
        status = 'committed',
        buyer_sale_id = v_buyer_sale_id,
        total_purchase = v_total_purchase,
        total_commission = v_total_commission,
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'purchase_bill_ids', to_jsonb(v_arrival_ids),
        'sale_bill_id', v_buyer_sale_id,
        'total_commission', v_total_commission,
        'total_purchase', v_total_purchase,
        'total_net_qty', v_total_net_qty
    );
END;
$$;

DROP FUNCTION IF EXISTS public.commit_mandi_session(UUID) CASCADE;
CREATE FUNCTION public.commit_mandi_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
    SELECT mandi.commit_mandi_session(p_session_id);
$$;

UPDATE mandi.lots l
SET net_payable = c.net_payable
FROM LATERAL mandi.get_lot_bill_components(l.id) c
WHERE l.id IS NOT NULL;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id
        FROM mandi.lots
    LOOP
        PERFORM mandi.refresh_lot_payment_status(r.id);
    END LOOP;
END;
$$;

UPDATE mandi.purchase_bills pb
SET
    net_payable = COALESCE(l.net_payable, pb.net_payable),
    payment_status = COALESCE(l.payment_status, pb.payment_status)
FROM mandi.lots l
WHERE pb.lot_id = l.id;

UPDATE mandi.vouchers v
SET invoice_id = s.id
FROM mandi.sales s
WHERE v.type = 'receipt'
  AND v.invoice_id IS NULL
  AND (
      v.reference_id = s.id
      OR COALESCE(v.narration, '') ILIKE '%' || s.bill_no::TEXT || '%'
      OR (
          s.contact_bill_no IS NOT NULL
          AND COALESCE(v.narration, '') ILIKE '%' || s.contact_bill_no::TEXT || '%'
      )
  );

UPDATE mandi.ledger_entries le
SET reference_id = v.invoice_id
FROM mandi.vouchers v
WHERE le.voucher_id = v.id
  AND v.type = 'receipt'
  AND v.invoice_id IS NOT NULL
  AND (le.reference_id IS NULL OR le.reference_id = v.id);

WITH receipt_totals AS (
    SELECT
        v.invoice_id AS sale_id,
        COALESCE(SUM(CASE WHEN le.contact_id IS NOT NULL THEN le.credit ELSE 0 END), 0) AS received_total
    FROM mandi.vouchers v
    JOIN mandi.ledger_entries le ON le.voucher_id = v.id
    WHERE v.type = 'receipt'
      AND v.invoice_id IS NOT NULL
    GROUP BY v.invoice_id
)
UPDATE mandi.sales s
SET
    amount_received = rt.received_total,
    payment_status = mandi.classify_bill_status(COALESCE(s.total_amount_inc_tax, 0), rt.received_total)
FROM receipt_totals rt
WHERE s.id = rt.sale_id;

UPDATE mandi.sales s
SET
    amount_received = COALESCE(s.total_amount_inc_tax, 0),
    payment_status = 'paid'
WHERE mandi.normalize_payment_mode(s.payment_mode) IN ('cash', 'upi', 'bank')
  AND COALESCE(s.amount_received, 0) <= 0.01
  AND COALESCE(s.payment_status, 'pending') = 'pending'
  AND NOT EXISTS (
      SELECT 1
      FROM mandi.vouchers v
      WHERE v.type = 'receipt'
        AND v.invoice_id = s.id
  );

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT arrival_id AS id
        FROM mandi.lots
        WHERE arrival_id IS NOT NULL
    LOOP
        PERFORM mandi.post_arrival_ledger(r.id);
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.get_lot_bill_components(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.refresh_lot_payment_status(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.post_arrival_ledger(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.confirm_sale_transaction TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_sale_transaction TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.commit_mandi_session(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_mandi_session(UUID) TO authenticated, service_role;

COMMIT;
