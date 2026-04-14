-- Migration: Contact Form Submissions Table
-- Creates the table that /api/contact POSTs into.
-- Separate from site_contact_settings which holds display info.

CREATE TABLE IF NOT EXISTS core.contact_submissions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    phone       TEXT,
    subject     TEXT,
    message     TEXT        NOT NULL,
    tenant_id   UUID        REFERENCES core.organizations(id) ON DELETE SET NULL,
    status      TEXT        NOT NULL DEFAULT 'new',   -- new | read | replied | closed
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE core.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Only service_role (used by the API route) can insert/select.
-- Anon/authenticated users have no direct access — they submit via the API.
DROP POLICY IF EXISTS "Service role full access contact_submissions" ON core.contact_submissions;

-- Super admins can read all submissions via the admin UI.
DROP POLICY IF EXISTS "Super admins can read contact submissions" ON core.contact_submissions;
CREATE POLICY "Super admins can read contact submissions"
    ON core.contact_submissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM core.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Super admins can update status (mark read/replied/closed).
DROP POLICY IF EXISTS "Super admins can update contact submissions" ON core.contact_submissions;
CREATE POLICY "Super admins can update contact submissions"
    ON core.contact_submissions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM core.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Grant to authenticated for admin UI reads; service_role bypasses RLS anyway.
GRANT SELECT, UPDATE ON core.contact_submissions TO authenticated;
