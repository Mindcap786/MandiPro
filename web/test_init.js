const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const envContent = fs.readFileSync('.env.local', 'utf8');
const matchUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const matchKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(matchUrl[1].trim(), matchKey[1].trim());

async function doIt() {
  console.log("Logging in as manager@mindt.com...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'manager@mindt.com',
    password: 'securepassword123'
  });

  if (authErr) {
    console.log('Login Error:', authErr.message);
    // try wh1
    const { data: a2, error: e2 } = await supabase.auth.signInWithPassword({
      email: 'wh1@gmail.com',
      password: '123456'
    });
    if (e2) {
      console.log('Fallback Login Error:', e2.message);
      return;
    }
    console.log('Fallback Login Success:', a2.user.id);
  } else {
    console.log('Login Success:', authData.user.id);
  }

  console.log("Calling initialize_organization...");
  const { data: rpcData, error: rpcErr } = await supabase.schema('core').rpc('initialize_organization', {
    p_name: 'MindT New HQ',
    p_city: 'Mumbai',
    p_full_name: 'HQ Manager',
    p_business_domain: 'mandi'
  });

  if (rpcErr) {
    console.log('Init RPC Error:', JSON.stringify(rpcErr, null, 2));
  } else {
    console.log('Init RPC Success. Data:', rpcData);
  }
}
doIt();
