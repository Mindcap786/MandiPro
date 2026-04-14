"use client";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, TrendingUp, TrendingDown, RefreshCcw, Calendar as CalendarIcon, DollarSign, PieChart, ArrowUpRight, Filter, Zap, Activity, Info, Download, MessageCircle, Apple } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { isNativePlatform } from "@/lib/capacitor-utils";
import { BottomSheet } from "@/components/mobile/BottomSheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LotPnLSheet } from "@/components/reports/lot-pnl-sheet";
import { format, subDays, startOfDay, endOfDay, isSameDay, startOfYear, endOfYear, subYears, startOfMonth, endOfMonth, subMonths, isValid } from "date-fns";

const PAGE_SIZE = 15;
const MAX_FREE_PAGES = 3;

export default function ProfitLossPage() {
    const { profile, loading: authLoading } = useAuth();
    const [stats, setStats] = useState<any>(null);
    const [rawSalesData, setRawSalesData] = useState<any[] | null>(null);
    const [selectedFruit, setSelectedFruit] = useState<string>("all");
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });
    const [dateSheetOpen, setDateSheetOpen] = useState(false);
    const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    const availableFruits = useMemo(() => {
        if (!rawSalesData) return [];
        const fruits = new Set<string>();
        rawSalesData.forEach((si: any) => {
            const name = si.lot?.commodity?.name;
            if (name) fruits.add(name);
        });
        return Array.from(fruits).sort();
    }, [rawSalesData]);

    // Filter computation effect
    useEffect(() => {
        if (!rawSalesData) return;

        const lotMap = new Map<string, any>();
        let totalRevenue = 0;
        let totalCost = 0;
        let totalExpenses = 0;
        let totalCommission = 0;

        rawSalesData.forEach((si: any) => {
            const lot = si.lot;
            const sale = si.sale;
            const purchaseBill = Array.isArray(lot?.purchase_bill) ? lot.purchase_bill[0] : lot?.purchase_bill;
            
            if (!lot || !sale) return;
            if (sale.workflow_status === 'cancelled') return;

            // Apply selectedFruit filter
            const commodityName = (lot.commodity?.name || 'Unknown Item').toLowerCase();
            if (selectedFruit !== 'all' && !commodityName.includes(selectedFruit.toLowerCase())) {
                return;
            }

            const qty = Number(si.qty) || 0;
            const saleAmount = Number(si.amount) || 0;
            const initialQty = Number(lot.initial_qty) || 1;
            const proRataFactor = qty / initialQty;

            let lineRevenue = saleAmount;
            let lineCost = 0;
            let lineCommission = 0;
            let lineExpenses = (Number(lot.expense_paid_by_mandi) || 0) * proRataFactor;

            if (purchaseBill) {
                lineCost = (Number(purchaseBill.gross_amount) || 0) * proRataFactor;
                lineCommission = (Number(purchaseBill.commission_amount) || 0) * proRataFactor;
            } else {
                lineCost = (Number(lot.supplier_rate) || 0) * qty;
                lineCommission = (lineCost * (Number(lot.commission_percent) || 0)) / 100;
                if (lot.arrival_type?.toLowerCase()?.includes('commission')) {
                    lineCost = lineRevenue;
                }
            }

            const lineProfit = lineRevenue - lineCost - lineExpenses + lineCommission;

            totalRevenue += lineRevenue;
            totalCost += lineCost;
            totalExpenses += lineExpenses;
            totalCommission += lineCommission;

            if (!lotMap.has(lot.id)) {
                lotMap.set(lot.id, {
                    id: lot.id,
                    lot_code: lot.lot_code || '—',
                    date: sale.sale_date,
                    item: lot.commodity?.name || 'Unknown Item',
                    arrival_type: String(lot.arrival_type || 'Direct Purchase').trim(),
                    qty: 0,
                    revenue: 0,
                    cost: 0,
                    expenses: 0,
                    commission: 0,
                    profit: 0,
                });
            }
            const existing = lotMap.get(lot.id)!;
            existing.qty += qty;
            existing.revenue += lineRevenue;
            existing.cost += lineCost;
            existing.expenses += lineExpenses;
            existing.commission += lineCommission;
            existing.profit += lineProfit;
            if (sale.sale_date > existing.date) existing.date = sale.sale_date;
        });

        const plItems = Array.from(lotMap.values()).map(lot => ({
            ...lot,
            saleRate: lot.qty > 0 ? (lot.revenue / lot.qty) : 0,
            margin: lot.revenue > 0 ? ((lot.profit / lot.revenue) * 100) : 0,
        })).sort((a, b) => {
            const timeA = a.date ? new Date(a.date).getTime() : 0;
            const timeB = b.date ? new Date(b.date).getTime() : 0;
            return (timeB || 0) - (timeA || 0);
        });

        const totalProfit = totalRevenue - totalCost - totalExpenses + totalCommission;
        const netMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

        setStats({
            items: plItems,
            totalRevenue,
            totalCost,
            totalExpenses,
            totalCommission,
            totalProfit,
            margin: netMargin,
        });
    }, [rawSalesData, selectedFruit]);

    const safeFormat = (date: any, formatStr: string) => {
        if (!date) return "—";
        const d = new Date(date);
        return isValid(d) ? format(d, formatStr) : "—";
    };

    const datePresets = [
        { label: 'Today', from: startOfDay(new Date()), to: endOfDay(new Date()) },
        { label: 'Last Month', from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) },
        { label: 'This Year', from: startOfYear(new Date()), to: endOfYear(new Date()) },
        { label: 'Last Year', from: startOfYear(subYears(new Date(), 1)), to: endOfYear(subYears(new Date(), 1)) },
        { label: 'Last 2 Years', from: startOfYear(subYears(new Date(), 2)), to: endOfYear(new Date()) },
    ];

    const activePreset = dateRange?.from && dateRange?.to
        ? datePresets.find(p => isSameDay(p.from, dateRange?.from!) && isSameDay(p.to, dateRange?.to!))?.label
        : null;

    // Reset to page 1 when date range changes
    useEffect(() => { setCurrentPage(1); }, [dateRange]);

    useEffect(() => {
        if (!profile?.organization_id) return;

        fetchPL();

        // Debounce realtime: P&L is expensive — collapse rapid writes into one refresh.
        // ledger_entries subscription removed (fires on every payment; P&L doesn't need it).
        // sale_items now has org filter to prevent cross-tenant spurious triggers.
        const schema = 'mandi';
        const orgFilter = `organization_id=eq.${profile.organization_id}`;
        const uniqueId = Math.random().toString(36).substring(7);
        let plTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedFetch = () => {
            if (plTimer) clearTimeout(plTimer);
            plTimer = setTimeout(() => { fetchPL(); }, 5000);
        };

        const channel = supabase
            .channel(`pl_realtime_${uniqueId}`)
            .on('postgres_changes', { event: '*', schema, table: 'sales',      filter: orgFilter }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema, table: 'sale_items', filter: orgFilter }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema, table: 'lots',       filter: orgFilter }, debouncedFetch)
            .subscribe();

        return () => {
            if (plTimer) clearTimeout(plTimer);
            supabase.removeChannel(channel);
        };
    }, [profile, authLoading, dateRange]);

    const downloadCSV = () => {
        if (!stats?.items?.length) return;
        const headers = ['Date', 'Item', 'Lot Code', 'Qty', 'Revenue', 'Cost', 'Expenses', 'Commission', 'Profit', 'Margin %'];
        const rows = stats.items.map((item: any) => [
            item.date ? safeFormat(item.date, 'dd MMM yyyy') : '',
            item.item,
            item.lot_code,
            item.qty,
            item.revenue.toFixed(2),
            item.cost.toFixed(2),
            item.expenses.toFixed(2),
            item.commission.toFixed(2),
            item.profit.toFixed(2),
            item.margin.toFixed(2)
        ]);
        // Add summary rows
        const summaryRows = [
            [],
            ['TOTAL', '', '', stats.items.reduce((sum: number, item: any) => sum + item.qty, 0),
             stats.totalRevenue.toFixed(2), stats.totalCost.toFixed(2),
             stats.totalExpenses.toFixed(2), stats.totalCommission.toFixed(2),
             stats.totalProfit.toFixed(2), stats.margin.toFixed(2)]
        ];
        const csv = [headers, ...rows, ...summaryRows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trading-pl-${safeFormat(dateRange?.from || new Date(), 'dd-MMM-yyyy')}-to-${safeFormat(dateRange?.to || new Date(), 'dd-MMM-yyyy')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const fetchPL = async () => {
        if (!profile?.organization_id) return;
        setLoading(true);
        try {
            const schema = 'mandi';
            const fromDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
            const toDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
            const toDateTime = `${toDate} 23:59:59`;

            // -------------------------------------------------------
            // Fetch sales with lot details for per-lot profit analysis
            // -------------------------------------------------------
            const { data: salesData, error: salesError } = await supabase
                .schema(schema)
                .from('sale_items')
                .select(`
                    id, qty, rate, amount,
                    sale:sales!inner(
                        id, sale_date, payment_status, workflow_status
                    ),
                    lot:lots!inner(
                        id, lot_code, arrival_type,
                        supplier_rate, commission_percent, less_percent,
                        packing_cost, loading_cost, initial_qty, farmer_charges,
                        expense_paid_by_mandi,
                        commodity:commodities(name),
                        purchase_bill:purchase_bills(
                            id, net_payable, commission_amount, gross_amount
                        )
                    )
                `)
                .eq('organization_id', profile.organization_id)
                .gte('sale.sale_date', fromDate)
                .lte('sale.sale_date', toDateTime);

            if (salesError) throw salesError;

            setRawSalesData(salesData || []);
        } catch (error) {
            console.error('fetchPL error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F0F2F5] text-slate-900 p-4 md:p-8 space-y-6 md:space-y-10 animate-in fade-in duration-700">
            <div className="max-w-7xl mx-auto space-y-6 md:space-y-10 pb-20">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-8 bg-white p-6 md:p-10 rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-50 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none opacity-60"></div>
                    <div className="relative z-10">
                        <h1 className="text-3xl md:text-5xl font-[1000] tracking-tighter text-slate-800 uppercase mb-2 md:mb-3">
                            Trading <span className="text-emerald-600">PnL</span>
                        </h1>
                        <div className="flex items-center gap-4">
                            <p className="text-slate-500 font-bold text-sm md:text-lg flex items-center gap-2">
                                <PieChart className="w-4 h-4 md:w-5 md:h-5 text-emerald-600" />
                                Profitability Analysis
                            </p>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 shadow-sm">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Live Sync</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 md:gap-3 items-center bg-slate-100 p-1.5 md:p-2 rounded-2xl md:rounded-[24px] border border-slate-200 shadow-inner relative z-10 w-full md:w-auto">
                        <Select value={selectedFruit} onValueChange={setSelectedFruit}>
                            <SelectTrigger className="h-12 md:h-14 w-full md:w-fit md:min-w-[160px] justify-start text-left font-black bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:shadow-md px-4 md:px-6 rounded-xl md:rounded-2xl transition-all focus:ring-0 focus:ring-offset-0 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <Apple className="h-5 w-5 text-emerald-600" />
                                    <SelectValue placeholder="All Fruits" />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200 shadow-2xl p-2 bg-white max-h-[300px]">
                                <SelectItem value="all" className="rounded-xl px-4 py-3 font-black text-sm cursor-pointer hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-900 text-slate-700 data-[state=checked]:bg-emerald-50 data-[state=checked]:text-emerald-900 transition-colors">All Fruits</SelectItem>
                                {availableFruits.map((fruit: string) => (
                                    <SelectItem key={fruit} value={fruit.toLowerCase()} className="rounded-xl px-4 py-3 font-black text-sm cursor-pointer hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-900 text-slate-700 data-[state=checked]:bg-emerald-50 data-[state=checked]:text-emerald-900 transition-colors">
                                        {fruit}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {isNativePlatform() ? (
                            <>
                                <Button
                                    variant={"ghost"}
                                    onClick={() => setDateSheetOpen(true)}
                                    className={cn(
                                        "h-12 flex-1 justify-start text-left font-black bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:shadow-md px-4 rounded-xl transition-all",
                                        !dateRange?.from && "text-slate-400"
                                    )}
                                >
                                    <CalendarIcon className="mr-3 h-5 w-5 text-emerald-600" />
                                    {activePreset ? (
                                        <span className="text-sm font-black tracking-widest uppercase">{activePreset}</span>
                                    ) : dateRange?.from ? (
                                        <span className="text-sm">
                                            {format(dateRange.from, "dd MMM")} - {format(dateRange.to || dateRange.from, "dd MMM")}
                                        </span>
                                    ) : (
                                        <span className="text-sm uppercase tracking-widest">Date Filter</span>
                                    )}
                                </Button>
                                <BottomSheet open={dateSheetOpen} onClose={() => setDateSheetOpen(false)} title="Select Date Range">
                                    <div className="space-y-4">
                                        <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto no-scrollbar">
                                            {datePresets.map((preset) => (
                                                <button
                                                    key={preset.label}
                                                    onClick={() => setDateRange({
                                                        from: preset.from,
                                                        to: preset.to
                                                    })}
                                                    className={cn(
                                                        "flex-1 px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
                                                        activePreset === preset.label
                                                            ? "text-emerald-600 border-emerald-600 bg-emerald-50"
                                                            : "text-slate-400 border-transparent"
                                                    )}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="p-4 flex justify-center">
                                            <Calendar
                                                initialFocus
                                                mode="range"
                                                defaultMonth={dateRange?.from}
                                                selected={dateRange}
                                                onSelect={setDateRange}
                                                numberOfMonths={1}
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="p-4">
                                            <Button 
                                                className="w-full bg-slate-900 text-white h-12 rounded-xl font-black uppercase tracking-widest"
                                                onClick={() => setDateSheetOpen(false)}
                                            >
                                                Apply Filter
                                            </Button>
                                        </div>
                                    </div>
                                </BottomSheet>
                            </>
                        ) : (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"ghost"}
                                        className={cn(
                                            "h-12 md:h-14 flex-1 md:flex-initial justify-start text-left font-black bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:shadow-md px-4 md:px-6 rounded-xl md:rounded-2xl transition-all",
                                            !dateRange?.from && "text-slate-400"
                                        )}
                                    >
                                        <CalendarIcon className="mr-3 h-5 w-5 text-emerald-600" />
                                        {activePreset ? (
                                            <span className="text-sm font-black tracking-widest uppercase">{activePreset}</span>
                                        ) : dateRange?.from ? (
                                            <span className="text-sm">
                                                {safeFormat(dateRange.from, "dd MMM")} - {safeFormat(dateRange.to || dateRange.from, "dd MMM yyyy")}
                                            </span>
                                        ) : (
                                            <span className="text-sm uppercase tracking-widest">Filter by Date</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-white border-slate-200 shadow-2xl rounded-2xl overflow-hidden" align="end">
                                    <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto no-scrollbar">
                                        {datePresets.map((preset) => (
                                            <button
                                                key={preset.label}
                                                onClick={() => setDateRange({
                                                    from: preset.from,
                                                    to: preset.to
                                                })}
                                                className={cn(
                                                    "flex-1 px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
                                                    activePreset === preset.label
                                                        ? "text-emerald-600 border-emerald-600 bg-emerald-50"
                                                        : "text-slate-400 border-transparent hover:text-slate-800 hover:bg-white"
                                                )}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={setDateRange}
                                        numberOfMonths={1}
                                        className="p-4 bg-white"
                                    />
                                </PopoverContent>
                            </Popover>
                        )}

                        <Button onClick={fetchPL} variant="ghost" className="h-12 w-12 md:h-14 md:w-14 bg-white hover:bg-emerald-50 rounded-xl md:rounded-2xl text-slate-400 p-0 shadow-sm border border-slate-200">
                            {loading ? <Loader2 className="animate-spin w-5 h-5 md:w-6 md:h-6 text-emerald-600" /> : <RefreshCcw className="w-5 h-5 md:w-6 md:h-6" />}
                        </Button>

                        <Button
                            onClick={() => {
                                const text = `*Trading P&L Summary*\n\n` +
                                    `Revenue: ₹${(stats?.totalRevenue || 0).toLocaleString()}\n` +
                                    `Less: Cost: ₹${(stats?.totalCost || 0).toLocaleString()}\n` +
                                    `Less: Expenses: ₹${(stats?.totalExpenses || 0).toLocaleString()}\n` +
                                    `Plus: Commission: ₹${(stats?.totalCommission || 0).toLocaleString()}\n\n` +
                                    `Net Profit: ₹${(stats?.totalProfit || 0).toLocaleString()}\n` +
                                    `Margin: ${(stats?.margin || 0).toFixed(1)}%`;
                                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                            }}
                            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 md:h-14 px-4 md:px-6 rounded-xl md:rounded-2xl shadow-lg shadow-emerald-100 transition-all justify-center flex items-center gap-2"
                        >
                            <MessageCircle className="w-4 h-4 md:w-5 md:h-5" /> Share Report
                        </Button>
                    </div>
                </div>

                {loading && !stats ? (
                    <div className="flex flex-col items-center justify-center py-40 space-y-6">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin"></div>
                            <PieChart className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-emerald-600" />
                        </div>
                        <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Analyzing Trading Data</p>
                    </div>
                ) : !stats ? (
                    <div className="flex flex-col items-center justify-center py-40 space-y-6 bg-white rounded-[40px] border border-slate-200">
                        <Info className="w-16 h-16 text-slate-200" />
                        <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">No Data Available for this period</p>
                        <Button onClick={fetchPL} variant="outline" className="rounded-xl">Try Again</Button>
                    </div>
                ) : (
                    <>
                        {/* Summary Metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
                            {/* Net Profit Card */}
                            <div className={cn(
                                "group relative p-6 md:p-10 rounded-2xl md:rounded-[40px] border shadow-xl transition-all duration-500 overflow-hidden",
                                (stats?.totalProfit || 0) >= 0 ? "bg-emerald-600 border-emerald-500 text-white" : "bg-rose-600 border-rose-500 text-white"
                            )}>
                                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                                    <TrendingUp className="w-40 h-40" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] mb-4 opacity-80">
                                        <Zap className="w-4 h-4" /> Total Net Profit
                                    </div>
                                    <div className={cn(
                                        "font-[1000] tracking-tighter mb-2 md:mb-4 transition-all duration-300",
                                        (() => {
                                            const profitStr = (stats?.totalProfit || 0).toLocaleString();
                                            if (profitStr.length > 12) return "text-2xl md:text-3xl";
                                            if (profitStr.length > 10) return "text-3xl md:text-4xl";
                                            if (profitStr.length > 8) return "text-4xl md:text-5xl";
                                            return "text-5xl md:text-6xl";
                                        })()
                                    )}>
                                        ₹{(stats?.totalProfit || 0).toLocaleString()}
                                    </div>
                                    <div className="text-xs font-black uppercase tracking-widest opacity-60 bg-black/10 w-fit px-3 py-1 rounded-full">
                                        Over {stats?.items?.length || 0} Successful Cycles
                                    </div>
                                </div>
                            </div>

                            {/* Margin Analytics */}
                            <div className="group bg-white p-6 md:p-10 rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm hover:shadow-md transition-all duration-500">
                                <div className="flex items-center justify-between mb-6">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trade Performance</p>
                                    <Activity className="w-5 h-5 text-indigo-500" />
                                </div>
                                <div className="flex items-baseline gap-3">
                                    <div className={cn("text-4xl md:text-5xl font-[1000] tracking-tighter",
                                        (stats?.margin || 0) >= 20 ? "text-emerald-600" :
                                            (stats?.margin || 0) > 0 ? "text-amber-600" : "text-rose-600"
                                    )}>
                                        {(stats?.margin || 0).toFixed(1)}%
                                    </div>
                                    <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Margin</div>
                                </div>
                                <div className="mt-8 space-y-4">
                                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                                        <div
                                            className={cn("h-full rounded-full transition-all duration-1000 shadow-sm", (stats?.margin || 0) > 0 ? "bg-emerald-500" : "bg-rose-500")}
                                            style={{ width: `${Math.min(Math.abs(stats?.margin || 0), 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Efficiency Score: {Math.round(Math.min(stats?.margin || 0, 100))}/100</p>
                                </div>
                            </div>

                            {/* P&L Breakdown */}
                            <div className="group bg-white p-6 md:p-10 rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm flex flex-col justify-between gap-4 md:gap-6 overflow-hidden relative">
                                <div className="absolute bottom-0 right-0 w-32 h-32 bg-slate-50 rounded-full blur-3xl -mb-16 -mr-16 pointer-events-none opacity-50"></div>
                                <div className="space-y-4 relative z-10">
                                    <div className="flex justify-between items-baseline">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <ArrowUpRight className="w-3 h-3 text-emerald-500" /> Revenue
                                        </p>
                                        <div className="font-black text-emerald-600 text-lg">₹{(stats?.totalRevenue || 0).toLocaleString()}</div>
                                    </div>
                                    <div className="flex justify-between items-baseline text-slate-600">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Less: Cost</p>
                                        <div className="font-black text-slate-700 text-lg">₹{(stats?.totalCost || 0).toLocaleString()}</div>
                                    </div>
                                    <div className="flex justify-between items-baseline text-slate-600">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Less: Expenses</p>
                                        <div className="font-black text-slate-700 text-lg">{stats?.totalExpenses > 0 ? `₹${(stats?.totalExpenses || 0).toLocaleString()}` : '—'}</div>
                                    </div>
                                    <div className="flex justify-between items-baseline">
                                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Plus: Commission</p>
                                        <div className="font-black text-amber-600 text-lg">{stats?.totalCommission > 0 ? `₹${(stats?.totalCommission || 0).toLocaleString()}` : '—'}</div>
                                    </div>
                                    <div className="h-px w-full bg-slate-100" />
                                    <div className="flex justify-between items-baseline pt-1 md:pt-2">
                                        <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Net Profit</p>
                                        <div className={cn("font-[1000] text-xl md:text-2xl tracking-tighter", (stats?.totalProfit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                                            {(stats?.totalProfit || 0) >= 0 ? '+' : ''}₹{(stats?.totalProfit || 0).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Transaction Detail Table */}
                        {(() => {
                            const allItems = stats?.items || [];
                            const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
                            const cappedPage = Math.min(currentPage, MAX_FREE_PAGES);
                            const pageItems = allItems.slice((cappedPage - 1) * PAGE_SIZE, cappedPage * PAGE_SIZE);
                            const hasMoreBeyondLimit = allItems.length > MAX_FREE_PAGES * PAGE_SIZE;

                            return (
                                <div className="bg-white border border-slate-200 rounded-[24px] md:rounded-[48px] overflow-hidden shadow-xl">
                                    <div className="p-6 md:p-10 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
                                        <div>
                                            <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2">
                                                <Filter className="w-4 h-4 text-emerald-600" /> Transaction Breakdown
                                            </h3>
                                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                                                Showing {pageItems.length} of {allItems.length} records
                                                {hasMoreBeyondLimit && <span className="ml-2 text-amber-500 text-[8px] md:text-[10px]">· Export for full data</span>}
                                            </p>
                                        </div>
                                        <Button onClick={downloadCSV} variant="outline" className="w-full md:w-auto border-slate-200 text-slate-500 hover:text-black hover:bg-white h-10 md:h-12 px-4 md:px-6 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[9px] md:text-[10px] shadow-sm">
                                            <Download className="w-3.5 h-3.5 mr-2" /> Export Full Report
                                        </Button>
                                    </div>

                                    {/* Desktop Table */}
                                    <div className="hidden md:block overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50/30 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                                                <tr>
                                                    <th className="p-8 pl-12">Item / Lot Identity</th>
                                                    <th className="p-8 text-right">Revenue</th>
                                                    <th className="p-8 text-right">Cost</th>
                                                    <th className="p-8 text-right">Expenses</th>
                                                    <th className="p-8 text-right">Commission</th>
                                                    <th className="p-8 text-right pr-12">Profit / Margin</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {allItems.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="p-32 text-center">
                                                            <div className="flex flex-col items-center gap-4 text-slate-300">
                                                                <Info className="w-16 h-16 opacity-20" />
                                                                <p className="font-black uppercase tracking-[0.3em] text-sm">No trading records found</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    pageItems.map((item: any) => (
                                                        <tr
                                                            key={item.id}
                                                            className="hover:bg-emerald-50/30 transition-all group cursor-pointer"
                                                            onClick={() => { if (item.id) setSelectedLotId(item.id) }}
                                                        >
                                                            <td className="p-8 pl-12">
                                                                <div className="flex flex-col">
                                                                    <span className="font-[1000] text-slate-800 text-2xl tracking-tighter leading-none mb-2 group-hover:text-emerald-700 transition-colors">
                                                                        {item.item}
                                                                    </span>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-lg font-black tracking-widest border border-slate-200">
                                                                            #{item.lot_code}
                                                                        </span>
                                                                        {item.arrival_type?.toLowerCase() === 'direct' ? (
                                                                            <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded-lg font-black uppercase tracking-widest">DIRECT</span>
                                                                        ) : item.arrival_type?.toLowerCase() === 'damage / loss' ? (
                                                                            <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-100 px-2 py-1 rounded-lg font-black uppercase tracking-widest">LOSS</span>
                                                                        ) : item.arrival_type?.toLowerCase() === 'expense' ? (
                                                                            <span className="text-[9px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg font-black uppercase tracking-widest">OP EX</span>
                                                                        ) : (
                                                                            <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-1 rounded-lg font-black uppercase tracking-widest">COMMISSION</span>
                                                                        )}
                                                                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                                                            {safeFormat(item.date, 'dd MMM')}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-8 text-right font-mono font-black text-emerald-600 text-lg">
                                                                ₹{(item.revenue || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-8 text-right font-mono font-black text-slate-600 text-lg">
                                                                ₹{(item.cost || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-8 text-right font-mono font-bold text-slate-500 text-sm">
                                                                {item.expenses > 0 ? `₹${(item.expenses || 0).toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="p-8 text-right font-mono font-bold text-amber-600 text-sm">
                                                                {item.commission > 0 ? `₹${(item.commission || 0).toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="p-8 text-right pr-12">
                                                                <div className={cn("font-[1000] font-mono text-3xl tracking-tighter", (item.profit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                                                                    {(item.profit || 0) >= 0 ? '+' : ''}₹{Math.round(item.profit || 0).toLocaleString()}
                                                                </div>
                                                                <div className={cn("text-[10px] font-black uppercase tracking-[0.2em] mt-1", (item.margin || 0) >= 0 ? "text-emerald-500 opacity-60" : "text-rose-500 opacity-60")}>
                                                                    {(item.margin || 0).toFixed(1)}% Margin
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Card List */}
                                    <div className="md:hidden divide-y divide-slate-100">
                                        {allItems.length === 0 ? (
                                            <div className="py-20 text-center">
                                                <div className="flex flex-col items-center gap-4 text-slate-300">
                                                    <Info className="w-12 h-12 opacity-20" />
                                                    <p className="font-black uppercase tracking-[0.2em] text-[10px]">No trading records found</p>
                                                </div>
                                            </div>
                                        ) : (
                                            pageItems.map((item: any) => (
                                                <div
                                                    key={item.id}
                                                    className="p-5 active:bg-slate-50 transition-colors"
                                                    onClick={() => { if (item.id) setSelectedLotId(item.id) }}
                                                >
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div>
                                                            <h4 className="font-black text-lg text-slate-800 tracking-tight leading-tight uppercase">{item.item}</h4>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black tracking-widest border border-slate-200 uppercase">#{item.lot_code}</span>
                                                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{safeFormat(item.date, 'dd MMM')}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className={cn("font-black text-lg tracking-tighter leading-tight", (item.profit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                                                                {(item.profit || 0) >= 0 ? '+' : ''}₹{Math.round(item.profit || 0).toLocaleString()}
                                                            </div>
                                                            <div className={cn("text-[8px] font-bold uppercase tracking-widest", (item.margin || 0) >= 0 ? "text-emerald-500" : "text-rose-500")}>{(item.margin || 0).toFixed(1)}% Margin</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-y-2 pt-3 border-t border-slate-50">
                                                        <div>
                                                            <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Revenue</p>
                                                            <p className="text-[10px] font-black text-emerald-600 tracking-tight">₹{(item.revenue || 0).toLocaleString()}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Buying Cost</p>
                                                            <p className="text-[10px] font-black text-slate-700 tracking-tight">₹{(item.cost || 0).toLocaleString()}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Expenses</p>
                                                            <p className="text-[10px] font-black text-slate-500 tracking-tight">{item.expenses > 0 ? `₹${(item.expenses || 0).toLocaleString()}` : '-'}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Commission</p>
                                                            <p className="text-[10px] font-black text-amber-600 tracking-tight">{item.commission > 0 ? `₹${(item.commission || 0).toLocaleString()}` : '-'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Pagination */}
                                    {allItems.length > PAGE_SIZE && (
                                        <div className="p-6 md:p-8 border-t border-slate-100 flex flex-col items-center gap-4">
                                            {/* Page buttons — max 3 pages free */}
                                            <div className="flex items-center gap-2 md:gap-3">
                                                <button
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                    className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl border border-slate-200 text-slate-400 font-black disabled:opacity-30 hover:bg-slate-50 transition-all text-sm md:text-base text-center"
                                                >←</button>

                                                {Array.from({ length: Math.min(totalPages, MAX_FREE_PAGES) }, (_, i) => i + 1).map(page => (
                                                    <button
                                                        key={page}
                                                        onClick={() => setCurrentPage(page)}
                                                        className={cn(
                                                            "w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl font-black text-xs md:text-sm transition-all text-center",
                                                            currentPage === page
                                                                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100"
                                                                : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                                                        )}
                                                    >{page}</button>
                                                ))}

                                                {totalPages > MAX_FREE_PAGES && (
                                                    <span className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest px-1 md:px-2">···</span>
                                                )}

                                                <button
                                                    onClick={() => setCurrentPage(p => Math.min(MAX_FREE_PAGES, p + 1))}
                                                    disabled={currentPage >= MAX_FREE_PAGES || currentPage >= totalPages}
                                                    className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl border border-slate-200 text-slate-400 font-black disabled:opacity-30 hover:bg-slate-50 transition-all text-sm md:text-base text-center"
                                                >→</button>
                                            </div>

                                            {/* Download CTA when beyond 3 pages */}
                                            {hasMoreBeyondLimit && (
                                                <div className="w-full bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl md:rounded-2xl p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
                                                    <div className="text-center md:text-left">
                                                        <p className="font-black text-slate-800 text-xs md:text-sm uppercase tracking-widest">📊 Full Analysis Available</p>
                                                        <p className="text-[8px] md:text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-widest">Download full CSV for {allItems.length} records</p>
                                                    </div>
                                                    <Button onClick={downloadCSV} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 md:px-6 h-10 md:h-11 rounded-xl md:rounded-2xl shadow-lg shadow-emerald-100 gap-2 shrink-0 text-[10px] md:text-xs">
                                                        <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Export Full Report
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>

            <LotPnLSheet
                lotId={selectedLotId}
                onClose={() => setSelectedLotId(null)}
            />
        </div>
    );
}
