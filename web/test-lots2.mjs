import fetch from "node-fetch";

fetch("https://ldayxjabzyorpugwszpt.supabase.co/rest/v1/lots?select=item_id,storage_location,current_qty,supplier_rate,unit,arrivals(arrival_type)&limit=1", {
    headers: {"Authorization": "Bearer sbp_66cef7f0fcd1ea2bd3194e131faac951635536ad", "apikey": "sbp_66cef7f0fcd1ea2bd3194e131faac951635536ad"}
}).then(r => r.json()).then(console.log).catch(console.error);
