const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRLS() {
    const { data: policies, error } = await supabase.rpc('get_policies_status');
    // Usually rpc might not exist, let's just query metadata
    const { data: tables } = await supabase.from('pg_tables').select('tablename, rowsecurity').in('tablename', ['profiles', 'contacts', 'items']);
    // Actually from service role we can just check directly if standard select works with auth
    console.log('Tables metadata:', tables);
}
// Let's use raw SQL via execute_sql instead
