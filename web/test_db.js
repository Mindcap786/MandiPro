const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl) {
    console.log("No URL");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("Fetching Ref 474...");
    const { data, error } = await supabase.schema('mandi').from('ledger_entries').select('*').eq('reference_no', '474');
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

test();
