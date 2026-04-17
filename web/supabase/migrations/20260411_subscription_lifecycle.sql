-- ============================================================
-- MandiGrow Enterprise — Subscription Lifecycle Extension
-- Migration: 20260411_subscription_lifecycle.sql
-- Adds on TOP of existing schema — zero breaking changes
-- ============================================================

-- ╔══════════════════════════════════════════════════════╗
-- ║  PART 1: Extend core.app_plans with feature flags   ║
-- ╚══════════════════════════════════════════════════════╝

ALTER TABLE core.app_plans
  ADD COLUMN IF NOT EXISTS trial_days               integer     DEFAULT 14,
  ADD COLUMN IF NOT EXISTS allowed_menus            jsonb       DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_advanced_reports boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_multi_location   boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_api_access       boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_bulk_import      boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_custom_fields    boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_audit_logs       boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_tds_management   boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_whatsapp_alerts  boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_priority_support boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_data_export      boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_gst_reports      boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_white_label      boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_commodities          integer     DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_locations            integer     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_transactions_per_month integer   DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_storage_mb           integer     DEFAULT 500;

-- Update existing plan records with menus and feature flags
UPDATE core.app_plans
SET
  trial_days = 14,
  feature_gst_reports   = true,
  feature_data_export   = true,
  feature_audit_logs    = false,
  feature_tds_management = false,
  feature_advanced_reports = false,
  feature_multi_location   = false,
  feature_whatsapp_alerts  = false,
  feature_bulk_import      = false,
  feature_api_access       = false,
  feature_priority_support = false,
  allowed_menus = '["dashboard","stock","parties","finance","reports","settings"]'::jsonb
WHERE name ILIKE '%basic%' OR name ILIKE '%starter%' OR name ILIKE '%free%';

UPDATE core.app_plans
SET
  trial_days = 14,
  feature_gst_reports      = true,
  feature_data_export      = true,
  feature_audit_logs       = true,
  feature_tds_management   = true,
  feature_advanced_reports = true,
  feature_multi_location   = false,
  feature_whatsapp_alerts  = true,
  feature_bulk_import      = true,
  feature_api_access       = false,
  feature_priority_support = false,
  allowed_menus = '["dashboard","stock","parties","finance","reports","settings","import","alerts"]'::jsonb
WHERE name ILIKE '%standard%' OR name ILIKE '%growth%' OR name ILIKE '%silver%' OR name ILIKE '%gold%';

UPDATE core.app_plans
SET
  trial_days = 14,
  feature_gst_reports      = true,
  feature_data_export      = true,
  feature_audit_logs       = true,
  feature_tds_management   = true,
  feature_advanced_reports = true,
  feature_multi_location   = true,
  feature_whatsapp_alerts  = true,
  feature_bulk_import      = true,
  feature_api_access       = true,
  feature_priority_support = true,
  feature_white_label      = true,
  feature_custom_fields    = true,
  allowed_menus = '["dashboard","stock","parties","finance","reports","settings","import","alerts","api","white-label","custom-fields","audit-logs"]'::jsonb
WHERE name ILIKE '%enterprise%' OR name ILIKE '%premium%' OR name ILIKE '%platinum%';


-- ╔══════════════════════════════════════════════════════╗
-- ║  PART 2: Extend core.subscriptions                  ║
-- ╚══════════════════════════════════════════════════════╝

-- Extend status values to support full lifecycle
ALTER TABLE core.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE core.subscriptions
  ADD CONSTRAINT subscriptions_status_check CHECK (
    status IN (
      'trialing',        -- Free trial active
      'trial_expired',   -- Trial ended, payment not made
      'active',          -- Paid and current
      'past_due',        -- Payment failed, Razorpay retrying
      'grace_period',    -- Payment still outstanding, 7-day window
      'soft_locked',     -- Grace expired, reads only / writes blocked
      'cancelled',       -- Cancelled, access till period_end
      'expired',         -- Fully expired
      'admin_suspended', -- Manually suspended by super admin
      'admin_gifted',    -- Admin grant / free plan
      -- Legacy values (compatibility with existing data)
      'suspended',
      'trial',
      'grace'
    )
  );

-- Add new lifecycle columns
ALTER TABLE core.subscriptions
  ADD COLUMN IF NOT EXISTS plan_interval          text        DEFAULT 'monthly'
    CHECK (plan_interval IN ('monthly', 'yearly', 'annual', 'trial', 'lifetime')),
  ADD COLUMN IF NOT EXISTS trial_converted        boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_starts_at        timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS grace_period_start     timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_end       timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_plan_id      uuid        REFERENCES core.app_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_interval     text,
  ADD COLUMN IF NOT EXISTS scheduled_change_at    timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end   boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at           timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason    text,
  ADD COLUMN IF NOT EXISTS admin_assigned_by      uuid,
  ADD COLUMN IF NOT EXISTS admin_notes            text,
  ADD COLUMN IF NOT EXISTS override_trial_days    integer,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at  timestamptz;


-- ╔══════════════════════════════════════════════════════╗
-- ║  PART 3: subscription_events (immutable audit log)  ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS core.subscription_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL,
  subscription_id   uuid,
  event_type        text        NOT NULL,
  gateway_event_id  text        UNIQUE,  -- idempotency key
  old_status        text,
  new_status        text,
  old_plan_id       uuid,
  new_plan_id       uuid,
  amount            numeric,
  currency          text        DEFAULT 'INR',
  triggered_by      text        DEFAULT 'system',
      -- system_cron | webhook | admin | user
  admin_user_id     uuid,
  metadata          jsonb       DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now()
);

-- Append-only policy: no UPDATE or DELETE
CREATE OR REPLACE RULE subscription_events_no_update AS
  ON UPDATE TO core.subscription_events DO INSTEAD NOTHING;

CREATE OR REPLACE RULE subscription_events_no_delete AS
  ON DELETE TO core.subscription_events DO INSTEAD NOTHING;

-- RLS
ALTER TABLE core.subscription_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_members_read_own_events" ON core.subscription_events;
CREATE POLICY "org_members_read_own_events"
  ON core.subscription_events FOR SELECT
  USING (organization_id::text = (auth.jwt()->>'org_id'));

-- Index for fast org lookups
CREATE INDEX IF NOT EXISTS idx_sub_events_org_id ON core.subscription_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_type   ON core.subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sub_events_created ON core.subscription_events(created_at DESC);


-- ╔══════════════════════════════════════════════════════╗
-- ║  PART 4: plan_access_logs (upgrade analytics)       ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS core.plan_access_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  user_id          uuid,
  feature_key      text        NOT NULL,
  plan_required    text,
  current_plan     text,
  accessed_at      timestamptz DEFAULT now()
);

ALTER TABLE core.plan_access_logs ENABLE ROW LEVEL SECURITY;
-- Service role only — analytics data, not tenant-readable
CREATE INDEX IF NOT EXISTS idx_pal_org_id    ON core.plan_access_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_pal_feature   ON core.plan_access_logs(feature_key);
CREATE INDEX IF NOT EXISTS idx_pal_accessed  ON core.plan_access_logs(accessed_at DESC);


-- ╔══════════════════════════════════════════════════════╗
-- ║  PART 5: webhook_events (idempotency dedup table)   ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS core.webhook_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway         text        NOT NULL,   -- razorpay | stripe | smepay
  event_id        text        NOT NULL UNIQUE,
  event_type      text        NOT NULL,
  organization_id uuid,
  status          text        DEFAULT 'processed',
      -- processed | failed | skipped | duplicate
  payload         jsonb,
  error_message   text,
  received_at     timestamptz DEFAULT now(),
  processed_at    timestamptz
);

ALTER TABLE core.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_wh_events_gateway ON core.webhook_events(gateway);
CREATE INDEX IF NOT EXISTS idx_wh_events_status  ON core.webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_wh_events_recv    ON core.webhook_events(received_at DESC);


-- ╔══════════════════════════════════════════════════════╗
-- ║  PART 6: Key Postgres Functions                     ║
-- ╚══════════════════════════════════════════════════════╝

-- FUNCTION: get_subscription_state
-- Returns full subscription state for an org — used for JWT claim injection
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
    'allowed_menus',        COALESCE(v_plan.allowed_menus, '[]'::jsonb),
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

-- FUNCTION: check_feature
CREATE OR REPLACE FUNCTION core.check_feature(p_org_id uuid, p_feature_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_state jsonb;
BEGIN
  v_state := core.get_subscription_state(p_org_id);
  RETURN COALESCE((v_state->'features'->>p_feature_key)::boolean, false);
END;
$$;

-- FUNCTION: check_menu_access
CREATE OR REPLACE FUNCTION core.check_menu_access(p_org_id uuid, p_route_prefix text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_state jsonb;
  v_menu  text;
BEGIN
  v_state := core.get_subscription_state(p_org_id);
  -- Check if any allowed menu prefix matches
  FOR v_menu IN SELECT jsonb_array_elements_text(v_state->'allowed_menus')
  LOOP
    IF p_route_prefix LIKE v_menu || '%' THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- FUNCTION: expire_trials (called by pg_cron)
CREATE OR REPLACE FUNCTION core.expire_trials()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sub   record;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.organization_id, s.status
    FROM core.subscriptions s
    WHERE s.status IN ('trialing', 'trial')
      AND s.trial_ends_at < now()
      AND COALESCE(s.trial_converted, false) = false
  LOOP
    UPDATE core.subscriptions
    SET status = 'trial_expired',
        updated_at = now()
    WHERE id = v_sub.id;

    -- Log event
    INSERT INTO core.subscription_events (
      organization_id, subscription_id, event_type,
      old_status, new_status, triggered_by
    ) VALUES (
      v_sub.organization_id, v_sub.id, 'trial.expired',
      v_sub.status, 'trial_expired', 'system_cron'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- FUNCTION: send_trial_reminders (called by pg_cron daily)
CREATE OR REPLACE FUNCTION core.send_trial_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count  integer := 0;
  v_sub    record;
  v_days   integer;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.organization_id, s.trial_ends_at
    FROM core.subscriptions s
    WHERE s.status IN ('trialing', 'trial')
      AND s.trial_ends_at > now()
      AND COALESCE(s.trial_converted, false) = false
  LOOP
    v_days := EXTRACT(DAY FROM v_sub.trial_ends_at - now())::integer;

    -- Send reminder on days 7, 3, 1
    IF v_days IN (7, 3, 1, 0) THEN
      -- Only send if not sent today
      IF NOT EXISTS (
        SELECT 1 FROM core.subscription_events
        WHERE subscription_id = v_sub.id
          AND event_type = 'trial.reminder_sent'
          AND metadata->>'days_left' = v_days::text
          AND created_at > now() - interval '20 hours'
      ) THEN
        INSERT INTO core.subscription_events (
          organization_id, subscription_id, event_type,
          triggered_by, metadata
        ) VALUES (
          v_sub.organization_id, v_sub.id, 'trial.reminder_sent',
          'system_cron', jsonb_build_object('days_left', v_days)
        );

        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- FUNCTION: expire_grace_periods (called by pg_cron hourly)
CREATE OR REPLACE FUNCTION core.expire_grace_periods()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sub   record;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.organization_id
    FROM core.subscriptions s
    WHERE s.status = 'grace_period'
      AND s.grace_period_end < now()
  LOOP
    UPDATE core.subscriptions
    SET status = 'soft_locked',
        updated_at = now()
    WHERE id = v_sub.id;

    -- Also update org
    UPDATE core.organizations
    SET status = 'suspended',
        is_active = false
    WHERE id = v_sub.organization_id;

    INSERT INTO core.subscription_events (
      organization_id, subscription_id, event_type,
      old_status, new_status, triggered_by
    ) VALUES (
      v_sub.organization_id, v_sub.id, 'lock.soft_started',
      'grace_period', 'soft_locked', 'system_cron'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- FUNCTION: apply_scheduled_changes (downgrades — called by pg_cron daily at midnight)
CREATE OR REPLACE FUNCTION core.apply_scheduled_changes()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sub   record;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.organization_id, s.plan_id, s.scheduled_plan_id, s.scheduled_interval
    FROM core.subscriptions s
    WHERE s.scheduled_change_at IS NOT NULL
      AND s.scheduled_change_at <= now()
      AND s.scheduled_plan_id IS NOT NULL
  LOOP
    UPDATE core.subscriptions
    SET plan_id             = v_sub.scheduled_plan_id,
        plan_interval       = v_sub.scheduled_interval,
        scheduled_plan_id   = NULL,
        scheduled_interval  = NULL,
        scheduled_change_at = NULL,
        updated_at          = now()
    WHERE id = v_sub.id;

    -- Update org tier
    UPDATE core.organizations
    SET subscription_tier = (SELECT name FROM core.app_plans WHERE id = v_sub.scheduled_plan_id)
    WHERE id = v_sub.organization_id;

    INSERT INTO core.subscription_events (
      organization_id, subscription_id, event_type,
      old_plan_id, new_plan_id, triggered_by
    ) VALUES (
      v_sub.organization_id, v_sub.id, 'subscription.downgraded',
      v_sub.plan_id, v_sub.scheduled_plan_id, 'system_cron'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- FUNCTION: expire_subscriptions (cancelled → expired at period end)
CREATE OR REPLACE FUNCTION core.expire_subscriptions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sub   record;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.organization_id
    FROM core.subscriptions s
    WHERE s.status = 'cancelled'
      AND s.current_period_end < now()
  LOOP
    UPDATE core.subscriptions
    SET status = 'expired',
        updated_at = now()
    WHERE id = v_sub.id;

    UPDATE core.organizations
    SET status = 'suspended',
        is_active = false
    WHERE id = v_sub.organization_id;

    INSERT INTO core.subscription_events (
      organization_id, subscription_id, event_type,
      old_status, new_status, triggered_by
    ) VALUES (
      v_sub.organization_id, v_sub.id, 'subscription.expired',
      'cancelled', 'expired', 'system_cron'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- FUNCTION: send_renewal_reminders
CREATE OR REPLACE FUNCTION core.send_renewal_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sub   record;
  v_days  integer;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.organization_id, s.current_period_end
    FROM core.subscriptions s
    WHERE s.status = 'active'
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > now()
      AND s.current_period_end < now() + interval '8 days'
  LOOP
    v_days := EXTRACT(DAY FROM v_sub.current_period_end - now())::integer;

    IF v_days IN (7, 3, 1) THEN
      IF NOT EXISTS (
        SELECT 1 FROM core.subscription_events
        WHERE subscription_id = v_sub.id
          AND event_type = 'renewal.reminder_sent'
          AND metadata->>'days_left' = v_days::text
          AND created_at > now() - interval '20 hours'
      ) THEN
        INSERT INTO core.subscription_events (
          organization_id, subscription_id, event_type,
          triggered_by, metadata
        ) VALUES (
          v_sub.organization_id, v_sub.id, 'renewal.reminder_sent',
          'system_cron', jsonb_build_object('days_left', v_days)
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ╔══════════════════════════════════════════════════════╗
-- ║  PART 7: pg_cron Jobs                               ║
-- ╚══════════════════════════════════════════════════════╝
-- NOTE: pg_cron must be enabled in Supabase (Settings → Database → Extensions)

-- Remove existing jobs with same names (idempotent)
SELECT cron.unschedule('expire_trials')          WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_trials');
SELECT cron.unschedule('send_trial_reminders')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_trial_reminders');
SELECT cron.unschedule('expire_grace_periods')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_grace_periods');
SELECT cron.unschedule('apply_scheduled_changes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'apply_scheduled_changes');
SELECT cron.unschedule('expire_subscriptions')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_subscriptions');
SELECT cron.unschedule('send_renewal_reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_renewal_reminders');

-- Schedule all jobs
-- Expire trials: every hour (catches midnight IST)
SELECT cron.schedule('expire_trials',           '0 * * * *',     'SELECT core.expire_trials()');
-- Send trial reminders: 9 AM IST = 3:30 UTC
SELECT cron.schedule('send_trial_reminders',    '30 3 * * *',    'SELECT core.send_trial_reminders()');
-- Expire grace periods: every hour
SELECT cron.schedule('expire_grace_periods',    '0 * * * *',     'SELECT core.expire_grace_periods()');
-- Apply scheduled downgrades: midnight UTC
SELECT cron.schedule('apply_scheduled_changes', '0 0 * * *',     'SELECT core.apply_scheduled_changes()');
-- Expire cancelled subscriptions: 1 AM UTC daily
SELECT cron.schedule('expire_subscriptions',    '0 1 * * *',     'SELECT core.expire_subscriptions()');
-- Renewal reminders: 9 AM IST
SELECT cron.schedule('send_renewal_reminders',  '35 3 * * *',    'SELECT core.send_renewal_reminders()');
