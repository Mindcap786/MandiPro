-- Migration: Platform Enhancements (Tasks 3, 4, 8)
-- Description: Adds configuration columns for subscription expiry warnings, helpdesk phone, and marketing banners.
--              Includes an RPC string to determine active tenant subscription health dynamically.

-- 1. Extend platform_branding_settings
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='platform_branding_settings' AND column_name='expiry_warning_days') THEN
        ALTER TABLE core.platform_branding_settings ADD COLUMN expiry_warning_days INT NOT NULL DEFAULT 10;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='platform_branding_settings' AND column_name='support_phone') THEN
        ALTER TABLE core.platform_branding_settings ADD COLUMN support_phone TEXT NOT NULL DEFAULT '+91 98765 43210';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='platform_branding_settings' AND column_name='homepage_banner_text') THEN
        ALTER TABLE core.platform_branding_settings ADD COLUMN homepage_banner_text TEXT NOT NULL DEFAULT '🚀 Looking for freelancers? Join our MindT Partner Network today!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='platform_branding_settings' AND column_name='is_homepage_banner_enabled') THEN
        ALTER TABLE core.platform_branding_settings ADD COLUMN is_homepage_banner_enabled BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

-- 2. Create RPC for fast Expiry Checking for Tenants
CREATE OR REPLACE FUNCTION core.get_tenant_expiry_status(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub RECORD;
    v_warning_days INT;
    v_days_remaining INT;
    v_expires_at TIMESTAMPTZ;
    v_is_warning BOOLEAN := false;
BEGIN
    -- Get global warning threshold
    SELECT expiry_warning_days INTO v_warning_days 
    FROM core.platform_branding_settings LIMIT 1;
    
    IF v_warning_days IS NULL THEN v_warning_days := 10; END IF;

    -- Lookup active/trial subscription for this org
    SELECT status, trial_ends_at, current_period_end INTO v_sub
    FROM core.subscriptions 
    WHERE organization_id = p_org_id 
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'none');
    END IF;

    IF v_sub.status = 'trial' THEN
        v_expires_at := v_sub.trial_ends_at;
    ELSE
        v_expires_at := v_sub.current_period_end;
    END IF;

    -- If no explicit expiry is set, assume active indefinitely (shouldn't happen in proper billing)
    IF v_expires_at IS NULL THEN
        RETURN jsonb_build_object('status', 'active', 'is_warning', false);
    END IF;

    -- Calculate days remaining relative to NOW
    v_days_remaining := EXTRACT(DAY FROM (v_expires_at - NOW()))::INT;

    -- If it's already expired
    IF v_expires_at <= NOW() THEN
        RETURN jsonb_build_object(
            'status', 'expired',
            'days_remaining', 0,
            'expires_at', v_expires_at,
            'is_warning', true
        );
    END IF;

    -- Check if within warning window
    IF v_days_remaining <= v_warning_days THEN
        v_is_warning := true;
    END IF;

    RETURN jsonb_build_object(
        'status', v_sub.status,
        'days_remaining', v_days_remaining,
        'expires_at', v_expires_at,
        'is_warning', v_is_warning,
        'warning_threshold', v_warning_days
    );
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION core.get_tenant_expiry_status(UUID) TO authenticated;
