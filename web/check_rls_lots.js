const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRLS() {
    console.log("🔍 Checking RLS policies for 'lots'...");

    const { data: policies, error } = await supabase
        .rpc('execute_sql', {
            query_text: "SELECT * FROM pg_policies WHERE tablename = 'lots';"
        });

    if (error) {
        console.log("RPC failed, trying manual select...");
        const { data: d2, error: e2 } = await supabase.from('pg_policies').select('*').eq('tablename', 'lots');
        if (e2) console.error("Error:", e2);
        else console.log(d2);
    } else {
        console.log(policies);
    }

    // Also check if RLS is ENABLED
    const { data: status, error: e3 } = await supabase.rpc('execute_sql', {
        query_text: "SELECT relrowsecurity FROM pg_class WHERE relname = 'lots';"
    });
    console.log("RLS Enabled:", status?.[0]?.relrowsecurity);
}

checkRLS();
