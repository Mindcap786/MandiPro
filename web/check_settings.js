import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    const { data: settings } = await supabase.from('financial_settings').select('*').limit(1).single()
    console.log('Financial Settings:', settings)

    if (settings) {
        const { data: accounts } = await supabase.from('accounts').select('id, name')
        console.log('\n--- Account Mappings ---')
        for (const [key, value] of Object.entries(settings)) {
            if (key.includes('account_id') && value) {
                const acc = accounts.find(a => a.id === value)
                console.log(`${key}: ${acc ? acc.name : 'Unknown'} (${value})`)
            }
        }
    }
}

run()
