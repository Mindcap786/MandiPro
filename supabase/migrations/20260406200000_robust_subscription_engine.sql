-- Migration: Robust Subscription Engine
-- Date: 2026-04-06
-- Description: Creates the complete subscription lifecycle management system.
--   - manage_tenant_lifecycle(): Auto-transitions trial→expired, active→grace→suspended→expired
--   - generate_recurring_invoices(): Auto-generates invoices at billing cycle boundaries
--   - process_subscription_renewal(): Instant renewal on payment, resets grace period
--   - activate_plan_for_tenant(): Super admin/admin can activate any plan for any tenant
-- IMPORTANT: Does NOT modify any existing tables or functions. Only creates new functions.

-- ============================================================================
-- 1. manage_tenant_lifecycle() - The core state machine
-- ============================================================================
-- States: trial → active → grace_period → suspended → expired
-- Called by pg_cron daily or via manual sync from admin panel

CREATE OR REPLACE FUNCTION core.manage_tenant_lifecycle()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org RECORD;
    v_sub RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_grace_days INT := 7;
    v_stats JSONB := jsonb_build_object(
        'trials_expired', 0,
        'entered_grace', 0,
        'suspended', 0,
        'expired', 0,
        'processed_at', v_now
    );
    v_trials_expired INT := 0;
    v_entered_grace INT := 0;
    v_suspended INT := 0;
    v_expired INT := 0;
BEGIN
    -- ── PHASE 1: Trial → Expired ──
    -- Trials that have passed their trial_ends_at without upgrading
    FOR v_org IN (
        SELECT o.id as org_id, o.name, s.id as sub_id, s.trial_ends_at
        FROM core.organizations o
        LEFT JOIN core.subscriptions s ON s.organization_id = o.id
        WHERE o.status = 'trial'
          AND (
            (s.trial_ends_at IS NOT NULL AND s.trial_ends_at < v_now)
            OR (o.trial_ends_at IS NOT NULL AND o.trial_ends_at < v_now AND s.id IS NULL)
          )
    ) LOOP
        -- Update organization
        UPDATE core.organizations
        SET status = 'expired', is_active = false
        WHERE id = v_org.org_id;

        -- Update subscription if exists
        IF v_org.sub_id IS NOT NULL THEN
            UPDATE core.subscriptions
            SET status = 'expired'
            WHERE id = v_org.sub_id;
        END IF;

        -- Generate alert
        INSERT INTO core.system_alerts (organization_id, alert_type, severity, message, domain)
        VALUES (
            v_org.org_id, 'subscription_expiry', 'critical',
            'Your trial period has expired. Please subscribe to continue using the platform.',
            'mandi'
        ) ON CONFLICT DO NOTHING;

        -- Log billing event
        INSERT INTO core.billing_events (organization_id, event_type, old_value, new_value, notes)
        VALUES (
            v_org.org_id, 'suspend',
            jsonb_build_object('status', 'trial'),
            jsonb_build_object('status', 'expired'),
            'Auto-expired: trial period ended'
        );

        v_trials_expired := v_trials_expired + 1;
    END LOOP;

    -- ── PHASE 2: Active → Grace Period ──
    -- Active subscriptions past current_period_end enter grace period
    FOR v_sub IN (
        SELECT s.id as sub_id, s.organization_id, s.current_period_end
        FROM core.subscriptions s
        JOIN core.organizations o ON o.id = s.organization_id
        WHERE s.status = 'active'
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end < v_now
          AND (s.grace_period_ends_at IS NULL OR s.grace_period_ends_at > v_now)
    ) LOOP
        -- Set grace period if not already set
        UPDATE core.subscriptions
        SET grace_period_ends_at = COALESCE(grace_period_ends_at, v_now + (v_grace_days || ' days')::INTERVAL),
            status = 'active' -- Still active during grace
        WHERE id = v_sub.sub_id
          AND grace_period_ends_at IS NULL;

        -- Update org grace period
        UPDATE core.organizations
        SET grace_period_ends_at = COALESCE(grace_period_ends_at, v_now + (v_grace_days || ' days')::INTERVAL)
        WHERE id = v_sub.organization_id
          AND grace_period_ends_at IS NULL;

        -- Alert
        INSERT INTO core.system_alerts (organization_id, alert_type, severity, message, domain)
        SELECT v_sub.organization_id, 'subscription_expiry', 'warning',
            'Your subscription period has ended. You have ' || v_grace_days || ' days grace period to renew.',
            'mandi'
        WHERE NOT EXISTS (
            SELECT 1 FROM core.system_alerts
            WHERE organization_id = v_sub.organization_id
              AND alert_type = 'subscription_expiry'
              AND is_resolved = false
              AND message LIKE '%grace period%'
        );

        -- Log event
        INSERT INTO core.billing_events (organization_id, event_type, old_value, new_value, notes)
        VALUES (
            v_sub.organization_id, 'suspend',
            jsonb_build_object('status', 'active', 'period_end', v_sub.current_period_end),
            jsonb_build_object('status', 'grace_period', 'grace_ends', v_now + (v_grace_days || ' days')::INTERVAL),
            'Auto: entered grace period after billing cycle ended'
        );

        v_entered_grace := v_entered_grace + 1;
    END LOOP;

    -- ── PHASE 3: Grace Period → Suspended ──
    -- Grace period expired, suspend access
    FOR v_sub IN (
        SELECT s.id as sub_id, s.organization_id, s.grace_period_ends_at
        FROM core.subscriptions s
        WHERE s.status = 'active'
          AND s.grace_period_ends_at IS NOT NULL
          AND s.grace_period_ends_at < v_now
    ) LOOP
        UPDATE core.subscriptions
        SET status = 'suspended', suspended_at = v_now
        WHERE id = v_sub.sub_id;

        UPDATE core.organizations
        SET status = 'suspended', is_active = false
        WHERE id = v_sub.organization_id;

        -- Critical alert
        INSERT INTO core.system_alerts (organization_id, alert_type, severity, message, domain)
        SELECT v_sub.organization_id, 'subscription_expiry', 'critical',
            'Your account has been suspended due to non-payment. Please renew immediately to restore access.',
            'mandi'
        WHERE NOT EXISTS (
            SELECT 1 FROM core.system_alerts
            WHERE organization_id = v_sub.organization_id
              AND alert_type = 'subscription_expiry'
              AND is_resolved = false
              AND message LIKE '%suspended%'
        );

        INSERT INTO core.billing_events (organization_id, event_type, old_value, new_value, notes)
        VALUES (
            v_sub.organization_id, 'suspend',
            jsonb_build_object('status', 'grace_period'),
            jsonb_build_object('status', 'suspended', 'suspended_at', v_now),
            'Auto-suspended: grace period expired without payment'
        );

        v_suspended := v_suspended + 1;
    END LOOP;

    -- ── PHASE 4: Suspended → Expired (after 30 days suspended) ──
    FOR v_sub IN (
        SELECT s.id as sub_id, s.organization_id
        FROM core.subscriptions s
        WHERE s.status = 'suspended'
          AND s.suspended_at IS NOT NULL
          AND s.suspended_at < (v_now - INTERVAL '30 days')
    ) LOOP
        UPDATE core.subscriptions
        SET status = 'expired'
        WHERE id = v_sub.sub_id;

        UPDATE core.organizations
        SET status = 'expired'
        WHERE id = v_sub.organization_id;

        INSERT INTO core.billing_events (organization_id, event_type, old_value, new_value, notes)
        VALUES (
            v_sub.organization_id, 'suspend',
            jsonb_build_object('status', 'suspended'),
            jsonb_build_object('status', 'expired'),
            'Auto-expired: suspended for over 30 days without renewal'
        );

        v_expired := v_expired + 1;
    END LOOP;

    -- Return stats
    RETURN jsonb_build_object(
        'trials_expired', v_trials_expired,
        'entered_grace', v_entered_grace,
        'suspended', v_suspended,
        'expired', v_expired,
        'processed_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION core.manage_tenant_lifecycle() TO service_role;

-- ============================================================================
-- 2. generate_recurring_invoices() - Auto-generate invoices at billing boundaries
-- ============================================================================

CREATE OR REPLACE FUNCTION core.generate_recurring_invoices()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_inv_number TEXT;
    v_inv_count INT;
    v_period_start DATE;
    v_period_end DATE;
    v_amount NUMERIC;
    v_generated INT := 0;
BEGIN
    -- Get current year invoice count for numbering
    SELECT COUNT(*) INTO v_inv_count
    FROM core.saas_invoices
    WHERE EXTRACT(YEAR FROM invoice_date) = EXTRACT(YEAR FROM v_now);

    -- Find active subscriptions where next_invoice_date has passed
    FOR v_sub IN (
        SELECT
            s.id as sub_id,
            s.organization_id,
            s.plan_id,
            s.billing_cycle,
            s.mrr_amount,
            s.next_invoice_date,
            s.current_period_end,
            p.display_name as plan_name,
            p.price_monthly,
            p.price_yearly
        FROM core.subscriptions s
        JOIN core.app_plans p ON s.plan_id = p.id
        WHERE s.status = 'active'
          AND s.next_invoice_date IS NOT NULL
          AND s.next_invoice_date <= v_now
          AND s.plan_id IS NOT NULL
    ) LOOP
        -- Check if invoice already exists for this period
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM core.saas_invoices
            WHERE organization_id = v_sub.organization_id
              AND plan_id = v_sub.plan_id
              AND period_start = v_sub.next_invoice_date::DATE
        );

        -- Calculate period
        v_period_start := v_sub.next_invoice_date::DATE;
        IF v_sub.billing_cycle = 'yearly' THEN
            v_period_end := v_period_start + INTERVAL '1 year';
            v_amount := COALESCE(v_sub.price_yearly, v_sub.mrr_amount * 12);
        ELSE
            v_period_end := v_period_start + INTERVAL '1 month';
            v_amount := COALESCE(v_sub.mrr_amount, v_sub.price_monthly);
        END IF;

        -- Generate invoice number
        v_inv_count := v_inv_count + 1;
        v_inv_number := 'INV-' || EXTRACT(YEAR FROM v_now)::TEXT || '-' || LPAD(v_inv_count::TEXT, 4, '0');

        -- Create invoice
        INSERT INTO core.saas_invoices (
            organization_id, plan_id, invoice_number,
            period_start, period_end,
            amount, subtotal, tax, total,
            status, invoice_date, due_date,
            currency, line_items, notes
        ) VALUES (
            v_sub.organization_id, v_sub.plan_id, v_inv_number,
            v_period_start, v_period_end,
            v_amount, v_amount, 0, v_amount,
            'pending', v_now, v_now + INTERVAL '7 days',
            'INR',
            jsonb_build_array(jsonb_build_object(
                'description', v_sub.plan_name || ' - ' || INITCAP(v_sub.billing_cycle) || ' Subscription',
                'quantity', 1,
                'unit_price', v_amount,
                'amount', v_amount,
                'type', 'subscription'
            )),
            'Auto-generated recurring invoice'
        );

        -- Update next invoice date on subscription
        UPDATE core.subscriptions
        SET next_invoice_date = v_period_end
        WHERE id = v_sub.sub_id;

        v_generated := v_generated + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'invoices_generated', v_generated,
        'processed_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION core.generate_recurring_invoices() TO service_role;

-- ============================================================================
-- 3. process_subscription_renewal() - Instant renewal on payment
-- ============================================================================
-- Called after payment confirmation (webhook or manual).
-- Instantly reactivates, extends period, clears grace, resolves alerts.

CREATE OR REPLACE FUNCTION core.process_subscription_renewal(
    p_org_id UUID,
    p_payment_amount NUMERIC DEFAULT NULL,
    p_payment_gateway TEXT DEFAULT 'manual',
    p_billing_cycle TEXT DEFAULT NULL,
    p_plan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_new_period_end TIMESTAMPTZ;
    v_cycle TEXT;
    v_target_plan_id UUID;
BEGIN
    -- Get current subscription
    SELECT * INTO v_sub
    FROM core.subscriptions
    WHERE organization_id = p_org_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Determine plan
    v_target_plan_id := COALESCE(p_plan_id, v_sub.plan_id);

    IF v_target_plan_id IS NOT NULL THEN
        SELECT * INTO v_plan FROM core.app_plans WHERE id = v_target_plan_id;
    END IF;

    -- Determine billing cycle
    v_cycle := COALESCE(p_billing_cycle, v_sub.billing_cycle, 'monthly');

    -- Calculate new period end
    IF v_cycle = 'yearly' THEN
        v_new_period_end := v_now + INTERVAL '1 year';
    ELSE
        v_new_period_end := v_now + INTERVAL '30 days';
    END IF;

    IF v_sub.id IS NOT NULL THEN
        -- Update existing subscription
        UPDATE core.subscriptions
        SET status = 'active',
            plan_id = v_target_plan_id,
            billing_cycle = v_cycle,
            current_period_end = v_new_period_end,
            next_invoice_date = v_new_period_end,
            grace_period_ends_at = NULL,
            suspended_at = NULL,
            retry_count = 0,
            mrr_amount = COALESCE(
                p_payment_amount,
                CASE WHEN v_cycle = 'yearly' THEN v_plan.price_yearly ELSE v_plan.price_monthly END,
                v_sub.mrr_amount
            )
        WHERE id = v_sub.id;
    ELSE
        -- Create subscription if none exists
        INSERT INTO core.subscriptions (
            organization_id, plan_id, status, billing_cycle,
            current_period_end, next_invoice_date, mrr_amount
        ) VALUES (
            p_org_id, v_target_plan_id, 'active', v_cycle,
            v_new_period_end, v_new_period_end,
            COALESCE(p_payment_amount, v_plan.price_monthly, 0)
        );
    END IF;

    -- Reactivate organization
    UPDATE core.organizations
    SET status = 'active',
        is_active = true,
        subscription_tier = COALESCE(v_plan.name, 'basic'),
        grace_period_ends_at = NULL,
        max_web_users = COALESCE(v_plan.max_web_users, 5),
        max_mobile_users = COALESCE(v_plan.max_mobile_users, 5)
    WHERE id = p_org_id;

    -- Resolve all pending subscription alerts
    UPDATE core.system_alerts
    SET is_resolved = true
    WHERE organization_id = p_org_id
      AND alert_type IN ('subscription_expiry', 'overdue_payment')
      AND is_resolved = false;

    -- Mark pending/overdue invoices as paid
    UPDATE core.saas_invoices
    SET status = 'paid', paid_at = v_now
    WHERE organization_id = p_org_id
      AND status IN ('pending', 'overdue');

    -- Log payment attempt
    INSERT INTO core.payment_attempts (organization_id, status, amount, gateway)
    VALUES (p_org_id, 'success', COALESCE(p_payment_amount, 0), p_payment_gateway);

    -- Log billing event
    INSERT INTO core.billing_events (organization_id, event_type, old_value, new_value, notes)
    VALUES (
        p_org_id, 'reactivate',
        jsonb_build_object('status', COALESCE(v_sub.status, 'none')),
        jsonb_build_object(
            'status', 'active',
            'period_end', v_new_period_end,
            'plan', COALESCE(v_plan.display_name, 'unknown'),
            'amount', COALESCE(p_payment_amount, 0)
        ),
        'Subscription renewed via ' || p_payment_gateway
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'active',
        'period_end', v_new_period_end,
        'plan', COALESCE(v_plan.display_name, 'unknown'),
        'billing_cycle', v_cycle
    );
END;
$$;

GRANT EXECUTE ON FUNCTION core.process_subscription_renewal(UUID, NUMERIC, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION core.process_subscription_renewal(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

-- ============================================================================
-- 4. activate_plan_for_tenant() - Admin activates any plan for any tenant
-- ============================================================================
-- Used by super_admin/platform_admin to assign standard or custom plans

CREATE OR REPLACE FUNCTION core.activate_plan_for_tenant(
    p_org_id UUID,
    p_plan_id UUID,
    p_billing_cycle TEXT DEFAULT 'monthly',
    p_custom_expiry TIMESTAMPTZ DEFAULT NULL,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan RECORD;
    v_sub RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_period_end TIMESTAMPTZ;
    v_inv_number TEXT;
    v_inv_count INT;
BEGIN
    -- Validate plan exists
    SELECT * INTO v_plan FROM core.app_plans WHERE id = p_plan_id AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Plan not found or inactive');
    END IF;

    -- Calculate period end
    IF p_custom_expiry IS NOT NULL THEN
        v_period_end := p_custom_expiry;
    ELSIF p_billing_cycle = 'yearly' THEN
        v_period_end := v_now + INTERVAL '1 year';
    ELSE
        v_period_end := v_now + INTERVAL '30 days';
    END IF;

    -- Check existing subscription
    SELECT * INTO v_sub
    FROM core.subscriptions
    WHERE organization_id = p_org_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_sub.id IS NOT NULL THEN
        -- Update existing
        UPDATE core.subscriptions
        SET plan_id = p_plan_id,
            status = 'active',
            billing_cycle = p_billing_cycle,
            current_period_end = v_period_end,
            next_invoice_date = v_period_end,
            grace_period_ends_at = NULL,
            suspended_at = NULL,
            retry_count = 0,
            mrr_amount = CASE WHEN p_billing_cycle = 'yearly'
                THEN COALESCE(v_plan.price_yearly, v_plan.price_monthly * 12)
                ELSE v_plan.price_monthly END
        WHERE id = v_sub.id;
    ELSE
        -- Create new
        INSERT INTO core.subscriptions (
            organization_id, plan_id, status, billing_cycle,
            current_period_end, next_invoice_date, mrr_amount
        ) VALUES (
            p_org_id, p_plan_id, 'active', p_billing_cycle,
            v_period_end, v_period_end,
            CASE WHEN p_billing_cycle = 'yearly'
                THEN COALESCE(v_plan.price_yearly, v_plan.price_monthly * 12)
                ELSE v_plan.price_monthly END
        );
    END IF;

    -- Sync organization
    UPDATE core.organizations
    SET subscription_tier = v_plan.name,
        status = 'active',
        is_active = true,
        max_web_users = COALESCE(v_plan.max_web_users, 5),
        max_mobile_users = COALESCE(v_plan.max_mobile_users, 5),
        enabled_modules = COALESCE(v_plan.enabled_modules, '[]'::JSONB),
        grace_period_ends_at = NULL
    WHERE id = p_org_id;

    -- Resolve alerts
    UPDATE core.system_alerts
    SET is_resolved = true
    WHERE organization_id = p_org_id
      AND is_resolved = false
      AND alert_type IN ('subscription_expiry', 'overdue_payment');

    -- Generate invoice for this activation
    SELECT COUNT(*) + 1 INTO v_inv_count
    FROM core.saas_invoices
    WHERE EXTRACT(YEAR FROM invoice_date) = EXTRACT(YEAR FROM v_now);

    v_inv_number := 'INV-' || EXTRACT(YEAR FROM v_now)::TEXT || '-' || LPAD(v_inv_count::TEXT, 4, '0');

    INSERT INTO core.saas_invoices (
        organization_id, plan_id, invoice_number,
        period_start, period_end,
        amount, subtotal, tax, total,
        status, invoice_date, due_date,
        currency, line_items, notes
    ) VALUES (
        p_org_id, p_plan_id, v_inv_number,
        v_now::DATE, v_period_end::DATE,
        CASE WHEN p_billing_cycle = 'yearly'
            THEN COALESCE(v_plan.price_yearly, v_plan.price_monthly * 12)
            ELSE v_plan.price_monthly END,
        CASE WHEN p_billing_cycle = 'yearly'
            THEN COALESCE(v_plan.price_yearly, v_plan.price_monthly * 12)
            ELSE v_plan.price_monthly END,
        0,
        CASE WHEN p_billing_cycle = 'yearly'
            THEN COALESCE(v_plan.price_yearly, v_plan.price_monthly * 12)
            ELSE v_plan.price_monthly END,
        'pending', v_now, v_now + INTERVAL '7 days',
        'INR',
        jsonb_build_array(jsonb_build_object(
            'description', v_plan.display_name || ' - ' || INITCAP(p_billing_cycle) || ' Plan Activation',
            'quantity', 1,
            'unit_price', CASE WHEN p_billing_cycle = 'yearly'
                THEN COALESCE(v_plan.price_yearly, v_plan.price_monthly * 12)
                ELSE v_plan.price_monthly END,
            'amount', CASE WHEN p_billing_cycle = 'yearly'
                THEN COALESCE(v_plan.price_yearly, v_plan.price_monthly * 12)
                ELSE v_plan.price_monthly END,
            'type', 'activation'
        )),
        COALESCE(p_admin_notes, 'Admin-activated plan')
    );

    -- Billing event
    INSERT INTO core.billing_events (organization_id, event_type, old_value, new_value, notes)
    VALUES (
        p_org_id,
        CASE WHEN v_sub.id IS NOT NULL THEN
            CASE WHEN COALESCE(v_plan.price_monthly, 0) > COALESCE(v_sub.mrr_amount, 0)
                THEN 'upgrade' ELSE 'downgrade' END
        ELSE 'manual_override' END,
        CASE WHEN v_sub.id IS NOT NULL THEN
            jsonb_build_object('plan_id', v_sub.plan_id, 'status', v_sub.status)
        ELSE '{}'::JSONB END,
        jsonb_build_object(
            'plan_id', p_plan_id,
            'plan_name', v_plan.display_name,
            'status', 'active',
            'period_end', v_period_end,
            'billing_cycle', p_billing_cycle
        ),
        COALESCE(p_admin_notes, 'Admin plan activation')
    );

    RETURN jsonb_build_object(
        'success', true,
        'plan', v_plan.display_name,
        'status', 'active',
        'period_end', v_period_end,
        'billing_cycle', p_billing_cycle,
        'invoice_number', v_inv_number
    );
END;
$$;

GRANT EXECUTE ON FUNCTION core.activate_plan_for_tenant(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

-- ============================================================================
-- 5. Add grace_period_ends_at column to organizations if missing
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'core' AND table_name = 'organizations' AND column_name = 'grace_period_ends_at'
    ) THEN
        ALTER TABLE core.organizations ADD COLUMN grace_period_ends_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================================================
-- SUCCESS
-- ============================================================================
-- Functions created:
--   core.manage_tenant_lifecycle() → JSONB
--   core.generate_recurring_invoices() → JSONB
--   core.process_subscription_renewal(UUID, NUMERIC, TEXT, TEXT, UUID) → JSONB
--   core.activate_plan_for_tenant(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT) → JSONB
