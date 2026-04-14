-- Migration for Purchase Invoices and Purchase Invoice Items

-- Create sequence for invoice_number
CREATE SEQUENCE IF NOT EXISTS purchase_invoice_no_seq;

-- Create purchase_invoices table
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_no INTEGER NOT NULL DEFAULT nextval('purchase_invoice_no_seq'::regclass),
    invoice_number TEXT, -- Sometimes suppliers have alphanumeric invoices
    supplier_invoice_no TEXT,
    supplier_id UUID REFERENCES public.contacts(id) ON DELETE RESTRICT,
    invoice_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'paid', 'void')),
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    
    -- Financials
    subtotal NUMERIC DEFAULT 0,
    gross_amount NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    round_off NUMERIC DEFAULT 0,
    grand_total NUMERIC DEFAULT 0,
    amount_paid NUMERIC DEFAULT 0,
    
    -- Taxes
    is_igst BOOLEAN DEFAULT false,
    cgst_amount NUMERIC DEFAULT 0,
    sgst_amount NUMERIC DEFAULT 0,
    igst_amount NUMERIC DEFAULT 0,
    gst_total NUMERIC DEFAULT 0,
    place_of_supply TEXT,
    
    -- Metadata
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Organization-specific invoice_no index
CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_org_invoice_no_idx 
ON public.purchase_invoices (organization_id, invoice_no);

-- Create purchase_invoice_items table
CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    purchase_invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.items(id) ON DELETE RESTRICT,
    qty NUMERIC NOT NULL,
    unit TEXT,
    rate NUMERIC NOT NULL,
    amount NUMERIC NOT NULL,
    
    -- Taxes
    hsn_code TEXT,
    gst_rate NUMERIC DEFAULT 0,
    cgst_amount NUMERIC DEFAULT 0,
    sgst_amount NUMERIC DEFAULT 0,
    igst_amount NUMERIC DEFAULT 0,
    tax_amount NUMERIC DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for purchase_invoices
CREATE POLICY "Users can view purchase_invoices for their organization"
    ON public.purchase_invoices FOR SELECT
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can create purchase_invoices for their organization"
    ON public.purchase_invoices FOR INSERT
    WITH CHECK (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can update purchase_invoices for their organization"
    ON public.purchase_invoices FOR UPDATE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can delete purchase_invoices for their organization"
    ON public.purchase_invoices FOR DELETE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

-- RLS Policies for purchase_invoice_items
CREATE POLICY "Users can view purchase_invoice_items for their organization"
    ON public.purchase_invoice_items FOR SELECT
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can create purchase_invoice_items for their organization"
    ON public.purchase_invoice_items FOR INSERT
    WITH CHECK (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can update purchase_invoice_items for their organization"
    ON public.purchase_invoice_items FOR UPDATE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "Users can delete purchase_invoice_items for their organization"
    ON public.purchase_invoice_items FOR DELETE
    USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);

-- Grant privileges
GRANT ALL ON TABLE public.purchase_invoices TO authenticated;
GRANT ALL ON TABLE public.purchase_invoices TO service_role;
GRANT ALL ON TABLE public.purchase_invoice_items TO authenticated;
GRANT ALL ON TABLE public.purchase_invoice_items TO service_role;
GRANT ALL ON SEQUENCE public.purchase_invoice_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.purchase_invoice_no_seq TO service_role;
