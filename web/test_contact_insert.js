const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    console.log("Starting test insert...");
    const start = Date.now();
    
    // We need a valid organization_id and user session if RLS is on
    // But let's try a blind insert first to see if it even responds
    const { data, error } = await supabase
        .from('contacts')
        .insert({
            name: 'Test Contact ' + start,
            type: 'farmer',
            organization_id: 'e0125816-4760-4927-a94f-4226d7f9d8ec' // Mandi HQ ID from previous context
        });

    const end = Date.now();
    console.log("Duration:", (end - start), "ms");
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Success:", data);
    }
}

testInsert();
