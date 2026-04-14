const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLocs() {
    const orgId = '8c11de72-6a71-4fd3-a442-7f653a710876';
    console.log(`🔍 Checking storage_locations for Org: ${orgId}...`);

    const { data, error } = await supabase
        .from('storage_locations')
        .select('*')
        .eq('organization_id', orgId);

    if (error) {
        console.error("❌ Error:", error);
    } else {
        console.log(`✅ Success! Found ${data.length} locations.`);
        console.log("Locations:", data);
    }
}

checkLocs();
