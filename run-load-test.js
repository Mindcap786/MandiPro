const SUPABASE_URL = 'https://ldayxjabzyorpugwszpt.supabase.co';
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

async function runTest() {
    console.log("🚀 Starting Real-Time Node.js Load Test (Service Role bypassing RLS)...");

    const HEADERS = {
        'apikey': SUPABASE_SERVICE_ROLE,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        'Accept-Profile': 'mandi' // Specify the mandi schema!
    };

    const CONCURRENCY = 500; // Simulate 500 strict concurrent requests to hammer DB
    
    // Quick Debug Call
    const testRes = await fetch(`${SUPABASE_URL}/rest/v1/lots?select=*&limit=1`, { headers: HEADERS });
    if (!testRes.ok) {
        console.error("DEBUG ERROR payload:", await testRes.text());
        return;
    }

    console.log(`📡 [TEST 1] Hitting /lots endpoint with ${CONCURRENCY} concurrent requests...`);
    const lotsStart = Date.now();
    const lotsPromises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        lotsPromises.push(
            fetch(`${SUPABASE_URL}/rest/v1/lots?select=*&limit=50`, { headers: HEADERS }).then(r => r.ok)
        );
    }
    const lotsResults = await Promise.all(lotsPromises);
    const lotsEnd = Date.now();
    const lotsSuccesses = lotsResults.filter(Boolean).length;
    
    console.log(`🟢 [TEST 1 RESULT]`);
    console.log(`   - Total Requests: ${CONCURRENCY}`);
    console.log(`   - Successful DB Hits: ${lotsSuccesses}`);
    console.log(`   - Dropped/Failed: ${CONCURRENCY - lotsSuccesses}`);
    console.log(`   - Total Time Taken: ${lotsEnd - lotsStart}ms`);
    console.log(`   - Average Latency per request: ${((lotsEnd - lotsStart) / CONCURRENCY).toFixed(2)}ms`);
    console.log("--------------------------------------------------\n");

    console.log(`📡 [TEST 2] Hitting /sales endpoint with ${CONCURRENCY} concurrent requests...`);
    const salesStart = Date.now();
    const salesPromises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        salesPromises.push(
            fetch(`${SUPABASE_URL}/rest/v1/sales?select=*&limit=20&order=created_at.desc`, { headers: HEADERS }).then(r => r.ok)
        );
    }
    const salesResults = await Promise.all(salesPromises);
    const salesEnd = Date.now();
    const salesSuccesses = salesResults.filter(Boolean).length;

    console.log(`🟢 [TEST 2 RESULT]`);
    console.log(`   - Total Requests: ${CONCURRENCY}`);
    console.log(`   - Successful DB Hits: ${salesSuccesses}`);
    console.log(`   - Dropped/Failed: ${CONCURRENCY - salesSuccesses}`);
    console.log(`   - Total Time Taken: ${salesEnd - salesStart}ms`);
    console.log(`   - Average Latency per request: ${((salesEnd - salesStart) / CONCURRENCY).toFixed(2)}ms`);
    console.log("--------------------------------------------------\n");

    console.log("🎉 Load Test Complete.");
}

runTest();
