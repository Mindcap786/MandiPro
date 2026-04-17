const { createClient } = require('@supabase/supabase-js')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZudHlsYmN2dHR6dHR6Y3liZ2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTExMDMyOTUsImV4cCI6MjAyNjg3OTI5NX0.xxx';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { count, error } = await supabase.schema('mandi').from('item_images').select('*', { count: 'exact', head: true });
    console.log('Result:', { count, error });
}
check();
