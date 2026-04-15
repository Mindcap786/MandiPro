'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { isNativePlatform } from '@/lib/capacitor-utils'
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper"
import { NativeCard } from "@/components/mobile/NativeCard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Activity, User, Truck, AlertCircle, FileText, ArrowUpRight, ArrowDownLeft, Wallet, TrendingUp, Search, Download, ChevronRight } from 'lucide-react'

interface LedgerSummary {
    entity_id: string
    entity_name: string
    entity_type: string
    total_debit: number
    total_credit: number
    net_balance: number // +ve means Payable (Credit), -ve means Receivable (Debit)
}

export default function Ledgers() {
    const { user, profile } = useAuth()
    const [stats, setStats] = useState({
        totalReceivable: 0,
        totalPayable: 0,
        cashInHand: 0
    })
    const [farmerLedgers, setFarmerLedgers] = useState<LedgerSummary[]>([])
    const [buyerLedgers, setBuyerLedgers] = useState<LedgerSummary[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (user && profile?.organization_id) fetchLedgers()
    }, [user, profile])


    if (isNativePlatform()) {
        return (
            <NativePageWrapper title="Master Ledger">
                <div className="space-y-4 px-4 pb-10">
                    {/* Compact Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <NativeCard className="p-4 bg-[#F0FDF4] border-green-100">
                            <p className="text-[10px] font-black uppercase text-green-700 tracking-widest mb-1">Receivables</p>
                            <p className="text-xl font-black text-green-900">₹{stats.totalReceivable.toLocaleString()}</p>
                        </NativeCard>
                        <NativeCard className="p-4 bg-[#FEF2F2] border-red-100">
                            <p className="text-[10px] font-black uppercase text-red-700 tracking-widest mb-1">Payables</p>
                            <p className="text-xl font-black text-red-900">₹{stats.totalPayable.toLocaleString()}</p>
                        </NativeCard>
                    </div>

                    <Tabs defaultValue="farmers" className="w-full">
                        <TabsList className="bg-gray-100 p-1 rounded-xl mb-4 w-full h-12">
                            <TabsTrigger value="farmers" className="flex-1 rounded-lg font-bold text-xs uppercase tracking-wider h-10">
                                Suppliers
                            </TabsTrigger>
                            <TabsTrigger value="buyers" className="flex-1 rounded-lg font-bold text-xs uppercase tracking-wider h-10">
                                Buyers
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="farmers" className="space-y-3 m-0">
                            {farmerLedgers.length === 0 ? (
                                <div className="text-center py-20 text-gray-400 font-medium">No supplier ledgers found</div>
                            ) : (
                                farmerLedgers.map(row => (
                                    <NativeCard 
                                        key={row.entity_id} 
                                        onClick={() => {}} // Could link to individual ledger
                                        className="p-4 flex items-center justify-between active:scale-95 transition-transform"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-700 font-bold">
                                                {row.entity_name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-gray-900">{row.entity_name}</p>
                                                <p className="text-[10px] font-bold text-red-500 uppercase">
                                                    {row.net_balance < 0 ? `Payable: ₹${Math.abs(row.net_balance).toLocaleString()}` : "Settled"}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300" />
                                    </NativeCard>
                                ))
                            )}
                        </TabsContent>

                        <TabsContent value="buyers" className="space-y-3 m-0">
                            {buyerLedgers.length === 0 ? (
                                <div className="text-center py-20 text-gray-400 font-medium">No buyer ledgers found</div>
                            ) : (
                                buyerLedgers.map(row => (
                                    <NativeCard 
                                        key={row.entity_id} 
                                        className="p-4 flex items-center justify-between active:scale-95 transition-transform"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-700 font-bold">
                                                {row.entity_name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-gray-900">{row.entity_name}</p>
                                                <p className="text-[10px] font-bold text-blue-600 uppercase">
                                                    {row.net_balance > 0 ? `Due: ₹${row.net_balance.toLocaleString()}` : "Advance"}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300" />
                                    </NativeCard>
                                ))
                            )}
                        </TabsContent>
                    </Tabs>
                </div>
            </NativePageWrapper>
        )
    }


    async function fetchLedgers() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('view_party_balances')
                .select('*')
                .eq('organization_id', profile?.organization_id);

            if (error) throw error

            const fList: LedgerSummary[] = []
            const bList: LedgerSummary[] = []
            let totRec = 0
            let totPay = 0

            data?.forEach(row => {
                const summary: LedgerSummary = {
                    entity_id: row.contact_id,
                    entity_name: row.contact_name,
                    entity_type: row.contact_type,
                    // View doesn't have total credit/debit, so we set to 0 to keep interface happy for now
                    total_debit: 0,
                    total_credit: 0,
                    net_balance: Number(row.net_balance)
                }

                if (row.contact_type === 'farmer') {
                    fList.push(summary)
                    // For farmers, if Net Balance < 0, it means we owe them (Payable)
                    // The view returns negative for "Payable" typically in accounting logic if it's (Credit - Debit)
                    // Let's verify view logic: normally (Receivable is +, Payable is -)
                    // finance-dashboard says: b.net_balance < 0 (Payable)
                    if (summary.net_balance < 0) totPay += Math.abs(summary.net_balance)
                }
                else if (row.contact_type === 'buyer') {
                    bList.push(summary)
                    // For buyers, if Net Balance > 0, they owe us (Receivable)
                    // finance-dashboard says: b.net_balance > 0 (Receivable)
                    if (summary.net_balance > 0) totRec += summary.net_balance
                }
                else if (row.contact_type === 'supplier') {
                    // Adding suppliers to Farmers tab as "Payables" usually, or we can make a new list if UI supported it.
                    // The current UI has Tabs for "Farmers" and "Buyers". 
                    // Let's add suppliers to the 'farmer' list (which acts as Payables tab)
                    fList.push(summary)
                    if (summary.net_balance < 0) totPay += Math.abs(summary.net_balance)
                }
            })

            setFarmerLedgers(fList)
            setBuyerLedgers(bList)
            setStats({
                totalPayable: totPay,
                totalReceivable: totRec,
                cashInHand: 0 // Cash handling requires separate query if needed, keeping 0 for now
            })

        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const exportToCSV = () => {
        const data = [...farmerLedgers, ...buyerLedgers];
        if (data.length === 0) return;

        const headers = ["Entity Name", "Type", "Total Credit", "Total Debit", "Net Balance"];
        const csvContent = [
            headers.join(","),
            ...data.map(row => [
                `"${row.entity_name}"`,
                row.entity_type,
                row.total_credit,
                row.total_debit,
                row.net_balance
            ].join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `mandi_ledger_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-8">
            {/* Header Stats */}
            <header className="mb-10 animate-in slide-in-from-top-6 duration-700">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-4xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] flex items-center gap-3">
                        <Wallet className="w-8 h-8 text-neon-purple" />
                        Master Ledger
                    </h1>
                    <div className="flex gap-2">
                        <button className="glass-panel px-4 py-2 rounded-xl text-sm font-bold text-gray-300 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2">
                            <Search className="w-4 h-4" /> Search
                        </button>
                        <button
                            onClick={exportToCSV}
                            className="glass-panel px-4 py-2 rounded-xl text-sm font-bold text-gray-300 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" /> Export Report
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="glass-card p-8 rounded-3xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-neon-green/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 relative z-10">
                            <ArrowDownLeft className="w-4 h-4 text-neon-green" /> Total Receivables
                        </div>
                        <div className="text-4xl font-black text-white mb-1 relative z-10">₹{stats.totalReceivable.toLocaleString()}</div>
                        <div className="text-xs text-neon-green font-bold bg-neon-green/10 px-2 py-1 rounded w-fit border border-neon-green/20 relative z-10">From Market Buyers</div>
                    </div>

                    <div className="glass-card p-8 rounded-3xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 relative z-10">
                            <ArrowUpRight className="w-4 h-4 text-red-500" /> Total Payables
                        </div>
                        <div className="text-4xl font-black text-white mb-1 relative z-10">₹{stats.totalPayable.toLocaleString()}</div>
                        <div className="text-xs text-red-500 font-bold bg-red-500/10 px-2 py-1 rounded w-fit border border-red-500/20 relative z-10">To Suppliers</div>
                    </div>

                    <div className="glass-card p-8 rounded-3xl relative overflow-hidden group border-neon-purple/30 shadow-[0_0_30px_rgba(188,19,254,0.1)]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-neon-purple/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 relative z-10">
                            <TrendingUp className="w-4 h-4 text-neon-purple" /> Mandi P&L (Est)
                        </div>
                        <div className="text-4xl font-black text-neon-purple mb-1 relative z-10 drop-shadow-[0_0_10px_rgba(188,19,254,0.4)]">₹{(stats.totalReceivable - stats.totalPayable).toLocaleString()}</div>
                        <div className="text-xs text-gray-400 font-bold relative z-10">Net Position</div>
                    </div>
                </div>
            </header>

            <div className="glass-panel rounded-3xl p-1 min-h-[600px] shadow-2xl relative overflow-hidden">
                {/* Decorative Top Line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neon-purple via-blue-500 to-neon-green opacity-50"></div>

                <Tabs defaultValue="farmers" className="w-full">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center">
                        <TabsList className="bg-black/40 border border-white/10 p-1 rounded-xl inline-flex gap-1">
                            <TabsTrigger value="farmers" className="px-6 py-2.5 rounded-lg text-sm font-bold text-gray-400 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all flex items-center gap-2">
                                <Truck className="w-4 h-4" /> Suppliers (Payables)
                            </TabsTrigger>
                            <TabsTrigger value="buyers" className="px-6 py-2.5 rounded-lg text-sm font-bold text-gray-400 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all flex items-center gap-2">
                                <User className="w-4 h-4" /> Buyers (Receivables)
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* SUPPLIERS TAB */}
                    <TabsContent value="farmers" className="p-0 m-0 animate-in fade-in zoom-in-95 duration-300">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-white/5 text-gray-400 text-[10px] uppercase font-bold tracking-widest">
                                    <tr>
                                        <th className="px-8 py-5 font-medium">Account Name</th>
                                        <th className="px-8 py-5 font-medium text-right">Total Credit (Goods In)</th>
                                        <th className="px-8 py-5 font-medium text-right">Total Debit (Paid)</th>
                                        <th className="px-8 py-5 font-medium text-right">Net Balance</th>
                                        <th className="px-8 py-5 font-medium text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {farmerLedgers.length > 0 ? farmerLedgers.map((row) => (
                                        <tr key={row.entity_id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-8 py-5 font-bold text-white flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-900/40 to-black border border-purple-500/20 flex items-center justify-center text-sm text-purple-400 font-bold shadow-inner">
                                                    {row.entity_name.charAt(0)}
                                                </div>
                                                <span className="text-base">{row.entity_name}</span>
                                            </td>
                                            <td className="px-8 py-5 text-right text-gray-400 font-mono text-sm">₹{row.total_credit.toLocaleString()}</td>
                                            <td className="px-8 py-5 text-right text-gray-400 font-mono text-sm">₹{row.total_debit.toLocaleString()}</td>
                                            <td className="px-8 py-5 text-right">
                                                <span className={`font-mono font-bold px-3 py-1.5 rounded-lg text-xs border ${row.net_balance > 0 ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-gray-400 border-green-500/20'}`}>
                                                    {row.net_balance > 0 ? `Payable: ₹${row.net_balance.toLocaleString()}` : 'Settled'}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <button className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} className="px-8 py-24 text-center text-gray-500 italic">No active farmer ledgers found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    {/* BUYERS TAB */}
                    <TabsContent value="buyers" className="p-0 m-0 animate-in fade-in zoom-in-95 duration-300">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-white/5 text-gray-400 text-[10px] uppercase font-bold tracking-widest">
                                    <tr>
                                        <th className="px-8 py-5 font-medium">Account Name</th>
                                        <th className="px-8 py-5 font-medium text-right">Total Debit (Purchased)</th>
                                        <th className="px-8 py-5 font-medium text-right">Total Credit (Paid)</th>
                                        <th className="px-8 py-5 font-medium text-right">Outstanding</th>
                                        <th className="px-8 py-5 font-medium text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {buyerLedgers.length > 0 ? buyerLedgers.map((row) => (
                                        <tr key={row.entity_id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-8 py-5 font-bold text-white flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-900/40 to-black border border-blue-500/20 flex items-center justify-center text-sm text-blue-400 font-bold shadow-inner">
                                                    {row.entity_name.charAt(0)}
                                                </div>
                                                <span className="text-base">{row.entity_name}</span>
                                            </td>
                                            <td className="px-8 py-5 text-right text-gray-400 font-mono text-sm">₹{row.total_debit.toLocaleString()}</td>
                                            <td className="px-8 py-5 text-right text-gray-400 font-mono text-sm">₹{row.total_credit.toLocaleString()}</td>
                                            <td className="px-8 py-5 text-right">
                                                <span className={`font-mono font-bold px-3 py-1.5 rounded-lg text-xs border ${row.net_balance < 0 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20 shadow-[0_0_10px_rgba(255,165,0,0.1)]' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
                                                    {row.net_balance < 0 ? `Due: ₹${Math.abs(row.net_balance).toLocaleString()}` : 'Advance'}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <button className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} className="px-8 py-24 text-center text-gray-500 italic">No active buyer ledgers found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
