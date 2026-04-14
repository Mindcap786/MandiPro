-- Migration: 20260418_add_archived_status_and_softdelete.sql
-- Description: Adds 'archived' to organizations status constraint (needed for soft-delete),
--              and soft-deletes the auto-generated Audit Corp test orgs.

-- Expand the status CHECK to include 'archived'
ALTER TABLE core.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE core.organizations ADD CONSTRAINT organizations_status_check
CHECK (status IN (
    'trial', 'trialing', 'active', 'suspended', 'cancelled',
    'expired', 'soft_locked', 'past_due', 'archived'
));

-- Soft-delete any leftover auto-generated audit test orgs
UPDATE core.organizations
SET status = 'archived', is_active = false
WHERE name ILIKE 'audit corp%' AND status != 'archived';
