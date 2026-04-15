const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkViewAnon() {
    console.log("🔍 Checking 'view_location_stock' with ANON KEY...");

    // Attempt to query without specific filters first to see if it's even visible
    const { data, error } = await supabase
        .from('view_location_stock')
        .select('*')
        .limit(1);

    if (error) {
        console.error("❌ Error (Anon):", error);
    } else {
        console.log(`✅ Success (Anon)! Found ${data.length} rows.`);
    }
}

checkViewAnon();
