-- Migration: Fix generate alerts and get_subscription_state

-- 1. Remove the CAPACITY_WARNING from generate_automated_alerts
CREATE OR REPLACE FUNCTION core.generate_automated_alerts()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    v_days_left INT;
BEGIN
    -- 1. Trial Expiry Alerts (7, 3, 1 days)
    FOR rec IN 
        SELECT s.organization_id, s.trial_ends_at, o.name as org_name, s.id as sub_id
        FROM core.subscriptions s
        JOIN core.organizations o ON s.organization_id = o.id
        WHERE s.status = 'trial' AND s.trial_ends_at IS NOT NULL
    LOOP
        v_days_left := EXTRACT(DAY FROM (rec.trial_ends_at - now()))::INT;
        
        IF v_days_left IN (7, 3, 1) THEN
            INSERT INTO core.system_alerts (organization_id, alert_type, severity, message, domain)
            SELECT rec.organization_id, 'TRIAL_EXPIRY_' || v_days_left, 'warning', 
                   'Your free trial for ' || rec.org_name || ' expires in ' || v_days_left || ' days. Please upgrade to avoid disruption.',
                   'core'
            WHERE NOT EXISTS (
                SELECT 1 FROM core.system_alerts 
                WHERE organization_id = rec.organization_id 
                AND alert_type = 'TRIAL_EXPIRY_' || v_days_left
                AND created_at > now() - interval '24 hours'
            );
        ELSIF v_days_left <= 0 THEN
            INSERT INTO core.system_alerts (organization_id, alert_type, severity, message, domain)
            SELECT rec.organization_id, 'TRIAL_EXPIRED', 'critical', 
                   'Your free trial has expired. Access will be limited until a subscription is active.',
                   'core'
            WHERE NOT EXISTS (
                SELECT 1 FROM core.system_alerts 
                WHERE organization_id = rec.organization_id 
                AND alert_type = 'TRIAL_EXPIRED'
                AND created_at > now() - interval '24 hours'
            );
        END IF;
    END LOOP;

    -- 2. Subscription Renewal Reminders (Active status)
    FOR rec IN 
        SELECT s.organization_id, s.current_period_end, o.name as org_name
        FROM core.subscriptions s
        JOIN core.organizations o ON s.organization_id = o.id
        WHERE s.status = 'active' AND s.current_period_end IS NOT NULL
    LOOP
        v_days_left := EXTRACT(DAY FROM (rec.current_period_end - now()))::INT;
        
        IF v_days_left IN (7, 3, 1) THEN
            INSERT INTO core.system_alerts (organization_id, alert_type, severity, message, domain)
            SELECT rec.organization_id, 'SUBSCRIPTION_RENEWAL_' || v_days_left, 'info', 
                   'Subscription for ' || rec.org_name || ' renews in ' || v_days_left || ' days.',
                   'core'
            WHERE NOT EXISTS (
                SELECT 1 FROM core.system_alerts 
                WHERE organization_id = rec.organization_id 
                AND alert_type = 'SUBSCRIPTION_RENEWAL_' || v_days_left
                AND created_at > now() - interval '24 hours'
            );
        END IF;
    END LOOP;

    -- The Plan Capacity Monitoring has been removed to respect tenant limitations without false positive alerts.
END;
$$;

-- 2. Clear out any existing CAPACITY WARNING alerts to immediately vanish them for clients
DELETE FROM core.system_alerts WHERE alert_type = 'CAPACITY_WARNING';

-- 3. Fix get_subscription_state to merge plan menus with organization override menus
CREATE OR REPLACE FUNCTION core.get_subscription_state(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_sub    core.subscriptions%ROWTYPE;
  v_plan   core.app_plans%ROWTYPE;
  v_org    core.organizations%ROWTYPE;
  v_days   integer;
  v_result jsonb;
  v_merged_menus text[];
BEGIN
  SELECT * INTO v_org  FROM core.organizations  WHERE id = p_org_id;
  SELECT * INTO v_sub  FROM core.subscriptions  WHERE organization_id = p_org_id LIMIT 1;
  SELECT * INTO v_plan FROM core.app_plans      WHERE id = v_sub.plan_id LIMIT 1;

  -- Calculate trial days remaining
  IF v_sub.trial_ends_at IS NOT NULL THEN
    v_days := GREATEST(0, EXTRACT(DAY FROM v_sub.trial_ends_at - now())::integer);
  ELSE
    v_days := NULL;
  END IF;

  -- Merge v_plan.allowed_menus and v_org.enabled_modules
  SELECT ARRAY(
      SELECT DISTINCT elem FROM (
          SELECT jsonb_array_elements_text(COALESCE(v_plan.allowed_menus, '[]'::jsonb)) as elem
          UNION
          SELECT unnest(COALESCE(v_org.enabled_modules, ARRAY[]::text[])) as elem
      ) sub
  ) INTO v_merged_menus;

  v_result := jsonb_build_object(
    'status',               COALESCE(v_sub.status, 'none'),
    'plan_id',              v_plan.id,
    'plan_name',            COALESCE(v_plan.display_name, v_plan.name),
    'plan_interval',        COALESCE(v_sub.plan_interval, v_sub.billing_cycle, 'monthly'),
    'trial_days_remaining', v_days,
    'trial_ends_at',        v_sub.trial_ends_at,
    'current_period_end',   v_sub.current_period_end,
    'grace_period_end',     v_sub.grace_period_end,
    'cancel_at_period_end', COALESCE(v_sub.cancel_at_period_end, false),
    'allowed_menus',        array_to_json(v_merged_menus)::jsonb,
    'features', jsonb_build_object(
      'advanced_reports',    COALESCE(v_plan.feature_advanced_reports, false),
      'multi_location',      COALESCE(v_plan.feature_multi_location, false),
      'api_access',          COALESCE(v_plan.feature_api_access, false),
      'bulk_import',         COALESCE(v_plan.feature_bulk_import, false),
      'custom_fields',       COALESCE(v_plan.feature_custom_fields, false),
      'audit_logs',          COALESCE(v_plan.feature_audit_logs, false),
      'tds_management',      COALESCE(v_plan.feature_tds_management, false),
      'whatsapp_alerts',     COALESCE(v_plan.feature_whatsapp_alerts, false),
      'priority_support',    COALESCE(v_plan.feature_priority_support, false),
      'data_export',         COALESCE(v_plan.feature_data_export, true),
      'gst_reports',         COALESCE(v_plan.feature_gst_reports, true),
      'white_label',         COALESCE(v_plan.feature_white_label, false)
    ),
    'limits', jsonb_build_object(
      'max_users',                   COALESCE(v_org.max_web_users, v_plan.max_web_users, 2),
      'max_mobile_users',            COALESCE(v_org.max_mobile_users, v_plan.max_mobile_users, 0),
      'max_commodities',             COALESCE(v_plan.max_commodities, 50),
      'max_transactions_per_month',  COALESCE(v_plan.max_transactions_per_month, 500),
      'max_storage_mb',              COALESCE(v_plan.max_storage_mb, 500)
    )
  );

  RETURN v_result;
END;
$$;
