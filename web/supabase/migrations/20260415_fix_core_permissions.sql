-- ============================================================
-- FIX: Standard User Access to Core Schema
-- Migration: 20260415_fix_core_permissions.sql
--
-- PROBLEM: Previous hardening migration (20260411) revoked usage 
-- on 'core' from authenticated users, causing 403 Forbidden 
-- on profiles, organizations, and app_plans.
-- ============================================================

-- 1. Restore USAGE to the core schema for all authenticated users
-- Without this, users cannot even 'see' the tables in 'core'
GRANT USAGE ON SCHEMA core TO authenticated, anon;

-- 2. Grant SELECT on essential non-sensitive tables
-- standard users need to read their own profiles and see active plans
GRANT SELECT ON core.profiles TO authenticated;
GRANT SELECT ON core.organizations TO authenticated;
GRANT SELECT ON core.app_plans TO authenticated;
GRANT SELECT ON core.subscriptions TO authenticated;

-- 3. Ensure they can read usage metrics (for billing dashboard)
GRANT SELECT ON core.usage_metrics TO authenticated;

-- 4. Re-verify function execution
GRANT EXECUTE ON FUNCTION core.get_my_org_id() TO authenticated;

-- 5. Logging (Optional: helpful for audit logs)
COMMENT ON SCHEMA core IS 'Standard ERP core schema - access restored to authenticated users for non-sensitive data.';
