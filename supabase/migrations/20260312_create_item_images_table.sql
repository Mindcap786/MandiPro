-- Create item_images table to track commodity photos
CREATE TABLE IF NOT EXISTS public.item_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    commodity_id UUID NOT NULL,
    url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_commodity FOREIGN KEY (commodity_id) REFERENCES public.commodities(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.item_images ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
CREATE POLICY "Users can view their organization's item images"
    ON public.item_images FOR SELECT
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert their organization's item images"
    ON public.item_images FOR INSERT
    WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their organization's item images"
    ON public.item_images FOR UPDATE
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their organization's item images"
    ON public.item_images FOR DELETE
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
