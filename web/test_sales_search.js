const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    const search = "afzal";
    const idsStr = `(db62dc78-3a9a-41ab-8e06-92f7ea6b23a1)`; 
    
    // Test 1: plain ilike on bill_no (might fail if bill_no is integer)
    const { data: q1, error: e1 } = await supabase.from('sales').select('id, bill_no').ilike('bill_no', `%${search}%`);
    console.log("Q1 Error:", e1);
    
    // Test 2: .or
    const { data: q2, error: e2 } = await supabase.from('sales').select('id, bill_no').or(`bill_no.ilike.%${search}%,buyer_id.in.${idsStr}`);
    console.log("Q2 Error:", e2);
}
test();
