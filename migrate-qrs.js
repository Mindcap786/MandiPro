const SUPABASE_URL = 'https://ldayxjabzyorpugwszpt.supabase.co';
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

async function updateLegacyQR() {
    console.log("Fetching lots...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lots?select=id,qr_code`, {
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
            'Accept-Profile': 'mandi'
        }
    });
    
    const lots = await res.json();
    console.log(`Found ${lots.length} lots. Checking for legacy formats...`);

    let count = 0;
    for (const lot of lots) {
        if (lot.qr_code && (lot.qr_code.includes('{') || lot.qr_code.includes('MANDI'))) {
            const newQr = Math.floor(100000 + Math.random() * 900000).toString();
            console.log(`Updating lot ${lot.id} -> new QR: ${newQr}`);
            
            await fetch(`${SUPABASE_URL}/rest/v1/lots?id=eq.${lot.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_SERVICE_ROLE,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
                    'Content-Type': 'application/json',
                    'Accept-Profile': 'mandi'
                },
                body: JSON.stringify({ qr_code: newQr })
            });
            count++;
        }
    }
    console.log(`Successfully migrated ${count} legacy QR codes to modern 6-digit numeric strings.`);
}

updateLegacyQR();
