
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role to bypass RLS for test

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
    console.log('Testing get_billing_overview RPC...');
    const { data, error } = await supabase.rpc('get_billing_overview');

    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Success. Data:', JSON.stringify(data, null, 2));
    }
}

testRpc();
