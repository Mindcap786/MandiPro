import { GateEntryTable } from '@/components/gate/gate-entry-table'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Truck } from 'lucide-react'

// Since this is a server component, we can fetch data directly (in Next.js App Router)
// For static export (Capacitor), this would be force-static, but for Web (with auth) it MUST be force-dynamic
export const dynamic = 'force-dynamic'

async function getGateEntries() {
    const cookieStore = cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() {}, // Read-only in server components
            },
        }
    )
    const { data, error } = await supabase
        .schema('mandi')
        .from('lots')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Error fetching lots:", error)
        return []
    }
    return data || []
}

import { NewEntryModal } from '@/components/gate/new-entry-modal'

export default async function GateLogs() {
    const gateEntries = await getGateEntries()

    return (
        <div className="p-8">
            <header className="flex justify-between items-end mb-8 animate-in slide-in-from-top-4 duration-500">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tight mb-2 drop-shadow-[0_0_10px_rgba(57,255,20,0.4)]">
                        Inward Log
                    </h1>
                    <p className="text-gray-300 flex items-center font-medium">
                        <Truck className="w-4 h-4 mr-2 text-neon-blue" />
                        Real-time tracking of all vehicle arrivals and generated lots.
                    </p>
                </div>
                <NewEntryModal />
            </header>

            <GateEntryTable data={gateEntries} />
        </div>
    )
}
