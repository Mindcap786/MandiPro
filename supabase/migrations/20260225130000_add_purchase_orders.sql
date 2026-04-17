-- Migration for Purchase Orders and Purchase Order Items

-- Create sequence for order_no
CREATE SEQUENCE IF NOT EXISTS purchase_order_no_seq;

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_no INTEGER NOT NULL DEFAULT nextval('purchase_order_no_seq'::regclass),
    supplier_id UUID REFERENCES public.contacts(id) ON DELETE RESTRICT,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    due_date TIMESTAMP WITH TIME ZONE,
    expected_delivery_date TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
    
    -- Financials
    gross_amount NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    round_off NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    total_amount_inc_tax NUMERIC DEFAULT 0,
    
    -- Taxes
    is_igst BOOLEAN DEFAULT false,
    cgst_amount NUMERIC DEFAULT 0,
    sgst_amount NUMERIC DEFAULT 0,
    igst_amount NUMERIC DEFAULT 0,
    gst_total NUMERIC DEFAULT 0,
    place_of_supply TEXT,
    supplier_gstin TEXT,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Organization-specific order_no index
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_org_order_no_idx 
ON public.purchase_orders (organization_id, order_no);

-- Create purchase_order_items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
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
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for purchase_orders
CREATE POLICY "Users can view purchase_orders for their organization"
    ON public.purchase_orders FOR SELECT
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can create purchase_orders for their organization"
    ON public.purchase_orders FOR INSERT
    WITH CHECK (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can update purchase_orders for their organization"
    ON public.purchase_orders FOR UPDATE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can delete purchase_orders for their organization"
    ON public.purchase_orders FOR DELETE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

-- RLS Policies for purchase_order_items
CREATE POLICY "Users can view purchase_order_items for their organization"
    ON public.purchase_order_items FOR SELECT
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can create purchase_order_items for their organization"
    ON public.purchase_order_items FOR INSERT
    WITH CHECK (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can update purchase_order_items for their organization"
    ON public.purchase_order_items FOR UPDATE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can delete purchase_order_items for their organization"
    ON public.purchase_order_items FOR DELETE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

-- Grant privileges
GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO service_role;
GRANT ALL ON TABLE public.purchase_order_items TO authenticated;
GRANT ALL ON TABLE public.purchase_order_items TO service_role;
GRANT ALL ON SEQUENCE public.purchase_order_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.purchase_order_no_seq TO service_role;
