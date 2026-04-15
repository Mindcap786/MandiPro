
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function check() {
    const { data, error } = await supabase.from('contacts').select('*');
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Contacts count:", data.length);
        console.log("Contacts sample:", data.slice(0, 3));
    }
}

check();
