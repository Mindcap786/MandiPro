-- Migration: Fix Sale Adjustments Schema and Foreign Keys
-- Date: 2026-02-15
-- Description: Ensures sale_adjustments has proper relationships for nested Supabase selects.

-- 1. Create table if missing (formal definition)
CREATE TABLE IF NOT EXISTS public.sale_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    sale_id UUID NOT NULL,
    sale_item_id UUID NOT NULL,
    old_qty NUMERIC,
    new_qty NUMERIC,
    old_rate NUMERIC,
    new_rate NUMERIC,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add Foreign Keys (Crucial for Postgrest Join)
-- First drop if exists to avoid errors on reapplying
ALTER TABLE public.sale_adjustments DROP CONSTRAINT IF EXISTS fk_sale_adjustments_sale;
ALTER TABLE public.sale_adjustments DROP CONSTRAINT IF EXISTS fk_sale_adjustments_item;

ALTER TABLE public.sale_adjustments 
ADD CONSTRAINT fk_sale_adjustments_sale 
FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

ALTER TABLE public.sale_adjustments 
ADD CONSTRAINT fk_sale_adjustments_item 
FOREIGN KEY (sale_item_id) REFERENCES public.sale_items(id) ON DELETE CASCADE;

-- 3. Add Index for Performance
CREATE INDEX IF NOT EXISTS idx_sale_adjustments_sale_id ON public.sale_adjustments(sale_id);

-- 4. Enable RLS (Security)
ALTER TABLE public.sale_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON public.sale_adjustments;
CREATE POLICY "Enable all for users based on organization_id" ON public.sale_adjustments
FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
);
