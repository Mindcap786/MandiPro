-- Phase 2: Data ETL and Synchronization Triggers
-- This script migrates existing data from `public` to the new isolated dual-schema structure.

-- 1. Migrate core organizations
INSERT INTO core.organizations (id, name, tenant_type, created_at)
SELECT id, name, 
    CASE 
        WHEN subscription_tier ILIKE '%wholesale%' THEN 'wholesale'
        ELSE 'mandi'
    END as tenant_type, 
    created_at 
FROM public.organizations
ON CONFLICT (id) DO NOTHING;

-- 2. Migrate core profiles
INSERT INTO core.profiles (id, organization_id, full_name, role)
SELECT id, organization_id, full_name, role
FROM public.profiles
ON CONFLICT (id) DO NOTHING;

-- 3. Migrate Mandi Commodities
-- We only migrate items belonging to organizations classified as 'mandi'
INSERT INTO mandi.commodities (id, organization_id, name, local_name, shelf_life_days, critical_age_days, default_unit)
SELECT i.id, i.organization_id, i.name, i.local_name, i.shelf_life_days, i.critical_age_days, i.default_unit
FROM public.items i
JOIN core.organizations o ON i.organization_id = o.id
WHERE o.tenant_type = 'mandi'
ON CONFLICT (id) DO NOTHING;

-- Drop restrictive check constraints initially for migration flexibility
ALTER TABLE mandi.contacts DROP CONSTRAINT IF EXISTS contacts_contact_type_check;
ALTER TABLE wholesale.contacts DROP CONSTRAINT IF EXISTS contacts_contact_type_check;

-- 4. Migrate Mandi Contacts
INSERT INTO mandi.contacts (id, organization_id, contact_type, name, phone, mandi_license_no)
SELECT c.id, c.organization_id, c.type, c.name, c.phone, NULL
FROM public.contacts c
JOIN core.organizations o ON c.organization_id = o.id
WHERE o.tenant_type = 'mandi'
ON CONFLICT (id) DO NOTHING;

-- 5. Migrate Wholesale SKUs
INSERT INTO wholesale.sku_master (id, organization_id, name, sku_code, brand, category, hsn_code, gst_rate, is_gst_exempt)
SELECT i.id, i.organization_id, i.name, COALESCE(i.sku_code, 'SKU-' || substr(i.id::text, 1, 6)), NULL, i.category, i.hsn_code, i.gst_rate, i.is_gst_exempt
FROM public.items i
JOIN core.organizations o ON i.organization_id = o.id
WHERE o.tenant_type = 'wholesale'
ON CONFLICT (id) DO NOTHING;

-- 6. Migrate Wholesale Contacts
INSERT INTO wholesale.contacts (id, organization_id, contact_type, name, company_name, gstin, state_code)
SELECT c.id, c.organization_id, c.type, c.name, c.company_name, c.gst_number, c.state_code
FROM public.contacts c
JOIN core.organizations o ON c.organization_id = o.id
WHERE o.tenant_type = 'wholesale'
ON CONFLICT (id) DO NOTHING;

