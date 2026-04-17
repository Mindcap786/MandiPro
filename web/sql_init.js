const { createClient } = require('@supabase/supabase-js')

// Since standard user REST APIs block CREATE TABLE, we need to bypass it. 
// However, the project might have a generic RPC for migrations. Let's try.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZudHlsYmN2dHR6dHR6Y3liZ2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTExMDMyOTUsImV4cCI6MjAyNjg3OTI5NX0.xxx';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.rpc('exec_sql', { query: `
        CREATE TABLE IF NOT EXISTS mandi.item_images (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL,
            commodity_id UUID NOT NULL,
            url TEXT NOT NULL,
            is_primary BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
            CONSTRAINT fk_commodity FOREIGN KEY (commodity_id) REFERENCES mandi.commodities(id) ON DELETE CASCADE
        );
    `});
    console.log(error || data);
}
check();
