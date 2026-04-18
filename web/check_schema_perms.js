import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase.rpc('get_pnl_summary', { p_organization_id: '00000000-0000-0000-0000-000000000000', p_start_date: '2026-04-01', p_end_date: '2026-04-30' });
  console.log("get_pnl_summary:", { data, error });

  const { data: qdata, error: qerr } = await supabase.from('organizations').select('*').limit(1);
  console.log("org table check:", { qdata, qerr });
}
check();
