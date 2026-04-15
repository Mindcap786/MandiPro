const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applySql() {
    console.log("🚀 Applying Payment RPC Migration...");

    try {
        const sql = fs.readFileSync('./supabase/migrations/20260131_create_payment_rpc.sql', 'utf8');

        const { error } = await supabase.rpc('execute_sql', {
            query_text: sql
        });

        if (error) {
            console.error("❌ RPC Failed:", error);
            // Fallback: If execute_sql RPC doesn't exist (it should from previous steps, but safety first)
            console.log("⚠️ If execute_sql is missing, you must run this via Dashboard SQL Editor.");
        } else {
            console.log("✅ Success! RPC 'create_financial_transaction' created.");
        }
    } catch (e) {
        console.error("❌ Script Error:", e);
    }
}

applySql();
