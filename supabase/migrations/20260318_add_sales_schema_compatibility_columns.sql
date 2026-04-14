-- Bring mandi sales tables up to the shape expected by the current web app
-- while preserving compatibility with older quantity/total_price based code.

ALTER TABLE mandi.sales
    ADD COLUMN IF NOT EXISTS total_amount_inc_tax NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS buyer_gstin TEXT,
    ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS igst_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gst_total NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_igst BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS place_of_supply TEXT,
    ADD COLUMN IF NOT EXISTS workflow_status TEXT;

UPDATE mandi.sales
SET total_amount_inc_tax = COALESCE(total_amount, 0)
    + COALESCE(market_fee, 0)
    + COALESCE(nirashrit, 0)
    + COALESCE(misc_fee, 0)
    + COALESCE(loading_charges, 0)
    + COALESCE(unloading_charges, 0)
    + COALESCE(other_expenses, 0)
WHERE COALESCE(total_amount_inc_tax, 0) = 0;

UPDATE mandi.sales
SET workflow_status = COALESCE(workflow_status, status, 'confirmed')
WHERE workflow_status IS NULL;

ALTER TABLE mandi.sale_items
    ADD COLUMN IF NOT EXISTS qty NUMERIC,
    ADD COLUMN IF NOT EXISTS amount NUMERIC,
    ADD COLUMN IF NOT EXISTS unit TEXT,
    ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES mandi.commodities(id),
    ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hsn_code TEXT;

CREATE INDEX IF NOT EXISTS idx_mandi_sale_items_item_id ON mandi.sale_items(item_id);

UPDATE mandi.sale_items si
SET qty = COALESCE(si.qty, si.quantity),
    amount = COALESCE(si.amount, si.total_price),
    quantity = COALESCE(si.quantity, si.qty),
    total_price = COALESCE(si.total_price, si.amount, COALESCE(si.qty, si.quantity) * si.rate),
    item_id = COALESCE(si.item_id, l.item_id),
    unit = COALESCE(si.unit, l.unit, c.default_unit, 'Kg'),
    gst_rate = COALESCE(si.gst_rate, c.gst_rate, 0),
    tax_amount = COALESCE(si.tax_amount, 0),
    hsn_code = COALESCE(si.hsn_code, NULL)
FROM mandi.lots l
LEFT JOIN mandi.commodities c ON c.id = l.item_id
WHERE si.lot_id = l.id;

CREATE OR REPLACE FUNCTION mandi.sync_sale_item_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.qty IS NULL THEN
        NEW.qty := NEW.quantity;
    END IF;

    IF NEW.quantity IS NULL THEN
        NEW.quantity := NEW.qty;
    END IF;

    IF NEW.qty IS NULL AND NEW.quantity IS NULL THEN
        NEW.qty := 0;
        NEW.quantity := 0;
    END IF;

    IF NEW.amount IS NULL AND NEW.rate IS NOT NULL THEN
        NEW.amount := COALESCE(NEW.qty, NEW.quantity, 0) * NEW.rate;
    END IF;

    IF NEW.total_price IS NULL THEN
        NEW.total_price := NEW.amount;
    END IF;

    IF NEW.amount IS NULL THEN
        NEW.amount := NEW.total_price;
    END IF;

    IF NEW.item_id IS NULL AND NEW.lot_id IS NOT NULL THEN
        SELECT
            l.item_id,
            COALESCE(NEW.unit, l.unit, c.default_unit, 'Kg'),
            NEW.hsn_code,
            COALESCE(NEW.gst_rate, c.gst_rate, 0)
        INTO
            NEW.item_id,
            NEW.unit,
            NEW.hsn_code,
            NEW.gst_rate
        FROM mandi.lots l
        LEFT JOIN mandi.commodities c ON c.id = l.item_id
        WHERE l.id = NEW.lot_id
        LIMIT 1;
    END IF;

    IF NEW.unit IS NULL THEN
        NEW.unit := 'Kg';
    END IF;

    IF NEW.gst_rate IS NULL THEN
        NEW.gst_rate := 0;
    END IF;

    IF NEW.tax_amount IS NULL THEN
        NEW.tax_amount := 0;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_sale_item_compatibility ON mandi.sale_items;

CREATE TRIGGER trg_sync_sale_item_compatibility
BEFORE INSERT OR UPDATE ON mandi.sale_items
FOR EACH ROW
EXECUTE FUNCTION mandi.sync_sale_item_compatibility();
