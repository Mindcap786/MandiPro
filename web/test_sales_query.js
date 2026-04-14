require('dotenv').config({ path: '.env.local' });

async function testQuery() {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sales?select=*%2Ccontact%3Acontacts!sales_buyer_id_fkey(id%2Cname)%2Csale_items(*%2Clot%3Alots(lot_code%2Carrival_type%2Csupplier_rate%2Ccommission_percent%2Cgrade%2Cvariety%2Citem%3Acommodities(name)))%2Csale_adjustments(id)%2Cvouchers(amount%2Cdiscount_amount%2Ctype)&limit=1`;
    
    console.log("Fetching from:", url);
    
    try {
        const res = await fetch(url, {
            headers: {
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                "Accept-Profile": "mandi"
            }
        });
        
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

testQuery();
