-- ============================================================================
-- MIGRATION: 20260418_fix_view_location_stock_status.sql
-- PURPOSE: Update the dashboard view to include the newly standardized statuses.
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS mandi.view_location_stock CASCADE;

CREATE VIEW mandi.view_location_stock AS
SELECT 
    l.organization_id,
    l.item_id,
    i.name AS item_name,
    l.arrival_type,
    l.storage_location,
    l.unit,
    sum(l.current_qty) AS current_stock,
    sum(l.initial_qty) AS total_inward,
    count(l.id) AS active_lots_count,
    i.image_url,
    sum(
        CASE
            WHEN ((now() - l.created_at) <= ((COALESCE(l.shelf_life_days, i.shelf_life_days, 3) || ' days'::text))::interval) THEN l.current_qty
            ELSE (0)::numeric
        END) AS fresh_stock,
    sum(
        CASE
            WHEN (((now() - l.created_at) > ((COALESCE(l.shelf_life_days, i.shelf_life_days, 3) || ' days'::text))::interval) AND ((now() - l.created_at) <= ((COALESCE(l.critical_age_days, i.critical_age_days, 7) || ' days'::text))::interval)) THEN l.current_qty
            ELSE (0)::numeric
        END) AS aging_stock,
    sum(
        CASE
            WHEN ((now() - l.created_at) > ((COALESCE(l.critical_age_days, i.critical_age_days, 7) || ' days'::text))::interval) THEN l.current_qty
            ELSE (0)::numeric
        END) AS critical_stock
FROM mandi.lots l
JOIN mandi.commodities i ON l.item_id = i.id
WHERE l.status IN ('available', 'partial', 'active', 'Available') AND l.current_qty > 0
GROUP BY 
    l.organization_id, 
    l.item_id, 
    i.name, 
    l.arrival_type, 
    l.storage_location, 
    l.unit, 
    i.image_url, 
    l.shelf_life_days, 
    i.shelf_life_days, 
    l.critical_age_days, 
    i.critical_age_days;

GRANT SELECT ON mandi.view_location_stock TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
