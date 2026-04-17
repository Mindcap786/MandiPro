import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    // try calling with auth token
    const token = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: 'asifmuhammed78@gmail.com'
    });
    console.log(token);
}

test();
