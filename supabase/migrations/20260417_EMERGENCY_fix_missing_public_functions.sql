-- ============================================================================
-- EMERGENCY FIX: Missing public-schema function wrappers
-- Date: 2026-04-17
-- Priority: CRITICAL — Production system down
-- Root Cause: Migration 20260409160000_fix_system_context_bundle.sql references
--   public.get_subscription_status(uuid) which was NEVER created in public schema.
--   Migration 20260408103000_fix_rpc_schema_visibility.sql created
--   public.get_tenant_expiry_status but the PostgREST schema cache was never
--   reloaded, so PGRST202 is returned.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FIX 1: Create public.get_subscription_status(uuid)
--   Referenced by: core.get_system_context_bundle (migration 20260409160000)
--   Was never created in public schema — only referenced, never defined.
--   This function reads from core.subscriptions and core.organizations to return
--   a JSONB blob describing the org's subscription health.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_subscription_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public, pg_temp
AS $$
DECLARE
    v_org_id    UUID;
    v_sub       RECORD;
    v_org       RECORD;
    v_now       TIMESTAMPTZ := NOW();
    v_days_rem  INT;
    v_status    TEXT;
    v_expires   TIMESTAMPTZ;
BEGIN
    -- Resolve the user's org
    SELECT organization_id INTO v_org_id
    FROM core.profiles
    WHERE id = p_user_id;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('status', 'none', 'has_access', false,
                                  'message', 'No organisation linked to user');
    END IF;

    -- Get org record
    SELECT id, status, is_active, trial_ends_at, subscription_tier
    INTO v_org
    FROM core.organizations
    WHERE id = v_org_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'none', 'has_access', false,
                                  'message', 'Organisation not found');
    END IF;

    -- Get latest subscription
    SELECT status, trial_ends_at, current_period_end, grace_period_ends_at
    INTO v_sub
    FROM core.subscriptions
    WHERE organization_id = v_org_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Determine effective status & expiry
    IF NOT FOUND THEN
        -- No subscription row → derive from org
        v_status  := COALESCE(v_org.status, 'trial');
        v_expires := v_org.trial_ends_at;
    ELSIF v_sub.status = 'trial' THEN
        v_status  := 'trial';
        v_expires := v_sub.trial_ends_at;
    ELSE
        v_status  := v_sub.status;
        v_expires := v_sub.current_period_end;
    END IF;

    -- Days remaining (NULL if no expiry set)
    IF v_expires IS NOT NULL THEN
        v_days_rem := GREATEST(0, EXTRACT(DAY FROM (v_expires - v_now))::INT);
    END IF;

    RETURN jsonb_build_object(
        'status',         v_status,
        'has_access',     (v_org.is_active IS NOT FALSE AND v_status IN ('active','trial')),
        'days_remaining', v_days_rem,
        'expires_at',     v_expires,
        'is_warning',     (v_days_rem IS NOT NULL AND v_days_rem <= 10),
        'org_id',         v_org_id,
        'tier',           v_org.subscription_tier
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Fail open — never crash the shell that loads the whole dashboard
        RAISE WARNING '[get_subscription_status] error for user %: %', p_user_id, SQLERRM;
        RETURN jsonb_build_object('status', 'unknown', 'has_access', true,
                                  'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscription_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(UUID) TO service_role;
COMMENT ON FUNCTION public.get_subscription_status(UUID)
IS 'Public-schema wrapper for subscription health. Called by core.get_system_context_bundle. Created 2026-04-17 emergency fix.';

-- ----------------------------------------------------------------------------
-- FIX 2: Re-create public.get_tenant_expiry_status(uuid)
--   Was defined in migration 20260408103000 but PostgREST schema cache had
--   not reloaded → PGRST202. Re-creating it here forces the cache to reload
--   on the next schema refresh. Also hardens it with GRANT to anon so the
--   subscription-expiry-warning component (unauthenticated path) can call it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_expiry_status(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public, pg_temp
AS $$
BEGIN
    RETURN core.get_tenant_expiry_status(p_org_id);
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[get_tenant_expiry_status] error for org %: %', p_org_id, SQLERRM;
        RETURN jsonb_build_object('status', 'unknown', 'has_access', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_expiry_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_expiry_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_expiry_status(UUID) TO anon;
COMMENT ON FUNCTION public.get_tenant_expiry_status(UUID)
IS 'Public wrapper → core.get_tenant_expiry_status. Re-created 2026-04-17 to force PostgREST schema cache reload.';

-- ----------------------------------------------------------------------------
-- FIX 3: Harden check_subscription_access — ensure it exists in public schema
--   (was created in migration 20260215 but may be missing in live DB)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_subscription_access(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public, pg_temp
AS $$
DECLARE
    v_is_active BOOLEAN;
BEGIN
    SELECT COALESCE(is_active, TRUE) INTO v_is_active
    FROM core.organizations
    WHERE id = p_org_id;

    IF v_is_active IS NULL THEN
        RETURN TRUE; -- org not found → fail open
    END IF;

    RETURN v_is_active;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[check_subscription_access] error for org %: %', p_org_id, SQLERRM;
        RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_subscription_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_subscription_access(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.check_subscription_access(UUID) TO service_role;
COMMENT ON FUNCTION public.check_subscription_access(UUID)
IS 'Returns TRUE if organisation subscription is active. Fail-open to avoid breaking the ERP. Re-hardened 2026-04-17.';

-- ============================================================================
-- NOTIFY PostgREST to reload its schema cache immediately
-- (Works on Supabase — sends pg_notify to the PostgREST reload channel)
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION QUERIES (run manually to confirm after applying)
-- ============================================================================
-- SELECT public.get_subscription_status(auth.uid());
-- SELECT public.get_tenant_expiry_status('<your-org-id-uuid>');
-- SELECT public.check_subscription_access('<your-org-id-uuid>');
-- ============================================================================
