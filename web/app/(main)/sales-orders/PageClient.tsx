"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { Plus, ClipboardList, TrendingUp, Users, Loader2, Filter, Search, Calendar as CalendarIcon, ChevronLeft, ChevronRight, RefreshCw, X, LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import SalesOrdersTable from "@/components/sales-orders/sales-orders-table";
import { useLanguage } from "@/components/i18n/language-provider";
import { useRouter, useSearchParams } from "next/navigation";

export default function SalesOrders() {
    const { profile, loading: authLoading } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useLanguage();

    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [totalValue, setTotalValue] = useState(0);
    const [activeOrdersCount, setActiveOrdersCount] = useState(0);

    const [page, setPage] = useState(1);
    const pageSize = 20;
    const [search, setSearch] = useState(searchParams.get("search") || "");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: undefined | Date }>({
        from: undefined,
        to: undefined,
    });
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    useEffect(() => {
        if (authLoading) return;

        if (!profile?.organization_id) {
            setLoading(false);
            return;
        }

        const timer = setTimeout(() => {
            fetchOrdersAndStats();
        }, 500);
        return () => clearTimeout(timer);
    }, [search, page, statusFilter, dateRange, profile, authLoading]);

    const fetchOrdersAndStats = async () => {
        if (!profile?.organization_id) {
            setLoading(false);
            return;
        }
        setLoading(true);

        try {
            const buildQuery = (selectStr: string, opts: any = {}) => {
                let q = supabase
                    .from('sales_orders')
                    .select(selectStr, opts)
                    .eq('organization_id', profile.organization_id);

                if (statusFilter !== 'all') {
                    q = q.eq('status', statusFilter);
                }
                if (dateRange.from) {
                    q = q.gte('order_date', startOfDay(dateRange.from).toISOString());
                }
                if (dateRange.to) {
                    q = q.lte('order_date', endOfDay(dateRange.to).toISOString());
                }
                return q;
            };

            const { data: statsData } = await buildQuery('total_amount');

            const realTotal = (statsData as any[])?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
            const activeCount = statsData?.length || 0;

            setTotalValue(realTotal);
            setTotalCount(activeCount);

            // Just for a metric card: how many are Draft / Sent / Accepted, not Fully Invoiced or Cancelled
            const { count: pendingOrdersCount } = await supabase
                .from('sales_orders')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', profile.organization_id)
                .in('status', ['Draft', 'Sent', 'Accepted', 'Partially Invoiced']);

            setActiveOrdersCount(pendingOrdersCount || 0);

            const startIdx = (page - 1) * pageSize;
            const endIdx = startIdx + pageSize - 1;

            let tableQuery = buildQuery('*, buyer:contacts!sales_orders_buyer_id_fkey(id, name, city), sales_order_items(*, item:items(name))', { count: 'exact' })
                .order('created_at', { ascending: false });

            if (search) {
                // Step 1: Find matching buyers for the search term
                const { data: matchingBuyers } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('organization_id', profile.organization_id)
                    .ilike('name', `%${search}%`);

                const buyerIds = matchingBuyers?.map(b => b.id) || [];

                // Step 2: Search Orders by Number OR Matching Buyer IDs
                if (buyerIds.length > 0) {
                    const idsStr = `(${buyerIds.join(',')})`;
                    tableQuery = tableQuery.or(`order_number.ilike.%${search}%,buyer_id.in.${idsStr}`);
                } else {
                    tableQuery = tableQuery.ilike('order_number', `%${search}%`);
                }
            }

            tableQuery = tableQuery.range(startIdx, endIdx);

            const { data: tableData, error: tableError } = await tableQuery;

            if (tableError) throw tableError;

            setOrders(tableData || []);

        } catch (err) {
            console.error("Error fetching sales orders:", err);
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => {
        setStatusFilter("all");
        setDateRange({ from: undefined, to: undefined });
        setSearch("");
        setPage(1);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-black p-8 pb-40 space-y-8 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#F0F4E3] p-6 rounded-3xl border border-olive-200/50 shadow-sm transition-colors duration-500">
                <div>
                    <h1 className="text-4xl font-[1000] text-black tracking-tighter uppercase mb-2">
                        {t('sales_orders.title') || 'SALES ORDERS'}
                    </h1>
                    <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-[#0C831F]" />
                        {t('sales_orders.subtitle') || 'Manage Customer Orders & Quotations.'}
                    </p>
                </div>
                <div className="flex gap-4">
                    <Button variant="outline" onClick={() => fetchOrdersAndStats()} className="h-12 w-12 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-400 bg-white shadow-sm font-bold">
                        <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
                    </Button>
                    <Link href="/sales-orders/new">
                        <Button className="h-12 px-8 bg-[#0C831F] text-white hover:bg-[#0A6C1A] font-black text-lg rounded-xl shadow-lg shadow-emerald-200 hover:scale-105 transition-all">
                            <Plus className="mr-2 h-5 w-5" /> {t('sales_orders.new_order') || 'NEW ORDER'}
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-2">
                    <StatsCard
                        title={t('stats.order_value') || "TOTAL ORDER VALUE"}
                        value={`₹ ${(totalValue).toLocaleString()}`}
                        icon={<TrendingUp className="w-8 h-8 text-black/40" />}
                        color="lime"
                        textColor="black"
                    />
                </div>
                <StatsCard
                    title="Active Orders"
                    value={activeOrdersCount.toString()}
                    subtext="Pending Fulfillment"
                    icon={<ClipboardList className="w-8 h-8 text-white/50" />}
                    color="blue"
                />
            </div>

            <div className="sticky top-4 z-30 bg-white/90 backdrop-blur-xl border border-slate-200 p-2 rounded-2xl shadow-xl flex flex-col md:flex-row gap-2 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                        placeholder={t('sales_orders.search_placeholder') || 'Search orders...'}
                        className="pl-12 bg-white border-slate-200 text-black h-12 rounded-xl focus:ring-0 focus:border-[#0C831F] text-lg font-black transition-all shadow-sm placeholder:text-slate-300"
                        value={search}
                        onChange={(e) => {
                            const val = e.target.value;
                            setSearch(val);
                            setPage(1);
                            const params = new URLSearchParams(searchParams.toString());
                            if (val) params.set("search", val);
                            else params.delete("search");
                            router.replace(`/sales-orders?${params.toString()}`);
                        }}
                    />
                </div>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn(
                                "h-12 justify-start text-left font-bold rounded-xl border-slate-200 bg-white text-black shadow-sm transition-all",
                                !dateRange.from && "text-slate-500",
                                dateRange.from && "border-[#0C831F] text-[#0C831F] bg-emerald-50"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            <span className="hidden md:inline">
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>{format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}</>
                                    ) : (
                                        format(dateRange.from, "MMM d, yyyy")
                                    )
                                ) : (
                                    "Date Range"
                                )}
                            </span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white border-slate-200 rounded-xl shadow-2xl" align="end">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange.from}
                            selected={dateRange as any}
                            onSelect={(range: any) => { setDateRange(range || { from: undefined, to: undefined }); setPage(1); }}
                            numberOfMonths={1}
                            className="bg-white text-black p-4 rounded-xl"
                        />
                    </PopoverContent>
                </Popover>

                <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "h-12 w-12 rounded-xl border-slate-200 hover:bg-slate-50 bg-white shadow-sm font-bold p-0",
                                (statusFilter !== 'all' || dateRange.from) && "border-[#0C831F] text-[#0C831F] bg-emerald-50"
                            )}
                        >
                            <Filter className="w-5 h-5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-4 bg-white border-slate-200 shadow-2xl rounded-2xl mr-4" align="end">
                        <div className="space-y-4">
                            <h3 className="font-black text-black uppercase tracking-widest text-xs border-b border-slate-100 pb-2">Filter Orders</h3>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-slate-400">Status</label>
                                <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                                    <SelectTrigger className="w-full bg-slate-50 border-slate-200 text-black font-bold h-10 rounded-lg">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border-slate-200 text-black rounded-xl">
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="Draft">Draft</SelectItem>
                                        <SelectItem value="Sent">Sent</SelectItem>
                                        <SelectItem value="Accepted">Accepted</SelectItem>
                                        <SelectItem value="Partially Invoiced">Partially Invoiced</SelectItem>
                                        <SelectItem value="Fully Invoiced">Fully Invoiced</SelectItem>
                                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button
                                variant="destructive"
                                onClick={clearFilters}
                                className="w-full h-10 rounded-lg font-black uppercase tracking-widest bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm text-xs"
                            >
                                <X className="w-3 h-3 mr-2" /> {t('common.clear_filters') || 'Clear Filters'}
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div className="space-y-4">
                <SalesOrdersTable
                    data={orders}
                    isLoading={loading}
                    onRefresh={fetchOrdersAndStats}
                />

                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {t('common.pagination_info', { page, totalPages: Math.ceil(totalCount / pageSize) || 1, total: totalCount })}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="h-10 px-6 rounded-xl bg-white hover:bg-slate-50 text-black font-bold border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" /> {t('common.previous') || 'Previous'}
                        </Button>
                        <Button
                            variant="outline"
                            disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                            onClick={() => setPage(p => p + 1)}
                            className="h-10 px-6 rounded-xl bg-black hover:bg-slate-800 text-white font-bold border-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            {t('common.next') || 'Next'} <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}


function StatsCard({ title, value, trend, subtext, icon, color, textColor }: any) {
    let bgClass = '';
    let textClass = 'text-white';
    let iconClass = 'text-white/80';
    let subTextClass = 'text-white/60';

    if (color === 'white') {
        bgClass = 'bg-white border border-slate-200';
        textClass = 'text-black';
        iconClass = 'text-slate-400';
        subTextClass = 'text-slate-400';
    } else if (color === 'lime') {
        bgClass = 'bg-[#D9F99D] border border-lime-200'; // Greenish yellow
        textClass = 'text-slate-900';
        iconClass = 'text-slate-600';
        subTextClass = 'text-slate-600';
    } else if (color === 'blue') {
        bgClass = 'bg-blue-600';
    } else if (color === 'orange') {
        bgClass = 'bg-orange-500';
    } else {
        bgClass = 'bg-black'; // Default fallback
    }

    return (
        <div className={`p-8 rounded-[32px] ${bgClass} relative overflow-hidden group hover:shadow-xl transition-all duration-500 hover:-translate-y-1 shadow-sm`}>
            <div className={`absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-30 transition-opacity ${iconClass}`}>
                {icon}
            </div>
            <div className="relative z-10">
                <div className={`text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2 ${color === 'white' || color === 'lime' ? 'text-slate-600' : 'text-white/80'}`}>
                    <span className={`w-2 h-2 rounded-full ${color === 'white' ? 'bg-slate-300' : color === 'lime' ? 'bg-slate-400' : 'bg-white/60'}`}></span> {title}
                </div>
                <div className={`text-5xl font-black tracking-tighter mb-4 drop-shadow-sm ${textClass}`}>{value}</div>
                {(trend || subtext) && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border ${color === 'white' || color === 'lime' ? 'bg-black/5 border-black/10 text-slate-800' : 'bg-white/20 border-white/30 text-white'}`}>
                        {trend ? <TrendingUp className="w-3 h-3" /> : null} {trend || subtext}
                    </div>
                )}
            </div>
        </div>
    )
}
