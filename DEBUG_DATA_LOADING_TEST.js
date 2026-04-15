// DEBUG TEST: Data Loading Issue Diagnosis
// Run this in browser console while logged in

async function debugDataLoading() {
    const { createClient } = window.supabase;
    const supabase = window.supabase;
    
    console.log("🔍 DEBUGGING DATA LOADING ISSUE...\n");
    
    // TEST 1: Check if user is authenticated
    console.log("TEST 1: Authentication");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error("❌ NOT AUTHENTICATED:", authError?.message);
        return;
    }
    console.log("✅ Authenticated as:", user.email);
    console.log("   User ID:", user.id, "\n");
    
    // TEST 2: Fetch profile via RPC (same as app)
    console.log("TEST 2: Fetch Profile via RPC");
    const { data: rpcContext, error: rpcError } = await supabase.rpc('get_full_user_context', {
        p_user_id: user.id
    });
    
    if (rpcError) {
        console.warn("⚠️  RPC failed:", rpcError.message);
    } else if (rpcContext) {
        console.log("✅ RPC Context loaded");
        console.log("   Org ID:", rpcContext.organization?.id);
        console.log("   Org Name:", rpcContext.organization?.name);
        console.log("   Role:", rpcContext.role);
        console.log("   Profile exists:", !!rpcContext);
    } else {
        console.log("⚠️  RPC returned no context\n");
    }
    
    // TEST 3: Direct profile lookup (fallback)
    console.log("\nTEST 3: Direct Profile Lookup from core.profiles");
    const { data: directProfile, error: directError } = await supabase
        .schema('core')
        .from('profiles')
        .select('*, organization:organization_id(*)')
        .eq('id', user.id)
        .maybeSingle();
    
    if (directError) {
        console.error("❌ Direct lookup failed:", directError.message);
    } else if (directProfile) {
        console.log("✅ Direct profile found");
        console.log("   Organization ID:", directProfile.organization_id);
        console.log("   Organization:", directProfile.organization?.name);
    } else {
        console.log("❌ No profile found in core.profiles for this user");
    }
    
    const orgId = rpcContext?.organization?.id || directProfile?.organization_id;
    
    if (!orgId) {
        console.error("\n❌ CRITICAL: Cannot determine organization ID");
        return;
    }
    
    console.log(`\n✅ Using Organization ID: ${orgId}\n`);
    
    // TEST 4: Check if sales exist for this org
    console.log("TEST 4: Count Sales for this Organization");
    const { data: salesCount, error: countError } = await supabase
        .schema('mandi')
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId);
    
    if (countError) {
        console.error("❌ Count query failed:", countError.message);
    } else {
        console.log("✅ Sales count query succeeded");
        console.info(`   Total sales for this org: ${salesCount?.length || 'checking...'}`);
    }
    
    // TEST 5: Fetch first 5 sales
    console.log("\nTEST 5: Fetch Sample Sales Data");
    const { data: salesData, error: salesError } = await supabase
        .schema('mandi')
        .from('sales')
        .select('id, sale_date, total_amount, payment_status')
        .eq('organization_id', orgId)
        .limit(5);
    
    if (salesError) {
        console.error("❌ Sales fetch failed:", salesError.message);
        console.error("   Code:", salesError.code);
        console.error("   Details:", salesError.details);
    } else if (salesData && salesData.length > 0) {
        console.log("✅ Sales data loaded!");
        console.log(`   Found ${salesData.length} sales`);
        salesData.forEach((sale, idx) => {
            console.log(`   ${idx + 1}. Sale ${sale.id}: ₹${sale.total_amount} (${sale.payment_status})`);
        });
    } else {
        console.warn("⚠️  No sales data returned (empty array)");
    }
    
    // TEST 6: Check RLS by testing unauthorized org
    console.log("\nTEST 6: RLS Security Test");
    const fakeOrgId = '00000000-0000-0000-0000-000000000000';
    const { data: fakeData, error: fakeError } = await supabase
        .schema('mandi')
        .from('sales')
        .select('id')
        .eq('organization_id', fakeOrgId)
        .limit(1);
    
    if (fakeError) {
        console.warn("✅ RLS is working (got error for fake org as expected):", fakeError.message);
    } else if (fakeData && fakeData.length === 0) {
        console.log("✅ RLS is working (no data returned for fake org)");
    }
    
    // TEST 7: Arrivals test
    console.log("\nTEST 7: Fetch Sample Arrivals Data");
    const { data: arrivalsData, error: arrivalsError } = await supabase
        .schema('mandi')
        .from('arrivals')
        .select('id, arrival_date, arrival_type')
        .eq('organization_id', orgId)
        .limit(5);
    
    if (arrivalsError) {
        console.error("❌ Arrivals fetch failed:", arrivalsError.message);
    } else if (arrivalsData && arrivalsData.length > 0) {
        console.log("✅ Arrivals data loaded!");
        console.log(`   Found ${arrivalsData.length} arrivals`);
    } else {
        console.warn("⚠️  No arrivals data returned (empty array)");
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Authenticated: ${user.email}`);
    console.log(`✅ Organization: ${orgId}`);
    console.log(`${salesData?.length ? '✅' : '❌'} Sales loaded: ${salesData?.length || 0}`);
    console.log(`${arrivalsData?.length ? '✅' : '❌'} Arrivals loaded: ${arrivalsData?.length || 0}`);
}

// Run the test
debugDataLoading().catch(err => console.error("Test error:", err));
