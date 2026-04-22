-- Add custom_attributes to lots and mandi_session_farmers
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;
ALTER TABLE mandi.mandi_session_farmers ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;

-- Refresh view_lot_stock to include custom_attributes
CREATE OR REPLACE VIEW mandi.view_lot_stock AS
SELECT 
    l.id,
    l.organization_id,
    l.created_at,
    l.lot_code,
    l.contact_id,
    l.item_id,
    l.arrival_type,
    l.initial_qty,
    l.current_qty,
    l.unit,
    l.status,
    l.arrival_id,
    l.unit_weight,
    l.total_weight,
    l.supplier_rate,
    l.commission_percent,
    l.farmer_charges,
    l.custom_attributes,
    COALESCE(l.shelf_life_days, i.shelf_life_days) AS shelf_life_days,
    COALESCE(l.critical_age_days, i.critical_age_days) AS critical_age_days,
    i.name AS item_name,
    c.name AS farmer_name,
    c.city AS farmer_city
FROM mandi.lots l
JOIN mandi.commodities i ON l.item_id = i.id
LEFT JOIN mandi.contacts c ON l.contact_id = c.id;
