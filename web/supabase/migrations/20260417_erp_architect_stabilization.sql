-- Migration: 20260417_erp_architect_stabilization.sql
-- Description: Unified stabilization of the tenant system and administrative permissions.
-- Author: Senior ERP Architect & DB Engineer

DO $$
BEGIN
    -- 1. STABILIZE CORE SCHEMAS
    -- Ensure the feature_flags table exists within the core schema
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'feature_flags') THEN
        CREATE TABLE core.feature_flags (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            is_enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        -- Seed basic flags
        INSERT INTO core.feature_flags (name, description) VALUES 
            ('onboarding_v2', 'New owner onboarding flow'),
            ('razorpay_gateway', 'Razorpay Payment Gateway integration'),
            ('whatsapp_alerts', 'Transactional WhatsApp notifications');
    END IF;

    -- 2. ADMINISTRATIVE PERMISSIONS
    -- Grant explicit access to the super admin and service roles
    GRANT ALL ON ALL TABLES IN SCHEMA core TO service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA core TO postgres;
    
    -- Ensure Super Admin can read all tables (including RLS tables)
    GRANT USAGE ON SCHEMA core TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO authenticated;

    -- 3. STATUS STANDARDIZATION
    -- Ensure organizations table has the robust status check
    ALTER TABLE core.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
    ALTER TABLE core.organizations ADD CONSTRAINT organizations_status_check 
    CHECK (status IN ('trial', 'trialing', 'active', 'suspended', 'cancelled', 'expired', 'soft_locked', 'past_due'));

    -- 4. CLEANUP: Removing dangling tenants (broken provisioning attempts)
    -- This deletes organizations that have no matching owner in core.profiles
    DELETE FROM core.organizations 
    WHERE id NOT IN (SELECT organization_id FROM core.profiles WHERE organization_id IS NOT NULL)
    AND (name ILIKE 'rrr%' OR name ILIKE 'rmandi%' OR name ILIKE 'test%');

    -- 5. HUD ALIGNMENT
    -- Any tenant in trial/trialing should be marked as active for platform monitoring
    UPDATE core.organizations 
    SET is_active = true 
    WHERE status IN ('trial', 'trialing') AND is_active = false;

END $$;
