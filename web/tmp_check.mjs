import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/shauddin/Desktop/MandiPro/web/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'core' } });

async function run() {
  const { data, error } = await supabase.from('app_plans').select('*').limit(1);
  console.log(error ? error : Object.keys(data[0] || {}));
}
run();
