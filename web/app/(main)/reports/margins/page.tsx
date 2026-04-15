'use client'
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { PieChart, TrendingUp, TrendingDown, Package, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react'

type SaleItem = {
    id: string; qty: number; rate: number; amount: number; cost_price: number | null; margin_amount: number | null
    sale: { id: string; sale_date: string; buyer_id: string; buyer: { id: string; name: string } | null } | null
    lot: { id: string; item: { id: string; name: string } | null; supplier_rate: number } | null
}

export default function MarginAnalysisPage() {
    const { profile } = useAuth()
    const [saleItems, setSaleItems] = useState<SaleItem[]>([])
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState<'items' | 'customers'>('items')
    const [period, setPeriod] = useState('30')

    useEffect(() => {
        if (profile?.organization_id) fetchData()
    }, [profile?.organization_id, period])

    const fetchData = async () => {
        setLoading(true)
        const since = new Date()
        since.setDate(since.getDate() - parseInt(period))

        const { data } = await supabase
            .schema('mandi')
            .from('sale_items')
            .select(`id, qty, rate, amount, cost_price, margin_amount,
                sale:sales!sale_id(id, sale_date, buyer_id, buyer:contacts!buyer_id(id, name)),
                lot:lots!lot_id(id, supplier_rate, item:items!item_id(id, name))`)
            .eq('organization_id', profile!.organization_id)
            .gte('sale.sale_date', since.toISOString())
            .order('amount', { ascending: false })

        setSaleItems((data as any) || [])
        setLoading(false)
    }

    // Calculate aggregate margins by item
    const itemMargins = useMemo(() => {
        const map = new Map<string, { name: string, revenue: number, cost: number, qty: number }>()
        saleItems.forEach(si => {
            const itemName = si.lot?.item?.name || 'Unknown'
            const itemId = si.lot?.item?.id || 'unknown'
            const existing = map.get(itemId) || { name: itemName, revenue: 0, cost: 0, qty: 0 }
            existing.revenue += si.amount || 0
            existing.cost += si.cost_price || (si.lot?.supplier_rate || 0) * si.qty
            existing.qty += si.qty || 0
            map.set(itemId, existing)
        })
        return Array.from(map.entries()).map(([id, d]) => ({
            id, name: d.name, revenue: d.revenue, cost: d.cost, qty: d.qty,
            margin: d.revenue - d.cost, marginPct: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
        })).sort((a, b) => b.margin - a.margin)
    }, [saleItems])

    // Calculate aggregate margins by customer
    const customerMargins = useMemo(() => {
        const map = new Map<string, { name: string, revenue: number, cost: number, orders: number }>()
        saleItems.forEach(si => {
            const buyerName = si.sale?.buyer?.name || 'Unknown'
            const buyerId = si.sale?.buyer?.id || 'unknown'
            const existing = map.get(buyerId) || { name: buyerName, revenue: 0, cost: 0, orders: 0 }
            existing.revenue += si.amount || 0
            existing.cost += si.cost_price || (si.lot?.supplier_rate || 0) * si.qty
            existing.orders += 1
            map.set(buyerId, existing)
        })
        return Array.from(map.entries()).map(([id, d]) => ({
            id, name: d.name, revenue: d.revenue, cost: d.cost, orders: d.orders,
            margin: d.revenue - d.cost, marginPct: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
        })).sort((a, b) => b.margin - a.margin)
    }, [saleItems])

    const totalRevenue = saleItems.reduce((s, si) => s + (si.amount || 0), 0)
    const totalCost = saleItems.reduce((s, si) => s + (si.cost_price || (si.lot?.supplier_rate || 0) * si.qty), 0)
    const totalMargin = totalRevenue - totalCost
    const totalMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0

    const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Margin Analysis</h1>
                    <p className="text-slate-500 text-sm mt-1">Track profitability by item and customer</p>
                </div>
                <select value={period} onChange={e => setPeriod(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold">
                    <option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option><option value="365">Last Year</option>
                </select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">Total Revenue</div>
                    <div className="text-2xl font-black text-slate-800">{fmt(totalRevenue)}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">Total Cost</div>
                    <div className="text-2xl font-black text-slate-800">{fmt(totalCost)}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">Gross Margin</div>
                    <div className={`text-2xl font-black ${totalMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(totalMargin)}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">Margin %</div>
                    <div className={`text-2xl font-black flex items-center gap-2 ${totalMarginPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {totalMarginPct >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                        {totalMarginPct.toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* View Toggle */}
            <div className="flex gap-2 mb-6">
                <button onClick={() => setView('items')} className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${view === 'items' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
                    <Package className="w-3.5 h-3.5" /> By Item ({itemMargins.length})
                </button>
                <button onClick={() => setView('customers')} className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${view === 'customers' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
                    <Users className="w-3.5 h-3.5" /> By Customer ({customerMargins.length})
                </button>
            </div>

            {loading ? <div className="text-center py-20 text-slate-400">Calculating margins...</div> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="text-left py-3 px-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">{view === 'items' ? 'Item' : 'Customer'}</th>
                                {view === 'items' && <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Qty Sold</th>}
                                {view === 'customers' && <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Orders</th>}
                                <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Revenue</th>
                                <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Cost</th>
                                <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Margin</th>
                                <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Margin %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(view === 'items' ? itemMargins : customerMargins).map((row: any) => (
                                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="py-3 px-4 font-bold text-slate-800">{row.name}</td>
                                    <td className="py-3 px-4 text-right text-slate-600">{view === 'items' ? row.qty?.toLocaleString('en-IN') : row.orders}</td>
                                    <td className="py-3 px-4 text-right text-slate-700 font-medium">{fmt(row.revenue)}</td>
                                    <td className="py-3 px-4 text-right text-slate-500">{fmt(row.cost)}</td>
                                    <td className={`py-3 px-4 text-right font-black ${row.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(row.margin)}</td>
                                    <td className="py-3 px-4 text-right">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${row.marginPct >= 20 ? 'bg-emerald-50 text-emerald-600' : row.marginPct >= 0 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                                            {row.marginPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            {row.marginPct.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {(view === 'items' ? itemMargins : customerMargins).length === 0 && (
                                <tr><td colSpan={6} className="py-16 text-center text-slate-400">No sales data for the selected period</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
