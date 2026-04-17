-- Migration: 20260421_fix_app_settings_json_parsing.sql
-- Goal: Fix integer parsing errors when reading core.app_settings JSONB values
--       and ensure consistent JSON structure for trial day settings.

-- ============================================================
-- 1. NORMALIZE EXISTING SETTINGS
--    Ensure all key/value pairs follow the {"value": ...} pattern
-- ============================================================
UPDATE core.app_settings
SET value = jsonb_build_object('value', (CASE 
    WHEN jsonb_typeof(value) = 'object' AND value ? 'value' THEN (value->>'value')
    ELSE value::text 
END))
WHERE key IN ('global_trial_days', 'grace_period_days_monthly', 'grace_period_days_yearly');

-- ============================================================
-- 2. FIX auto_create_trial_subscription Trigger Function
--    - Use value->>'value' to extract the integer correctly
-- ============================================================
CREATE OR REPLACE FUNCTION core.auto_create_trial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_trial_days    INTEGER;
    v_basic_plan_id UUID;
BEGIN
    -- Get global trial days from settings (default = 14)
    -- Fix: Correctly extract 'value' from JSONB and cast to integer
    SELECT COALESCE((value->>'value')::integer, 14)
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
            'trial',             -- normalized to 'trial'
            'monthly',           -- normalized to 'monthly'
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
            subscription_tier = 'basic',
            is_active = true    -- Fix: Ensure org is active
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================
-- 3. FIX admin_set_global_trial_days RPC
--    - Store the value in {"value": X} format
-- ============================================================
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

    -- Fix: Store as {"value": p_days}
    INSERT INTO core.app_settings (key, value, updated_at, updated_by)
    VALUES ('global_trial_days', jsonb_build_object('value', p_days), NOW(), auth.uid())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW(),
        updated_by = auth.uid();

    RETURN jsonb_build_object('success', true, 'trial_days', p_days);
END;
$$;

