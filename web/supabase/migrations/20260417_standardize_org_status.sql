-- Migration: 20260417_standardize_org_status.sql
-- Description: Standardizes the organization status lifecycle to prevent provisioning failures

DO $$
BEGIN
    -- 1. Ensure status column exists in core.organizations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'organizations' AND column_name = 'status') THEN
        ALTER TABLE core.organizations ADD COLUMN status TEXT DEFAULT 'trial';
    END IF;

    -- 2. Drop the old restrictive constraint if it exists (allows us to be more flexible)
    ALTER TABLE core.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;

    -- 3. Add the new comprehensive constraint
    -- This matches the subscription states for a unified lifecycle
    ALTER TABLE core.organizations ADD CONSTRAINT organizations_status_check 
    CHECK (status IN (
        'trial', 
        'trialing', 
        'active', 
        'suspended', 
        'cancelled', 
        'expired',
        'soft_locked',
        'past_due'
    ));
    
    -- 4. Set a safe default for any organizations currently missing a status
    UPDATE core.organizations SET status = 'active' WHERE status IS NULL;
END $$;
