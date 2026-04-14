-- Phase 1: Establish Domain Schemas
-- This script creates the core, mandi, and wholesale schemas without modifying existing public tables.

-- 1. Create the schemas
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS mandi;
CREATE SCHEMA IF NOT EXISTS wholesale;

-- 2. Grant permissions to Supabase roles
GRANT USAGE ON SCHEMA core TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA mandi TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA wholesale TO postgres, anon, authenticated, service_role;

-- 3. CORE SCHEMA TABLES
-- We start by establishing the core tenant table. 
-- Note: This is a standalone table for now to avoid breaking public.organizations
CREATE TABLE IF NOT EXISTS core.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tenant_type TEXT NOT NULL CHECK (tenant_type IN ('mandi', 'wholesale')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Core Profiles (minimal mapping for auth)
CREATE TABLE IF NOT EXISTS core.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT,
    email TEXT,
    business_domain TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Core Ledger Engine
CREATE TABLE IF NOT EXISTS core.ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    account_id UUID, -- References account master (can be in core to share chart of accounts)
    contact_id UUID, -- Loose ref (could be mandi farmer or wholesale b2b)
    debit NUMERIC DEFAULT 0,
    credit NUMERIC DEFAULT 0,
    transaction_type TEXT,
    reference_id UUID, -- Loose ref to domain-specific transaction table
    domain TEXT CHECK (domain IN ('mandi', 'wholesale')),
    entry_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);


-- 4. MANDI SCHEMA TABLES
CREATE TABLE IF NOT EXISTS mandi.commodities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    local_name TEXT,
    shelf_life_days INT,
    critical_age_days INT,
    default_unit TEXT
);

CREATE TABLE IF NOT EXISTS mandi.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    contact_type TEXT CHECK (contact_type IN ('farmer', 'commission_agent', 'buyer')),
    name TEXT NOT NULL,
    phone TEXT,
    mandi_license_no TEXT,
    bank_details JSONB
);

CREATE TABLE IF NOT EXISTS mandi.arrivals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES mandi.contacts(id),
    arrival_type TEXT, -- e.g. 'commission', 'direct'
    entry_date DATE NOT NULL,
    status TEXT
);

CREATE TABLE IF NOT EXISTS mandi.lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    arrival_id UUID REFERENCES mandi.arrivals(id),
    commodity_id UUID REFERENCES mandi.commodities(id),
    lot_code TEXT NOT NULL,
    gross_quantity NUMERIC,
    unit TEXT,
    supplier_rate NUMERIC,
    commission_percent NUMERIC,
    less_percent NUMERIC,
    status TEXT
);

CREATE TABLE IF NOT EXISTS mandi.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES mandi.contacts(id),
    sale_date DATE NOT NULL,
    payment_mode TEXT,
    total_amount NUMERIC,
    bill_no BIGINT,
    market_fee NUMERIC DEFAULT 0,
    nirashrit NUMERIC DEFAULT 0,
    misc_fee NUMERIC DEFAULT 0,
    loading_charges NUMERIC DEFAULT 0,
    unloading_charges NUMERIC DEFAULT 0,
    other_expenses NUMERIC DEFAULT 0,
    status TEXT,
    payment_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    idempotency_key UUID,
    due_date DATE
);

CREATE TABLE IF NOT EXISTS mandi.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES mandi.sales(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES mandi.lots(id),
    quantity NUMERIC NOT NULL,
    rate NUMERIC NOT NULL,
    total_price NUMERIC NOT NULL
);


-- 5. WHOLESALE SCHEMA TABLES
CREATE TABLE IF NOT EXISTS wholesale.sku_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku_code TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    hsn_code TEXT,
    gst_rate NUMERIC,
    is_gst_exempt BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS wholesale.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    contact_type TEXT CHECK (contact_type IN ('distributor', 'retailer', 'supplier', 'b2b')),
    name TEXT NOT NULL,
    company_name TEXT,
    gstin TEXT,
    state_code TEXT
);

CREATE TABLE IF NOT EXISTS wholesale.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES wholesale.contacts(id),
    po_number TEXT NOT NULL,
    order_date DATE,
    status TEXT
);

CREATE TABLE IF NOT EXISTS wholesale.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES wholesale.sku_master(id),
    warehouse_id UUID, -- For multi-warehouse
    batch_number TEXT,
    expiry_date DATE,
    quantity NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS wholesale.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES wholesale.contacts(id),
    invoice_number TEXT NOT NULL,
    invoice_date DATE,
    subtotal NUMERIC,
    tax_total NUMERIC,
    grand_total NUMERIC,
    place_of_supply TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS wholesale.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES wholesale.invoices(id) ON DELETE CASCADE,
    inventory_id UUID REFERENCES wholesale.inventory(id),
    quantity NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    taxable_value NUMERIC,
    cgst_amount NUMERIC,
    sgst_amount NUMERIC,
    igst_amount NUMERIC,
    total_price NUMERIC
);

-- Allow RLS on all new tables
ALTER TABLE core.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE mandi.commodities ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.sale_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE wholesale.sku_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale.invoice_items ENABLE ROW LEVEL SECURITY;
