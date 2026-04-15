'use client'
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Loader2, Calendar, CheckCircle, Calculator, TrendingUp, AlertCircle, DollarSign, Filter, Search } from 'lucide-react'
import { BillingService, BillConfig } from '@/lib/services/billing-service'


// Types
interface PendingLot {
    id: string
    lot_code: string
    farmer_id: string
    farmers: { name: string, village: string }
    item_type: string
    grade: string
    total_weight: number
    current_quantity: number
    commission_percent: number
    advance_paid: number
    created_at: string
}

interface FarmerGroup {
    farmer_id: string
    farmer_name: string
    farmer_village: string
    lots: PendingLot[]
    total_weight: number
    total_advance: number
    avg_commission: number
    proposed_rate: string // Input state
}

export default function DailyRateFixer() {
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [farmerGroups, setFarmerGroups] = useState<FarmerGroup[]>([])
    const [generating, setGenerating] = useState<string | null>(null) // farmer_id being processed
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])

    useEffect(() => {
        if (user) fetchPendingArrivals()
    }, [user, dateFilter])

    async function fetchPendingArrivals() {
        setLoading(true)
        try {
            // Fetch lots that are pending billing
            // Only 'commission' type usually gets settled this way? 
            // Or both? 'self_purchase' is already fixed at gate? 
            // Usually 'Commission' deals need Rate Fixing. 'Self Purchase' rate is fixed at gate.
            // Let's filter for trading_model = 'commission' primarily, but let's show all "Pending" for now.

            const { data, error } = await supabase
                .schema('mandi')
                .from('lots')
                .select(`
                    *,
                    farmers (name, village)
                `)
                .eq('billing_status', 'pending')
                .eq('trading_model', 'commission') // FOCUS ON COMMISSION AGENT FLOW
                .order('created_at', { ascending: false })

            if (error) throw error

            // Group by Farmer
            const groups: Record<string, FarmerGroup> = {}

            data.forEach((lot: any) => {
                // Filter by date if needed (client side or DB side)
                const lotDate = lot.created_at.split('T')[0]
                if (lotDate !== dateFilter) return // Simple date filter

                if (!groups[lot.farmer_id]) {
                    groups[lot.farmer_id] = {
                        farmer_id: lot.farmer_id,
                        farmer_name: lot.farmers?.name || 'Unknown',
                        farmer_village: lot.farmers?.village || '',
                        lots: [],
                        total_weight: 0,
                        total_advance: 0,
                        avg_commission: 0,
                        proposed_rate: ''
                    }
                }
                groups[lot.farmer_id].lots.push(lot)
                groups[lot.farmer_id].total_weight += Number(lot.total_weight) || 0
                groups[lot.farmer_id].total_advance += Number(lot.advance_paid) || 0
            })

            setFarmerGroups(Object.values(groups))
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    async function handleGenerateBill(group: FarmerGroup) {
        if (!group.proposed_rate) {
            alert('Please set a Settlement Rate first.')
            return
        }

        const rate = parseFloat(group.proposed_rate)
        if (isNaN(rate) || rate <= 0) {
            alert('Invalid Rate')
            return
        }

        setGenerating(group.farmer_id)
        try {
            // 1. Get Merchant ID (Current User/Owner)
            // In real app, cleaner way to get merchant_id
            const { data: merchant } = await supabase.from('merchants').select('id').eq('owner_id', user?.id).single()

            if (!merchant) throw new Error('Merchant profile not found')

            const config: BillConfig = {
                merchant_id: merchant.id,
                farmer_id: group.farmer_id,
                lot_ids: group.lots.map(l => l.id),
                settlement_rate: rate
            }

            // 2. Call Service
            const result = await BillingService.generateFarmerBill(config)

            // 3. Save to DB (Quick Logic here, ideally move to Service fully if Supabase had Edge Functions ready, but client side for now)
            // A. Create Bill Record (Mock table 'invoices' or use generic json for log)
            // B. Update Lots

            // Update Lots Status
            await supabase
                .schema('mandi')
                .from('lots')
                .update({
                    billing_status: 'billed',
                    final_settlement_rate: rate
                })
                .in('id', config.lot_ids)

            alert(`Bill Generated! Net Payable: ₹${result.bill.net_payable.toLocaleString()}`)

            // Refresh
            fetchPendingArrivals()

        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setGenerating(null)
        }
    }

    return (
        <div className="p-8">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4 animate-in slide-in-from-top-5 duration-700">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tight mb-2 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] flex items-center gap-3">
                        <Calculator className="w-8 h-8 text-neon-green" />
                        Daily Rate Fixer
                    </h1>
                    <p className="text-gray-300 mt-2 text-sm uppercase tracking-widest font-medium">
                        Approvals & Settlement Cockpit
                    </p>
                </div>

                <div className="flex items-center gap-4 glass-panel px-4 py-2 rounded-xl">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                        className="bg-transparent border-none text-white font-bold outline-none text-sm uppercase tracking-wider focus:ring-0"
                    />
                </div>
            </header>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center items-center h-64"><Loader2 className="w-10 h-10 animate-spin text-neon-green" /></div>
            ) : farmerGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 glass-panel rounded-3xl border border-dashed border-gray-700">
                    <div className="w-20 h-20 bg-neon-green/10 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle className="w-10 h-10 text-neon-green" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">All Caught Up</h3>
                    <p className="text-gray-400">No pending commission arrivals for this date.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-8">
                    {farmerGroups.map(group => (
                        <div key={group.farmer_id} className="glass-panel rounded-3xl overflow-hidden hover:border-white/20 transition-all duration-300 shadow-2xl relative group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-neon-green/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            {/* Group Header */}
                            <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-white/5 bg-black/20">
                                <div className="flex items-center gap-6 w-full md:w-auto">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center text-2xl font-bold text-white shadow-inner">
                                        {group.farmer_name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white mb-1">{group.farmer_name}</h3>
                                        <div className="flex items-center gap-3">
                                            <span className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-gray-300 border border-white/5">{group.farmer_village}</span>
                                            <span className="text-xs text-neon-green font-bold flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse"></span>
                                                {group.lots.length} Pending Lots
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end bg-black/40 p-4 rounded-xl border border-white/5">
                                    <div className="text-right border-r border-white/10 pr-6">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Total Weight</div>
                                        <div className="text-2xl font-black text-white">{group.total_weight.toLocaleString()} <span className="text-sm font-medium text-gray-500">kg</span></div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Advance Paid</div>
                                        <div className="text-2xl font-black text-red-500">₹{group.total_advance.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Action Area */}
                            <div className="p-8 flex flex-col md:flex-row items-center justify-between gap-8 bg-gradient-to-b from-white/5 to-transparent">
                                <div className="flex-1 w-full bg-black/40 p-6 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <TrendingUp className="w-4 h-4 text-neon-green" />
                                        <span className="text-xs font-bold text-neon-green uppercase tracking-wider">Set Final Settlement Rate (₹/Kg)</span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="relative flex-1">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xl">₹</span>
                                            <input
                                                type="number"
                                                className="w-full bg-black/60 border border-white/10 rounded-xl py-4 pl-10 pr-4 text-3xl font-black text-white focus:border-neon-green focus:shadow-[0_0_20px_rgba(57,255,20,0.2)] outline-none transition-all placeholder-gray-700"
                                                placeholder="0.00"
                                                value={group.proposed_rate}
                                                onChange={e => {
                                                    const val = e.target.value
                                                    const updated = farmerGroups.map(g => g.farmer_id === group.farmer_id ? { ...g, proposed_rate: val } : g)
                                                    setFarmerGroups(updated)
                                                }}
                                            />
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-500 mb-1">Est. Payable</div>
                                            <div className="text-xl font-bold text-white">₹{((Number(group.proposed_rate) || 0) * group.total_weight).toLocaleString()}</div>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleGenerateBill(group)}
                                    disabled={generating === group.farmer_id}
                                    className="w-full md:w-auto bg-neon-green text-black font-black uppercase tracking-wider py-6 px-12 rounded-2xl hover:bg-green-400 transition-all shadow-[0_0_20px_rgba(57,255,20,0.4)] hover:shadow-[0_0_40px_rgba(57,255,20,0.6)] hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 whitespace-nowrap"
                                >
                                    {generating === group.farmer_id ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <>
                                            Generate Bill <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Detailed Lots Accordion */}
                            <div className="p-4 bg-black/60 border-t border-white/5 grid grid-cols-1 md:grid-cols-3 gap-2">
                                {group.lots.map(lot => (
                                    <div key={lot.id} className="flex justify-between items-center p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                                            <span className="text-xs text-gray-300 font-medium">{lot.item_type} <span className="text-gray-500">({lot.grade})</span></span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-neon-green">{lot.lot_code}</span>
                                        <span className="text-xs font-mono text-gray-400">{lot.total_weight} Kg</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function ArrowRight(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
        </svg>
    )
}
