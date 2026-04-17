-- ============================================================================
-- Fix: RLS Recursion in core.profiles
-- Date: 2026-04-17
-- Priority: CRITICAL
-- Root Cause: "profiles_select_own" policy used a subquery on the same table, 
--   causing infinite recursion during organization_id resolution.
-- ============================================================================

-- 1. Ensure helper functions are robust and SECURITY DEFINER
CREATE OR REPLACE FUNCTION core.get_user_org_id()
RETURNS UUID AS $$
    -- Direct lookup on the table. Since THIS function is SECURITY DEFINER,
    -- it bypasses RLS and thus BREAKS the recursion loop.
    SELECT organization_id FROM core.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = core, public, pg_temp;

-- 2. Update core.profiles policy to use the non-recursive helper
DROP POLICY IF EXISTS "profiles_select_own" ON core.profiles;
CREATE POLICY "profiles_select_own" ON core.profiles
    FOR SELECT USING (
        id = auth.uid()
        OR organization_id = core.get_user_org_id()
    );

-- 3. Verify other tables are using the fixed helper
-- (Most already use core.get_user_org_id() based on 20260406310000 migration)

-- 4. Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
