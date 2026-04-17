-- Migration: 20260418_fix_missing_admin_schema_and_login_rpcs.sql
-- Description: Adds missing columns to core.profiles, creates core.admin_audit_logs,
--              core.admin_permissions tables, and finalize_login_bundle /
--              record_login_failure RPC functions that are required for login and
--              tenant provisioning from the admin panel.

-- ============================================================
-- 1. ADD MISSING COLUMNS TO core.profiles
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'admin_status') THEN
        ALTER TABLE core.profiles ADD COLUMN admin_status TEXT DEFAULT 'active'
            CHECK (admin_status IN ('active', 'suspended', 'locked'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'failed_login_attempts') THEN
        ALTER TABLE core.profiles ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'locked_until') THEN
        ALTER TABLE core.profiles ADD COLUMN locked_until TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'session_version') THEN
        ALTER TABLE core.profiles ADD COLUMN session_version INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'rbac_matrix') THEN
        ALTER TABLE core.profiles ADD COLUMN rbac_matrix JSONB DEFAULT '{}';
    END IF;

    -- last_login tracking (used by admin APIs — note: code queries 'last_login_time')
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'last_login_time') THEN
        ALTER TABLE core.profiles ADD COLUMN last_login_time TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'last_login_ip') THEN
        ALTER TABLE core.profiles ADD COLUMN last_login_ip TEXT;
    END IF;
END $$;

-- ============================================================
-- 2. CREATE core.admin_audit_logs (used by every admin API route)
-- ============================================================
CREATE TABLE IF NOT EXISTS core.admin_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_tenant_id UUID REFERENCES core.organizations(id) ON DELETE SET NULL,
    action_type     TEXT NOT NULL,
    module          TEXT,
    before_data     JSONB,
    after_data      JSONB,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE core.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role and postgres can do anything; authenticated reads own logs
DROP POLICY IF EXISTS "service_role_admin_audit" ON core.admin_audit_logs;
CREATE POLICY "service_role_admin_audit" ON core.admin_audit_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "super_admin_read_audit" ON core.admin_audit_logs;
CREATE POLICY "super_admin_read_audit" ON core.admin_audit_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM core.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
        )
    );

-- ============================================================
-- 3. CREATE core.admin_permissions (RBAC for admin panel)
-- ============================================================
CREATE TABLE IF NOT EXISTS core.admin_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id     TEXT NOT NULL,   -- matches core.profiles.role
    resource    TEXT NOT NULL,   -- e.g. 'tenants', 'billing', 'all'
    action      TEXT NOT NULL,   -- e.g. 'create', 'read', 'manage'
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (role_id, resource, action)
);

ALTER TABLE core.admin_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_admin_perms" ON core.admin_permissions;
CREATE POLICY "service_role_admin_perms" ON core.admin_permissions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_role_perms" ON core.admin_permissions;
CREATE POLICY "read_own_role_perms" ON core.admin_permissions
    FOR SELECT TO authenticated
    USING (
        role_id = (SELECT role FROM core.profiles WHERE id = auth.uid())
    );

-- Seed: give super_admin a wildcard grant so the RBAC check always passes
INSERT INTO core.admin_permissions (role_id, resource, action)
VALUES ('super_admin', 'all', 'manage')
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- ============================================================
-- 4. CREATE view_admin_audit_logs (used by the audit UI)
-- ============================================================
DROP VIEW IF EXISTS core.view_admin_audit_logs;
CREATE VIEW core.view_admin_audit_logs AS
SELECT
    l.id,
    l.admin_id,
    l.target_tenant_id,
    l.action_type,
    l.module,
    l.before_data,
    l.after_data,
    l.ip_address,
    l.user_agent,
    l.created_at,
    p.email       AS actor_email,
    p.full_name   AS actor_name,
    o.name        AS target_org_name
FROM core.admin_audit_logs l
LEFT JOIN core.profiles p ON p.id = l.admin_id
LEFT JOIN core.organizations o ON o.id = l.target_tenant_id;

GRANT SELECT ON core.view_admin_audit_logs TO authenticated, service_role;

-- ============================================================
-- 5. RPC: record_login_failure(p_email TEXT)
--    Called from the login page on every failed password attempt.
--    Increments failed_login_attempts; locks the account after 10 attempts.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_login_failure(p_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, core
AS $$
DECLARE
    v_attempts INTEGER;
BEGIN
    UPDATE core.profiles
    SET
        failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
        locked_until = CASE
            WHEN COALESCE(failed_login_attempts, 0) + 1 >= 10
            THEN NOW() + INTERVAL '1 hour'
            ELSE locked_until
        END,
        admin_status = CASE
            WHEN COALESCE(failed_login_attempts, 0) + 1 >= 10
            THEN 'locked'
            ELSE admin_status
        END
    WHERE LOWER(email) = LOWER(p_email)
    RETURNING failed_login_attempts INTO v_attempts;

    -- If no profile exists yet (race condition during signup) just return silently
    RETURN;
EXCEPTION WHEN OTHERS THEN
    RETURN; -- Always succeed silently so login error is shown to the user
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_failure(TEXT) TO authenticated, anon, service_role;

-- ============================================================
-- 6. RPC: finalize_login_bundle(p_user_id UUID)
--    Called immediately after signInWithPassword succeeds.
--    Returns { profile, organization } as JSON and resets the failed-attempt counter.
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_login_bundle(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, core
AS $$
DECLARE
    v_profile  core.profiles%ROWTYPE;
    v_org      core.organizations%ROWTYPE;
    v_result   JSON;
BEGIN
    -- 1. Fetch profile
    SELECT * INTO v_profile FROM core.profiles WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN json_build_object('profile', NULL, 'organization', NULL);
    END IF;

    -- 2. Reset failed login counter on successful login
    UPDATE core.profiles
    SET
        failed_login_attempts = 0,
        locked_until          = NULL,
        last_login_time       = NOW(),
        -- Ensure admin_status is not stuck in 'locked' after lockout expiry
        admin_status = CASE
            WHEN admin_status = 'locked' AND (locked_until IS NULL OR locked_until < NOW())
            THEN 'active'
            ELSE admin_status
        END
    WHERE id = p_user_id;

    -- Re-read the updated profile
    SELECT * INTO v_profile FROM core.profiles WHERE id = p_user_id;

    -- 3. Fetch organization if profile is linked to one
    IF v_profile.organization_id IS NOT NULL THEN
        SELECT * INTO v_org FROM core.organizations WHERE id = v_profile.organization_id;
    END IF;

    -- 4. Build and return the JSON bundle
    v_result := json_build_object(
        'profile',      row_to_json(v_profile),
        'organization', CASE WHEN v_org.id IS NOT NULL THEN row_to_json(v_org) ELSE NULL END
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    -- Never crash the login flow; the caller has a fallback
    RETURN json_build_object('profile', NULL, 'organization', NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_login_bundle(UUID) TO authenticated, anon, service_role;

-- ============================================================
-- 7. GRANTS: Ensure service_role has full access to new tables
-- ============================================================
GRANT ALL ON core.admin_audit_logs TO service_role, postgres;
GRANT ALL ON core.admin_permissions TO service_role, postgres;

-- ============================================================
-- 8. Ensure existing super_admin profiles have admin_status = 'active'
-- ============================================================
UPDATE core.profiles
SET admin_status = 'active'
WHERE role = 'super_admin' AND (admin_status IS NULL OR admin_status = '');
