-- Auto-generated migration to expose core RPCs to public schema for REST API

CREATE OR REPLACE FUNCTION public.sync_platform_lifecycle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'core, public, pg_temp'
AS $$
BEGIN
    PERFORM core.sync_platform_lifecycle();
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_platform_lifecycle() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_platform_lifecycle() TO service_role;


CREATE OR REPLACE FUNCTION public.get_full_user_context(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'core, public, pg_temp'
AS $$
BEGIN
    RETURN core.get_full_user_context(p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_full_user_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_full_user_context(UUID) TO service_role;
