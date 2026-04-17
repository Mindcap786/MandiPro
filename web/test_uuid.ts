import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    const { data, error } = await supabaseAdmin.schema('core').rpc('initialize_organization', {
        p_name: 'Test O',
        p_city: 'City',
        p_full_name: 'Full',
        p_business_domain: 'mandi',
        p_plan_id: 'basic'
    });
    console.log("Error:", error);
}

test();
