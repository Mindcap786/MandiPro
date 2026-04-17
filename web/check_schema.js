const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXTCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking contacts table...");
    // Try to get one row to see columns
    const { data, error, status } = await supabase
        .from('contacts')
        .select('*')
        .limit(1);
    
    console.log("Status:", status);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Sample Data:", data);
        if (data && data.length > 0) {
            console.log("Columns:", Object.keys(data[0]));
        }
    }
}

check();
