-- Migration: User Consent Log
-- Records explicit consent at signup for GDPR / IT Act 2000 / DPDP Act 2023 compliance.
-- Each row is immutable — consent cannot be updated or deleted, only new rows added.

CREATE TABLE IF NOT EXISTS core.user_consent_log (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    email            TEXT        NOT NULL,
    consent_version  TEXT        NOT NULL DEFAULT 'v1.0',   -- bump when T&C / Privacy Policy changes
    consented_to     TEXT[]      NOT NULL,                  -- e.g. ARRAY['terms','privacy','data_processing','marketing']
    ip_address       INET,                                  -- populated by the API route
    user_agent       TEXT,
    consented_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable: no updates or deletes allowed for compliance
ALTER TABLE core.user_consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own consent" ON core.user_consent_log;
CREATE POLICY "Users can read own consent"
    ON core.user_consent_log
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Super admins can read all consent" ON core.user_consent_log;
CREATE POLICY "Super admins can read all consent"
    ON core.user_consent_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM core.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- No UPDATE or DELETE policies — service_role handles INSERT via the API
GRANT SELECT ON core.user_consent_log TO authenticated;
