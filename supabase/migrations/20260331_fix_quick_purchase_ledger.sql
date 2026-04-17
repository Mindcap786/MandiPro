-- Migration to unify Quick Purchase daybook entries and clean up redundant public schema functions

-- 1. Drop the incorrect public schema functions
DROP FUNCTION IF EXISTS public.record_quick_purchase(uuid, uuid, date, text, numeric, text, text, date, text, boolean, uuid, boolean, uuid, jsonb);
DROP FUNCTION IF EXISTS public.record_quick_purchase(uuid, uuid, date, text, jsonb, numeric, text, uuid, text, date, text, boolean, boolean, uuid);

-- 2. Drop the overloaded mandi schema functions to recreate a clean canonical version
DROP FUNCTION IF EXISTS mandi.record_quick_purchase(uuid, uuid, date, text, jsonb, numeric, text, uuid, text, date, text, boolean, boolean, uuid);

-- 3. Update mandi.post_arrival_ledger to support cheque and bank details from lots
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival         RECORD;
    v_lot             RECORD;
    v_org_id           UUID;
    v_party_id         UUID;
    v_party_name       TEXT;
    v_arrival_date     DATE;
    v_reference_no     TEXT;
    v_arrival_type     TEXT;

    -- Account IDs
    v_purchase_acc_id          UUID;
    v_expense_recovery_acc_id  UUID;
    v_cash_acc_id              UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id         UUID;

    -- Voucher tracking
    v_main_voucher_id          UUID;
    v_voucher_no               BIGINT;

    -- Financial aggregates
    v_total_commission NUMERIC := 0;
    v_total_inventory  NUMERIC := 0;
    v_total_payable    NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;
    v_total_transport  NUMERIC := 0;
    v_total_paid       NUMERIC := 0;
    v_lot_count        INT := 0;
    v_contra_acc_id    UUID;
    
    -- Cheque and Payment Tracking
    v_check_no         TEXT;
    v_check_date       DATE;
    v_check_status     BOOLEAN;
    v_bank_name        TEXT;

BEGIN
    -- 0. Header & Cleanup
    SELECT a.*, c.name as party_name INTO v_arrival 
    FROM mandi.arrivals a 
    JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;
    
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival or Party not found'); END IF;

    v_org_id       := v_arrival.organization_id;
    v_party_id     := v_arrival.party_id;
    v_party_name   := v_arrival.party_name;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type := CASE v_arrival.arrival_type WHEN 'farmer' THEN 'commission' WHEN 'purchase' THEN 'direct' ELSE v_arrival.arrival_type END;

    -- Standard Cleanup
    WITH deleted_vouchers AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers WHERE id IN (SELECT voucher_id FROM deleted_vouchers WHERE voucher_id IS NOT NULL);

    -- 2. Accounts
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '5001' OR name ILIKE '%Purchase%') AND type = 'expense' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '4002' OR name ILIKE '%Expense Recovery%') AND type = 'income' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '1001' OR name ILIKE 'Cash%') AND type = 'asset' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' AND type = 'income' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' AND type = 'asset' LIMIT 1;

    -- 3. Aggregates
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;
        DECLARE
            v_adj_qty NUMERIC := CASE WHEN COALESCE(v_lot.less_units, 0) > 0 THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0) ELSE COALESCE(v_lot.initial_qty, 0) * (1.0 - COALESCE(v_lot.less_percent, 0) / 100.0) END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            v_total_paid := v_total_paid + COALESCE(v_lot.advance, 0);
            
            -- Capture contra account and cheque details from the first lot that has an advance
            IF v_lot.advance > 0 AND v_contra_acc_id IS NULL THEN
                v_contra_acc_id := CASE WHEN v_lot.advance_payment_mode IN ('bank', 'cheque') THEN COALESCE(v_lot.advance_bank_account_id, v_cash_acc_id) ELSE v_cash_acc_id END;
                v_check_no := v_lot.advance_cheque_no;
                v_check_date := v_lot.advance_cheque_date;
                v_check_status := v_lot.advance_cheque_status;
                v_bank_name := v_lot.advance_bank_name;
            END IF;

            IF v_arrival_type = 'commission' THEN
                DECLARE
                    v_comm NUMERIC := v_val * COALESCE(v_lot.commission_percent, 0) / 100.0;
                    v_exp  NUMERIC := COALESCE(v_lot.packing_cost, 0) + COALESCE(v_lot.loading_cost, 0);
                BEGIN
                    v_total_commission := v_total_commission + v_comm;
                    v_total_inventory  := v_total_inventory  + v_val;
                    v_total_payable    := v_total_payable    + (v_val - v_comm - v_exp - COALESCE(v_lot.farmer_charges, 0));
                END;
            ELSE
                DECLARE
                    v_comm NUMERIC := (v_val - COALESCE(v_lot.farmer_charges, 0)) * COALESCE(v_lot.commission_percent, 0) / 100.0;
                BEGIN
                    v_total_direct_cost := v_total_direct_cost + (v_val - COALESCE(v_lot.farmer_charges, 0) - v_comm);
                END;
            END IF;
        END;
    END LOOP;

    IF v_lot_count = 0 THEN RETURN jsonb_build_object('success', true, 'msg', 'No lots'); END IF;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0) + COALESCE(v_arrival.other_expenses, 0);
    v_contra_acc_id := COALESCE(v_contra_acc_id, v_cash_acc_id);

    -- 4. Post Unified Voucher (TWO-ENTRY PARTY MODEL)
    DECLARE
        v_gross_amount NUMERIC := CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END;
        v_narration    TEXT := CASE WHEN v_arrival_type = 'commission' THEN 'Commission Arrival ' ELSE 'Direct Purchase ' END || v_reference_no;
        v_cheque_status_text TEXT := CASE WHEN v_check_status IS TRUE THEN 'Cleared' WHEN v_check_status IS FALSE THEN 'Pending' ELSE NULL END;
    BEGIN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
        
        -- Insert voucher with cheque details included
        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, narration, amount,
            cheque_no, cheque_date, bank_name, is_cleared, cheque_status
        ) VALUES (
            v_org_id, v_arrival_date, 'purchase', v_voucher_no, v_narration, v_gross_amount,
            v_check_no, v_check_date, v_bank_name, COALESCE(v_check_status, false), v_cheque_status_text
        ) RETURNING id INTO v_main_voucher_id;

        -- --- ENTRY 1: THE PURCHASE (CREDIT TO PARTY) ---
        -- Debit: Asset/Expense side
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, v_gross_amount, 0, v_arrival_date, 'Fruit Value', 'purchase', p_arrival_id);
        
        -- Credit: Party (FULL AMOUNT)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_gross_amount, v_arrival_date, 'Fruit received from ' || v_party_name, 'purchase', p_arrival_id);

        -- --- ENTRY 2: THE PAYMENT (DEBIT TO PARTY) ---
        IF v_total_paid > 0 THEN
            -- Debit: Party (OFFSET PARTIAL/FULL)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_paid, 0, v_arrival_date, 'Cash/Bank paid to ' || v_party_name, 'purchase', p_arrival_id);
            
            -- Credit: Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_contra_acc_id, 0, v_total_paid, v_arrival_date, 'Payment for Arrival', 'purchase', p_arrival_id);
        END IF;

        -- --- ENTRY 3: RECOVERIES (EXPENSE RECOVERY) ---
        IF v_total_transport > 0 THEN
             -- Debit: Party (FOR RECOVERIES)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_transport, 0, v_arrival_date, 'Transport Recovery from ' || v_party_name, 'purchase', p_arrival_id);
            
            -- Credit: Expense Recovery Account
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);
        END IF;

        -- COMMISSION INCOME (If applicable)
        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Earned', 'purchase', p_arrival_id);
            
             -- Note: In commission model, the Net is what matters, but to keep 2-entry party view clean, 
             -- we post Full Gross Credit and then separate debits for Comm/Exp/Cash.
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_commission, 0, v_arrival_date, 'Commission Deduction', 'purchase', p_arrival_id);
        END IF;
    END;

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id);
END;
$function$;

-- 4. Recreate the canonical mandi.record_quick_purchase
CREATE OR REPLACE FUNCTION mandi.record_quick_purchase(
    p_organization_id uuid,
    p_supplier_id uuid,
    p_arrival_date date,
    p_arrival_type text,
    p_items jsonb,
    p_advance numeric DEFAULT 0,
    p_advance_payment_mode text DEFAULT 'cash'::text,
    p_advance_bank_account_id uuid DEFAULT NULL::uuid,
    p_advance_cheque_no text DEFAULT NULL::text,
    p_advance_cheque_date date DEFAULT NULL::date,
    p_advance_bank_name text DEFAULT NULL::text,
    p_advance_cheque_status boolean DEFAULT false,
    p_clear_instantly boolean DEFAULT false,
    p_created_by uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival_id UUID;
    v_arrival_bill_no BIGINT;
    v_arrival_contact_bill_no BIGINT;
    v_item RECORD;
    v_first_lot_id UUID;
    v_net_qty NUMERIC;
    v_gross NUMERIC;
    v_comm NUMERIC;
    v_net_payable NUMERIC;
    v_calculated_arrival_type TEXT;
    v_farmer_count INT := 0;
    v_supplier_count INT := 0;
BEGIN
    -- 1. Determine Arrival Type based on items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(commission_type text) LOOP
        IF v_item.commission_type = 'farmer' THEN v_farmer_count := v_farmer_count + 1; END IF;
        IF v_item.commission_type = 'supplier' THEN v_supplier_count := v_supplier_count + 1; END IF;
    END LOOP;

    IF v_farmer_count > 0 AND v_supplier_count > 0 THEN
        v_calculated_arrival_type := 'mixed';
    ELSIF v_farmer_count > 0 THEN
        v_calculated_arrival_type := 'farmer';
    ELSIF v_supplier_count > 0 THEN
        v_calculated_arrival_type := 'supplier';
    ELSE
        v_calculated_arrival_type := p_arrival_type;
    END IF;

    -- 2. Insert Arrival Header
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_date, arrival_type, status, created_at
    ) VALUES (
        p_organization_id, p_supplier_id, p_arrival_date, v_calculated_arrival_type, 'completed', NOW()
    ) RETURNING id, bill_no, contact_bill_no INTO v_arrival_id, v_arrival_bill_no, v_arrival_contact_bill_no;

    -- 3. Insert Lots and Purchase Bills
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id uuid, commodity_id uuid, -- Accept both to be safe
        qty numeric, unit text, rate numeric, 
        commission numeric, commission_type text, weight_loss numeric, less_units numeric, 
        storage_location text, lot_code text
    ) LOOP
        DECLARE
            v_lot_id UUID;
            v_lot_code TEXT;
            v_effective_item_id UUID;
        BEGIN
            v_effective_item_id := COALESCE(v_item.item_id, v_item.commodity_id);
            v_lot_code := COALESCE(v_item.lot_code, 'LOT-' || v_arrival_bill_no || '-' || substr(gen_random_uuid()::text, 1, 4));
            
            -- Insert Lot
            INSERT INTO mandi.lots (
                organization_id, arrival_id, item_id, lot_code, initial_qty, current_qty, 
                unit, supplier_rate, commission_percent, less_percent, status, 
                storage_location, less_units, arrival_type, created_at,
                contact_id
            ) VALUES (
                p_organization_id, v_arrival_id, v_effective_item_id, 
                v_lot_code, 
                v_item.qty, v_item.qty, v_item.unit, v_item.rate, v_item.commission, 
                v_item.weight_loss, 'active', v_item.storage_location, v_item.less_units,
                v_item.commission_type, 
                NOW(),
                p_supplier_id
            ) RETURNING id INTO v_lot_id;

            IF v_first_lot_id IS NULL THEN v_first_lot_id := v_lot_id; END IF;

            -- Auto-generate Purchase Bill
            v_net_qty := COALESCE(v_item.qty, 0) - COALESCE(v_item.less_units, 0);
            v_gross := v_net_qty * COALESCE(v_item.rate, 0);
            v_comm := (v_gross * COALESCE(v_item.commission, 0)) / 100;
            v_net_payable := v_gross - v_comm;

            INSERT INTO mandi.purchase_bills (
                organization_id, lot_id, contact_id, 
                bill_number, bill_date, 
                gross_amount, commission_amount, less_amount, 
                net_payable, status, payment_status
            ) VALUES (
                p_organization_id, v_lot_id, p_supplier_id,
                'PB-' || COALESCE(v_arrival_contact_bill_no, v_arrival_bill_no) || '-' || COALESCE((SELECT name FROM mandi.commodities WHERE id = v_effective_item_id LIMIT 1), 'ITEM'),
                p_arrival_date,
                v_gross, v_comm, 0,
                v_net_payable, 'draft', 'unpaid'
            );
        END;
    END LOOP;

    -- 4. Store Advance Reference in First Lot
    IF v_first_lot_id IS NOT NULL AND p_advance > 0 THEN
        UPDATE mandi.lots SET
            advance = p_advance,
            advance_payment_mode = p_advance_payment_mode,
            advance_cheque_no = p_advance_cheque_no,
            advance_cheque_date = p_advance_cheque_date,
            advance_bank_name = p_advance_bank_name,
            advance_bank_account_id = p_advance_bank_account_id,
            advance_cheque_status = p_advance_cheque_status
        WHERE id = v_first_lot_id;
    END IF;

    -- 5. Final Step: Post Ledger Entries using unified Arrivals logic
    PERFORM mandi.post_arrival_ledger(v_arrival_id);

    RETURN jsonb_build_object(
        'success', true,
        'arrival_id', v_arrival_id,
        'bill_no', v_arrival_bill_no,
        'contact_bill_no', v_arrival_contact_bill_no
    );
END;
$function$;
