const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    const search = "afzal";
    const idsStr = `(db62dc78-3a9a-41ab-8e06-92f7ea6b23a1)`; // fake uuid
    
    const { data: q1, error: e1 } = await supabase.from('sales').select('id, bill_no').or(`bill_no.ilike.%${search}%,buyer_id.in.${idsStr}`);
    console.log("Q1 Error:", e1);
}
test();
