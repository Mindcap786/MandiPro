require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testFetch() {
    const schema = 'mandi';
    // I need to use a valid org ID or just check if the query structure is valid.
    // Even without a valid org ID, an exposed schema issue will fail immediately.
    console.log(`Testing fetch on schema: ${schema}`);

    try {
        const { data, error } = await supabase.schema(schema).from('contacts').select('id, name, type').limit(1);
        if (error) {
            console.error("Contacts Error:", error);
        } else {
            console.log("Contacts Data:", data);
        }

        const res2 = await supabase.schema(schema).from('commodities').select('id, name, default_unit').limit(1);
        if (res2.error) {
            console.error("Commodities Error:", res2.error);
        } else {
            console.log("Commodities Data:", res2.data);
        }

        const res3 = await supabase.schema(schema).from('storage_locations').select('name, is_active').limit(1);
        if (res3.error) {
            console.error("Storage Locations Error:", res3.error);
        } else {
            console.log("Storage Locations Data:", res3.data);
        }

    } catch (err) {
        console.error("Caught exception:", err);
    }
}

testFetch();
