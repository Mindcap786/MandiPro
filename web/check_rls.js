const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Checking RLS Policies for mandi.sales...");
  const { data: policies, error } = await supabase.rpc('exec_sql', { query: `
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'mandi' AND tablename = 'sales';
  ` });
  
  if (error) {
    console.error("Error fetching policies:", error);
    // Fallback: try to see if we can just dump the table structure and RLS status
    const { data: tables } = await supabase.rpc('exec_sql', { query: `
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'mandi' AND tablename = 'sales';
    ` });
    console.log("Table RLS Status:", tables);
  } else {
    console.log("RLS Policies:", JSON.stringify(policies, null, 2));
  }
}
run();
