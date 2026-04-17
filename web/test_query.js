const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    let query = supabase.schema('mandi')
        .from('vouchers')
        .select(`id, voucher_no, date, bank_name, cheque_no, cheque_date, cheque_status, narration, type`)
        .not('cheque_status', 'is', null)
        .gte('date', '2026-03-01')
        .lte('date', '2026-03-31')
        .eq('cheque_status', 'Pending');
    const { data, error } = await query.order('cheque_date', { ascending: true });
    console.log(error || data);
}
run();
