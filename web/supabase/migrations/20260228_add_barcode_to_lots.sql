-- Create barcode column in lots table
ALTER TABLE public.lots
ADD COLUMN IF NOT EXISTS barcode text;

-- Add index to barcode to optimize future sales searches
CREATE INDEX IF NOT EXISTS idx_lots_barcode ON public.lots(barcode);
