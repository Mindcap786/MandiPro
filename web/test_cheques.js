const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.schema('mandi')
      .from('vouchers')
      .select(`
          id, voucher_no, date, bank_name, cheque_no, cheque_date, cheque_status, narration, type,
          ledger_entries(debit, credit, contact_id)
      `)
      .not('cheque_status', 'is', null)

  console.log("Found:", data?.length);
  if (data?.length > 0) console.log(data.filter(v => v.type === 'sales'));
}
run();
