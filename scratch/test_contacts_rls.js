const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ldayxjabzyorpugwszpt.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk';

// We simulate the user's situation by using the ANON key but specifying the org
// However, ANON KEY + direct table query usually fails OR relies on RLS.
// Since I can't easily sign in as the user here without their password,
// I'll check if there's any other reason.

async function test() {
    const supabase = createClient(SUPABASE_URL, ANON_KEY);
    
    // Attempting to read contacts for the org
    // Note: This will likely return empty if RLS is enabled and I'm not authed.
    const { data, error } = await supabase
        .schema('mandi')
        .from('contacts')
        .select('*')
        .eq('organization_id', '0586decf-b686-45a7-bff8-2f55309234a1');
        
    console.log("Data:", data);
    console.log("Error:", error);
}

test();
