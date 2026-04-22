const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = '.env.local';
let envContent = fs.readFileSync(envPath, 'utf8');

const matchUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const matchKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!matchUrl || !matchKey) {
    console.error("Missing URL or Service Role Key in .env.local");
    process.exit(1);
}

const supabase = createClient(matchUrl[1].trim(), matchKey[1].trim(), {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
    // We need the organization_id of the user 'wh1@gmail.com'
    const email = 'wh1@gmail.com';
    const { data: userList } = await supabase.auth.admin.listUsers();
    const user = userList.users.find(u => u.email === email);

    if (!user) {
        console.error("User wh1@gmail.com not found. Cannot determine organization_id.");
        return;
    }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
    if (!profile || !profile.organization_id) {
        console.error("No organization_id found for user.");
        return;
    }
    const orgId = profile.organization_id;

    console.log("Seeding data for organization:", orgId);

    // 1. Create Suppliers
    const { data: existingSuppliers } = await supabase.from('contacts').select('id, name').eq('organization_id', orgId).eq('type', 'supplier');
    const existingSupplierNames = (existingSuppliers || []).map(s => s.name);

    const suppliersToCreate = [
        { organization_id: orgId, type: 'supplier', name: 'Global Agro Suppliers', city: 'Mumbai', state_code: '27', gstin: '27AABCU9603R1Z2' },
        { organization_id: orgId, type: 'supplier', name: 'Premium Harvest Co', city: 'Pune', state_code: '27', gstin: '27DEFGU1234H1Z5' }
    ].filter(s => !existingSupplierNames.includes(s.name));

    let suppliers = [...(existingSuppliers || [])];
    if (suppliersToCreate.length > 0) {
        const { data: newSuppliers } = await supabase.from('contacts').insert(suppliersToCreate).select();
        suppliers.push(...(newSuppliers || []));
        console.log(`Created ${suppliersToCreate.length} suppliers.`);
    }

    // 2. Create Items
    const { data: existingItems } = await supabase.from('commodities').select('id, name').eq('organization_id', orgId);
    const existingItemNames = (existingItems || []).map(i => i.name);

    const itemsToCreate = [
        { organization_id: orgId, name: 'Premium Basmati Rice', hsn_code: '10063020', gst_rate: 5, default_unit: 'Kg', is_gst_exempt: false, purchase_price: 80 },
        { organization_id: orgId, name: 'Organic Turmeric Powder', hsn_code: '09103030', gst_rate: 5, default_unit: 'Kg', is_gst_exempt: false, purchase_price: 150 },
        { organization_id: orgId, name: 'Fresh Apples (Kashmiri)', hsn_code: '08081000', gst_rate: 0, default_unit: 'Box', is_gst_exempt: true, purchase_price: 1200 }
    ].filter(i => !existingItemNames.includes(i.name));

    let items = [...(existingItems || [])];
    if (itemsToCreate.length > 0) {
        const { data: newItems } = await supabase.from('commodities').insert(itemsToCreate).select();
        items.push(...(newItems || []));
        console.log(`Created ${itemsToCreate.length} items.`);
    }

    // 3. Add Inventory Lots (Stock)
    if (suppliers.length > 0 && items.length > 0) {
        const lotsToCreate = [
            { organization_id: orgId, item_id: items[0].id, contact_id: suppliers[0].id, lot_code: 'LOT-RICE-001', initial_qty: 1000, current_qty: 1000, unit: 'Kg', arrival_type: 'direct', supplier_rate: 80, status: 'active' },
            { organization_id: orgId, item_id: items[1].id, contact_id: suppliers[1].id, lot_code: 'LOT-TURM-001', initial_qty: 200, current_qty: 200, unit: 'Kg', arrival_type: 'direct', supplier_rate: 150, status: 'active' },
            { organization_id: orgId, item_id: items[2].id, contact_id: suppliers[0].id, lot_code: 'LOT-APPL-001', initial_qty: 50, current_qty: 50, unit: 'Box', arrival_type: 'direct', supplier_rate: 1200, status: 'active' }
        ];

        // Let's just create them directly
        const { data: newLots, error: lotError } = await supabase.from('lots').insert(lotsToCreate).select();
        if (lotError) {
            console.error("Error creating lots:", lotError);
        } else {
            console.dir(newLots);
            console.log(`Added ${newLots.length} stock lots. You are ready to sell!`);
        }
    }
}

main();
