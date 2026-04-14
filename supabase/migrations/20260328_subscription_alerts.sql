-- Migration: Subscription Alerts Logic
-- Date: 2026-03-28
-- Description: Adds a function to automatically assess subscription status and generate alerts for tenants.

-- ============================================================================
-- 1. Create check_subscription_alerts Function
-- ============================================================================

CREATE OR REPLACE FUNCTION core.check_subscription_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub RECORD;
    v_alert_exists BOOLEAN;
BEGIN
    -- 1. Check for Active Subscriptions Nearing Expiry / Trial Ends
    FOR v_sub IN (
        SELECT 
            s.organization_id, 
            s.status, 
            s.trial_ends_at, 
            s.current_period_end,
            p.display_name as plan_name
        FROM core.subscriptions s
        JOIN core.app_plans p ON s.plan_id = p.id
        WHERE s.status IN ('active', 'trial')
    ) LOOP
        
        -- Logic: Trial Ending (within 3 days)
        IF v_sub.status = 'trial' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > NOW() AND v_sub.trial_ends_at <= (NOW() + interval '3 days') THEN
            -- Check if alert already exists to prevent spam
            SELECT EXISTS (
                SELECT 1 FROM core.system_alerts 
                WHERE organization_id = v_sub.organization_id 
                AND alert_type = 'subscription_expiry'
                AND is_resolved = false
                AND message LIKE '%Trial ends on%'
            ) INTO v_alert_exists;

            IF NOT v_alert_exists THEN
                INSERT INTO core.system_alerts (
                    organization_id, alert_type, severity, message, domain
                ) VALUES (
                    v_sub.organization_id,
                    'subscription_expiry',
                    'warning',
                    'Your trial period ends on ' || to_char(v_sub.trial_ends_at, 'DD/MM/YYYY') || '. Upgrade your plan to prevent service interruption.',
                    'mandi'
                );
            END IF;
        END IF;

        -- Logic: Active Subscription Ending (within 3 days)
        IF v_sub.status = 'active' AND v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > CURRENT_DATE AND v_sub.current_period_end <= (CURRENT_DATE + 3) THEN
             SELECT EXISTS (
                SELECT 1 FROM core.system_alerts 
                WHERE organization_id = v_sub.organization_id 
                AND alert_type = 'subscription_expiry'
                AND is_resolved = false
                AND message LIKE '%subscription renews on%'
            ) INTO v_alert_exists;

            IF NOT v_alert_exists THEN
                INSERT INTO core.system_alerts (
                    organization_id, alert_type, severity, message, domain
                ) VALUES (
                    v_sub.organization_id,
                    'subscription_expiry',
                    'info',
                    'Your ' || v_sub.plan_name || ' subscription renews on ' || to_char(v_sub.current_period_end, 'DD/MM/YYYY') || '.',
                    'mandi'
                );
            END IF;
        END IF;
    END LOOP;

    -- 2. Check for Overdue Invoices
    FOR v_sub IN (
        SELECT DISTINCT organization_id 
        FROM core.saas_invoices 
        WHERE status = 'overdue' OR (status = 'pending' AND due_date < NOW())
    ) LOOP
         SELECT EXISTS (
            SELECT 1 FROM core.system_alerts 
            WHERE organization_id = v_sub.organization_id 
            AND alert_type = 'overdue_payment'
            AND is_resolved = false
        ) INTO v_alert_exists;

        IF NOT v_alert_exists THEN
            INSERT INTO core.system_alerts (
                organization_id, alert_type, severity, message, domain
            ) VALUES (
                v_sub.organization_id,
                'overdue_payment',
                'critical',
                'You have an overdue payment. Please update your billing details immediately to avoid account suspension.',
                'mandi'
            );
        END IF;
    END LOOP;

END;
$$;

-- Grant execution to service role for cron jobs
GRANT EXECUTE ON FUNCTION core.check_subscription_alerts() TO service_role;

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- Function core.check_subscription_alerts() created successfully.
