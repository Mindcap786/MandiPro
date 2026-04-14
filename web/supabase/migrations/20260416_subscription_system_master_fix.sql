-- ============================================================
-- MANDIPRO SUBSCRIPTION SYSTEM — MASTER FIX
-- Migration: 20260416_subscription_system_master_fix.sql
--
-- Run this in your Supabase SQL Editor.
-- This fixes ALL subscription-related issues:
-- 1. Grants authenticated users access to read app_plans
-- 2. Sets correct RLS policies on app_plans (public read)
-- 3. Updates basic/standard/enterprise plans to show on homepage
-- 4. Creates auto-trial trigger on new org creation
-- 5. Creates admin RPCs: set trial days, extend expiry, assign plan
-- ============================================================


-- ================================================================
-- STEP 1: GRANT ACCESS TO CORE SCHEMA FOR AUTHENTICATED USERS
-- (Fixes "permission denied for table app_plans" error)
-- ================================================================
GRANT USAGE ON SCHEMA core TO authenticated, anon;
GRANT SELECT ON core.app_plans TO authenticated, anon;
GRANT SELECT ON core.subscriptions TO authenticated;
GRANT SELECT ON core.organizations TO authenticated;
GRANT SELECT ON core.profiles TO authenticated;
GRANT SELECT ON core.usage_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION core.get_my_org_id() TO authenticated;


-- ================================================================
-- STEP 2: RLS POLICY — Anyone authenticated can read active plans
-- (Required for billing page to load plans)
-- ================================================================
ALTER TABLE core.app_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_plans_public_read" ON core.app_plans;
CREATE POLICY "app_plans_public_read"
  ON core.app_plans FOR SELECT
  TO authenticated, anon
  USING (is_active = true);


-- ================================================================
-- STEP 3: SET show_on_homepage = true FOR STANDARD PLANS
-- (Basic, Standard, Enterprise always visible on billing page)
-- ================================================================
UPDATE core.app_plans
SET features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{show_on_homepage}',
    'true'::jsonb
)
WHERE LOWER(name) IN ('basic', 'standard', 'enterprise');

-- VIP_PLAN is hidden from normal users (admin-only assignment)
UPDATE core.app_plans
SET features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{show_on_homepage}',
    'false'::jsonb
)
WHERE LOWER(name) IN ('vip_plan', 'vip');


-- ================================================================
-- STEP 4: ADD global_trial_days TO core.app_settings
-- This is the "Trial Period Configuration" the super admin controls
-- ================================================================
CREATE TABLE IF NOT EXISTS core.app_settings (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID
);

GRANT SELECT ON core.app_settings TO authenticated;
GRANT ALL ON core.app_settings TO service_role;

-- Insert default trial period (14 days) — super admin can change this
INSERT INTO core.app_settings (key, value)
VALUES ('global_trial_days', '14')
ON CONFLICT (key) DO NOTHING;


-- ================================================================
-- STEP 5: FUNCTION — auto_create_trial_subscription
-- Called by trigger on new organization creation
-- Creates a trial subscription using the global_trial_days setting
-- ================================================================
CREATE OR REPLACE FUNCTION core.auto_create_trial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_trial_days    INTEGER;
    v_basic_plan_id UUID;
BEGIN
    -- Get global trial days from settings (default = 14)
    SELECT COALESCE((value::text)::integer, 14)
    INTO v_trial_days
    FROM core.app_settings
    WHERE key = 'global_trial_days';

    v_trial_days := COALESCE(v_trial_days, 14);

    -- Find the lowest-tier active plan (Basic) as the trial plan
    SELECT id INTO v_basic_plan_id
    FROM core.app_plans
    WHERE LOWER(name) IN ('basic', 'starter', 'free')
      AND is_active = true
    ORDER BY price_monthly ASC
    LIMIT 1;

    -- Fall back to cheapest plan if basic not found
    IF v_basic_plan_id IS NULL THEN
        SELECT id INTO v_basic_plan_id
        FROM core.app_plans
        WHERE is_active = true
        ORDER BY price_monthly ASC
        LIMIT 1;
    END IF;

    -- Only create if no subscription already exists for this org
    IF NOT EXISTS (
        SELECT 1 FROM core.subscriptions WHERE organization_id = NEW.id
    ) THEN
        INSERT INTO core.subscriptions (
            organization_id,
            plan_id,
            status,
            plan_interval,
            trial_starts_at,
            trial_ends_at,
            trial_converted,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            v_basic_plan_id,
            'trialing',
            'trial',
            NOW(),
            NOW() + (v_trial_days || ' days')::INTERVAL,
            false,
            NOW(),
            NOW()
        );

        -- Also set trial_ends_at on the org itself for quick access
        UPDATE core.organizations
        SET trial_ends_at = NOW() + (v_trial_days || ' days')::INTERVAL,
            status = 'trial',
            subscription_tier = 'basic'
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- Attach trigger to organizations table
DROP TRIGGER IF EXISTS trg_auto_create_trial ON core.organizations;
CREATE TRIGGER trg_auto_create_trial
    AFTER INSERT ON core.organizations
    FOR EACH ROW
    EXECUTE FUNCTION core.auto_create_trial_subscription();


-- ================================================================
-- STEP 6: ADMIN RPC — admin_set_global_trial_days
-- Super admin sets how many trial days new orgs get
-- ================================================================
CREATE OR REPLACE FUNCTION core.admin_set_global_trial_days(p_days INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is super admin
    IF NOT EXISTS (
        SELECT 1 FROM core.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Super admin only';
    END IF;

    INSERT INTO core.app_settings (key, value, updated_at, updated_by)
    VALUES ('global_trial_days', p_days::text::jsonb, NOW(), auth.uid())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW(),
        updated_by = auth.uid();

    RETURN jsonb_build_object('success', true, 'trial_days', p_days);
END;
$$;

GRANT EXECUTE ON FUNCTION core.admin_set_global_trial_days(integer) TO authenticated;


-- ================================================================
-- STEP 7: ADMIN RPC — admin_extend_subscription
-- Super admin can extend trial or paid subscription expiry date
-- ================================================================
CREATE OR REPLACE FUNCTION core.admin_extend_subscription(
    p_organization_id UUID,
    p_new_expiry_date DATE,         -- Set absolute expiry date
    p_extend_days INTEGER DEFAULT 0, -- OR add days to current expiry
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_sub RECORD;
    v_final_expiry TIMESTAMPTZ;
BEGIN
    -- Verify caller is super admin
    IF NOT EXISTS (
        SELECT 1 FROM core.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Super admin only';
    END IF;

    SELECT * INTO v_sub FROM core.subscriptions WHERE organization_id = p_organization_id LIMIT 1;

    IF v_sub IS NULL THEN
        RAISE EXCEPTION 'No subscription found for org %', p_organization_id;
    END IF;

    -- Calculate final expiry
    IF p_extend_days > 0 THEN
        -- Extend from current expiry
        v_final_expiry := COALESCE(
            v_sub.trial_ends_at,
            v_sub.current_period_end,
            NOW()
        ) + (p_extend_days || ' days')::INTERVAL;
    ELSIF p_new_expiry_date IS NOT NULL THEN
        v_final_expiry := p_new_expiry_date::TIMESTAMPTZ;
    ELSE
        RAISE EXCEPTION 'Must provide either p_new_expiry_date or p_extend_days > 0';
    END IF;

    -- Update subscription
    UPDATE core.subscriptions
    SET
        trial_ends_at = CASE WHEN status IN ('trialing', 'trial') THEN v_final_expiry ELSE trial_ends_at END,
        current_period_end = CASE WHEN status = 'active' THEN v_final_expiry ELSE current_period_end END,
        admin_notes = p_admin_notes,
        admin_assigned_by = auth.uid(),
        updated_at = NOW()
    WHERE organization_id = p_organization_id;

    -- Update org level trial_ends_at for quick access
    UPDATE core.organizations
    SET trial_ends_at = v_final_expiry
    WHERE id = p_organization_id;

    -- Log the action
    INSERT INTO core.subscription_events (
        organization_id, subscription_id, event_type,
        triggered_by, admin_user_id, metadata
    ) VALUES (
        p_organization_id, v_sub.id, 'admin.expiry_extended',
        'admin', auth.uid(),
        jsonb_build_object(
            'new_expiry', v_final_expiry,
            'extend_days', p_extend_days,
            'notes', p_admin_notes
        )
    );

    RETURN jsonb_build_object('success', true, 'new_expiry', v_final_expiry);
END;
$$;

GRANT EXECUTE ON FUNCTION core.admin_extend_subscription(uuid, date, integer, text) TO authenticated;


-- ================================================================
-- STEP 8: ADMIN RPC — admin_assign_plan
-- Super admin upgrades/downgrades a tenant to a specific plan
-- ================================================================
CREATE OR REPLACE FUNCTION core.admin_assign_plan(
    p_organization_id UUID,
    p_plan_id UUID,
    p_interval TEXT DEFAULT 'monthly', -- monthly | yearly | lifetime
    p_new_expiry_date DATE DEFAULT NULL,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_expiry TIMESTAMPTZ;
BEGIN
    -- Verify super admin
    IF NOT EXISTS (
        SELECT 1 FROM core.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Super admin only';
    END IF;

    SELECT * INTO v_plan FROM core.app_plans WHERE id = p_plan_id AND is_active = true;
    IF v_plan IS NULL THEN
        RAISE EXCEPTION 'Plan not found or inactive: %', p_plan_id;
    END IF;

    SELECT * INTO v_sub FROM core.subscriptions WHERE organization_id = p_organization_id LIMIT 1;

    -- Calculate expiry based on interval
    v_expiry := CASE
        WHEN p_new_expiry_date IS NOT NULL THEN p_new_expiry_date::TIMESTAMPTZ
        WHEN p_interval = 'yearly' OR p_interval = 'annual' THEN NOW() + INTERVAL '1 year'
        WHEN p_interval = 'lifetime' THEN NOW() + INTERVAL '100 years'
        ELSE NOW() + INTERVAL '1 month'
    END;

    IF v_sub IS NULL THEN
        -- Create new subscription
        INSERT INTO core.subscriptions (
            organization_id, plan_id, status, plan_interval,
            current_period_start, current_period_end,
            trial_converted, admin_assigned_by, admin_notes,
            created_at, updated_at
        ) VALUES (
            p_organization_id, p_plan_id, 'active', p_interval,
            NOW(), v_expiry,
            true, auth.uid(), p_admin_notes,
            NOW(), NOW()
        ) RETURNING * INTO v_sub;
    ELSE
        -- Update existing subscription
        UPDATE core.subscriptions
        SET
            plan_id = p_plan_id,
            status = 'active',
            plan_interval = p_interval,
            current_period_start = NOW(),
            current_period_end = v_expiry,
            trial_converted = true,
            admin_assigned_by = auth.uid(),
            admin_notes = p_admin_notes,
            updated_at = NOW()
        WHERE organization_id = p_organization_id;
    END IF;

    -- Update organization subscription_tier
    UPDATE core.organizations
    SET
        subscription_tier = v_plan.name,
        status = 'active',
        is_active = true,
        trial_ends_at = v_expiry
    WHERE id = p_organization_id;

    -- Log the event
    INSERT INTO core.subscription_events (
        organization_id, subscription_id, event_type,
        old_plan_id, new_plan_id,
        triggered_by, admin_user_id, metadata
    ) VALUES (
        p_organization_id, v_sub.id, 'admin.plan_assigned',
        v_sub.plan_id, p_plan_id,
        'admin', auth.uid(),
        jsonb_build_object(
            'plan_name', v_plan.name,
            'interval', p_interval,
            'expiry', v_expiry,
            'notes', p_admin_notes
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'plan', v_plan.name,
        'status', 'active',
        'expiry', v_expiry
    );
END;
$$;

GRANT EXECUTE ON FUNCTION core.admin_assign_plan(uuid, uuid, text, date, text) TO authenticated;
