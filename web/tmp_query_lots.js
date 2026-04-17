const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.schema('mandi').from('lots').select('*, arrival:arrivals(*)').order('created_at', { ascending: false }).limit(5);
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
run();
