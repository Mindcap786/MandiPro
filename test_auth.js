require('dotenv').config({ path: 'web/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
    const { data: profile } = await supabaseAdmin
        .schema('core')
        .from('profiles')
        .select('id')
        .ilike('email', 'asifmuhammed78@gmail.com')
        .maybeSingle();
        
    console.log("Profile ID:", profile?.id);
    
    if (profile?.id) {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(profile.id);
        console.log("Auth User:", data);
        console.log("Error:", error);
    }
}

test();
