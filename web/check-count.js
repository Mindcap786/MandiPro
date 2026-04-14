require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function check() {
  const { data, error, count } = await supabase.schema('mandi').from('contacts').select('*', { count: 'exact', head: true });
  console.log("Contacts count:", count);
  console.log("Error:", error);
}
check();
