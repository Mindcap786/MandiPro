-- Migration: Granular Role-Based Access Control (Task 9)
-- Description: Adds a JSONB matrix to core.profiles to store precise module-level authorization toggles.

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='profiles' AND column_name='rbac_matrix') THEN
        -- Default all users to having full access implicitly if unspecified, or specify an empty object
        ALTER TABLE core.profiles ADD COLUMN rbac_matrix JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
END $$;
