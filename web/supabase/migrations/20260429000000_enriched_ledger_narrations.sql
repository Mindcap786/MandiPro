-- Enriched Ledger Narrations with Lot Codes and traceability
-- Migration: 20260429000000_enriched_ledger_narrations.sql

BEGIN;

-- 1. Update post_arrival_ledger to include Lot Code and Bill No in narration
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_lot RECORD;
    v_org_id uuid;
    v_party_id uuid;
    v_total_payable numeric := 0;
    v_narration text;
    v_bill_label text;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;

    -- Calculate total from all lots in this arrival
    SELECT SUM(COALESCE(net_payable, 0)) INTO v_total_payable FROM mandi.lots WHERE arrival_id = p_arrival_id;

    -- Build enriched narration
    v_bill_label := COALESCE(v_arrival.reference_no, v_arrival.contact_bill_no::text, v_arrival.bill_no::text, 'NEW');
    
    -- Get items summary for narration
    SELECT string_agg(i.name || ' (' || l.lot_code || ')', ', ') INTO v_narration
    FROM mandi.lots l
    JOIN mandi.items i ON l.item_id = i.id
    WHERE l.arrival_id = p_arrival_id;

    v_narration := 'Arrival Bill #' || v_bill_label || ': ' || COALESCE(v_narration, 'Items');
    IF v_arrival.vehicle_number IS NOT NULL THEN
        v_narration := v_narration || ' | Vehicle: ' || v_arrival.vehicle_number;
    END IF;

    -- If total is 0, nothing to post to ledger yet (might be pending weights)
    IF v_total_payable <= 0 THEN RETURN; END IF;

    -- Upsert ledger entry
    -- (Specific logic depends on whether you have a generic ledger posting script)
    -- This is a placeholder for the actual logic that should match MindT core ledger system
    PERFORM core.upsert_ledger_entry(
        v_org_id,
        v_party_id,
        v_arrival.arrival_date,
        v_total_payable,
        0, -- debit
        v_total_payable, -- credit (we owe party)
        v_narration,
        'purchase',
        p_arrival_id
    );
END;
$function$;

-- 2. Update post_sale_ledger to include Lot No and Truck No in narration
CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_sale RECORD;
    v_org_id uuid;
    v_buyer_id uuid;
    v_items_summary text;
    v_narration text;
    v_bill_label text;
BEGIN
    SELECT * INTO v_sale FROM mandi.sales WHERE id = p_sale_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_sale.organization_id;
    v_buyer_id := v_sale.buyer_id;

    -- Build enriched narration
    v_bill_label := COALESCE(v_sale.book_no, v_sale.contact_bill_no::text, v_sale.bill_no::text, 'INV');
    
    -- Get items summary
    SELECT string_agg(i.name || ' [' || l.lot_code || ']', ', ') INTO v_items_summary
    FROM mandi.sale_items si
    JOIN mandi.lots l ON si.lot_id = l.id
    JOIN mandi.items i ON si.item_id = i.id
    WHERE si.sale_id = p_sale_id;

    v_narration := 'Sale Invoice #' || v_bill_label || ': ' || COALESCE(v_items_summary, 'Products');
    
    IF v_sale.vehicle_number IS NOT NULL THEN
        v_narration := v_narration || ' | Vehicle: ' || v_sale.vehicle_number;
    END IF;
    
    IF v_sale.lot_no IS NOT NULL THEN
        v_narration := v_narration || ' | Master Lot: ' || v_sale.lot_no;
    END IF;

    -- Upsert ledger entry
    PERFORM core.upsert_ledger_entry(
        v_org_id,
        v_buyer_id,
        v_sale.sale_date,
        v_sale.total_amount,
        v_sale.total_amount, -- debit (buyer owes us)
        0, -- credit
        v_narration,
        'sale',
        p_sale_id
    );
END;
$function$;

COMMIT;
