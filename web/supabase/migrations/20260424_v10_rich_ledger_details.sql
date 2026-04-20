-- =============================================================================
-- Migration V10: Rich Ledger Descriptions & Master Data Staff Filtering
--
-- 1. Updates view_party_balances to exclude internal staff.
-- 2. Updates post_arrival_ledger to include vehicle number in invoice.
-- 3. Updates post_sale_ledger to include item and lot details safely via UPDATE.
-- 4. Retrospectively updates all current ledger descriptions logically.
-- =============================================================================

-- 1. Filter out staff from view_party_balances
CREATE OR REPLACE VIEW mandi.view_party_balances AS
WITH party_sums AS (
    SELECT 
        le.organization_id,
        le.contact_id,
        SUM(le.debit - le.credit) AS net_balance
    FROM mandi.ledger_entries le
    WHERE COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared') 
      AND le.contact_id IS NOT NULL
    GROUP BY le.organization_id, le.contact_id
)
SELECT 
    c.id AS contact_id,
    c.organization_id,
    c.name AS contact_name,
    c.type AS contact_type,
    c.city AS contact_city,
    COALESCE(ps.net_balance, 0) AS net_balance
FROM mandi.contacts c
LEFT JOIN party_sums ps ON ps.contact_id = c.id
WHERE c.type != 'staff' 
  AND c.status != 'deleted';

-- 2. Update post_arrival_ledger to include vehicle number in descriptions
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival          RECORD;
    v_lot              RECORD;
    v_purchase_vch_id  UUID;
    v_narration        TEXT;
    v_lot_details      TEXT := '';
    v_ap_acc_id        UUID;
    v_inventory_acc_id UUID;
    v_arrival_total    NUMERIC := 0;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Account lookups
    v_ap_acc_id := COALESCE(
        (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND account_sub_type = 'accounts_payable' ORDER BY created_at LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'liability' AND name ILIKE '%Payable%' LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'liability' LIMIT 1)
    );

    v_inventory_acc_id := COALESCE(
        (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND account_sub_type = 'inventory' LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'asset' AND name ILIKE '%Stock%' LIMIT 1)
    );

    IF v_ap_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN RETURN; END IF;

    -- Build Lot Details
    FOR v_lot IN
        SELECT l.*, c.name AS item_name
        FROM mandi.lots l
        JOIN mandi.commodities c ON l.item_id = c.id
        WHERE l.arrival_id = p_arrival_id
    LOOP
        v_lot_details := v_lot_details || v_lot.item_name || ' (Lot: ' || v_lot.lot_code || ', ' || v_lot.initial_qty || ' @ Rs.' || COALESCE(v_lot.supplier_rate,0) || ') ';
        v_arrival_total := v_arrival_total + COALESCE(v_lot.net_payable, 0);
    END LOOP;

    -- Build rich narration including Vehicle Number
    v_narration := 'Purchase Bill #' || COALESCE(v_arrival.bill_no::text, '-');
    IF COALESCE(v_arrival.vehicle_number, '') != '' THEN
        v_narration := v_narration || ' [Veh: ' || v_arrival.vehicle_number || ']';
    END IF;
    v_narration := v_narration || ' | ' || TRIM(v_lot_details);

    -- PART 1: PURCHASE VOUCHER
    SELECT id INTO v_purchase_vch_id
    FROM mandi.vouchers
    WHERE arrival_id = p_arrival_id AND type = 'purchase' LIMIT 1;

    IF v_purchase_vch_id IS NULL THEN
        IF v_arrival_total > 0 THEN
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, arrival_id)
            VALUES (
                v_arrival.organization_id, v_arrival.created_at, 'purchase',
                (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = v_arrival.organization_id AND type = 'purchase'),
                v_arrival_total, v_narration, p_arrival_id
            ) RETURNING id INTO v_purchase_vch_id;

            -- Dr Inventory, Cr Accounts Payable
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_arrival.organization_id, v_purchase_vch_id, v_inventory_acc_id, v_arrival_total, 0, v_arrival.created_at, v_narration, 'purchase', p_arrival_id);

            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_arrival.organization_id, v_purchase_vch_id, v_arrival.party_id, 0, v_arrival_total, v_arrival.created_at, v_narration, 'purchase', p_arrival_id);
        END IF;
    ELSE
        -- Retrospective update: if it exists, just update the narration to be rich
        UPDATE mandi.vouchers SET narration = v_narration WHERE id = v_purchase_vch_id;
        UPDATE mandi.ledger_entries SET description = v_narration WHERE voucher_id = v_purchase_vch_id AND description NOT ILIKE 'Payment%';
    END IF;

    -- PART 2: ADVANCE PAYMENT
    IF COALESCE(v_arrival.advance_amount, 0) > 0.01 AND COALESCE(v_arrival.advance_payment_mode, '') IN ('cash', 'bank', 'upi') THEN
        PERFORM mandi.post_arrival_advance_payment(
            p_arrival_id, v_arrival.organization_id, v_arrival.party_id,
            v_arrival.advance_amount, v_arrival.advance_payment_mode,
            v_arrival.bill_no, v_arrival.created_at, v_ap_acc_id
        );
    END IF;
END;
$function$;

-- 3. Update post_sale_ledger to include rich lot details using UPDATE for safety
CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mandi', 'core', 'public', 'pg_temp'
AS $function$
DECLARE
    v_sale          RECORD;
    v_item          RECORD;
    v_buyer_id      UUID;
    v_org_id        UUID;
    v_sale_date     DATE;
    v_bill_no       TEXT;
    v_sales_acc     UUID;
    v_cash_acc      UUID;
    v_bank_acc      UUID;
    v_voucher_id    UUID;
    v_voucher_no    BIGINT;
    v_total         NUMERIC;
    v_received      NUMERIC;
    v_item_details  TEXT := '';
    v_narration     TEXT;
BEGIN
    SELECT * INTO v_sale FROM mandi.sales WHERE id = p_sale_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sale not found'); END IF;

    v_org_id   := v_sale.organization_id;
    v_buyer_id := v_sale.buyer_id;
    v_sale_date:= v_sale.sale_date;
    v_bill_no  := 'BILL-' || COALESCE(v_sale.bill_no::text, '?');
    v_total    := COALESCE(v_sale.total_amount, 0);
    
    -- Build Item Details
    FOR v_item IN
        SELECT si.*, c.name AS item_name, l.lot_code
        FROM mandi.sale_items si
        JOIN mandi.lots l ON si.lot_id = l.id
        JOIN mandi.commodities c ON l.item_id = c.id
        WHERE si.sale_id = p_sale_id
    LOOP
        v_item_details := v_item_details || v_item.item_name || ' (Lot: ' || COALESCE(v_item.lot_code,'-') || ', qty: ' || COALESCE(v_item.quantity,0) || ') ';
    END LOOP;
    
    v_narration := 'Sale ' || v_bill_no || ' | ' || TRIM(v_item_details);

    -- If cheque is pending, received is effectively 0 for ledger
    IF v_sale.payment_mode = 'cheque' AND COALESCE(v_sale.cheque_status, false) = false THEN
        v_received := 0;
    ELSE
        v_received := COALESCE(v_sale.amount_received, 0);
    END IF;

    IF v_total = 0 THEN RETURN jsonb_build_object('success', true, 'skipped', 'zero value'); END IF;

    -- Check if existing voucher
    SELECT id INTO v_voucher_id FROM mandi.vouchers WHERE reference_id = p_sale_id AND type = 'sale' LIMIT 1;

    IF v_voucher_id IS NOT NULL THEN
        -- Safely update descriptions without deleting rows to avoid constraint violations
        UPDATE mandi.vouchers SET narration = v_narration WHERE id = v_voucher_id;
        UPDATE mandi.ledger_entries SET description = 'Goods Sold | ' || v_narration WHERE voucher_id = v_voucher_id AND description NOT ILIKE 'Payment%';
        UPDATE mandi.ledger_entries SET description = 'Payment Recd | ' || v_bill_no || ' (' || v_sale.payment_mode || ')' WHERE voucher_id = v_voucher_id AND description ILIKE 'Payment%';
        
        RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id, 'voucher_id', v_voucher_id, 'action', 'updated');
    END IF;

    -- Create new entries if missing
    v_sales_acc := COALESCE(
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4001' LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Sales Revenue%' LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'income' LIMIT 1)
    );

    v_cash_acc := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '1001' OR name ILIKE '%Cash%') LIMIT 1);
    v_bank_acc := COALESCE(v_sale.bank_account_id, v_cash_acc);

    SELECT COALESCE(MAX(voucher_no),0)+1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id=v_org_id AND type='sale';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, contact_id, reference_id, party_id) 
    VALUES (v_org_id, v_sale_date, 'sale', v_voucher_no, v_narration, v_total, v_buyer_id, p_sale_id, v_buyer_id) 
    RETURNING id INTO v_voucher_id;

    IF v_buyer_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_buyer_id, v_total, 0, v_sale_date, 'Goods Sold | ' || v_narration, 'sale', p_sale_id);
    END IF;

    IF v_sales_acc IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_sales_acc, 0, v_total, v_sale_date, 'Goods Sold | ' || v_narration, 'sale', p_sale_id);
    END IF;

    IF v_received > 0 THEN
        IF v_buyer_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_buyer_id, 0, v_received, v_sale_date, 'Payment Recd | ' || v_bill_no || ' ('||v_sale.payment_mode||')', 'sale', p_sale_id);
        END IF;

        DECLARE
            v_pay_acc UUID := CASE WHEN v_sale.payment_mode IN ('upi','cheque','bank') THEN v_bank_acc ELSE v_cash_acc END;
        BEGIN
            IF v_pay_acc IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_voucher_id, v_pay_acc, v_received, 0, v_sale_date, 'Payment Recd | ' || v_bill_no || ' ('||v_sale.payment_mode||')', 'sale', p_sale_id);
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id, 'voucher_id', v_voucher_id, 'action', 'inserted');
EXCEPTION WHEN OTHERS THEN 
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 4. Historically Rebuild (Update descriptions)
DO $$
DECLARE
    v_arr RECORD;
    v_sale RECORD;
BEGIN
    ALTER TABLE mandi.ledger_entries DISABLE TRIGGER ALL;

    FOR v_arr IN SELECT id FROM mandi.arrivals LOOP
        PERFORM mandi.post_arrival_ledger(v_arr.id);
    END LOOP;

    FOR v_sale IN SELECT id FROM mandi.sales LOOP
        PERFORM mandi.post_sale_ledger(v_sale.id);
    END LOOP;

    ALTER TABLE mandi.ledger_entries ENABLE TRIGGER ALL;
END;
$$;
