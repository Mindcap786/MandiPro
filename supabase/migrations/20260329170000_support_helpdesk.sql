-- Migration: Support Helpdesk & Feature Requests (Tasks 5 & 7)
-- Description: Creates the core.support_tickets table to manage tenant issues and business enhancement requests directly to the Platform Owner.

CREATE TABLE IF NOT EXISTS core.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ticket_type TEXT NOT NULL CHECK (ticket_type IN ('support', 'feature_request', 'billing')),
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE core.support_tickets ENABLE ROW LEVEL SECURITY;

-- Tenants can insert their own tickets
CREATE POLICY "Tenants can create support tickets" 
    ON core.support_tickets 
    FOR INSERT 
    WITH CHECK (organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid()));

-- Tenants can view their own tickets
CREATE POLICY "Tenants can view their own tickets" 
    ON core.support_tickets 
    FOR SELECT 
    USING (organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid()));

-- Super Admins can SELECT, UPDATE, DELETE all tickets
CREATE POLICY "Super Admins can manage all tickets" 
    ON core.support_tickets 
    FOR ALL 
    USING (EXISTS (SELECT 1 FROM core.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION core.update_support_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_support_ticket_timestamp ON core.support_tickets;
CREATE TRIGGER trg_update_support_ticket_timestamp
    BEFORE UPDATE ON core.support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION core.update_support_ticket_timestamp();
