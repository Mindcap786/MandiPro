const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testLotFetch() {
    const lotCode = 'LOT-260203-c375';
    console.log("Fetching lot:", lotCode);
    const { data: lots, error } = await supabase
        .from('lots')
        .select(`
            id, lot_code, created_at, initial_qty, current_qty, unit, supplier_rate, commission_percent, arrival_type, organization_id,
            item:items(name),
            contact:contacts(name, type)
        `)
        .eq('lot_code', lotCode);

    console.log("Lots Error:", error);
    console.log("Lots Data:", JSON.stringify(lots, null, 2));

    if (lots && lots.length > 0) {
        const lot = lots[0]; // just check the first one
        const { data: sales, error: saleErr } = await supabase
            .from('sale_items')
            .select(`
                id, qty, rate, unit, created_at,
                sale:sales(bill_no, sale_date, buyer:contacts(name))
            `)
            .eq('lot_id', lot.id);

        console.log("Sales Error:", saleErr);
        console.log("Sales Count:", sales?.length);
    }
}

testLotFetch();
