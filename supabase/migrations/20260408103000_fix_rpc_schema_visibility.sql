-- Migration: Expose Core RPCs to Public
-- Description: Creates proxy functions in the public schema for frontend-accessible core functions.
--              This resolves 404 errors caused by PostgREST searching only the public schema by default.

-- 1. get_tenant_expiry_status
CREATE OR REPLACE FUNCTION public.get_tenant_expiry_status(p_org_id UUID)
RETURNS JSONB SECURITY DEFINER AS $$
BEGIN
    RETURN core.get_tenant_expiry_status(p_org_id);
END;
$$ LANGUAGE plpgsql;

-- 2. record_login_failure
CREATE OR REPLACE FUNCTION public.record_login_failure(p_email TEXT)
RETURNS VOID SECURITY DEFINER AS $$
BEGIN
    PERFORM core.record_login_failure(p_email);
END;
$$ LANGUAGE plpgsql;

-- 3. record_login_success
CREATE OR REPLACE FUNCTION public.record_login_success(p_user_id UUID)
RETURNS VOID SECURITY DEFINER AS $$
BEGIN
    PERFORM core.record_login_success(p_user_id);
END;
$$ LANGUAGE plpgsql;

-- 4. unlock_account
CREATE OR REPLACE FUNCTION public.unlock_account(p_email TEXT)
RETURNS VOID SECURITY DEFINER AS $$
BEGIN
    PERFORM core.unlock_account(p_email);
END;
$$ LANGUAGE plpgsql;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_tenant_expiry_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_failure(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.record_login_success(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_account(TEXT) TO authenticated, anon;
