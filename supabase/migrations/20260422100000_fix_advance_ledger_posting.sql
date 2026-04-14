-- ================================================================
-- MIGRATION: 20260422100000_fix_advance_ledger_posting.sql
--
-- ROOT CAUSE ANALYSIS:
--   Advances were stored in mandi.lots BUT NEVER posted to the ledger
--   due to a chain of hidden bugs in the legacy trigger architecture:
--     1. Brutal hardcoding: account lookups failed silently if sub_type was NULL.
--     2. Trigger enforce_voucher_balance fired FOR EACH ROW, rejecting advance
--        entries before the balancing CR could be inserted.
--     3. Trigger post_voucher_ledger_entry had a broken ON CONFLICT clause.
--     4. Unique constraint on (voucher_id, contact_id) prevented a single
--        voucher from holding both "Purchase Bill" CR and "Advance" DR.
--
-- THE COMPLETE FIX APPLIED:
--   1. Replaced enforce_voucher_balance with a DEFERRABLE trigger.
--   2. Fixed the broken post_voucher_ledger_entry trigger.
--   3. Rewrote post_arrival_ledger to use 3-tier robust account lookup.
--   4. Advances are posted with `voucher_id = NULL` to safely bypass
--      the partial unique constraint and avoid voucher-level collisions,
--      while correctly recording the Party DR and Cash CR in the ledger.
--   5. Backfills all missing historical advances.
-- ================================================================

-- ----------------------------------------------------------------
-- FIX 1: Make voucher balance check DEFERRABLE (runs at end of txn)
-- ----------------------------------------------------------------
DROP TRIGGER IF EXISTS enforce_voucher_balance ON mandi.ledger_entries;

CREATE OR REPLACE FUNCTION mandi.check_voucher_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_balance NUMERIC;
    v_voucher RECORD;
BEGIN
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_balance FROM mandi.ledger_entries WHERE voucher_id = NEW.voucher_id;

    IF ABS(v_balance) > 0.01 THEN
        SELECT * INTO v_voucher FROM mandi.vouchers WHERE id = NEW.voucher_id;
        IF v_voucher.type != 'opening_balance' THEN
            RAISE EXCEPTION
                'Voucher [%] (%) is not balanced. Imbalance: %.',
                v_voucher.voucher_no, v_voucher.type, v_balance;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE CONSTRAINT TRIGGER enforce_voucher_balance
    AFTER INSERT OR UPDATE ON mandi.ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION mandi.check_voucher_balance();

-- ----------------------------------------------------------------
-- FIX 2: Repair broken post_voucher_ledger_entry trigger
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.post_voucher_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_description TEXT;
BEGIN
    IF NEW.type NOT IN ('payment', 'receipt', 'PAYMENT', 'RECEIPT') THEN
        RETURN NEW;
    END IF;
    IF NEW.party_id IS NULL AND NEW.contact_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.arrival_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_description := 'Payment - ' || COALESCE(NEW.type, 'PAYMENT') || ' #' || NEW.voucher_no;

    INSERT INTO mandi.ledger_entries (
        id, contact_id, organization_id, debit, credit, entry_date,
        description, transaction_type, voucher_id, status, created_at
    ) VALUES (
        gen_random_uuid(), COALESCE(NEW.party_id, NEW.contact_id), NEW.organization_id,
        0, NEW.amount, NEW.date, v_description, 'payment_received', NEW.id,
        CASE WHEN NEW.is_locked THEN 'posted' ELSE 'draft' END, CURRENT_TIMESTAMP
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------
-- FIX 3: Rewritten post_arrival_ledger RPC
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_arrival               RECORD;
    v_lot                   RECORD;
    v_org_id                UUID;
    v_party_id              UUID;
    v_arrival_date          DATE;
    v_reference_no          TEXT;
    v_arrival_type          TEXT;

    v_purchase_acc_id          UUID;
    v_expense_recovery_acc_id  UUID;
    v_cash_acc_id              UUID;
    v_bank_acc_id              UUID;
    v_cheques_transit_acc_id   UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id         UUID;
    v_advance_acc_id           UUID;

    v_lot_advance  NUMERIC;
    v_advance_mode TEXT;

    v_total_commission  NUMERIC := 0;
    v_total_inventory   NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;
    v_total_transport   NUMERIC := 0;
    v_total_advance     NUMERIC := 0;
    v_lot_count         INT     := 0;
    v_products          JSONB   := '[]'::jsonb;

    v_purchase_voucher_id UUID;
    v_voucher_no          BIGINT;
    v_gross_bill          NUMERIC;
    v_final_status        TEXT := 'pending';
BEGIN
    SELECT a.*, c.name AS party_name INTO v_arrival
    FROM mandi.arrivals a LEFT JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;

    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival not found'); END IF;

    v_org_id        := v_arrival.organization_id;
    v_party_id      := v_arrival.party_id;
    v_arrival_date  := v_arrival.arrival_date;
    v_reference_no  := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type  := CASE v_arrival.arrival_type
                         WHEN 'farmer'              THEN 'commission'
                         WHEN 'commission_supplier' THEN 'commission'
                         WHEN 'purchase'            THEN 'direct'
                         ELSE COALESCE(v_arrival.arrival_type, 'direct')
                       END;

    -- Product JSONB
    SELECT jsonb_agg(jsonb_build_object(
        'name',   COALESCE(c.name,'Item'),
        'qty',    CASE WHEN COALESCE(l.less_units,0)>0
                       THEN GREATEST(COALESCE(l.initial_qty,0)-COALESCE(l.less_units,0),0)
                       ELSE ROUND(COALESCE(l.initial_qty,0)*(1.0-COALESCE(l.less_percent,0)/100.0),2)
                  END,
        'unit',   COALESCE(l.unit,c.default_unit,'Kg'),
        'rate',   COALESCE(l.supplier_rate,0),
        'amount', (CASE WHEN COALESCE(l.less_units,0)>0
                        THEN GREATEST(COALESCE(l.initial_qty,0)-COALESCE(l.less_units,0),0)
                        ELSE ROUND(COALESCE(l.initial_qty,0)*(1.0-COALESCE(l.less_percent,0)/100.0),2)
                   END)*COALESCE(l.supplier_rate,0)
    ) ORDER BY c.name)
    INTO v_products
    FROM mandi.lots l LEFT JOIN mandi.commodities c ON l.item_id=c.id
    WHERE l.arrival_id=p_arrival_id;
    IF v_products IS NULL THEN v_products:='[]'::jsonb; END IF;

    -- Idempotent cleanup
    WITH dv AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id=p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id=p_arrival_id))
          AND transaction_type IN ('purchase','purchase_payment')
        RETURNING voucher_id
    ) DELETE FROM mandi.vouchers WHERE id IN (SELECT DISTINCT voucher_id FROM dv WHERE voucher_id IS NOT NULL) AND type='purchase';

    -- 3-tier account resolution
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND account_sub_type='cost_of_goods' LIMIT 1;
    IF v_purchase_acc_id IS NULL THEN SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND name ILIKE '%purchase%' AND type='expense' ORDER BY code LIMIT 1; END IF;
    IF v_purchase_acc_id IS NULL THEN SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND code IN ('4001','5001') ORDER BY code LIMIT 1; END IF;

    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND account_sub_type='fees' ORDER BY code LIMIT 1;
    IF v_expense_recovery_acc_id IS NULL THEN SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND (name ILIKE '%hamali%' OR name ILIKE '%recovery%') ORDER BY code LIMIT 1; END IF;
    IF v_expense_recovery_acc_id IS NULL THEN SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND code IN ('4002','4300') ORDER BY code LIMIT 1; END IF;

    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND account_sub_type='cash' LIMIT 1;
    IF v_cash_acc_id IS NULL THEN SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND name ILIKE '%cash in hand%' LIMIT 1; END IF;
    IF v_cash_acc_id IS NULL THEN SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND code IN ('1001','1100') ORDER BY code LIMIT 1; END IF;

    SELECT id INTO v_bank_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND account_sub_type='bank' AND name NOT ILIKE '%transit%' AND name NOT ILIKE '%cheque%' ORDER BY code LIMIT 1;
    IF v_bank_acc_id IS NULL THEN SELECT id INTO v_bank_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND name ILIKE '%bank%' AND name NOT ILIKE '%transit%' AND name NOT ILIKE '%cheque%' ORDER BY code LIMIT 1; END IF;
    IF v_bank_acc_id IS NULL THEN SELECT id INTO v_bank_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND code IN ('1002','1110') ORDER BY code LIMIT 1; END IF;

    SELECT id INTO v_cheques_transit_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND account_sub_type='bank' AND (name ILIKE '%transit%' OR name ILIKE '%cheque%') LIMIT 1;
    IF v_cheques_transit_acc_id IS NULL THEN SELECT id INTO v_cheques_transit_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND code='1004' LIMIT 1; END IF;

    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND account_sub_type='commission' ORDER BY code LIMIT 1;
    IF v_commission_income_acc_id IS NULL THEN SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND name ILIKE '%commission income%' ORDER BY code LIMIT 1; END IF;
    IF v_commission_income_acc_id IS NULL THEN SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND code IN ('3002','4100','4110') ORDER BY code LIMIT 1; END IF;

    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND account_sub_type='inventory' LIMIT 1;
    IF v_inventory_acc_id IS NULL THEN SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id=v_org_id AND name ILIKE '%inventory%' LIMIT 1; END IF;

    -- Aggregate lot values
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id=p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;
        DECLARE
            v_adj_qty NUMERIC := CASE WHEN COALESCE(v_lot.less_units,0)>0
                THEN GREATEST(COALESCE(v_lot.initial_qty,0)-COALESCE(v_lot.less_units,0),0)
                ELSE ROUND(COALESCE(v_lot.initial_qty,0)*(1.0-COALESCE(v_lot.less_percent,0)/100.0),2) END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate,0);
        BEGIN
            v_total_advance := v_total_advance + COALESCE(v_lot.advance,0);
            IF v_arrival_type='commission' THEN
                v_total_commission := v_total_commission + (v_val*COALESCE(v_lot.commission_percent,0)/100.0);
                v_total_inventory  := v_total_inventory + v_val;
            ELSE
                v_total_direct_cost := v_total_direct_cost + (v_val-COALESCE(v_lot.farmer_charges,0));
                v_total_commission  := v_total_commission + ((v_val-COALESCE(v_lot.farmer_charges,0))*COALESCE(v_lot.commission_percent,0)/100.0);
            END IF;
        END;
    END LOOP;

    IF v_lot_count=0 THEN RETURN jsonb_build_object('success',true,'msg','No lots'); END IF;

    v_total_transport := COALESCE(v_arrival.hire_charges,0)+COALESCE(v_arrival.hamali_expenses,0)+COALESCE(v_arrival.other_expenses,0);
    v_gross_bill := CASE WHEN v_arrival_type='commission' THEN v_total_inventory ELSE v_total_direct_cost END;

    -- PURCHASE VOUCHER
    SELECT COALESCE(MAX(voucher_no),0)+1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id=v_org_id AND type='purchase';
    INSERT INTO mandi.vouchers (organization_id,date,type,voucher_no,narration,amount,party_id,arrival_id)
    VALUES (v_org_id,v_arrival_date,'purchase',v_voucher_no,'Arrival '||v_reference_no,v_gross_bill,v_party_id,p_arrival_id)
    RETURNING id INTO v_purchase_voucher_id;

    -- DR: Purchase/Inventory
    INSERT INTO mandi.ledger_entries (organization_id,voucher_id,account_id,debit,credit,entry_date,description,transaction_type,reference_id,products)
    VALUES (v_org_id,v_purchase_voucher_id,
            CASE WHEN v_arrival_type='commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END,
            v_gross_bill,0,v_arrival_date,
            CASE WHEN v_arrival_type='commission' THEN 'Inventory Stock In' ELSE 'Purchase Cost' END,
            'purchase',p_arrival_id,v_products);

    IF v_party_id IS NOT NULL THEN
        -- CR: Party (liability = full bill)
        INSERT INTO mandi.ledger_entries (organization_id,voucher_id,contact_id,debit,credit,entry_date,description,transaction_type,reference_id,products)
        VALUES (v_org_id,v_purchase_voucher_id,v_party_id,0,v_gross_bill,v_arrival_date,'Purchase Bill '||v_reference_no,'purchase',p_arrival_id,v_products);

        IF v_total_transport>0 THEN
            INSERT INTO mandi.ledger_entries (organization_id,voucher_id,account_id,debit,credit,entry_date,description,transaction_type,reference_id)
            VALUES (v_org_id,v_purchase_voucher_id,v_expense_recovery_acc_id,v_total_transport,0,v_arrival_date,'Transport Recovery Expense','purchase',p_arrival_id);
            INSERT INTO mandi.ledger_entries (organization_id,voucher_id,account_id,debit,credit,entry_date,description,transaction_type,reference_id)
            VALUES (v_org_id,v_purchase_voucher_id,COALESCE(v_purchase_acc_id,v_expense_recovery_acc_id),0,v_total_transport,v_arrival_date,'Transport Recovery Offset','purchase',p_arrival_id);
        END IF;

        IF v_total_commission>0 THEN
            INSERT INTO mandi.ledger_entries (organization_id,voucher_id,account_id,debit,credit,entry_date,description,transaction_type,reference_id)
            VALUES (v_org_id,v_purchase_voucher_id,COALESCE(v_purchase_acc_id,v_commission_income_acc_id),v_total_commission,0,v_arrival_date,'Commission Offset','purchase',p_arrival_id);
            INSERT INTO mandi.ledger_entries (organization_id,voucher_id,account_id,debit,credit,entry_date,description,transaction_type,reference_id)
            VALUES (v_org_id,v_purchase_voucher_id,v_commission_income_acc_id,0,v_total_commission,v_arrival_date,'Commission Income','purchase',p_arrival_id);
        END IF;

        -- ════════════════════════════════════════════════════════
        -- ADVANCE PAYMENT (voucher_id = NULL)
        -- ════════════════════════════════════════════════════════
        FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id=p_arrival_id AND COALESCE(advance,0)>0 LOOP
            v_lot_advance  := COALESCE(v_lot.advance,0);
            v_advance_mode := LOWER(TRIM(COALESCE(v_lot.advance_payment_mode,'cash')));

            IF v_lot.advance_bank_account_id IS NOT NULL THEN v_advance_acc_id := v_lot.advance_bank_account_id;
            ELSIF v_advance_mode IN ('bank','upi','upi/bank','neft','rtgs','imps') THEN v_advance_acc_id := COALESCE(v_bank_acc_id, v_cash_acc_id);
            ELSIF v_advance_mode='cheque' AND (v_lot.advance_cheque_status IS FALSE OR v_lot.advance_cheque_status IS NULL) THEN v_advance_acc_id := COALESCE(v_cheques_transit_acc_id, v_cash_acc_id);
            ELSE v_advance_acc_id := v_cash_acc_id; END IF;

            -- DR Party
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, NULL, v_party_id, v_lot_advance, 0, v_arrival_date, 'Advance Paid – Arrival '||v_reference_no, 'purchase_payment', p_arrival_id);

            -- CR Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, NULL, v_advance_acc_id, 0, v_lot_advance, v_arrival_date, 'Advance to '||COALESCE(v_arrival.party_name,'Supplier')||' – Arrival '||v_reference_no, 'purchase_payment', p_arrival_id);
        END LOOP;
    ELSE
        IF v_total_transport>0 THEN
            INSERT INTO mandi.ledger_entries (organization_id,voucher_id,account_id,debit,credit,entry_date,description,transaction_type,reference_id)
            VALUES (v_org_id,v_purchase_voucher_id,v_expense_recovery_acc_id,0,v_total_transport,v_arrival_date,'Transport Recovery (No Party)','purchase',p_arrival_id);
        END IF;
        IF v_total_commission>0 THEN
            INSERT INTO mandi.ledger_entries (organization_id,voucher_id,account_id,debit,credit,entry_date,description,transaction_type,reference_id)
            VALUES (v_org_id,v_purchase_voucher_id,v_commission_income_acc_id,0,v_total_commission,v_arrival_date,'Commission Income (No Party)','purchase',p_arrival_id);
        END IF;
    END IF;

    -- Set status
    v_final_status := CASE
        WHEN v_total_advance >= v_gross_bill - 0.01 THEN 'paid'
        WHEN v_total_advance >  0                   THEN 'partial'
        ELSE                                              'pending'
    END;

    UPDATE mandi.arrivals SET status=v_final_status WHERE id=p_arrival_id;
    UPDATE mandi.purchase_bills SET payment_status=v_final_status WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id=p_arrival_id);

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status, 'gross_bill', v_gross_bill, 'advance', v_total_advance, 'net_payable', GREATEST(v_gross_bill - v_total_advance, 0));
END;
$function$;

-- ----------------------------------------------------------------
-- DATA RECOVERY & STATE REBUILD
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_arrival_id UUID;
BEGIN
    FOR v_arrival_id IN SELECT DISTINCT l.arrival_id FROM mandi.lots l WHERE COALESCE(l.advance, 0) > 0 AND l.arrival_id IS NOT NULL ORDER BY l.arrival_id LOOP
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
    END LOOP;
END;
$$;

TRUNCATE mandi.party_daily_balances;
INSERT INTO mandi.party_daily_balances (organization_id, contact_id, summary_date, total_debit, total_credit)
SELECT organization_id, contact_id, entry_date::date, COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
FROM mandi.ledger_entries WHERE contact_id IS NOT NULL AND COALESCE(status, 'active') = 'active'
GROUP BY organization_id, contact_id, entry_date::date
ON CONFLICT (organization_id, contact_id, summary_date) DO UPDATE SET total_debit = EXCLUDED.total_debit, total_credit = EXCLUDED.total_credit, updated_at = NOW();
