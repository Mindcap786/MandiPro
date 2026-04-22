const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXTCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    // 1. Get current user (from the session if possible, but here we'll just check all profiles)
    console.log("--- Profiles ---");
    const { data: profiles, error: pError } = await supabase.from('profiles').select('*');
    console.log(profiles || pError);

    console.log("--- Items ---");
    const { data: items, error: iError } = await supabase.from('commodities').select('*');
    console.log(items || iError);

    console.log("--- Organizations ---");
    const { data: orgs, error: oError } = await supabase.from('organizations').select('*');
    console.log(orgs || oError);
}

check();
