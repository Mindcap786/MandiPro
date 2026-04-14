-- Migration: 20260418_super_admin_full_access.sql
-- Description: Super admin should have unrestricted access to all core schema tables.
--              Also grants authenticated role the table-level privileges needed
--              so that RLS policies can actually evaluate (without a GRANT, Postgres
--              rejects the query before even checking RLS).
--
-- Security model:
--   super_admin  → bypass policy on every table  (full CRUD on all rows)
--   tenant_admin → existing org-scoped policies continue to apply
--   anon         → unchanged (no new access)

-- ============================================================
-- 1. STABLE HELPER: core.is_super_admin()
--    SECURITY DEFINER so it reads core.profiles without RLS recursion.
-- ============================================================
CREATE OR REPLACE FUNCTION core.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = core, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM core.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
$$;

GRANT EXECUTE ON FUNCTION core.is_super_admin() TO authenticated;

-- ============================================================
-- 2. TABLE-LEVEL GRANTS
--    Without this, Postgres rejects the query before RLS runs.
--    RLS still controls *which rows* are visible — the grant
--    only allows the operation to proceed to the RLS check.
-- ============================================================
GRANT USAGE ON SCHEMA core TO authenticated, anon;

-- Grant all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO authenticated;

-- Ensure future tables also get the grant automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA core
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- ============================================================
-- 3. SUPER ADMIN BYPASS POLICY ON EVERY RLS TABLE
--    Loop over all tables in core that have RLS enabled and add
--    a permissive bypass policy for super_admin.
--    Multiple policies combine with OR, so this doesn't remove
--    any existing org-scoped policies for regular users.
-- ============================================================
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'core'
        -- Exclude system tables we want tightly controlled
        AND tablename NOT IN ('super_admins')
    LOOP
        -- Drop stale bypass policy if it exists
        EXECUTE format(
            'DROP POLICY IF EXISTS "super_admin_full_access" ON core.%I',
            tbl
        );

        -- Only create policy if RLS is enabled on this table
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'core' AND c.relname = tbl AND c.relrowsecurity
        ) THEN
            EXECUTE format(
                'CREATE POLICY "super_admin_full_access" ON core.%I
                    FOR ALL TO authenticated
                    USING (core.is_super_admin())
                    WITH CHECK (core.is_super_admin())',
                tbl
            );
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 4. SEED feature_flags WITH STANDARD PLATFORM FLAGS
--    (idempotent — uses ON CONFLICT DO NOTHING)
-- ============================================================
-- feature_flags schema: (id, key, label, description, default_enabled, organization_id, is_enabled, created_at)
INSERT INTO core.feature_flags (key, label, description, is_enabled, default_enabled) VALUES
    ('maintenance_mode',     'Emergency Kill Switch',         'Immediately suspends all tenant access — use with caution', false, false),
    ('mandi_pro',            'MandiPro Module',               'Commission mandi billing engine',                           true,  true),
    ('gst_module',           'GST Module',                    'GST filing & compliance reports',                           true,  true),
    ('ai_analytics',         'AI Analytics',                  'AI-powered sales analytics and demand forecasting',         false, false),
    ('pos_module',           'POS Terminal',                  'Point-of-sale terminal integration',                        false, false),
    ('multi_user',           'Multi-User Access',             'Multiple users within the same tenant',                     true,  true),
    ('whatsapp_alerts',      'WhatsApp Alerts',               'Transactional WhatsApp notifications',                      false, false),
    ('mobile_app',           'Mobile App',                    'Mobile app access (iOS & Android)',                         true,  true),
    ('bulk_import',          'Bulk Import',                   'CSV/Excel bulk data import',                                true,  true),
    ('api_access',           'API Access',                    'REST API key generation for tenant integrations',           false, false),
    ('data_export',          'Data Export',                   'Full data export to CSV/PDF',                               true,  true),
    ('advanced_reports',     'Advanced Reports',              'P&L, ledger, and stock analytics reports',                  true,  true),
    ('multi_location',       'Multi-Location',                'Multi-warehouse / multi-mandi location support',            false, false),
    ('custom_fields',        'Custom Fields',                 'Custom field configuration per org',                        false, false),
    ('tds_management',       'TDS Management',                'TDS deduction tracking and Form 16 generation',             false, false),
    ('audit_logs',           'Audit Logs',                    'User activity audit logs',                                  true,  true),
    ('priority_support',     'Priority Support',              'Priority support SLA (<4h response)',                       false, false),
    ('white_label',          'White Label',                   'Custom domain and branding',                                false, false),
    ('gst_reports',          'GST Reports',                   'GST return filing reports (GSTR-1, GSTR-3B)',               false, false),
    ('financial_year_close', 'Financial Year Close',          'Financial year closing and carry-forward',                  true,  true)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 5. ENSURE feature_flags HAS RLS ENABLED
-- ============================================================
ALTER TABLE core.feature_flags ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated to READ feature flags (needed for tenant feature checks)
DROP POLICY IF EXISTS "authenticated_read_flags" ON core.feature_flags;
CREATE POLICY "authenticated_read_flags" ON core.feature_flags
    FOR SELECT TO authenticated
    USING (true);

-- Only super_admin can write (super_admin_full_access policy above covers this)
