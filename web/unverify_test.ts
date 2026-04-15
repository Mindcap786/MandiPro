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
        .select('id')
        .ilike('email', 'asifmuhammed78@gmail.com')
        .maybeSingle();

    if (profile?.id) {
        console.log("Unverifying auth user...");
        // This is a trick to manually un-verify a user via admin API
        const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
            email_confirm: false
        });
        console.log("Error:", error);
        if (!error) console.log("SUCCESSFULLY UNVERIFIED THE USER.");
    } else {
        console.log("User not found.");
    }
}

test();
