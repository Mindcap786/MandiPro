const { Client } = require('pg');

const ENCODED_PASS = encodeURIComponent('Shaik@admin1-');
const connectionString = `postgres://postgres:${ENCODED_PASS}@db.ldayxjabzyorpugwszpt.supabase.co:5432/postgres`;

async function dump() {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    
    // Check create_mixed_arrival
    const res1 = await client.query(`
        SELECT proname, nspname, prosecdef, pg_get_functiondef(p.oid) as def 
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE proname = 'create_mixed_arrival'
    `);
    console.log("create_mixed_arrival:", res1.rows.length ? "EXISTS in " + res1.rows.map(r => r.nspname).join(', ') : "MISSING");
    
    // Check get_pnl_summary
    const res2 = await client.query(`
        SELECT proname, nspname 
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE proname = 'get_pnl_summary'
    `);
    console.log("get_pnl_summary:", res2.rows.length ? "EXISTS in " + res2.rows.map(r => r.nspname).join(', ') : "MISSING");
    
    // Check what is in public
    const res3 = await client.query(`
        SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE nspname = 'public' AND proname IN ('create_mixed_arrival', 'post_arrival_ledger', 'confirm_sale_transaction', 'get_pnl_summary')
    `);
    console.log("public wrappers:", res3.rows.map(r => r.proname));

    await client.end();
}
dump();
