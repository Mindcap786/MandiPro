const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function repairDB() {
    const client = new Client({
        connectionString: "postgresql://postgres:9SjI2m*M@ldayxjabzyorpugwszpt.supabase.co:5432/postgres",
    });

    try {
        await client.connect();
        console.log("✅ Connected to Postgres. Running healthy migrations...");

        const sqlPath = path.join(__dirname, 'supabase/migrations/20260410_fix_stock_alerts.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await client.query(sql);
        console.log("✅ Database schema applied.");

        // CRITICAL: Reload PostgREST schema cache to fix 404s
        await client.query("NOTIFY pgrst, 'reload schema';");
        console.log("✅ PostgREST schema cache reloaded. 404s should disappear.");

    } catch (err) {
        console.error("❌ Database repair failed:", err);
    } finally {
        await client.end();
    }
}

repairDB();
