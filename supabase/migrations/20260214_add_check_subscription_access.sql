-- Migration: Add check_subscription_access RPC
-- Date: 2026-02-14
-- Description: Adds a missing RPC function required by the frontend subscription enforcer.

CREATE OR REPLACE FUNCTION check_subscription_access(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_active BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_active
    FROM organizations
    WHERE id = p_org_id;

    RETURN COALESCE(v_is_active, FALSE);
END;
$$;
