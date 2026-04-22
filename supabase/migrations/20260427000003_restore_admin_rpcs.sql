-- Restore Admin RPC Functions (Standardized for MandiPro Schema)
-- This script restores functions used by the Admin HQ Portal and Support Ops

-- 1. get_tenant_details
CREATE OR REPLACE FUNCTION public.get_tenant_details(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, mandi, public
AS $$
DECLARE
    v_org JSONB;
    v_owner JSONB;
    v_users JSONB;
    v_stats JSONB;
BEGIN
    -- Get Organization info directly from core.organizations
    SELECT jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'slug', o.slug,
        'status', o.status,
        'is_active', COALESCE(o.is_active, true),
        'subscription_tier', COALESCE(o.subscription_tier, 'basic'),
        'max_web_users', COALESCE(o.max_web_users, 1),
        'max_mobile_users', COALESCE(o.max_mobile_users, 0),
        'trial_ends_at', o.trial_ends_at,
        'current_period_end', o.current_period_end,
        'billing_cycle', o.billing_cycle,
        'rbac_matrix', o.rbac_matrix,
        'phone', o.phone,
        'email', o.email
    ) INTO v_org
    FROM core.organizations o
    WHERE o.id = p_org_id;

    -- Get Owner info (primary owner/admin)
    SELECT jsonb_build_object(
        'id', pr.id,
        'full_name', pr.full_name,
        'email', pr.email,
        'phone', pr.phone,
        'username', pr.username
    ) INTO v_owner
    FROM core.profiles pr
    WHERE pr.organization_id = p_org_id 
      AND pr.role IN ('owner', 'org_admin', 'admin')
    ORDER BY 
        CASE pr.role 
            WHEN 'owner' THEN 1 
            WHEN 'org_admin' THEN 2 
            ELSE 3 
        END ASC, 
        pr.created_at ASC
    LIMIT 1;

    -- Get all Users
    SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'full_name', pr.full_name,
        'email', pr.email,
        'role', pr.role,
        'is_active', pr.is_active,
        'last_login_time', pr.last_login_time
    )) INTO v_users
    FROM core.profiles pr
    WHERE pr.organization_id = p_org_id;

    -- Compute Stats (Placeholders for UI restoration)
    v_stats := jsonb_build_object(
        'negative_ledger_count', 0,
        'negative_stock_count', 0
    );

    RETURN jsonb_build_object(
        'org', v_org,
        'owner', v_owner,
        'users', COALESCE(v_users, '[]'::jsonb),
        'stats', v_stats
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_details TO authenticated;

-- 2. toggle_organization_status
CREATE OR REPLACE FUNCTION public.toggle_organization_status(org_id UUID, new_status BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE core.organizations
    SET status = CASE WHEN new_status THEN 'active' ELSE 'suspended' END,
        is_active = new_status,
        updated_at = NOW()
    WHERE id = org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_organization_status TO authenticated;

-- 3. admin_assign_tenant_owner
CREATE OR REPLACE FUNCTION public.admin_assign_tenant_owner(p_org_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Demote existing owners
    UPDATE core.profiles
    SET role = 'staff' -- Fallback role in MandiPro
    WHERE organization_id = p_org_id AND role IN ('owner', 'org_admin');

    -- Promote new owner
    UPDATE core.profiles
    SET role = 'owner'
    WHERE id = p_user_id AND organization_id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_tenant_owner TO authenticated;

-- 4. Placeholders for Repair Tools
CREATE OR REPLACE FUNCTION public.admin_recalculate_ledger(p_org_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_recalculate_stock(p_org_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_resync_balances(p_org_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_unlock_stuck_transactions(p_org_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN NULL; END; $$;

GRANT EXECUTE ON FUNCTION public.admin_recalculate_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resync_balances TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_stuck_transactions TO authenticated;
