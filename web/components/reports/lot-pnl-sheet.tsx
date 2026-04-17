"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useAuth } from "@/components/auth/auth-provider"
import { Loader2, TrendingUp, TrendingDown, Package, Activity, AlertCircle, RefreshCcw } from "lucide-react"

interface LotPnLSheetProps {
    lotId: string | null
    onClose: () => void
}

export function LotPnLSheet({ lotId, onClose }: LotPnLSheetProps) {
    const { profile } = useAuth()
    const [loading, setLoading] = useState(false)
    const [lotData, setLotData] = useState<any>(null)
    const [sales, setSales] = useState<any[]>([])
    const [damages, setDamages] = useState<any[]>([])
    const [returns, setReturns] = useState<any[]>([])

    useEffect(() => {
        if (!lotId || !profile?.organization_id) return
        fetchLotDetails()
    }, [lotId])

    const fetchLotDetails = async () => {
        setLoading(true)
        try {
            // 1. Fetch Lot Info
            const { data: lot, error: lotErr } = await supabase
                .schema('mandi')
                .from('lots')
                .select(`
                    id, lot_code, created_at, initial_qty, current_qty, unit, supplier_rate, commission_percent, less_percent, arrival_type,
                    packing_cost, loading_cost, farmer_charges,
                    item:items(name),
                    contact:contacts(name, type)
                `)
                .eq('organization_id', profile?.organization_id)
                .eq('id', lotId)
                .maybeSingle()

            console.error("DEBUG_FETCH_LOT", lotId, lot, lotErr)

            if (lotErr || !lot) {
                console.error("Failed to fetch lot:", lotErr || "No lot found for ID " + lotId)
                setLotData({ error: lotErr?.message || "Lot not found" })
                setLoading(false)
                return
            }
            setLotData(lot)

            // 2. Fetch Sales
            const { data: salesData } = await supabase
                .schema('mandi')
                .from('sale_items')
                .select(`
                    id, qty, rate, unit,
                    sale:sales(bill_no, sale_date, buyer:contacts(name))
                `)
                .eq('lot_id', lot.id)
            setSales(salesData || [])

            // 3. Fetch Damages
            const { data: dmgs } = await supabase
                .schema('mandi')
                .from('damages')
                .select('*')
                .eq('lot_id', lot.id)
            setDamages(dmgs || [])

            // 4. Fetch Returns
            const { data: retns } = await supabase
                .schema('mandi')
                .from('purchase_returns')
                .select('*')
                .eq('lot_id', lot.id)
            setReturns(retns || [])

        } catch (e) {
            console.error("Error fetching lot PnL:", e)
        } finally {
            setLoading(false)
        }
    }

    if (!lotId) return null

    // Calculations
    const totalQtySold = sales.reduce((sum, s) => sum + Number(s.qty), 0)
    const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.qty) * Number(s.rate)), 0)

    // Core per-unit cost calculation
    const initialQty = Number(lotData?.initial_qty) || 1;
    const rate = Number(lotData?.supplier_rate) || 0;
    const lessPercent = Number(lotData?.less_percent) || 0;
    const commPercent = Number(lotData?.commission_percent) || 0;
    const otherCutTotal = Number(lotData?.farmer_charges || 0);
    const packingTotal = Number(lotData?.packing_cost || 0);
    const loadingTotal = Number(lotData?.loading_cost || 0);

    // Derived unit costs (after Less% weight discount)
    const qtyAfterLess = totalQtySold * (1 - lessPercent / 100);
    const costOnSideRateByQty = qtyAfterLess * rate;
    const otherCutByQty = otherCutTotal * (totalQtySold / initialQty);
    const overheadsByQty = (packingTotal + loadingTotal) * (totalQtySold / initialQty);

    const settlementRate = rate * (1 - commPercent / 100);
    const potentialCommissionPerUnit = rate * (commPercent / 100);
    
    // Realized Calculations (Only on Sold Quantity)
    const realizedCommission = costOnSideRateByQty * (commPercent / 100);
    const realizedSurplus = totalRevenue - costOnSideRateByQty;
    
    // Total Inventory Cost (What Mandi spent/owes for sold portion)
    const purchaseCostAtSettlement = qtyAfterLess * settlementRate;

    let totalCost = 0
    let realizedNetProfit = 0

    if (lotData?.arrival_type === 'direct') {
        // Direct: Mandi profit = Revenue - (PurchaseCost - OtherCut + Overheads)
        totalCost = (costOnSideRateByQty - otherCutByQty) + overheadsByQty;
        realizedNetProfit = totalRevenue - totalCost;
    } else {
        // Commission: Mandi profit = Commission + Trading Surplus
        realizedNetProfit = realizedCommission + realizedSurplus;
        totalCost = purchaseCostAtSettlement; 
    }

    // Potential (For remaining stock)
    const remainingQty = (Number(lotData?.current_qty) || 0);
    const remainingQtyAfterLess = remainingQty * (1 - lessPercent / 100);
    const potentialEarnings = remainingQtyAfterLess * potentialCommissionPerUnit;

    const formatCurrency = (val: number) => "₹" + val.toLocaleString('en-IN', { maximumFractionDigits: 2 })

    return (
        <Sheet open={!!lotId} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full sm:max-w-xl md:max-w-2xl bg-[#F8FAFC] border-l-0 shadow-2xl overflow-y-auto p-0 rounded-l-3xl">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                    </div>
                ) : (
                    <div className="flex flex-col min-h-full">
                        {/* Header */}
                        <div className="bg-white p-8 border-b border-slate-200 stick top-0 z-10">
                            <div className="flex items-center gap-3 mb-2">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lotData?.arrival_type === 'direct' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                                    <Package className="w-5 h-5" />
                                </div>
                                <div>
                                    <SheetTitle className="text-2xl font-[1000] uppercase tracking-tighter text-slate-800">
                                        {lotData?.item?.name}
                                    </SheetTitle>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 w-fit mt-1">
                                        #{lotId}
                                    </p>
                                </div>
                            </div>

                            {/* DEBUG BLOCK */}
                            {lotData?.error && (
                                <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800 text-xs font-mono">
                                    <p><b>Fatal Error:</b> {lotData.error}</p>
                                    <p>Prop lotId: {lotId}</p>
                                </div>
                            )}
                        </div>

                        {/* Content Body */}
                        <div className="p-8 space-y-8 max-w-full">

                            {/* Key Stats Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Lot Quantity</p>
                                    <p className="text-xl font-black text-slate-700">{lotData?.initial_qty} <span className="text-sm">{lotData?.unit}</span></p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Buy Rate (Net)</p>
                                    <p className="text-xl font-black text-slate-700">{lotData?.arrival_type === 'direct' ? formatCurrency(lotData?.supplier_rate) : formatCurrency(settlementRate)}</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <p className="text-[10px] uppercase font-black tracking-widest text-blue-500 mb-1">Potential Earn</p>
                                    <p className="text-xl font-black text-blue-600">{formatCurrency(potentialEarnings)}</p>
                                    <div className="text-[8px] font-bold text-blue-400 uppercase">On stock: {remainingQty} nugs</div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm col-span-2">
                                    <div className="flex justify-between items-start">
                                        <p className={`text-[10px] uppercase font-black tracking-widest mb-1 ${realizedNetProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Realized Profit</p>
                                        <div className="text-right">
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">Comm: {formatCurrency(realizedCommission)}</span>
                                            {realizedSurplus !== 0 && (
                                                <span className="text-[8px] font-bold text-blue-400 uppercase block">Surplus: {formatCurrency(realizedSurplus)}</span>
                                            )}
                                        </div>
                                    </div>
                                    <p className={`text-2xl font-[1000] tracking-tighter ${realizedNetProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(realizedNetProfit)}</p>
                                </div>
                            </div>

                            {/* Breakdown Lists */}

                            {/* 1. Sells */}
                            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50/50 flex items-center justify-between">
                                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-[11px] flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-emerald-500" /> Sales Breakdown
                                    </h3>
                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg">Rev: {formatCurrency(totalRevenue)}</span>
                                </div>
                                <div className="divide-y divide-slate-50">
                                    {sales.length === 0 ? (
                                        <p className="p-6 text-center text-xs font-black text-slate-300 uppercase tracking-widest">No Sales Yet</p>
                                    ) : sales.map(s => (
                                        <div key={s.id} className="p-4 px-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{s.sale?.buyer?.name || 'Cash Sale'}</p>
                                                <p className="text-[10px] text-slate-400 font-bold">Bill #{s.sale?.bill_no} • {s.sale?.sale_date ? new Date(s.sale.sale_date).toLocaleDateString() : 'Unknown Date'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-slate-700">{Number(s.qty)} <span className="text-xs">{s.unit}</span> @ {formatCurrency(Number(s.rate))}</p>
                                                <p className="text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 rounded-md inline-block mt-1">
                                                    {formatCurrency(Number(s.qty) * Number(s.rate))}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 2. Damages / Spoilage */}
                            {damages.length > 0 && (
                                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 border-b border-rose-100 bg-rose-50 flex items-center justify-between">
                                        <h3 className="font-black text-rose-800 uppercase tracking-widest text-[11px] flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 text-rose-500" /> Spoilage & Damages
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {damages.map(d => (
                                            <div key={d.id} className="p-4 px-6 flex items-center justify-between">
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{d.reason || 'Damage Encountered'}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold">{new Date(d.damage_date).toLocaleDateString()}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-black text-rose-600">{Number(d.qty)} {lotData?.unit}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 3. Returns */}
                            {returns.length > 0 && (
                                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
                                        <h3 className="font-black text-amber-800 uppercase tracking-widest text-[11px] flex items-center gap-2">
                                            <RefreshCcw className="w-4 h-4 text-amber-500" /> Supplier Returns
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {returns.map(r => (
                                            <div key={r.id} className="p-4 px-6 flex items-center justify-between">
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">Returned to Supplier</p>
                                                    <p className="text-[10px] text-slate-400 font-bold">{new Date(r.return_date).toLocaleDateString()} • {r.status}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-black text-amber-600">{Number(r.qty)} {lotData?.unit}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
