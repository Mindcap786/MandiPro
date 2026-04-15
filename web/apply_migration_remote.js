const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'ldayxjabzyorpugwszpt';
const ACCESS_TOKEN = 'sbp_ccb0afdea158f92bf469d11c797c25e22616330f';
const SQL_FILE_PATH = path.join(__dirname, 'supabase/migrations/20260228_add_barcode_to_lots.sql');

async function applyMigration() {
    try {
        const query = fs.readFileSync(SQL_FILE_PATH, 'utf8');

        console.log(`Applying migration to project ${PROJECT_REF}...`);

        // Using native fetch (Node 18+) or https module if older. Assuming fetch exists.
        const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('Migration successfully applied!');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Failed to apply migration:', error);
        process.exit(1);
    }
}

applyMigration();
