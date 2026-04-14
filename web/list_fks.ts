import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    const { data, error } = await supabaseAdmin.auth.admin.deleteUser('cee8ff93-4e3d-4f77-99b7-39e7c0baee45');
    console.log(error);
}
test();
