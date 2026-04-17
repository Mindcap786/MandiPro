const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Credentials provided by user
const DB_REF = 'ldayxjabzyorpugwszpt';
const DB_PASS = 'Shaik@admin1-';
const ENCODED_PASS = encodeURIComponent(DB_PASS);

const REGIONS = ['direct'];

async function applyMigration() {
    const sqlPath = path.join(__dirname, 'supabase/migrations/20260228_add_barcode_to_lots.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`🔌 Trying Direct Connection (db.${DB_REF}.supabase.co)...`);
    // DIRECT Connection: User 'postgres', Host 'db.[ref].supabase.co', Port 5432
    const connectionString = `postgres://postgres:${ENCODED_PASS}@db.${DB_REF}.supabase.co:5432/postgres`;

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 20000
    });

    try {
        await client.connect();
        console.log(`✅ Connected!`);
        console.log("📜 Executing Migration...");
        await client.query(sql);
        console.log("✅ Migration Applied Successfully!");
        await client.end();
    } catch (e) {
        console.log(`❌ Failed Direct:`, e.message);
        await client.end();
    }
}

applyMigration();
