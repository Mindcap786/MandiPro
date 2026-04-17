-- Migration for Quotations and Quotation Items

-- Create sequence for quotation_no
CREATE SEQUENCE IF NOT EXISTS quotation_no_seq;

-- Create quotations table
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quotation_no INTEGER NOT NULL DEFAULT nextval('quotation_no_seq'::regclass),
    quotation_number TEXT,
    buyer_id UUID REFERENCES public.contacts(id) ON DELETE RESTRICT,
    quotation_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    valid_until TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
    
    -- Financials
    subtotal NUMERIC DEFAULT 0,
    gross_amount NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    round_off NUMERIC DEFAULT 0,
    grand_total NUMERIC DEFAULT 0,
    
    -- Taxes
    is_igst BOOLEAN DEFAULT false,
    cgst_amount NUMERIC DEFAULT 0,
    sgst_amount NUMERIC DEFAULT 0,
    igst_amount NUMERIC DEFAULT 0,
    gst_total NUMERIC DEFAULT 0,
    place_of_supply TEXT,
    
    -- Metadata
    sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL, -- if converted to SO
    notes TEXT,
    terms TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Organization-specific quotation_no index
CREATE UNIQUE INDEX IF NOT EXISTS quotations_org_quotation_no_idx 
ON public.quotations (organization_id, quotation_no);

-- Create quotation_items table
CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.items(id) ON DELETE RESTRICT,
    qty NUMERIC NOT NULL,
    unit TEXT,
    rate NUMERIC NOT NULL,
    amount NUMERIC NOT NULL,
    
    -- Taxes
    hsn_code TEXT,
    gst_rate NUMERIC DEFAULT 0,
    tax_amount NUMERIC DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quotations
CREATE POLICY "Users can view quotations for their organization"
    ON public.quotations FOR SELECT
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can create quotations for their organization"
    ON public.quotations FOR INSERT
    WITH CHECK (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can update quotations for their organization"
    ON public.quotations FOR UPDATE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can delete quotations for their organization"
    ON public.quotations FOR DELETE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

-- RLS Policies for quotation_items
CREATE POLICY "Users can view quotation_items for their organization"
    ON public.quotation_items FOR SELECT
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can create quotation_items for their organization"
    ON public.quotation_items FOR INSERT
    WITH CHECK (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can update quotation_items for their organization"
    ON public.quotation_items FOR UPDATE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can delete quotation_items for their organization"
    ON public.quotation_items FOR DELETE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

-- Grant privileges
GRANT ALL ON TABLE public.quotations TO authenticated;
GRANT ALL ON TABLE public.quotations TO service_role;
GRANT ALL ON TABLE public.quotation_items TO authenticated;
GRANT ALL ON TABLE public.quotation_items TO service_role;
GRANT ALL ON SEQUENCE public.quotation_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.quotation_no_seq TO service_role;
