const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkStock() {
    const orgId = '8c11de72-6a71-4fd3-a442-7f653a710876'; // Mandi HQ
    console.log(`🔍 Checking REAL stock for Org: Mandi HQ (${orgId})...`);

    const { data: lots, error } = await supabase
        .from('lots')
        .select('*, items(name)')
        .eq('organization_id', orgId);

    if (error) {
        console.error("❌ Error:", error);
        return;
    }

    if (lots.length === 0) {
        console.log("❌ No lots found at all for this organization.");
    } else {
        console.log(`✅ Found ${lots.length} lots.`);
        lots.forEach(l => {
            console.log(`- Lot: ${l.lot_code} | Item: ${l.items?.name} | Qty: ${l.current_qty} | Status: ${l.status}`);
        });
    }
}

checkStock();
