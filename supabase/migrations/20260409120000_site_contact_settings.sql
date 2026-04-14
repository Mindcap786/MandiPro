-- Migration: Public Site Contact Settings
-- Description: Single-row table holding publicly-visible company contact
-- details (phone, email, WhatsApp, address, GSTIN/CIN, support hours).
-- Rendered on the public /contact page and editable from /admin/contact-info.

CREATE TABLE IF NOT EXISTS core.site_contact_settings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name      TEXT NOT NULL DEFAULT 'MandiGrow Software Solutions Pvt Ltd',
    tagline           TEXT NOT NULL DEFAULT 'India''s #1 Mandi ERP for fruits & vegetable traders',
    phone             TEXT NOT NULL DEFAULT '+91 82609 21301',
    whatsapp          TEXT NOT NULL DEFAULT '+91 82609 21301',
    email_support     TEXT NOT NULL DEFAULT 'support@mandigrow.com',
    email_sales       TEXT NOT NULL DEFAULT 'sales@mandigrow.com',
    email_legal       TEXT NOT NULL DEFAULT 'legal@mandigrow.com',
    address_line1     TEXT NOT NULL DEFAULT '',
    address_line2     TEXT NOT NULL DEFAULT '',
    city              TEXT NOT NULL DEFAULT 'Bengaluru',
    state             TEXT NOT NULL DEFAULT 'Karnataka',
    pincode           TEXT NOT NULL DEFAULT '',
    country           TEXT NOT NULL DEFAULT 'India',
    gstin             TEXT NOT NULL DEFAULT '',
    cin               TEXT NOT NULL DEFAULT '',
    support_hours     TEXT NOT NULL DEFAULT 'Mon–Sat, 9:00 AM – 8:00 PM IST',
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seed the singleton row if absent.
INSERT INTO core.site_contact_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM core.site_contact_settings);

ALTER TABLE core.site_contact_settings ENABLE ROW LEVEL SECURITY;

-- Publicly readable (marketing/contact page renders for anon visitors).
DROP POLICY IF EXISTS "Anyone can read site contact settings" ON core.site_contact_settings;
CREATE POLICY "Anyone can read site contact settings"
    ON core.site_contact_settings
    FOR SELECT
    USING (true);

-- Only super admins can UPDATE.
DROP POLICY IF EXISTS "Super admins can update site contact settings" ON core.site_contact_settings;
CREATE POLICY "Super admins can update site contact settings"
    ON core.site_contact_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM core.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM core.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Expose through the anon/auth API.
GRANT SELECT ON core.site_contact_settings TO anon, authenticated;
GRANT UPDATE ON core.site_contact_settings TO authenticated;
