"use client";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import {
    Loader2, Search, Package, TrendingDown, TrendingUp,
    AlertTriangle, Calendar, Clock, Download, Filter,
    ArrowRight, Info, Printer
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { getMainItemName } from "@/lib/utils/commodity-utils";

export default function StockValuationPage() {
    const { profile } = useAuth();
    const [stocks, setStocks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (!profile?.organization_id) return;
        fetchStockValuation();
    }, [profile?.organization_id]);

    const fetchStockValuation = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('lots')
                .select(`
                    id, 
                    lot_code, 
                    current_qty, 
                    unit, 
                    supplier_rate, 
                    mfg_date, 
                    expiry_date, 
                    created_at,
                    item:commodities!inner(name, sku_code)
                `)
                .eq('organization_id', profile!.organization_id)
                .gt('current_qty', 0)
                .order('expiry_date', { ascending: true, nullsFirst: false });

            if (error) throw error;
            setStocks(data || []);
        } catch (err) {
            console.error("Valuation Error:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredStocks = stocks.filter(s =>
        s.item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.lot_code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        if (isExporting || filteredStocks.length === 0) return;
        setIsExporting(true);
        try {
            const { generateStockAuditPDF } = await import('@/lib/generate-stock-pdf');
            const { downloadBlob } = await import('@/lib/capacitor-share');
            const orgName = profile?.organization?.name || 'Mandi Organisation';
            const stockForPDF = filteredStocks.map(s => ({
                name: s.item.name,
                arrival_type: 'direct',
                location: 'Mandi',
                total_quantity: Number(s.current_qty || 0),
                capacity: 0,
                total_value: Number(s.current_qty) * Number(s.supplier_rate || 0),
                created_at: s.created_at,
                lots: [],
            }));
            const blob = await generateStockAuditPDF(stockForPDF, orgName, profile?.organization);
            const filename = `StockValuation_${orgName}_${new Date().toISOString().slice(0, 10)}.pdf`;
            await downloadBlob(blob, filename);
        } catch (err: any) {
            console.error('[ExportAssets] failed:', err);
            alert(`Failed to export: ${err?.message || err}`);
        } finally {
            setIsExporting(false);
        }
    };

    const totalValuation = filteredStocks.reduce((acc, curr) => acc + (Number(curr.current_qty) * Number(curr.supplier_rate || 0)), 0);
    const nearExpiryValuation = filteredStocks
        .filter(s => s.expiry_date && differenceInDays(new Date(s.expiry_date), new Date()) < 30)
        .reduce((acc, curr) => acc + (Number(curr.current_qty) * Number(curr.supplier_rate || 0)), 0);

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-8 space-y-8 pb-32">
            {/* Header */}
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-[1000] tracking-tight text-slate-900 uppercase">
                        Stock <span className="text-indigo-600">Status / Valuation</span>
                    </h1>
                    <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-[0.2em] flex items-center gap-2">
                        <Package className="w-4 h-4 text-indigo-500" /> Real-time Inventory Assets
                    </p>
                </div>
                <div className="flex items-center gap-3 no-print">
                    <Button onClick={() => window.print()} variant="outline" className="h-12 px-6 rounded-xl border-slate-200 bg-white shadow-sm font-bold uppercase text-[10px] tracking-widest gap-2">
                        <Printer className="w-4 h-4" /> Print Report
                    </Button>
                    <Button onClick={handleExport} disabled={isExporting || filteredStocks.length === 0} className="h-12 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 font-bold uppercase text-[10px] tracking-widest gap-2">
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {isExporting ? 'Exporting...' : 'Export Assets'}
                    </Button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto space-y-8">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between group h-44 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-700">
                            <TrendingUp className="w-24 h-24" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Stock Value</p>
                        <p className="text-4xl font-[1000] tracking-tighter mt-4 text-slate-900">
                            ₹{totalValuation.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2 mt-4 text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-3 py-1 rounded-full">
                            CURRENT ASSET
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between group h-44 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-700 text-rose-500">
                            <TrendingDown className="w-24 h-24" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-rose-400">Expiring Assets</p>
                        <p className="text-4xl font-[1000] tracking-tighter mt-4 text-rose-600">
                            ₹{nearExpiryValuation.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2 mt-4 text-[10px] font-bold text-rose-600 bg-rose-50 w-fit px-3 py-1 rounded-full">
                            AT RISK (30 DAYS)
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between h-44">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Diversity</p>
                        <p className="text-4xl font-[1000] tracking-tighter mt-4 text-slate-900">
                            {new Set(filteredStocks.map(s => getMainItemName(s.item.name))).size} <span className="text-sm text-slate-400">SKUs</span>
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase">Across {filteredStocks.length} Stock Lots</p>
                    </div>

                    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between h-44 bg-indigo-600 text-white shadow-xl shadow-indigo-100">
                        <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Avg. Stock Age</p>
                        <p className="text-4xl font-[1000] tracking-tighter mt-4">
                            {Math.round(filteredStocks.reduce((acc, curr) => acc + differenceInDays(new Date(), new Date(curr.created_at)), 0) / (filteredStocks.length || 1))} <span className="text-sm text-white/60">Days</span>
                        </p>
                        <div className="flex items-center gap-2 mt-4 text-[10px] font-bold text-white bg-white/10 w-fit px-3 py-1 rounded-full">
                            INVENTORY HEALTH
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search Items or Lot Codes..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-4 bg-white border border-slate-200 rounded-[20px] text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto no-scrollbar py-2">
                        <div className="flex items-center gap-2 px-6 py-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <Filter className="w-4 h-4 text-slate-400" />
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Filter: Active Stock</span>
                        </div>
                        <div className="flex items-center gap-2 px-6 py-4 bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm">
                            <Info className="w-4 h-4 text-emerald-500" />
                            <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest group cursor-help relative">
                                FIFO Multi-Lot Method
                            </span>
                        </div>
                    </div>
                </div>

                {/* Valuation Table */}
                <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                                <tr>
                                    <th className="p-8 pl-10">Item & Description</th>
                                    <th className="p-8 text-center">Lot Details</th>
                                    <th className="p-8 text-center text-indigo-600">Qty On Hand</th>
                                    <th className="p-8 text-center text-amber-600">Unit Cost</th>
                                    <th className="p-8 text-right pr-10">Total Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="p-20 text-center">
                                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
                                            <p className="mt-4 text-slate-400 font-bold uppercase text-[10px] tracking-widest">Aggregating Stock Assets...</p>
                                        </td>
                                    </tr>
                                ) : filteredStocks.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-20 text-center text-slate-400">
                                            No stock items found matching your search.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredStocks.map((s) => {
                                        const totalValue = Number(s.current_qty) * Number(s.supplier_rate || 0);
                                        const daysToExpiry = s.expiry_date ? differenceInDays(new Date(s.expiry_date), new Date()) : null;
                                        const isExpiring = daysToExpiry !== null && daysToExpiry < 30;
                                        const isExpired = daysToExpiry !== null && daysToExpiry < 0;

                                        return (
                                            <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                                                <td className="p-8 pl-10">
                                                    <div className="flex items-start gap-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                            <Package className="w-6 h-6" />
                                                        </div>
                                                        <div>
                                                            <p className="text-md font-black text-slate-900 leading-none">{getMainItemName(s.item.name)}</p>
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">{s.item.sku_code || "NO-SKU"}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-8 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] font-black px-3 py-1 bg-slate-100 rounded-lg text-slate-600 uppercase mb-2">{s.lot_code}</span>
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="w-3 h-3 text-slate-300" />
                                                            <span className={cn(
                                                                "text-[10px] font-bold",
                                                                isExpired ? "text-rose-600" : isExpiring ? "text-amber-600" : "text-slate-400"
                                                            )}>
                                                                {s.expiry_date ? format(new Date(s.expiry_date), 'dd MMM y') : 'No Expiry'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-8 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-xl font-black text-slate-900 tracking-tighter">{Number(s.current_qty).toLocaleString()}</span>
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.unit}</span>
                                                    </div>
                                                </td>
                                                <td className="p-8 text-center">
                                                    <span className="font-mono text-sm font-black text-amber-600">₹{(Number(s.supplier_rate) || 0).toLocaleString()}</span>
                                                </td>
                                                <td className="p-8 text-right pr-10">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-md font-[1000] text-slate-900 tracking-tighter">₹{totalValue.toLocaleString()}</span>
                                                        <div className="flex items-center gap-1 mt-1">
                                                            {isExpired ? (
                                                                <span className="text-[8px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded uppercase tracking-widest">Expired</span>
                                                            ) : isExpiring ? (
                                                                <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase tracking-widest">Near Expiry</span>
                                                            ) : (
                                                                <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-widest">Fresh Asset</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                            <tfoot className="bg-slate-900 text-white">
                                <tr>
                                    <td colSpan={3} className="p-10 pl-10 text-xs font-black uppercase tracking-[0.4em]">Total Consolidated Stock Value</td>
                                    <td colSpan={2} className="p-10 text-right pr-10">
                                        <div className="flex flex-col items-end">
                                            <span className="text-3xl font-[1000] tracking-tighter leading-none">₹{totalValuation.toLocaleString()}</span>
                                            <span className="text-[10px] font-black text-white/50 uppercase mt-2 tracking-widest flex items-center gap-2">
                                                <ShieldAlert className="w-3 h-3" /> Net Realizable Value
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ShieldAlert(props: any) {
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
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
        </svg>
    )
}
