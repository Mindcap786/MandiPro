const { createClient } = require('@supabase/supabase-js');
const matchUrl = require('fs').readFileSync('.env.local', 'utf8').match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const matchKey = require('fs').readFileSync('.env.local', 'utf8').match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const coreDb = createClient(matchUrl[1].trim(), matchKey[1].trim(), {
    db: { schema: 'core' },
    global: { headers: { 'Accept-Profile': 'core' } }
});
coreDb.from('profiles').select('*').limit(1).then(res => console.log(res));
