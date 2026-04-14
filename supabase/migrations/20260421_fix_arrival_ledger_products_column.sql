-- Fix: Update post_arrival_ledger function to include products column
-- The products column was added on 20260412 but the function wasn't updated

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

    -- Voucher
    v_main_voucher_id UUID;
    v_voucher_no BIGINT;
    v_gross_bill NUMERIC;
    v_final_status TEXT := 'pending';
BEGIN
    -- 0. Get arrival and party
    SELECT a.*, c.name as party_name INTO v_arrival
    FROM mandi.arrivals a
    JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Arrival not found');
    END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type := CASE v_arrival.arrival_type WHEN 'farmer' THEN 'commission' WHEN 'purchase' THEN 'direct' ELSE v_arrival.arrival_type END;

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
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = 5001 LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = 4002 LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = 1001 LIMIT 1;
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

    -- 3. Create SINGLE goods transaction (voucher)
    -- KEY CHANGE: Only goods, no payment entries
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount,
        party_id, arrival_id
    ) VALUES (
        v_org_id, v_arrival_date, 'purchase', v_voucher_no,
        'Arrival ' || v_reference_no,
        CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END,
        v_party_id, p_arrival_id
    ) RETURNING id INTO v_main_voucher_id;

    -- Debit Inventory/Purchase
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
    VALUES (v_org_id, v_main_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, v_gross_bill, 0, v_arrival_date, 'Fruit Value', 'purchase', p_arrival_id, NULL);

    -- Credit Party (Full Bill)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
    VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_gross_bill, v_arrival_date, 'Arrival Entry', 'purchase', p_arrival_id, NULL);

    -- Transport Recovery
    IF v_total_transport > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_transport, 0, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id, NULL);

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
        VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id, NULL);
    END IF;

    -- Commission Income
    IF v_total_commission > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_commission, 0, v_arrival_date, 'Commission Deduction', 'purchase', p_arrival_id, NULL);

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id, products)
        VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income', 'purchase', p_arrival_id, NULL);
    END IF;

    -- 4. Set arrival status to PENDING (payment to be recorded separately)
    v_final_status := 'pending';
    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.purchase_bills SET payment_status = v_final_status WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id);

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status, 'message', 'Arrival recorded. Payment status: pending');
END;
$function$;