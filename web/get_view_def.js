const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getViewDef() {
    console.log("🔍 Fetching definition of 'view_location_stock'...");

    const { data, error } = await supabase
        .rpc('execute_sql', {
            query_text: "SELECT definition FROM pg_views WHERE viewname = 'view_location_stock';"
        });

    if (error) {
        // If RPC fails, try raw query? (Usually we don't have execute_sql RPC unless created)
        console.log("RPC failed, trying raw select if any...");
        const { data: d2, error: e2 } = await supabase.from('pg_views').select('definition').eq('viewname', 'view_location_stock');
        if (e2) console.error("Error:", e2);
        else console.log(d2[0]?.definition);
    } else {
        console.log(data[0]?.definition);
    }
}

getViewDef();
