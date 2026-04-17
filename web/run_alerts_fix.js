const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    console.log("🚀 Repairing stock_alerts table...");

    try {
        const sqlPath = path.join(__dirname, 'supabase/migrations/20260410_fix_stock_alerts.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        const { data, error } = await supabase.rpc('execute_sql', {
            query_text: sql
        });

        if (error) {
            console.error("❌ Migration Failed:", error);
            process.exit(1);
        } else {
            console.log("✅ Success! stock_alerts table is now healthy and supports 'Seen' logic.");
        }
    } catch (e) {
        console.error("❌ Runner Error:", e);
        process.exit(1);
    }
}

runMigration();
