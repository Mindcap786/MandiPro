-- This migration fixes the post_arrival_ledger RPC to ensure correct logging of purchases and advances.
-- Advances (partial payments) made from the Arrivals form must be logged under the same 'purchase' voucher,
-- rather than creating independent 'payment' vouchers.

CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival         RECORD;
    v_lot             RECORD;
    v_adv             RECORD;

    -- Account IDs
    v_purchase_acc_id          UUID;
    v_expense_recovery_acc_id  UUID;
    v_cash_acc_id              UUID;
    v_cheque_issued_acc_id     UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id         UUID;
    v_ap_acc_id                UUID;  -- Accounts Payable

    -- Voucher tracking
    v_main_voucher_id          UUID;
    v_voucher_no               BIGINT;

    -- Runtime vars
    v_org_id           UUID;
    v_party_id         UUID;
    v_arrival_date     DATE;
    v_reference_no     TEXT;
    v_arrival_type     TEXT;

    -- Per-lot financials
    v_adj_qty          NUMERIC;
    v_base_value       NUMERIC;
    v_commission_amt   NUMERIC;
    v_lot_expenses     NUMERIC;
    v_net_payable      NUMERIC;
    v_total_transport  NUMERIC;
    v_lot_count        INT := 0;

    -- Aggregates for header-level posting
    v_total_commission NUMERIC := 0;
    v_total_inventory  NUMERIC := 0;
    v_total_payable    NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;

BEGIN
    -- ─── 0. Idempotency: delete existing entries for this arrival ───────────────
    WITH deleted AS (
        DELETE FROM mandi.ledger_entries
        WHERE reference_id = p_arrival_id
          AND transaction_type IN ('expense', 'income', 'purchase', 'payment', 'payable', 'commission')
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers WHERE id IN (SELECT voucher_id FROM deleted);

    -- ─── 1. Fetch Arrival Header ─────────────────────────────────────────────────
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Arrival % not found', p_arrival_id; END IF;

    v_org_id       := v_arrival.organization_id;
    v_party_id     := v_arrival.party_id;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, 'Arrival');
    v_arrival_type := v_arrival.arrival_type;

    IF v_party_id IS NULL THEN
        RAISE EXCEPTION 'Party ID required on arrival % for ledger posting', p_arrival_id;
    END IF;

    -- ─── 2. Ensure Required Accounts Exist ──────────────────────────────────────
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '5001' OR name ILIKE '%Purchase%') AND type = 'expense' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '4002' OR name ILIKE '%Expense Recovery%') AND type = 'income' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '1001' OR name ILIKE 'Cash%') AND type = 'asset' LIMIT 1;
    SELECT id INTO v_cheque_issued_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '2005' OR name ILIKE '%Cheques Issued%') AND type = 'liability' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' AND type = 'income' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' AND type = 'asset' LIMIT 1;
    SELECT id INTO v_ap_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '2001' OR name ILIKE '%Accounts Payable%' OR name ILIKE '%Payable%') AND type = 'liability' LIMIT 1;

    -- Auto-create missing system accounts
    IF v_purchase_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (v_org_id, 'Purchase Account', 'expense', '5001', true) RETURNING id INTO v_purchase_acc_id;
    END IF;
    IF v_expense_recovery_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (v_org_id, 'Expense Recovery', 'income', '4002', true) RETURNING id INTO v_expense_recovery_acc_id;
    END IF;
    IF v_cash_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (v_org_id, 'Cash Account', 'asset', '1001', true) RETURNING id INTO v_cash_acc_id;
    END IF;
    IF v_cheque_issued_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (v_org_id, 'Cheques Issued', 'liability', '2005', true) RETURNING id INTO v_cheque_issued_acc_id;
    END IF;
    IF v_commission_income_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (v_org_id, 'Commission Income', 'income', '4001', true) RETURNING id INTO v_commission_income_acc_id;
    END IF;
    IF v_inventory_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (v_org_id, 'Stock/Inventory', 'asset', '1003', true) RETURNING id INTO v_inventory_acc_id;
    END IF;
    IF v_ap_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (v_org_id, 'Accounts Payable', 'liability', '2001', true) RETURNING id INTO v_ap_acc_id;
    END IF;

    -- ─── 3. Calculate header-level transport deductions ─────────────────────────
    v_total_transport := COALESCE(v_arrival.hire_charges, 0)
                       + COALESCE(v_arrival.hamali_expenses, 0)
                       + COALESCE(v_arrival.other_expenses, 0);

    -- ─── 4. Loop through lots and calculate batch totals ─────────────────────────
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;

        v_adj_qty := COALESCE(v_lot.initial_qty, 0)
                   - (COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.less_percent, 0) / 100.0);
        v_base_value := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);

        IF v_arrival_type IN ('commission', 'commission_supplier') THEN
            v_commission_amt := v_base_value * COALESCE(v_lot.commission_percent, 0) / 100.0;
            v_lot_expenses := COALESCE(v_lot.packing_cost, 0) + COALESCE(v_lot.loading_cost, 0);
            v_net_payable := v_base_value - v_commission_amt - v_lot_expenses
                           - COALESCE(v_lot.farmer_charges, 0);

            v_total_commission := v_total_commission + v_commission_amt;
            v_total_inventory  := v_total_inventory  + v_base_value;
            v_total_payable    := v_total_payable    + v_net_payable;

        ELSE
            -- Direct purchase
            v_base_value := v_base_value - COALESCE(v_lot.farmer_charges, 0);
            v_total_direct_cost := v_total_direct_cost + v_base_value;
        END IF;
    END LOOP;

    -- ─── 5A. Commission Arrival: Full Journal ────────────────────────────────────
    IF v_arrival_type IN ('commission', 'commission_supplier') AND v_lot_count > 0 THEN

        v_net_payable := v_total_payable - v_total_transport;

        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
        FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount)
        VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no,
                'Commission Arrival - ' || v_reference_no, v_total_inventory)
        RETURNING id INTO v_main_voucher_id;

        -- Dr Inventory
        INSERT INTO mandi.ledger_entries
            (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_inventory_acc_id,
                v_total_inventory, 0, v_arrival_date, 'Stock In - Commission Arrival', 'purchase', p_arrival_id);

        -- Cr Party Payable
        IF v_net_payable > 0 THEN
            INSERT INTO mandi.ledger_entries
                (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id,
                    0, v_net_payable, v_arrival_date, 'Supplier Payable (Net of Commission)', 'purchase', p_arrival_id);
        END IF;

        -- Cr Commission Income
        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries
                (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id,
                    0, v_total_commission, v_arrival_date, 'Commission Income Earned', 'purchase', p_arrival_id);
        END IF;

        -- Cr Expense Recovery
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries
                (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id,
                    0, v_total_transport, v_arrival_date, 'Transport Expense Recovery', 'purchase', p_arrival_id);

            -- Dr Party for transport deduction
            INSERT INTO mandi.ledger_entries
                (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id,
                    v_total_transport, 0, v_arrival_date, 'Transport Deducted from Farmer', 'purchase', p_arrival_id);
        END IF;

    -- ─── 5B. Direct Purchase Arrival: Payable Journal ────────────────────────────
    ELSIF v_arrival_type = 'direct' AND v_total_direct_cost > 0 THEN

        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
        FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount)
        VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no,
                'Direct Purchase Arrival - ' || v_reference_no, v_total_direct_cost)
        RETURNING id INTO v_main_voucher_id;

        -- Dr Purchase Account
        INSERT INTO mandi.ledger_entries
            (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_purchase_acc_id,
                v_total_direct_cost, 0, v_arrival_date, 'Purchase Cost (Direct Buy)', 'purchase', p_arrival_id);

        -- Cr Accounts Payable - Party
        INSERT INTO mandi.ledger_entries
            (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id,
                0, v_total_direct_cost, v_arrival_date, 'Supplier Payable (Direct Purchase)', 'purchase', p_arrival_id);

        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries
                (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id,
                    v_total_transport, 0, v_arrival_date, 'Transport Expenses', 'purchase', p_arrival_id);
            INSERT INTO mandi.ledger_entries
                (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id,
                    0, v_total_transport, v_arrival_date, 'Transport Recovery Income', 'purchase', p_arrival_id);
        END IF;
    END IF;

    -- ─── 6. Handle Advances (all arrival types) under same Purchase Voucher ───────
    IF v_main_voucher_id IS NOT NULL THEN
        FOR v_adv IN
            SELECT
                COALESCE(advance_payment_mode, 'cash') AS mode,
                advance_cheque_no   AS chq_no,
                advance_cheque_date AS chq_date,
                advance_bank_name   AS bnk,
                SUM(advance)        AS total_adv
            FROM mandi.lots
            WHERE arrival_id = p_arrival_id AND advance > 0
            GROUP BY 1, 2, 3, 4
        LOOP
            DECLARE
                v_contra_id UUID;
            BEGIN
                v_contra_id := CASE WHEN v_adv.mode = 'cheque' THEN v_cheque_issued_acc_id ELSE v_cash_acc_id END;

                -- Dr Party (reduces their payable balance)
                INSERT INTO mandi.ledger_entries
                    (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_party_id,
                        v_adv.total_adv, 0, v_arrival_date,
                        'Advance Paid (' || v_adv.mode || ')', 'purchase', p_arrival_id);

                -- Cr Cash/Cheque (money went out)
                INSERT INTO mandi.ledger_entries
                    (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_contra_id,
                        0, v_adv.total_adv, v_arrival_date,
                        'Advance Contra (' || v_adv.mode || ')', 'purchase', p_arrival_id);

            END;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'arrival_id', p_arrival_id,
        'arrival_type', v_arrival_type,
        'lots_processed', v_lot_count,
        'commission_posted', v_total_commission,
        'payable_posted', v_total_payable
    );
END;
$function$;
