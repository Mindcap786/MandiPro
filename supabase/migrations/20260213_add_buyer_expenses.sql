-- Add buyer expense fields to sales table
-- These charges are borne by the buyer and added to the invoice total

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS loading_charges numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS unloading_charges numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_expenses numeric DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN sales.loading_charges IS 'Charges for loading goods, borne by buyer';
COMMENT ON COLUMN sales.unloading_charges IS 'Charges for unloading goods, borne by buyer';
COMMENT ON COLUMN sales.other_expenses IS 'Other miscellaneous expenses, borne by buyer';
