const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listRPCs() {
    console.log("🔍 Checking available RPCs...");

    // We can't easily list RPCs via client, but we can try common ones or check a system table if execute_sql works.
    // Wait, the error PGRST202 means it's not in the cache.
    // Let's try to find where execute_sql went.
    
    // Maybe it's in a different schema?
    const { data, error } = await supabase.rpc('execute_sql', { query_text: 'SELECT 1' });
    if (error) {
        console.log("❌ execute_sql still failing:", error.message);
    } else {
        console.log("✅ execute_sql is alive!");
    }
}

listRPCs();
