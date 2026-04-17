const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data: v, error: verr } = await supabase.schema('mandi').from('vouchers').select('*').eq('voucher_no', 474).single();
    if (v) {
        console.log("Voucher:", v);
        const { data: l, error: lerr } = await supabase.schema('mandi').from('ledger_entries').select('*').eq('voucher_id', v.id);
        console.log("Legs:", l);
    } else {
        console.log("No voucher found");
    }
}
test();
