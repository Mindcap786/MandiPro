-- Migration: 20260418_fix_org_provisioning_triggers.sql
-- Description: Fixes the three trigger bugs that cause newly-provisioned orgs
--              to appear as "Suspended" immediately after creation.
--
-- Root causes fixed:
-- 1. Duplicate subscription-creation triggers (trg_auto_trial + trg_auto_trial_subscription
--    both call the same function as trg_auto_create_trial — keep only one)
-- 2. auto_create_trial_subscription used status='trialing' instead of 'trial'
-- 3. sync_org_subscription_status never set is_active — orgs stayed false
-- 4. Normalize all existing orgs with status='trialing' to status='trial' + is_active=true

-- ============================================================
-- 1. DROP DUPLICATE SUBSCRIPTION-CREATION TRIGGERS
--    Keep only trg_auto_create_trial (the most complete one)
-- ============================================================
DROP TRIGGER IF EXISTS trg_auto_trial            ON core.organizations;
DROP TRIGGER IF EXISTS trg_auto_trial_subscription ON core.organizations;

-- ============================================================
-- 2. FIX auto_create_trial_subscription
--    - Use status='trial' not 'trialing'
--    - Set is_active=true when updating the org
-- ============================================================
CREATE OR REPLACE FUNCTION core.auto_create_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_trial_days    INTEGER;
    v_basic_plan_id UUID;
BEGIN
    -- Get global trial days from settings (default = 14)
    SELECT COALESCE((value::text)::integer, 14)
    INTO v_trial_days
    FROM core.app_settings
    WHERE key = 'global_trial_days'
    LIMIT 1;

    v_trial_days := COALESCE(v_trial_days, 14);

    -- Find the basic/starter plan
    SELECT id INTO v_basic_plan_id
    FROM core.app_plans
    WHERE LOWER(name) IN ('basic', 'starter', 'free') AND is_active = true
    ORDER BY price_monthly ASC LIMIT 1;

    -- Fallback to cheapest plan
    IF v_basic_plan_id IS NULL THEN
        SELECT id INTO v_basic_plan_id
        FROM core.app_plans
        WHERE is_active = true
        ORDER BY price_monthly ASC LIMIT 1;
    END IF;

    -- Only create if no subscription already exists for this org
    IF NOT EXISTS (SELECT 1 FROM core.subscriptions WHERE organization_id = NEW.id) THEN
        INSERT INTO core.subscriptions (
            organization_id, plan_id, status, plan_interval,
            billing_cycle, trial_starts_at, trial_ends_at,
            trial_converted, created_at, updated_at
        ) VALUES (
            NEW.id, v_basic_plan_id,
            'trial',             -- was 'trialing' — fixed
            'monthly',           -- was 'trial' — fixed
            'monthly',
            NOW(),
            NOW() + (v_trial_days || ' days')::INTERVAL,
            false, NOW(), NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================
-- 3. FIX sync_org_subscription_status
--    - Also set is_active based on subscription status
--    - Normalize 'trialing' → 'trial' when syncing to org
-- ============================================================
CREATE OR REPLACE FUNCTION core.sync_org_subscription_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_plan_name   TEXT;
    v_max_web     INT;
    v_max_mobile  INT;
    v_org_status  TEXT;
    v_is_active   BOOLEAN;
BEGIN
    -- Fetch plan defaults
    SELECT name, max_web_users, max_mobile_users
    INTO v_plan_name, v_max_web, v_max_mobile
    FROM core.app_plans WHERE id = NEW.plan_id;

    -- Normalize 'trialing' → 'trial' on the org (keep internal sub status as-is)
    v_org_status := CASE NEW.status
        WHEN 'trialing'  THEN 'trial'
        WHEN 'trial'     THEN 'trial'
        WHEN 'active'    THEN 'active'
        WHEN 'past_due'  THEN 'active'   -- grace window: org still usable
        ELSE NEW.status
    END;

    -- is_active = true for trial, active, past_due; false for suspended/cancelled/expired
    v_is_active := NEW.status IN ('trialing', 'trial', 'active', 'past_due');

    UPDATE core.organizations SET
        status       = v_org_status,
        is_active    = v_is_active,
        trial_ends_at = COALESCE(NEW.trial_ends_at, NEW.current_period_end),
        subscription_tier = COALESCE(v_plan_name, subscription_tier),
        max_web_users    = COALESCE(NEW.max_web_users, v_max_web, max_web_users),
        max_mobile_users = COALESCE(NEW.max_mobile_users, v_max_mobile, max_mobile_users)
    WHERE id = NEW.organization_id;

    RETURN NEW;
END;
$$;

-- ============================================================
-- 4. FIX PROVISION ROUTE: after triggers auto-create the
--    subscription, update it with the actual selected plan
--    instead of creating a duplicate.
--    (The provision route code is updated separately.)
-- ============================================================

-- ============================================================
-- 5. NORMALIZE ALL EXISTING ORGS
--    Any org with status='trialing' → 'trial', is_active=true
-- ============================================================
UPDATE core.organizations
SET status = 'trial', is_active = true
WHERE status = 'trialing';

-- Also fix any orgs that have trial_ends_at in the future but is_active=false
UPDATE core.organizations
SET is_active = true
WHERE status IN ('trial', 'trialing', 'active')
  AND is_active = false;

-- Normalize all subscriptions: 'trialing' → 'trial'
UPDATE core.subscriptions
SET status = 'trial', plan_interval = 'monthly'
WHERE status = 'trialing';
