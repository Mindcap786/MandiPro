-- Finalized Ledger Narrations with Lot & Vehicle info
-- Navigation: mandi.post_arrival_ledger and mandi.post_sale_ledger
-- Migration: 20260429000001_finalized_ledger_narrations.sql

BEGIN;

-- 1. Update post_arrival_ledger
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_lot_summary text;
    v_item_names text;
    v_narration text;
    v_bill_label text;
    v_org_id uuid;
    v_party_id uuid;
    v_total_payable numeric := 0;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;

    -- Calculate total
    SELECT SUM(COALESCE(net_payable, 0)) INTO v_total_payable FROM mandi.lots WHERE arrival_id = p_arrival_id;

    -- Build simplified narration
    v_bill_label := COALESCE(v_arrival.reference_no, v_arrival.contact_bill_no::text, v_arrival.bill_no::text, 'NEW');
    
    -- Item names join
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names
    FROM mandi.lots l
    JOIN mandi.commodities i ON l.item_id = i.id
    WHERE l.arrival_id = p_arrival_id;

    -- Format: Arrival Bill #300 | Lot: LOT-260421 | Items: Mango, Apple | Vehicle: KA-01-1234
    v_narration := 'Arrival Bill #' || v_bill_label;
    v_narration := v_narration || ' | Lot: ' || COALESCE(v_arrival.lot_prefix, '-');
    v_narration := v_narration || ' | Items: ' || COALESCE(v_item_names, 'Products');
    
    IF v_arrival.vehicle_number IS NOT NULL AND v_arrival.vehicle_number <> '' THEN
        v_narration := v_narration || ' | Vehicle: ' || v_arrival.vehicle_number;
    END IF;

    IF v_total_payable <= 0 THEN RETURN; END IF;

    -- Upsert logic (Legacy support or Core system)
    -- We'll use the core.upsert_ledger_entry if available, else insert into mandi.ledger_entries
    IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'core' AND routine_name = 'upsert_ledger_entry') THEN
        PERFORM core.upsert_ledger_entry(
            v_org_id, v_party_id, v_arrival.arrival_date, v_total_payable,
            0, v_total_payable, v_narration, 'purchase', p_arrival_id
        );
    ELSE
        -- Fallback to direct insertion if core engine is not mapped
        DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type = 'purchase';
        INSERT INTO mandi.ledger_entries (organization_id, contact_id, entry_date, credit, description, transaction_type, reference_id)
        VALUES (v_org_id, v_party_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id);
    END IF;
END;
$function$;

-- 2. Update post_sale_ledger
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
BEGIN
    SELECT * INTO v_sale FROM mandi.sales WHERE id = p_sale_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_sale.organization_id;
    v_buyer_id := v_sale.buyer_id;

    v_bill_label := COALESCE(v_sale.book_no, v_sale.contact_bill_no::text, v_sale.bill_no::text, 'INV');
    
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names
    FROM mandi.sale_items si
    JOIN mandi.commodities i ON si.item_id = i.id
    WHERE si.sale_id = p_sale_id;

    -- Format: Sale Invoice #BK-50 | Lot: LOT-260421 | Items: Mango | Vehicle: TN-02-5678
    v_narration := 'Sale Invoice #' || v_bill_label;
    
    IF v_sale.lot_no IS NOT NULL AND v_sale.lot_no <> '' THEN
        v_narration := v_narration || ' | Lot: ' || v_sale.lot_no;
        -- AS PER USER REQUEST: ONLY SHOW VEHICLE FOR PURCHASE + SALE (identifiable by lot_no)
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
        DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id AND transaction_type = 'sale';
        INSERT INTO mandi.ledger_entries (organization_id, contact_id, entry_date, debit, description, transaction_type, reference_id)
        VALUES (v_org_id, v_buyer_id, v_sale.sale_date, v_sale.total_amount, v_narration, 'sale', p_sale_id);
    END IF;
END;
$function$;

COMMIT;
