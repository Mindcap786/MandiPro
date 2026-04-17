-- Migration: Split Billing Lifecycle for Monthly and Yearly Plans
-- Creates the transition state to automatically move expired active users to grace period.
-- Modifies the reminder function to use the correct intervals per plan type.

-- 1. Ensure basic settings exist (though they're mostly upserted from UI)
INSERT INTO core.settings (key, value, organization_id)
VALUES
  ('grace_period_days_monthly',     '7', NULL),
  ('grace_period_days_yearly',      '14', NULL),
  ('payment_reminder_days_monthly', '3',  NULL),
  ('payment_reminder_days_yearly',  '7',  NULL)
ON CONFLICT (key, organization_id) WHERE organization_id IS NULL 
DO NOTHING;

-- 2. NEW FUNCTION: transition_to_grace_period
-- Moves active subscriptions passing their current_period_end into a grace_period
CREATE OR REPLACE FUNCTION core.transition_to_grace_period()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sub   record;
  v_grace_days integer;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.organization_id, s.plan_interval, s.current_period_end
    FROM core.subscriptions s
    WHERE s.status = 'active'
      AND s.current_period_end < now()
  LOOP
    -- Default fallback if setting missing
    IF COALESCE(v_sub.plan_interval, 'monthly') = 'yearly' THEN
      v_grace_days := COALESCE((SELECT value::int FROM core.settings WHERE key = 'grace_period_days_yearly' AND organization_id IS NULL), 14);
    ELSE
      v_grace_days := COALESCE((SELECT value::int FROM core.settings WHERE key = 'grace_period_days_monthly' AND organization_id IS NULL), 7);
    END IF;

    UPDATE core.subscriptions
    SET status = 'grace_period',
        grace_period_end = v_sub.current_period_end + (v_grace_days || ' days')::interval,
        updated_at = now()
    WHERE id = v_sub.id;

    -- Notice: We do NOT suspend the org yet. Org runs on `active` as long as sub is in grace.

    INSERT INTO core.subscription_events (
      organization_id, subscription_id, event_type,
      old_status, new_status, triggered_by
    ) VALUES (
      v_sub.organization_id, v_sub.id, 'subscription.grace_started',
      'active', 'grace_period', 'system_cron'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- 3. UPDATED FUNCTION: send_renewal_reminders
-- Now selectively triggers reminders depending on monthly/yearly configuration rather than hardcoded 7, 3, 1
CREATE OR REPLACE FUNCTION core.send_renewal_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sub   record;
  v_days_left integer;
  v_reminder_days integer;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.organization_id, s.current_period_end, COALESCE(s.plan_interval, 'monthly') as plan_interval
    FROM core.subscriptions s
    WHERE s.status = 'active'
      AND s.current_period_end > now()
      -- Optimize query by only looking at subs expiring in next 35 days (max lookup boundary)
      AND s.current_period_end < now() + interval '35 days'
  LOOP
    -- Calculate days remaining (ceil rounding basically)
    v_days_left := EXTRACT(DAY FROM (v_sub.current_period_end - now()))::integer;

    -- Lookup configured reminder days setting based on cycle
    IF v_sub.plan_interval = 'yearly' THEN
       v_reminder_days := COALESCE((SELECT value::int FROM core.settings WHERE key = 'payment_reminder_days_yearly' AND organization_id IS NULL), 7);
    ELSE
       v_reminder_days := COALESCE((SELECT value::int FROM core.settings WHERE key = 'payment_reminder_days_monthly' AND organization_id IS NULL), 3);
    END IF;

    -- Check if we are EXACTLY on the reminder offset day, OR 1 day prior to urgency.
    -- (Sends on precisely the configured day, or 1 day before expiry for severe urgency).
    IF v_days_left = v_reminder_days OR v_days_left = 1 THEN
      IF NOT EXISTS (
        SELECT 1 FROM core.subscription_events
        WHERE subscription_id = v_sub.id
          AND event_type = 'renewal.reminder_sent'
          AND metadata->>'days_left' = v_days_left::text
          AND created_at > now() - interval '20 hours'
      ) THEN
        INSERT INTO core.subscription_events (
          organization_id, subscription_id, event_type,
          triggered_by, metadata
        ) VALUES (
          v_sub.organization_id, v_sub.id, 'renewal.reminder_sent',
          'system_cron', jsonb_build_object('days_left', v_days_left)
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;


-- 4. REGISTER NEW CRON JOB
SELECT cron.unschedule('transition_to_grace_period') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'transition_to_grace_period');

-- Run the transition script every hour to catch active plans slipping beyond their current_period_end
SELECT cron.schedule('transition_to_grace_period', '0 * * * *', 'SELECT core.transition_to_grace_period()');
