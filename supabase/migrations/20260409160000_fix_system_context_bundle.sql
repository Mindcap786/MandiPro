-- Migration to fix the system_alerts logic in get_system_context_bundle

CREATE OR REPLACE FUNCTION core.get_system_context_bundle(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'core, public, pg_temp'
AS $function$
DECLARE
    v_org_id UUID;
    v_sub_status JSONB;
    v_alerts JSONB;
    v_org_data JSONB;
BEGIN
    -- Resolve Org ID
    SELECT organization_id INTO v_org_id FROM core.profiles WHERE id = p_user_id;
    
    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('error', 'No organization associated');
    END IF;

    -- Get Subscription Status (Reusing the logic from get_subscription_status but inline)
    v_sub_status := public.get_subscription_status(p_user_id);

    -- Get Organization Data (Branding, Enabled Modules)
    SELECT row_to_json(o)::jsonb INTO v_org_data
    FROM (
        SELECT id, name, subscription_tier, status, trial_ends_at, is_active, enabled_modules, brand_color, brand_color_secondary, logo_url, settings
        FROM core.organizations
        WHERE id = v_org_id
    ) o;

    -- Get Active System Alerts (Limit to latest 3, filter by is_resolved = false)
    SELECT jsonb_agg(a) INTO v_alerts
    FROM (
        SELECT id, alert_type as type, message, created_at
        FROM core.system_alerts
        WHERE (organization_id = v_org_id OR organization_id IS NULL)
        AND is_resolved = false
        ORDER BY created_at DESC
        LIMIT 3
    ) a;

    RETURN jsonb_build_object(
        'subscription', v_sub_status,
        'organization', v_org_data,
        'alerts', COALESCE(v_alerts, '[]'::jsonb),
        'server_time', NOW()
    );
END;
$function$;
