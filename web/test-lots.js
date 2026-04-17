fetch("https://ldayxjabzyorpugwszpt.supabase.co/rest/v1/lots?select=item_id,storage_location,current_qty,supplier_rate,unit,arrivals%28arrival_type%29&limit=1", {
    headers: {"Authorization": "Bearer sbp_66cef7f0fcd1ea2bd3194e131faac951635536ad", "apikey": "sbp_66cef7f0fcd1ea2bd3194e131faac951635536ad"}
}).then(r => r.json()).then(console.log).catch(console.error);
