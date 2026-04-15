import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // BYPASS RLS

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data: entries, error } = await supabase
        .from('ledger_entries')
        .select('id, voucher_id, account_id, contact_id, debit, credit, description, transaction_type')
        .order('entry_date', { ascending: false })
        .limit(20)

    if (error) {
        console.error('Error fetching entries:', error)
        return
    }

    console.log('--- Recent Ledger Entries ---')
    for (const entry of entries) {
        console.log(`Desc: ${entry.description}`)
        console.log(`Type: ${entry.transaction_type}`)
        if (entry.account_id) {
            const { data: account } = await supabase.from('accounts').select('name').eq('id', entry.account_id).single()
            console.log(`Account Name: ${account?.name}`)
        }
        if (entry.contact_id) {
            const { data: contact } = await supabase.from('contacts').select('name').eq('id', entry.contact_id).single()
            console.log(`Contact Name: ${contact?.name}`)
        }
        console.log('---------------------------')
    }
}

run()
