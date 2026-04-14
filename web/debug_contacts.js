const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXTCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debug() {
    console.log("--- 1. Table Schema ---");
    // We'll use RPC to execute SQL if possible, or just query pg_catalog if we have direct access (usually not via JS client)
    // However, Supabase JS client doesn't support raw SQL easily unless there's an RPC.
    // Let's try to just fetch policies via a common trick if available, or just test inserts.
    
    console.log("--- 2. Checking Policies ---");
    // Trying to fetch from pg_policies via a generic query (might fail if not permitted even for service role via JS API)
    // Actually, service role bypasses RLS, so let's see if we can at least count rows.
    const { count, error: countError } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true });
    
    console.log("Contact count:", count, countError);

    console.log("--- 3. Testing Service Role Insert ---");
    const testId = 'test-' + Date.now();
    const { data: insertData, error: insertError } = await supabase
        .from('contacts')
        .insert({
            name: 'Debug Test ' + testId,
            type: 'farmer',
            organization_id: 'e0125816-4760-4927-a94f-4226d7f9d8ec'
        })
        .select();

    if (insertError) {
        console.error("Insert Error (Service Role):", insertError);
    } else {
        console.log("Insert Success (Service Role):", insertData);
    }

    console.log("--- 4. Checking Table Columns ---");
    const { data: cols } = await supabase.from('contacts').select('*').limit(1);
    if (cols && cols.length > 0) {
        console.log("Columns:", Object.keys(cols[0]));
    }
}

debug();
