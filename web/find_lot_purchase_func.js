import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // BYPASS RLS

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data: procs, error } = await supabase.rpc('execute_sql_query', {
        query: "SELECT proname, prosrc FROM pg_proc WHERE prosrc ILIKE '%lot_purchase%';"
    })

    if (error) {
        // If we don't have an execute_sql_query rpc, let's try reading the migrations directly
        console.error('RPC Error:', error.message)
    } else {
        console.log(procs)
    }
}
run()
