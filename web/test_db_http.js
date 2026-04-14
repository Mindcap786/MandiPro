const https = require('https');

const SUPABASE_URL = 'https://ldayxjabzyorpugwszpt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';
// We know manager@mindt.com is the test org, its ID exists in local storage or from prior searches
// Let's first quickly query the public schema for the organization ID
function makeRequest(path, method = 'GET', body = null, schema='public') {
    return new Promise((resolve, reject) => {
        const url = new URL(path, SUPABASE_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Accept-Profile': schema
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    try {
        console.log("---- Fetching Org ID from public ----");
        let orgId = '';
        let schema = 'mandi';

        try {
            const orgs = await makeRequest('/rest/v1/organizations?select=id,name&limit=1', 'GET', null, 'public');
            console.log("Org found:", orgs);
            if (orgs.length > 0) orgId = orgs[0].id;
        } catch(e) { console.log('Err getting org:', e.message); }

        if(!orgId) {
             const profiles = await makeRequest('/rest/v1/profiles?select=organization_id,email,business_domain&limit=1', 'GET', null, 'public');
            console.log("Profile found:", profiles);
            if(profiles.length > 0) {
                orgId = profiles[0].organization_id;
                schema = profiles[0].business_domain === 'wholesaler' ? 'wholesale' : 'mandi';
            }
        }
        
        if(!orgId) {
            console.log("Could not find an org ID to test with.");
            return;
        }

        console.log(`Using Org ID: ${orgId} | Schema: ${schema}`);

        // 1. Query ledger_entries directly
        try {
            const ledgers = await makeRequest(`/rest/v1/ledger_entries?organization_id=eq.${orgId}&select=id,debit,credit,transaction_type,entry_date&limit=10`, 'GET', null, schema);
            console.log(`\nLedger Entries (${ledgers.length}):`, ledgers.slice(0, 3));
            
            // Sum all debits/credits to see if they balance or exist
            const sums = ledgers.reduce((acc, l) => ({ dr: acc.dr + (l.debit||0), cr: acc.cr + (l.credit||0) }), {dr:0, cr:0});
            console.log(`Sample Sum - Debits: ${sums.dr}, Credits: ${sums.cr}`);
        } catch(e) { console.log('Ledger Err:', e.message); }

        // 2. Query view_party_balances
        try {
            const views = await makeRequest(`/rest/v1/view_party_balances?organization_id=eq.${orgId}&limit=5`, 'GET', null, schema);
            console.log(`\nParty Balances (${views.length}):`, views);
        } catch(e) { console.log('View Err:', e.message); }

        // 3. Query get_financial_summary RPC
        try {
            console.log(`\nCalling ${schema}.get_financial_summary...`);
            const rpcRes = await makeRequest(`/rest/v1/rpc/get_financial_summary`, 'POST', { p_org_id: orgId }, schema);
            console.log("RPC Output:", rpcRes);
        } catch(e) { console.log('RPC Err:', e.message); }

    } catch (e) {
        console.error("Test Failed:", e.message);
    }
}

run();
