const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY3OTE5MTExNSwiZXhwIjoxOTk0NzY3MTE1fQ.X_--bLw6U-zI1_bB8X7lZ27eO6Z-2jJ-9lq8Hh8M4iM'; // default local key

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_function_def', { func_name: 'post_arrival_ledger' });
  if (error) {
    console.error('Error with RPC:', error);
    // fallback query if admin access provided by service_role key
  } else {
    fs.writeFileSync('/tmp/dump.sql', data);
  }
}
run();
