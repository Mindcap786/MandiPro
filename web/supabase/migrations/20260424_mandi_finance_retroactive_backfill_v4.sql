-- Migration: Retroactive Ledger Enrichment
-- Target: mandi.ledger_entries
-- Logic: Update 'Transaction' or NULL narrations with live data from Sales/Arrivals.

BEGIN;

-- 1. Enrich SALE entries
WITH sale_details AS (
    SELECT 
        s.id as sale_id,
        s.bill_no,
        string_agg(DISTINCT c.name || ' (' || si.qty || ' ' || c.default_unit || ')', ', ') as items_summary
    FROM mandi.sales s
    JOIN mandi.sale_items si ON s.id = si.sale_id
    JOIN mandi.lots l ON si.lot_id = l.id
    JOIN mandi.commodities c ON l.commodity_id = c.id
    GROUP BY s.id, s.bill_no
)
UPDATE mandi.ledger_entries le
SET narration = 'Sale #' || sd.bill_no || ' | ' || sd.items_summary
FROM sale_details sd
WHERE le.reference_id = sd.sale_id
AND (le.narration IS NULL OR le.narration = 'Transaction' OR le.narration = '' OR le.narration ~ '^[0-9a-fA-F-]{36}$');

-- 2. Enrich ARRIVAL (Purchase) entries
WITH arrival_details AS (
    SELECT 
        a.id as arrival_id,
        COALESCE(a.contact_bill_no, a.bill_no, '---') as bill_no,
        string_agg(DISTINCT c.name || ' (' || l.gross_qty || ' ' || c.default_unit || ')', ', ') as items_summary
    FROM mandi.arrivals a
    JOIN mandi.lots l ON a.id = l.arrival_id
    JOIN mandi.commodities c ON l.commodity_id = c.id
    GROUP BY a.id, a.bill_no, a.contact_bill_no
)
UPDATE mandi.ledger_entries le
SET narration = 'Arrival #' || ad.bill_no || ' | ' || ad.items_summary
FROM arrival_details ad
WHERE le.reference_id = ad.arrival_id
AND (le.narration IS NULL OR le.narration = 'Transaction' OR le.narration = '' OR le.narration ~ '^[0-9a-fA-F-]{36}$');

-- 3. Safety: Grant permissions if missing
GRANT EXECUTE ON FUNCTION mandi.post_arrival_ledger(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.confirm_sale_transaction(uuid) TO authenticated, service_role;

COMMIT;
