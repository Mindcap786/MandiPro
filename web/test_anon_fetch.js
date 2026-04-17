const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFetchAsUser() {
    // We can't actually 'sign in' here easily without a real user session, 
    // but we can try to query profiles (which should be blocked by RLS if not logged in).

    console.log("Attempting to fetch profile with organization join using ANON key...");
    const { data, error } = await supabase
        .from('profiles')
        .select('id, organization_id, role, full_name, organization:organizations(name, subscription_tier)')
        .eq('id', '34dcd6d8-8292-435a-a79e-ef024d35689c')
        .maybeSingle();

    if (error) {
        console.error("Fetch failed (Expected if RLS is on):", error.message);
    } else {
        console.log("Fetch result (If this is empty, RLS is active or data missing):", data);
    }
}

testFetchAsUser();
