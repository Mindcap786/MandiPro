const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const matchUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const matchKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const supabaseUrl = matchUrl[1].trim();
const supabaseKey = matchKey[1].trim();

// UI way
const coreSupabase = createClient(supabaseUrl, supabaseKey, {
    global: {
        headers: {
            'Accept-Profile': 'core',
            'Content-Profile': 'core'
        }
    },
    auth: {
        persistSession: false
    },
    db: {
        schema: 'core'
    }
});

const defaultSupabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false
    }
});

async function test() {
    console.log("Logging in...");
    const { data: authData, error: authErr } = await defaultSupabase.auth.signInWithPassword({
        email: 'wh1@gmail.com',
        password: '123456'
    });
    if (authErr) {
        console.error("Auth Error:", authErr);
        return;
    }
    console.log("Logged in as:", authData.user.id);

    // Set the session for coreSupabase
    await coreSupabase.auth.setSession({
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token
    });

    console.log("\n=== UI WAY: PROFILE ===");
    const r1 = await coreSupabase.from('profiles').select('business_domain').eq('id', authData.user.id).maybeSingle();
    console.log("UI select error:", r1.error);
    console.log("UI select data:", r1.data);

    console.log("\n=== UI WAY: RPC ===");
    const r3 = await coreSupabase.rpc('initialize_organization', {
        p_name: "Test UI Org",
        p_city: "UI City",
        p_full_name: "UI Manager",
        p_business_domain: "mandi"
    });
    console.log("UI rpc error:", r3.error);
    console.log("UI rpc data:", r3.data);

}

test();
