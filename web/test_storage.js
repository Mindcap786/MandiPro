const fs = require('fs');

async function testUpload() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZudHlsYmN2dHR6dHR6Y3liZ2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTExMDMyOTUsImV4cCI6MjAyNjg3OTI5NX0.xxx'; // Grabbed default anon key from local studio if needed, but going to assume we can fetch anonymously
    
    // Create dummy 1x1 png 
    const testContent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    
    console.log('Testing raw REST upload to item_images bucket...');
    
    const response = await fetch(`${supabaseUrl}/storage/v1/object/item_images/test_pixel.png`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'image/png'
        },
        body: testContent
    });

    const result = await response.json().catch(() => response.text());
    console.log('Upload Result:', response.status, result);
}

testUpload();
