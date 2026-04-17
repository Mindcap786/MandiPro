const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fix() {
  // The user "Imran" (imran786) profile has org: 76c6d2ad-a3e0-4b41-a736-ff4b7ca14da8
  // That org has sales data (found in Step 2 above).
  // But the profile we updated (rrr786 / 47786852) now points to 51771d21 which only has 15 sales.
  
  // The REAL admin is "Imran Bhai" (imran786) → org: 76c6d2ad-a3e0-4b41-a736-ff4b7ca14da8
  // Check sales count for Imran's org
  const imranOrg = '76c6d2ad-a3e0-4b41-a736-ff4b7ca14da8';
  const { count: imranSales } = await supabase.schema('mandi').from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', imranOrg);
  console.log("Imran Bhai org (76c6d2ad) sales count:", imranSales);

  const imranOrg2 = '0586decf-b686-45a7-bff8-2f55309234a1';
  const { count: imranSales2 } = await supabase.schema('mandi').from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', imranOrg2);
  console.log("Imran (imran123) org (0586decf) sales count:", imranSales2);

  // Also get latest 3 sales for the IMRAN786 org to confirm it's the right one
  const { data: latestSales } = await supabase.schema('mandi').from('sales')
    .select('id, bill_no, total_amount, sale_date, payment_mode, created_at')
    .eq('organization_id', imranOrg)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log("\nLatest 5 sales for imran786 org:", latestSales);
}
fix();
