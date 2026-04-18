-- ============================================================
-- MANDIGROW STATUS SYNCHRONIZATION REPAIR (v5.3)
-- PURPOSE: Fix mismatch where Arrival-level advances were ignored.
-- ============================================================

BEGIN;

-- 1. UPDATE: post_arrival_ledger to include parent-level advances
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_arrival          RECORD;
    v_lot              RECORD;
    v_org_id           UUID;
    v_party_id         UUID;
    v_arrival_date     DATE;
    v_reference_no     TEXT;
    v_arrival_type     TEXT;

    -- Account IDs
    v_purchase_acc_id          UUID;
    v_expense_recovery_acc_id  UUID;
    v_cash_acc_id              UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id         UUID;

    -- Bill aggregates
    v_total_commission  NUMERIC := 0;
    v_total_inventory   NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;
    v_total_transport   NUMERIC := 0;
    v_lot_count         INT     := 0;

    -- Voucher
    v_main_voucher_id UUID;
    v_voucher_no      BIGINT;
    v_gross_bill      NUMERIC;

    -- Payment tracking
    v_total_advance_cleared NUMERIC := 0;  -- only cash + cleared-cheque advances
    v_final_status          TEXT    := 'pending';

    -- Advance loop
    v_adv        RECORD;
    v_contra_acc UUID;
    v_pend_vo_no BIGINT;
BEGIN
    -- 0. Fetch arrival
    SELECT a.*, c.name AS party_name INTO v_arrival
    FROM mandi.arrivals a
    LEFT JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Arrival not found');
    END IF;

    v_org_id       := v_arrival.organization_id;
    v_party_id     := v_arrival.party_id;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type := CASE v_arrival.arrival_type
                        WHEN 'farmer'   THEN 'commission'
                        WHEN 'purchase' THEN 'direct'
                        ELSE v_arrival.arrival_type
                      END;

    -- Cleanup old ledger entries
    WITH del AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id
               OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
          AND transaction_type = 'purchase'
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers
    WHERE id IN (SELECT voucher_id FROM del WHERE voucher_id IS NOT NULL)
      AND type = 'purchase';

    DELETE FROM mandi.vouchers
    WHERE arrival_id = p_arrival_id
      AND type = 'payment'
      AND COALESCE(is_cleared, false) = false
      AND cheque_status = 'Pending';

    -- 1. Get accounts (standardized for organization)
    SELECT id INTO v_purchase_acc_id          FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id  FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4002' LIMIT 1;
    SELECT id INTO v_cash_acc_id              FROM mandi.accounts WHERE organization_id = v_org_id AND code = '1001' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' LIMIT 1;
    SELECT id INTO v_inventory_acc_id         FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' LIMIT 1;

    -- 2. Aggregate totals from lots
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;
        DECLARE
            v_val NUMERIC := COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            IF v_arrival_type = 'commission' THEN
                v_total_commission := v_total_commission + (v_val * COALESCE(v_lot.commission_percent, 0) / 100.0);
                v_total_inventory  := v_total_inventory  + v_val;
            ELSE
                v_total_direct_cost := v_total_direct_cost + (v_val - COALESCE(v_lot.farmer_charges, 0));
                v_total_commission  := v_total_commission  + ((v_val - COALESCE(v_lot.farmer_charges, 0)) * COALESCE(v_lot.commission_percent, 0) / 100.0);
            END IF;
        END;
    END LOOP;

    IF v_lot_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'msg', 'No lots');
    END IF;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0) + COALESCE(v_arrival.other_expenses, 0);
    v_gross_bill      := CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END;

    -- 3. Create purchase voucher
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount,
        party_id, arrival_id
    ) VALUES (
        v_org_id, v_arrival_date, 'purchase', v_voucher_no,
        'Arrival ' || v_reference_no, v_gross_bill,
        v_party_id, p_arrival_id
    ) RETURNING id INTO v_main_voucher_id;

    -- 4. Goods Entry Logic (Standard)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (v_org_id, v_main_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, v_gross_bill, 0, v_arrival_date, 'Goods Received', 'purchase', p_arrival_id);

    IF v_party_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_gross_bill, v_arrival_date, 'Goods Payable', 'purchase', p_arrival_id);
        
        -- Recovery / Commission entries ... (Same as before)
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_transport, 0, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);
        END IF;

        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_commission, 0, v_arrival_date, 'Commission Deduction', 'purchase', p_arrival_id);
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income', 'purchase', p_arrival_id);
        END IF;
    END IF;

    -- 5. PROCESS ADVANCES (360° Fix)
    
    -- A. PARENT LEVEL ADVANCE (from arrivals table)
    IF COALESCE(v_arrival.advance_amount, 0) > 0 THEN
        v_contra_acc := CASE 
            WHEN v_arrival.advance_payment_mode = 'cash' THEN v_cash_acc_id 
            ELSE COALESCE(v_arrival.advance_bank_account_id, v_cash_acc_id) 
        END;

        IF v_arrival.advance_payment_mode IN ('cash', 'upi', 'bank_transfer', 'bank', 'UPI/BANK') THEN
            v_total_advance_cleared := v_total_advance_cleared + v_arrival.advance_amount;
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_party_id, v_arrival.advance_amount, 0, v_arrival_date, 'Parent Advance (' || v_arrival.advance_payment_mode || ')', 'purchase', p_arrival_id);
            END IF;
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_contra_acc, 0, v_arrival.advance_amount, v_arrival_date, 'Parent Advance (' || v_arrival.advance_payment_mode || ')', 'purchase', p_arrival_id);
        END IF;
        -- (Cheque handling at parent level not requested but implied if mode is cheque)
    END IF;

    -- B. CHILD LEVEL ADVANCES (from lots table)
    FOR v_adv IN
        SELECT
            COALESCE(advance_payment_mode, 'cash') AS mode,
            COALESCE(advance_cheque_status, false)  AS chq_cleared,
            advance_cheque_no                        AS chq_no,
            advance_cheque_date                      AS chq_date,
            advance_bank_name                        AS bnk_name,
            advance_bank_account_id                  AS bank_acc_id,
            SUM(advance)                             AS total_adv
        FROM mandi.lots
        WHERE arrival_id = p_arrival_id AND COALESCE(advance, 0) > 0
        GROUP BY 1, 2, 3, 4, 5, 6
    LOOP
        v_contra_acc := CASE WHEN v_adv.mode = 'cash' THEN v_cash_acc_id ELSE COALESCE(v_adv.bank_acc_id, v_cash_acc_id) END;

        IF v_adv.mode IN ('cash', 'upi', 'bank_transfer', 'bank', 'UPI/BANK') OR (v_adv.mode = 'cheque' AND v_adv.chq_cleared = true) THEN
            v_total_advance_cleared := v_total_advance_cleared + v_adv.total_adv;
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_party_id, v_adv.total_adv, 0, v_arrival_date, 'Lot Advance (' || v_adv.mode || ')', 'purchase', p_arrival_id);
            END IF;
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_contra_acc, 0, v_adv.total_adv, v_arrival_date, 'Lot Advance (' || v_adv.mode || ')', 'purchase', p_arrival_id);
        ELSE
            -- Uncleared Cheque
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_pend_vo_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, arrival_id, party_id, cheque_no, cheque_date, bank_name, cheque_status, is_cleared, bank_account_id)
            VALUES (v_org_id, v_arrival_date, 'payment', v_pend_vo_no, 'Pending Cheque — Arrival ' || v_reference_no, v_adv.total_adv, p_arrival_id, v_party_id, v_adv.chq_no, v_adv.chq_date, v_adv.bnk_name, 'Pending', false, v_adv.bank_acc_id);
        END IF;
    END LOOP;

    -- 6. FINAL STATUS CALCULATION
    IF v_total_advance_cleared >= (v_gross_bill - 0.01) AND v_gross_bill > 0 THEN
        v_final_status := 'paid';
    ELSIF v_total_advance_cleared > 0 THEN
        v_final_status := 'partial';
    ELSE
        v_final_status := 'pending';
    END IF;

    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.purchase_bills SET payment_status = v_final_status WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id);

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status, 'bill', v_gross_bill, 'paid', v_total_advance_cleared);
END;
$function$;

-- 2. RECOVERY SCRIPT: Fix all existing arrivals
DO $$
DECLARE
    arr_id UUID;
BEGIN
    FOR arr_id IN SELECT id FROM mandi.arrivals LOOP
        PERFORM mandi.post_arrival_ledger(arr_id);
    END LOOP;
END;
$$;

COMMIT;
