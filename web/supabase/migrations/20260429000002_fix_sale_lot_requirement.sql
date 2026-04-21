-- Finalized Ledger Narrations with Lot & Vehicle info
-- V2: Ensure Lot Number is ALWAYS required, while Vehicle remains conditional.
-- Migration: 20260429000002_fix_sale_lot_requirement.sql

BEGIN;

-- 1. Update post_sale_ledger
CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_sale RECORD;
    v_item_names text;
    v_lot_codes text;
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
    
    -- Gather item names correctly from commodities
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names
    FROM mandi.sale_items si
    JOIN mandi.commodities i ON si.item_id = i.id
    WHERE si.sale_id = p_sale_id;

    -- Gather lot codes if it's not a master session lot
    IF v_sale.lot_no IS NULL OR v_sale.lot_no = '' THEN
        SELECT string_agg(DISTINCT l.lot_code, ', ') INTO v_lot_codes
        FROM mandi.sale_items si
        JOIN mandi.lots l ON si.lot_id = l.id
        WHERE si.sale_id = p_sale_id;
    ELSE
        v_lot_codes := v_sale.lot_no;
    END IF;

    -- Format: Sale Invoice #BK-50 | Lot: LOT-260421 | Items: Mango | Vehicle: TN-02-5678
    v_narration := 'Sale Invoice #' || v_bill_label;
    
    -- LOT IS NOW REQUIRED FOR ALL SALES
    v_narration := v_narration || ' | Lot: ' || COALESCE(v_lot_codes, '-');

    -- VEHICLE IS ONLY FOR PURCHASE + SALE (identifiable by v_sale.lot_no being non-null)
    IF v_sale.lot_no IS NOT NULL AND v_sale.lot_no <> '' THEN
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
