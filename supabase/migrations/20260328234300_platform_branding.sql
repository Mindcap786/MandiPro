-- Migration: Global Platform Branding Configuration & Auditing
-- Description: Creates the configuration tables for global document attribution branding, along with an automated trigger to enforce audit logging of all modifications.

-- 1. Create the Audit Logs Table
CREATE TABLE IF NOT EXISTS core.branding_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    old_values JSONB NOT NULL,
    new_values JSONB NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create the Platform Branding Settings Table
CREATE TABLE IF NOT EXISTS core.platform_branding_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_footer_powered_by_text TEXT NOT NULL DEFAULT 'Powered by MandiPro ERP',
    document_footer_presented_by_text TEXT NOT NULL DEFAULT 'Presented by Tally',
    document_footer_developed_by_text TEXT NOT NULL DEFAULT 'Developed by MindT',
    watermark_text TEXT NOT NULL DEFAULT 'Powered by MandiPro',
    is_watermark_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 3. Enable RLS
ALTER TABLE core.platform_branding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.branding_audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for Branding Settings
-- Only Super Admins can UPDATE
CREATE POLICY "Super Admins can update branding settings" 
    ON core.platform_branding_settings 
    FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM core.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'super_admin'
        )
    );

-- Everyone (Tenants, Public) can SELECT branding settings to render documents
CREATE POLICY "Anyone can read banding settings" 
    ON core.platform_branding_settings 
    FOR SELECT 
    USING (true);

-- 5. RLS Policies for Audit Logs
-- Only Super Admins can SELECT logs
CREATE POLICY "Super Admins can view branding audit logs" 
    ON core.branding_audit_logs 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM core.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'super_admin'
        )
    );

-- 6. Trigger for Automated Auditing
CREATE OR REPLACE FUNCTION core.log_branding_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD IS DISTINCT FROM NEW THEN
        INSERT INTO core.branding_audit_logs (
            changed_by,
            old_values,
            new_values,
            ip_address
        ) VALUES (
            NEW.updated_by,
            to_jsonb(OLD),
            to_jsonb(NEW),
            current_setting('request.headers', true)::json->>'x-forwarded-for' -- Captures IP directly from PostgREST/Supabase Edge
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_branding_audit ON core.platform_branding_settings;
CREATE TRIGGER trg_branding_audit
    AFTER UPDATE ON core.platform_branding_settings
    FOR EACH ROW
    EXECUTE FUNCTION core.log_branding_changes();

-- 7. Seed Default Configuration
INSERT INTO core.platform_branding_settings (
    document_footer_powered_by_text,
    document_footer_presented_by_text,
    document_footer_developed_by_text,
    is_watermark_enabled
) VALUES (
    'Powered by MandiPro ERP',
    'Presented by MandiPro',
    'Developed by MindT Solutions',
    false
) ON CONFLICT DO NOTHING;
