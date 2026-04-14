import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    console.log("Looking up profile...");
    const { data: profile } = await supabaseAdmin
        .schema('core')
        .from('profiles')
        .select('*')
        .ilike('email', 'mandi1@gmail.com')
        .maybeSingle();

    console.log("Profile:", profile);

    if (profile?.id) {
        console.log("Fetching auth.user...");
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(profile.id);
        console.log("User email_confirmed_at:", data?.user?.email_confirmed_at);
        console.log("Error:", error);
    } else {
        console.log("User not found.");
    }
}

test();
