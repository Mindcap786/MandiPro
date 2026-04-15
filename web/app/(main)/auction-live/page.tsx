'use client'

import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Gavel, TrendingUp, Clock, Package } from 'lucide-react'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'

export default function AuctionLive() {
    const { profile } = useAuth()
    const [feed, setFeed] = useState<any[]>([])

    useEffect(() => {
        if (!profile?.organization_id) return

        fetchFeed()

        // Subscribe to mandi.sales (not the legacy public.transactions table)
        const uniqueId = Math.random().toString(36).substring(7)
        const channel = supabase
            .channel(`realtime_sales_${uniqueId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'mandi',
                    table: 'sales',
                    filter: `organization_id=eq.${profile.organization_id}`,
                },
                (payload) => {
                    setFeed((prev) => [payload.new, ...prev].slice(0, 20))
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [profile?.organization_id])

    async function fetchFeed() {
        if (!profile?.organization_id) return
        const { data } = await supabase
            .schema('mandi')
            .from('sales')
            .select('id, sale_date, total_amount, payment_mode, created_at, contact:contacts(name)')
            .eq('organization_id', profile.organization_id)
            .order('created_at', { ascending: false })
            .limit(20)

        if (data) setFeed(data)
    }

    return (
        <div className="p-8">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-neon-green tracking-tight mb-2">Live Auction Floor</h1>
                    <p className="text-gray-400 flex items-center">
                        <Gavel className="w-4 h-4 mr-2" />
                        Real-time feed of all sales activity.
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <span className="text-red-500 font-bold uppercase text-sm tracking-wider">Live</span>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Feed */}
                <div className="lg:col-span-2 space-y-4">
                    {feed.map((txn) => (
                        <div key={txn.id} className="bg-gray-900 border-l-4 border-neon-green p-4 rounded-r-xl shadow-lg flex justify-between items-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="flex items-center space-x-4">
                                <div className="bg-black p-3 rounded-full border border-gray-800">
                                    <TrendingUp className="w-5 h-5 text-neon-green" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-white">Sale Confirmed</h3>
                                    <p className="text-sm text-gray-400">
                                        Buyer: <span className="text-white">{txn.contact?.name || 'Cash Sale'}</span>
                                        {txn.payment_mode && <span className="ml-2 text-xs text-gray-500 uppercase">{txn.payment_mode}</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold text-neon-green font-mono">₹{Number(txn.total_amount).toLocaleString()}</p>
                                <p className="text-xs text-gray-500 flex items-center justify-end">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {format(new Date(txn.created_at), 'hh:mm:ss a')}
                                </p>
                            </div>
                        </div>
                    ))}

                    {feed.length === 0 && (
                        <div className="text-center py-20 bg-gray-900 rounded-xl border border-gray-800 border-dashed flex flex-col items-center gap-3">
                            <Package className="w-10 h-10 text-gray-700" />
                            <p className="text-gray-500">Waiting for live sales...</p>
                        </div>
                    )}
                </div>

                {/* Sidebar Stats */}
                <div className="space-y-6">
                    <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
                        <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-4">Today's Summary</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between border-b border-gray-800 pb-2">
                                <span className="text-gray-400 text-sm">Total Sales</span>
                                <span className="text-neon-green font-bold font-mono">
                                    ₹{feed.reduce((sum, t) => sum + Number(t.total_amount || 0), 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-gray-800 pb-2">
                                <span className="text-gray-400 text-sm">Transactions</span>
                                <span className="text-white font-bold">{feed.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
