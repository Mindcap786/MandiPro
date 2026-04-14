const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXTCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking Anon Access to Profiles...");
    // Try to fetch any profile (should fail if RLS works correctly and we are anon)
    const { data: anonData, error: anonError } = await supabase.from('profiles').select('count');
    console.log("Anon Fetch Result:", anonData ? "Success (Bad if RLS is on)" : "Blocked (Good)", anonError?.message || "");

    // We can't easily simulate a specific user without their exact JWT, 
    // but detecting if the table is locked down is a good start.
}

check();
