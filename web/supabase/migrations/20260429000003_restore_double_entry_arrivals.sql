-- Restoration of Double-Entry Financial Logic
-- Ensures stable Day Book reporting and accurate Account Balances
-- Migration: 20260429000003_restore_double_entry_arrivals.sql

BEGIN;

-- 1. Restore post_arrival_ledger with proper Double Entry
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_item_names text;
    v_narration text;
    v_bill_label text;
    v_org_id uuid;
    v_party_id uuid;
    v_total_payable numeric := 0;
    v_inventory_acc_id uuid;
    v_ap_acc_id uuid;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;

    -- Calculate total from lots
    SELECT SUM(COALESCE(net_payable, 0)) INTO v_total_payable FROM mandi.lots WHERE arrival_id = p_arrival_id;

    -- 1. Account lookups for the fallback path
    v_inventory_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND account_sub_type = 'inventory' LIMIT 1);
    IF v_inventory_acc_id IS NULL THEN
        v_inventory_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'asset' AND name ILIKE '%Stock%' LIMIT 1);
    END IF;

    v_ap_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND account_sub_type = 'accounts_payable' LIMIT 1);
    IF v_ap_acc_id IS NULL THEN
        v_ap_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'liability' AND name ILIKE '%Payable%' LIMIT 1);
    END IF;

    -- 2. Build narration
    v_bill_label := COALESCE(v_arrival.reference_no, v_arrival.contact_bill_no::text, v_arrival.bill_no::text, 'NEW');
    
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names
    FROM mandi.lots l
    JOIN mandi.commodities i ON l.item_id = i.id
    WHERE l.arrival_id = p_arrival_id;

    v_narration := 'Arrival Bill #' || v_bill_label;
    v_narration := v_narration || ' | Lot: ' || COALESCE(v_arrival.lot_prefix, '-');
    v_narration := v_narration || ' | Items: ' || COALESCE(v_item_names, 'Products');
    
    IF v_arrival.vehicle_number IS NOT NULL AND v_arrival.vehicle_number <> '' THEN
        v_narration := v_narration || ' | Vehicle: ' || v_arrival.vehicle_number;
    END IF;

    -- 3. Execution (Double Entry)
    IF v_total_payable <= 0 THEN RETURN; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'core' AND routine_name = 'upsert_ledger_entry') THEN
        -- We still call core engine for the primary entry, but we ensure fallback is robust
        PERFORM core.upsert_ledger_entry(
            v_org_id, v_party_id, v_arrival.arrival_date, v_total_payable,
            0, v_total_payable, v_narration, 'purchase', p_arrival_id
        );
    ELSE
        -- FALLBACK: MUST BE DOUBLE ENTRY
        DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type = 'purchase';
        
        -- Row 1: Stock (Debit)
        INSERT INTO mandi.ledger_entries (organization_id, account_id, entry_date, debit, description, transaction_type, reference_id)
        VALUES (v_org_id, v_inventory_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id);
        
        -- Row 2: Party (Credit)
        INSERT INTO mandi.ledger_entries (organization_id, contact_id, account_id, entry_date, credit, description, transaction_type, reference_id)
        VALUES (v_org_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id);
    END IF;
END;
$function$;

-- 2. Restore post_sale_ledger with proper Double Entry lookups
CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_sale RECORD;
    v_item_names text;
    v_narration text;
    v_bill_label text;
    v_org_id uuid;
    v_buyer_id uuid;
    v_sales_acc_id uuid;
    v_ar_acc_id uuid;
BEGIN
    SELECT * INTO v_sale FROM mandi.sales WHERE id = p_sale_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_sale.organization_id;
    v_buyer_id := v_sale.buyer_id;

    -- Account lookups
    v_sales_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND account_sub_type = 'operating_revenue' LIMIT 1);
    IF v_sales_acc_id IS NULL THEN
        v_sales_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'income' AND name ILIKE '%Sales%' LIMIT 1);
    END IF;

    v_ar_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND account_sub_type = 'accounts_receivable' LIMIT 1);
    IF v_ar_acc_id IS NULL THEN
        v_ar_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'asset' AND name ILIKE '%Receivable%' LIMIT 1);
    END IF;

    v_bill_label := COALESCE(v_sale.book_no, v_sale.contact_bill_no::text, v_sale.bill_no::text, 'INV');
    
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names
    FROM mandi.sale_items si
    JOIN mandi.commodities i ON si.item_id = i.id
    WHERE si.sale_id = p_sale_id;

    v_narration := 'Sale Invoice #' || v_bill_label;
    
    IF v_sale.lot_no IS NOT NULL AND v_sale.lot_no <> '' THEN
        v_narration := v_narration || ' | Lot: ' || v_sale.lot_no;
        IF v_sale.vehicle_number IS NOT NULL AND v_sale.vehicle_number <> '' THEN
            v_narration := v_narration || ' | Vehicle: ' || v_sale.vehicle_number;
        END IF;
    END IF;

    v_narration := v_narration || ' | Items: ' || COALESCE(v_item_names, 'Products');

    IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'core' AND routine_name = 'upsert_ledger_entry') THEN
        PERFORM core.upsert_ledger_entry(
            v_org_id, v_buyer_id, v_sale.sale_date, v_sale.total_amount,
            v_sale.total_amount, 0, v_narration, 'sale', p_sale_id
        );
    ELSE
        -- FALLBACK: Double Entry
        DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id AND transaction_type = 'sale';
        
        -- Row 1: Party (Debit)
        INSERT INTO mandi.ledger_entries (organization_id, contact_id, account_id, entry_date, debit, description, transaction_type, reference_id)
        VALUES (v_org_id, v_buyer_id, v_ar_acc_id, v_sale.sale_date, v_sale.total_amount, v_narration, 'sale', p_sale_id);
        
        -- Row 2: Sales (Credit)
        INSERT INTO mandi.ledger_entries (organization_id, account_id, entry_date, credit, description, transaction_type, reference_id)
        VALUES (v_org_id, v_sales_acc_id, v_sale.sale_date, v_sale.total_amount, v_narration, 'sale', p_sale_id);
    END IF;
END;
$function$;

COMMIT;
