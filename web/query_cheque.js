require('dotenv').config({ path: '/Users/shauddin/Desktop/MandiPro/web/.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'mandi' } });

async function check() {
  const { data: v, error: vErr } = await supabase.from('vouchers').select('*').in('voucher_no', [31, 32, 516]).order('created_at', { ascending: false });
  console.log("Vouchers:", JSON.stringify(v, null, 2));

  const { data: entries, error } = await supabase.from('ledger_entries').select('*, voucher:vouchers(id, voucher_no, type, arrival_id)').in('voucher_id', v.map(vi => vi.id));
  console.log("Ledger Entries:", JSON.stringify(entries, null, 2));
}

check();
