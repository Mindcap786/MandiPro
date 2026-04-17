const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkView() {
    console.log("🔍 Checking 'view_location_stock'...");

    // 1. Get Org ID first (to be realistic)
    const orgId = '8c11de72-6a71-4fd3-a442-7f653a710876';
    console.log(`Using Org: Mandi HQ (${orgId})`);

    // 2. Query the view
    const start = Date.now();
    const { data, error } = await supabase
        .from('view_location_stock')
        .select('*')
        .eq('organization_id', orgId);
    const end = Date.now();

    if (error) {
        console.error("❌ Error querying view_location_stock:", error);
    } else {
        console.log(`✅ Success! Query took ${end - start}ms`);
        console.log(`Found ${data.length} rows.`);
        data.forEach(row => {
            console.log("Row Data:", JSON.stringify(row, null, 2));
        });
    }
}

checkView();
