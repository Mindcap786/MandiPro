const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyAdvancedStockOps() {
    console.log("🚀 Applying Advanced Stock Operations Migration via execute_sql RPC...");

    try {
        const sqlPath = path.join(__dirname, '../../supabase/migrations/20260312_advanced_stock_ops.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        const { data, error } = await supabase.rpc('execute_sql', {
            query_text: sql
        });

        if (error) {
            console.error("❌ RPC Failed:", error);
            process.exit(1);
        } else {
            console.log("✅ Success! Advanced stock operations applied.");
        }
    } catch (e) {
        console.error("❌ Script Error:", e);
        process.exit(1);
    }
}

applyAdvancedStockOps();
