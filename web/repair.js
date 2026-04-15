const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
        await client.connect();
        const sql = fs.readFileSync('supabase/migrations/20260410_fix_stock_alerts.sql', 'utf8');
        console.log("Running migration...");
        await client.query(sql);
        console.log("Reloading schema...");
        await client.query("NOTIFY pgrst, 'reload schema';");
        console.log("Success!");
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
