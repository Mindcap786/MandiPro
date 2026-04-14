-- Add location tracking to stock_ledger
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS source_location TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS destination_location TEXT;

-- Create atomic transfer function
CREATE OR REPLACE FUNCTION transfer_stock_v2(
    p_organization_id UUID,
    p_lot_id UUID,
    p_qty NUMERIC,
    p_from_location TEXT,
    p_to_location TEXT
) RETURNS VOID AS $$
DECLARE
    v_current_location TEXT;
    v_available_qty NUMERIC;
BEGIN
    -- 1. Check current location and availability
    SELECT storage_location, current_qty INTO v_current_location, v_available_qty
    FROM lots
    WHERE id = p_lot_id AND organization_id = p_organization_id;

    IF v_current_location != p_from_location THEN
        RAISE EXCEPTION 'Lot is not in the source location: %', p_from_location;
    END IF;

    IF v_available_qty < p_qty THEN
        RAISE EXCEPTION 'Insufficient quantity in lot. Available: %, Requested: %', v_available_qty, p_qty;
    END IF;

    -- 2. Update lot location
    -- Simple policy for now: If partial transfer, we might need lot splitting, 
    -- but for v1 we update the whole lot's location if it's a full transfer,
    -- or we just log the movement in ledger.
    -- Actually, to maintain end-to-end tracking, the LOT itself should probably represent a batch in a location.
    
    UPDATE lots 
    SET storage_location = p_to_location
    WHERE id = p_lot_id AND organization_id = p_organization_id;

    -- 3. Log movement in ledger
    INSERT INTO stock_ledger (
        organization_id,
        lot_id,
        transaction_type,
        qty_change,
        source_location,
        destination_location
    ) VALUES (
        p_organization_id,
        p_lot_id,
        'transfer',
        0, -- Net qty change in total system is 0
        p_from_location,
        p_to_location
    );
END;
$$ LANGUAGE plpgsql;
