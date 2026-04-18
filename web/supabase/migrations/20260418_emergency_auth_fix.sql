-- ================================================================
-- EMERGENCY FIX: Auth Permissions & Role Unification (Robust)
-- Version 2: With Data Cleansing to prevent "violated by some row" error
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. FIX: platform_branding_settings access
GRANT SELECT ON core.platform_branding_settings TO anon, authenticated;
ALTER TABLE core.platform_branding_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branding_settings_public_read" ON core.platform_branding_settings;
CREATE POLICY "branding_settings_public_read"
  ON core.platform_branding_settings FOR SELECT TO anon, authenticated USING (true);

-- 2. SYSTEMIC FIX: Prepare data for "profiles_role_check"
-- Drop the restrictive check first
ALTER TABLE core.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- DATA CLEANSING: Map existing non-standard roles to the new system
-- This ensures 'profiles_role_check' won't fail when we re-add it.
UPDATE core.profiles
SET role = CASE 
    WHEN role IN ('admin', 'tenant_admin', 'Admin') THEN 'admin'
    WHEN role IN ('owner', 'Owner')                THEN 'owner'
    WHEN role IN ('super_admin', 'Super Admin')     THEN 'super_admin'
    WHEN role IN ('staff', 'member', 'user')       THEN 'staff'
    WHEN role IN ('viewer', 'read_only')           THEN 'viewer'
    ELSE 'staff' -- Default safe fallback for anything else (or NULL)
END
WHERE role IS NULL OR role NOT IN ('super_admin', 'owner', 'admin', 'manager', 'staff', 'viewer', 'authenticated');

-- 3. RECREATE CONSTRAINT: Add the robust, unified constraint
ALTER TABLE core.profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN (
    'super_admin', 'owner', 'admin', 'manager', 'staff', 'viewer', 'authenticated'
));

-- 4. TARGETED FIX: Ensure mandi3@gmail.com is set correctly
UPDATE core.profiles
SET role = 'admin'
WHERE LOWER(email) = 'mandi3@gmail.com';

-- 5. ENSURE Schema Grants
GRANT USAGE ON SCHEMA core TO authenticated, anon;
GRANT USAGE ON SCHEMA mandi TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA core TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA mandi TO authenticated;

-- 6. VERIFY: Show the results
SELECT p.id, p.full_name, p.role, o.name as org_name
FROM core.profiles p
LEFT JOIN core.organizations o ON p.organization_id = o.id
WHERE p.email IN ('mandi3@gmail.com') OR p.role = 'admin'
LIMIT 10;
