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
        console.log("Deleting profile...", profile.id);
        await supabaseAdmin.schema('core').from('profiles').delete().eq('id', profile.id);
        
        console.log("Deleting auth user...");
        const { error } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
        console.log("Error:", error);
        if (!error) console.log("SUCCESSFULLY DELETED COMPLETE USER TRACE.");
    } else {
        console.log("User not found.");
    }
}

test();
