"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Loader2, AlertTriangle, ShieldCheck, Clock } from "lucide-react"
import { motion } from "framer-motion"
import { useAuth } from "@/components/auth/auth-provider"
import { formatCurrency } from "@/lib/accounting-logic"

export default function ReceivablesAging({ organizationId }: { organizationId: string }) {
    const { profile } = useAuth()
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (organizationId) fetchAging()
    }, [organizationId])

    const fetchAging = async () => {
        setLoading(true)
        const isMandi = profile?.business_domain === 'mandi' || !profile?.business_domain;
        const { data, error } = await supabase
            .schema(isMandi ? 'mandi' : 'public')
            .from('view_receivable_aging')
            .select('*')
            .eq('organization_id', organizationId)
            .order('net_balance', { ascending: false })

        if (data) setData(data)
        setLoading(false)
    }

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-[#0C831F]" /></div>

    const totals = data.reduce((acc, row) => ({
        b0: acc.b0 + Number(row.bucket_0_30),
        b30: acc.b30 + Number(row.bucket_31_60),
        b60: acc.b60 + Number(row.bucket_61_90),
        b90: acc.b90 + Number(row.bucket_90_plus),
        total: acc.total + Number(row.net_balance)
    }), { b0: 0, b30: 0, b60: 0, b90: 0, total: 0 })

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Summary Chart-like Buckets */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <AgingSummaryCard label="Current (0-30)" amount={totals.b0} color="bg-emerald-500" />
                <AgingSummaryCard label="31-60 Days" amount={totals.b30} color="bg-blue-500" />
                <AgingSummaryCard label="61-90 Days" amount={totals.b60} color="bg-orange-500" />
                <AgingSummaryCard label="90+ Days" amount={totals.b90} color="bg-rose-500" />
            </div>

            {/* Detailed Table */}
            <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <th className="p-6">Buyer</th>
                            <th className="p-6 text-right">0-30</th>
                            <th className="p-6 text-right">31-60</th>
                            <th className="p-6 text-right">61-90</th>
                            <th className="p-6 text-right">90+</th>
                            <th className="p-6 text-right text-black">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {data.map((row) => {
                            const isHighRisk = Number(row.bucket_90_plus) > 0 || Number(row.bucket_61_90) > (row.net_balance * 0.5)
                            return (
                                <tr key={row.contact_id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="p-6">
                                        <div className="flex items-center gap-3">
                                            {isHighRisk ? (
                                                <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
                                            ) : (
                                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                            )}
                                            <span className="font-bold text-slate-700 group-hover:text-black">{row.contact_name}</span>
                                        </div>
                                    </td>
                                    <td className="p-6 text-right font-mono text-sm text-slate-500 font-medium">{formatCurrency(row.bucket_0_30)}</td>
                                    <td className="p-6 text-right font-mono text-sm text-slate-500 font-medium">{formatCurrency(row.bucket_31_60)}</td>
                                    <td className="p-6 text-right font-mono text-sm text-orange-600 font-medium">{formatCurrency(row.bucket_61_90)}</td>
                                    <td className="p-6 text-right font-mono text-sm text-rose-600 font-bold">{formatCurrency(row.bucket_90_plus)}</td>
                                    <td className="p-6 text-right font-black text-black text-lg">{formatCurrency(row.net_balance)}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function AgingSummaryCard({ label, amount, color }: any) {
    return (
        <div className={`p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group bg-white`}>
            <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-black text-black">{formatCurrency(amount)}</p>
            <div className={`absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
                <Clock className="w-16 h-16 text-slate-900" />
            </div>
        </div>
    )
}
