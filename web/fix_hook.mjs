import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyFix() {
    console.log("🛠️ Re-creating custom_access_token_hook securely...");
    const sql = `
-- Recreate the Hook securely
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, core
AS $$
  DECLARE
    claims jsonb;
    profile_record record;
  BEGIN
    -- Initialize the claims object
    claims := event->'claims';

    -- Look up the user's profile to inject context into their JWT
    SELECT organization_id, role, business_domain 
    INTO profile_record
    FROM core.profiles 
    WHERE id = (event->>'user_id')::uuid;

    -- If a profile is found, inject the organizational claims
    IF FOUND THEN
      claims := jsonb_set(claims, '{organization_id}', to_jsonb(profile_record.organization_id));
      claims := jsonb_set(claims, '{user_role}', to_jsonb(profile_record.role));
      claims := jsonb_set(claims, '{business_domain}', to_jsonb(profile_record.business_domain));
    END IF;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);
    
    RETURN event;
  EXCEPTION WHEN OTHERS THEN
     -- Failsafe: if the query crashes, return the un-modified event so login STILL succeeds
     RETURN event;
  END;
$$;

-- Restore strict Auth Admin execution permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
    `;

    const { error } = await supabase.rpc('exec_sql', { query: sql });
    
    if (error) {
        console.error("❌ RPC exec_sql failed:", error);
    } else {
        console.log("✅ Hook recreated successfully!");
    }
}

applyFix();
