-- Migration: Stock Engine Upgrade (Wastage & Aging)
-- Date: 2026-02-04
-- Author: Antigravity

-- 1. Create Wastage Table
CREATE TABLE IF NOT EXISTS inventory_wastage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    item_id UUID NOT NULL REFERENCES items(id),
    lot_id UUID REFERENCES lots(id),
    quantity_kg NUMERIC DEFAULT 0,
    quantity_crates NUMERIC DEFAULT 0,
    reason TEXT,
    image_url TEXT,
    recorded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE inventory_wastage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read/write for organization members" ON inventory_wastage
    FOR ALL
    USING (organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
    ));

-- 2. Create Stock Aging View
-- Calculates age of stock based on arrival date of the Lot
-- REFACTORED: Use 'lots.current_qty' as source of truth (like view_lot_stock)
CREATE OR REPLACE VIEW view_stock_aging AS
SELECT 
    l.organization_id,
    l.item_id, 
    i.name as item_name,
    i.image_url,
    l.id as lot_id,
    l.lot_code as lot_number,
    l.created_at as arrival_date,
    EXTRACT(DAY FROM (NOW() - l.created_at))::INT as age_days,
    l.current_qty as current_stock_qty,
    l.unit,
    CASE 
        WHEN EXTRACT(DAY FROM (NOW() - l.created_at)) <= 3 THEN 'fresh'
        WHEN EXTRACT(DAY FROM (NOW() - l.created_at)) <= 7 THEN 'aging'
        ELSE 'critical'
    END as status
FROM lots l
JOIN items i ON l.item_id = i.id
WHERE l.current_qty > 0;

-- 3. wastage RPC
CREATE OR REPLACE FUNCTION record_inventory_wastage(
    p_organization_id UUID,
    p_item_id UUID,
    p_lot_id UUID,
    p_quantity_kg NUMERIC,
    p_quantity_crates NUMERIC,
    p_reason TEXT,
    p_image_url TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_wastage_id UUID;
    v_current_qty NUMERIC;
BEGIN
    -- 1. Insert into Wastage Table
    INSERT INTO inventory_wastage (
        organization_id, item_id, lot_id, quantity_kg, quantity_crates, reason, image_url, recorded_by
    ) VALUES (
        p_organization_id, p_item_id, p_lot_id, p_quantity_kg, p_quantity_crates, p_reason, p_image_url, auth.uid()
    ) RETURNING id INTO v_wastage_id;

    -- 2. Deduct from Stock Ledger (Transaction Type: WASTAGE)
    -- Using qty_change column
    INSERT INTO stock_ledger (
        organization_id, lot_id, qty_change, transaction_type, reference_id, description
    ) VALUES (
        p_organization_id, p_lot_id, -p_quantity_kg, 'WASTAGE', v_wastage_id, 'Stock Waste: ' || p_reason
    );

    -- 3. UPDATE LOTS TABLE (Source of Truth)
    UPDATE lots 
    SET current_qty = current_qty - p_quantity_kg 
    WHERE id = p_lot_id;

    RETURN jsonb_build_object('success', true, 'wastage_id', v_wastage_id);
END;
$$ LANGUAGE plpgsql;
