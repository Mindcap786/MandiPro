"use client"
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect } from "react"
import { Search, Wallet, ArrowUpRight, History, CheckCircle2, IndianRupee } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import Link from "next/link"

export default function FarmerSettlementsPage() {
    const { profile } = useAuth()
    const [farmers, setFarmers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        if (profile?.organization_id) {
            fetchFarmerBalances()
        }
    }, [profile])

    const fetchFarmerBalances = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('view_party_balances')
                .select('*')
                .eq('organization_id', profile!.organization_id)
                .eq('contact_type', 'farmer')

            if (error) throw error

            // net_balance is Debit - Credit. 
            // For a farmer, Credit > Debit (we owe them), so net_balance is negative.
            // UI 'balance' field is (Credit - Debit), which is -net_balance.
            const farmersWithBalances = data.map(f => ({
                id: f.contact_id,
                name: f.contact_name,
                city: f.contact_city,
                balance: -Number(f.net_balance || 0)
            }))
            setFarmers(farmersWithBalances)
        } catch (err) {
            console.error("Fetch Farmer Balances Error:", err)
        } finally {
            setLoading(false)
        }
    }

    const filteredFarmers = farmers.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))

    return (
        <div className="p-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter italic">
                        FARMER <span className="text-neon-green">PAYABLES</span>
                    </h1>
                    <p className="text-gray-500 font-medium">Clear outstanding dues and generate Farmer Pattis (Settlements).</p>
                </div>
                <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl flex items-baseline gap-2">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Global Outstanding:</span>
                    <span className="text-2xl font-black text-neon-green tabular-nums">
                        ₹{farmers.reduce((sum, f) => sum + Math.max(0, f.balance), 0).toLocaleString()}
                    </span>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                    placeholder="Search Farmer by name or village..."
                    className="pl-12 bg-white/5 border-white/10 h-16 text-xl rounded-2xl focus:border-neon-green transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full h-64 flex items-center justify-center text-gray-500 font-black animate-pulse uppercase tracking-widest">Calculating Outstandings...</div>
                ) : filteredFarmers.map(farmer => (
                    <div key={farmer.id} className="bg-white/5 border border-white/10 p-8 rounded-[32px] hover:bg-white/[0.08] hover:border-neon-green/30 transition-all group flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-neon-green/10 flex items-center justify-center text-neon-green border border-neon-green/20">
                                    <Wallet className="w-6 h-6" />
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Status</div>
                                    {farmer.balance > 0 ? (
                                        <span className="text-xs font-black text-orange-400 bg-orange-400/10 px-3 py-1 rounded-full uppercase italic">Payment Due</span>
                                    ) : (
                                        <span className="text-xs font-black text-neon-green bg-neon-green/10 px-3 py-1 rounded-full uppercase italic">Fully Settled</span>
                                    )}
                                </div>
                            </div>

                            <h3 className="text-2xl font-black text-white tracking-tight group-hover:text-neon-green transition-colors">{farmer.name}</h3>
                            <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mt-1 mb-8">{farmer.city || 'Regional Area'}</p>

                            <div className="space-y-4 mb-8">
                                <div className="flex justify-between items-end border-b border-white/5 pb-4">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Sales Worth</span>
                                    <span className="text-lg font-black text-white italic">₹{farmer.balance.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <Link href={`/ledgers/farmer/${farmer.id}`} className="flex-1">
                                <Button variant="outline" className="w-full h-12 rounded-xl border-white/10 font-bold hover:bg-white/10 text-white">
                                    <History className="w-4 h-4 mr-2" /> STATEMENT
                                </Button>
                            </Link>
                            <Link href={`/finance/patti/new?farmer=${farmer.id}`} className="flex-1">
                                <Button className="w-full h-12 rounded-xl bg-neon-green text-black font-black hover:bg-neon-green/80">
                                    SETTLE <ArrowUpRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
