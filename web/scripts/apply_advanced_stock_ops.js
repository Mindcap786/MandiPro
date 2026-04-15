const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Credentials from apply_sql_direct.js
const DB_REF = 'ldayxjabzyorpugwszpt';
const DB_PASS = 'Shaik@admin1-';
const ENCODED_PASS = encodeURIComponent(DB_PASS);

async function applyMigration() {
    const sqlPath = path.join(__dirname, '../../supabase/migrations/20260312_advanced_stock_ops.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`🔌 Connecting to db.${DB_REF}.supabase.co...`);
    const connectionString = `postgres://postgres:${ENCODED_PASS}@db.${DB_REF}.supabase.co:5432/postgres`;

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 20000
    });

    try {
        await client.connect();
        console.log(`✅ Connected!`);
        console.log("📜 Executing Advanced Stock Operations Migration...");
        await client.query(sql);
        console.log("✅ Migration Applied Successfully!");
        await client.end();
    } catch (e) {
        console.log(`❌ Failed:`, e.message);
        await client.end();
        process.exit(1);
    }
}

applyMigration();
