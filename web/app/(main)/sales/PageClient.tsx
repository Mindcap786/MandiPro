"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import {
    Plus, TrendingUp, Wallet, Users, FileText, Loader2,
    Filter, Search, Calendar as CalendarIcon, ChevronLeft,
    ChevronRight, RefreshCw, X, List, LayoutGrid,
    ChevronDown, Receipt, Clock, CheckCircle2, AlertCircle
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import SalesTable from "@/components/sales/sales-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import BuyerReceivablesTable from "@/components/sales/buyer-receivables-table";
import { calculateGrossRevenue } from "@/lib/accounting-logic";
import { useLanguage } from "@/components/i18n/language-provider";
import { useRouter, useSearchParams } from "next/navigation";
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache";
import { isNativePlatform } from "@/lib/capacitor-utils";
import { BottomSheet } from "@/components/mobile/BottomSheet";
import { snackbar } from "@/components/mobile/Snackbar";

// Native components
import { NativeCard } from "@/components/mobile/NativeCard";
import { ActionSheet } from "@/components/mobile/ActionSheet";
import { SegmentedControl } from "@/components/mobile/SegmentedControl";
import { SkeletonListScreen } from "@/components/mobile/ShimmerSkeleton";
import { StatChip } from "@/components/mobile/NativeSummaryCard";

// ──────────────────────────────────────────────────────────────────────────────
// ALL BUSINESS LOGIC IDENTICAL — only JSX return changes on native
// ──────────────────────────────────────────────────────────────────────────────

export default function Sales() {
    const { profile, loading: authLoading } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useLanguage();

    const _orgId = profile?.organization_id;
    const _cached = _orgId ? cacheGet<any>("sales_page", _orgId) : null;

    const [sales, setSales] = useState<any[]>(_cached?.sales || []);
    const [loading, setLoading] = useState(!_cached);
    const [totalCount, setTotalCount] = useState(_cached?.totalCount || 0);
    const [totalRevenue, setTotalRevenue] = useState(_cached?.totalRevenue || 0);
    const [activeDebtorsCount, setActiveDebtorsCount] = useState(_cached?.debtors || 0);
    const [activeCreditorsCount, setActiveCreditorsCount] = useState(_cached?.creditors || 0);

    const [page, setPage] = useState(1);
    const pageSize = 20;
    const [search, setSearch] = useState(searchParams.get("search") || "");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: undefined | Date }>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [viewMode, setViewMode] = useState<"invoices" | "buyers">("invoices");
    const [statusSheetOpen, setStatusSheetOpen] = useState(false);
    const [dateSheetOpen, setDateSheetOpen] = useState(false);

    // High Performance Search Debouncing
    const [debouncedSearch, setDebouncedSearch] = useState(search);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
        }, 400); // 400ms delay to prevent rapid-fire requests
        return () => clearTimeout(handler);
    }, [search]);

    useEffect(() => {
        if (!_orgId) return;
        const cached = cacheGet<any>("sales_page", _orgId);
        if (!cached) return;
        setSales(cached.sales || []);
        setTotalCount(cached.totalCount || 0);
        setTotalRevenue(cached.totalRevenue || 0);
        setActiveDebtorsCount(cached.debtors || 0);
        setActiveCreditorsCount(cached.creditors || 0);
        setLoading(false);
    }, [_orgId]);

    // Sync main table load with debounced search
    useEffect(() => {
        if (authLoading) return;
        if (!profile?.organization_id) { setLoading(false); return; }
        fetchSalesAndStats();
    }, [debouncedSearch, page, statusFilter, dateRange, profile, authLoading]);

    // Live Realtime Subscriptions (Blazing Fast Sync)
    useEffect(() => {
        if (!profile?.organization_id) return;
        const channelId = `sales-dashboard-${Math.random().toString(36).substring(7)}`;
        const channel = supabase.channel(channelId)
            .on('postgres_changes', 
                { event: '*', schema: 'mandi', table: 'sales', filter: `organization_id=eq.${profile.organization_id}` }, 
                () => {
                    console.log("Realtime event received! Updating Dashboard UI silently.");
                    fetchSalesAndStats(false);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile?.organization_id]);

    const fetchSalesAndStats = async (isManualRefresh = false) => {
        if (!profile?.organization_id) { setLoading(false); return; }
        const isBackgroundRefresh = sales.length > 0 && !isManualRefresh;
        if (!isBackgroundRefresh) setLoading(true);

        try {
            const buildQuery = (selectStr: string, opts: any = {}) => {
                let q = supabase.schema("mandi").from("sales").select(selectStr, opts).eq("organization_id", profile.organization_id);
                if (statusFilter !== "all") {
                    if (statusFilter === "overdue") q = q.eq("payment_status", "pending").lt("due_date", new Date().toISOString());
                    else q = q.eq("payment_status", statusFilter);
                }
                if (dateRange.from) q = q.gte("sale_date", startOfDay(dateRange.from).toISOString());
                if (dateRange.to) q = q.lte("sale_date", endOfDay(dateRange.to).toISOString());
                return q;
            };

            // Stats + peripheral views run in parallel with the table fetch, but their
            // failure MUST NOT hide the sales list. A single rejected promise in a
            // Promise.all used to empty the whole page.
            const [statsRes, debtorsRes, creditorsRes] = await Promise.allSettled([
                buildQuery("total_amount, payment_status, market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses, buyer_id, gst_total, total_amount_inc_tax"),
                supabase.schema("mandi").from("view_party_balances").select("*", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("contact_type", "buyer").gt("net_balance", 0),
                supabase.schema("mandi").from("view_party_balances").select("*", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("contact_type", "buyer").lt("net_balance", 0),
            ]);

            const statsData = statsRes.status === "fulfilled" ? (statsRes.value as any).data : [];
            if (statsRes.status === "rejected") console.warn("[sales] stats query failed:", statsRes.reason);
            const debtorsCount = debtorsRes.status === "fulfilled" ? (((debtorsRes.value as unknown) as { count: number | null }).count || 0) : 0;
            const creditorsCount = creditorsRes.status === "fulfilled" ? (((creditorsRes.value as unknown) as { count: number | null }).count || 0) : 0;
            if (debtorsRes.status === "rejected") console.warn("[sales] debtors view failed:", debtorsRes.reason);
            if (creditorsRes.status === "rejected") console.warn("[sales] creditors view failed:", creditorsRes.reason);

            setActiveDebtorsCount(debtorsCount);
            setActiveCreditorsCount(creditorsCount);
            setTotalRevenue(calculateGrossRevenue((statsData as any) || []));
            setTotalCount(statsData?.length || 0);

            const startIdx = (page - 1) * pageSize;
            // Slim default select: only what SalesTable actually renders. The heavy
            // sale_items / vouchers / sale_adjustments joins are re-fetched lazily
            // on the invoice detail screen, which is where they belong.
            let tableQuery = buildQuery(
                "id, sale_date, bill_no, contact_bill_no, invoice_no, status, payment_status, payment_mode, subtotal, discount_amount, gst_amount, total_amount, paid_amount, balance_due, due_date, buyer_id, organization_id, created_at, contact:contacts!sales_buyer_id_fkey(id, name, phone)",
                { count: "exact" }
            ).order("created_at", { ascending: false });

            if (debouncedSearch) {
                const { data: matchingBuyers } = await supabase.schema("mandi").from("contacts").select("id").eq("organization_id", profile.organization_id).ilike("name", `%${debouncedSearch}%`);
                const buyerIds = matchingBuyers?.map((b) => b.id) || [];
                const isNumericSearch = /^\d+$/.test(debouncedSearch.trim());
                if (buyerIds.length > 0) {
                    const idsStr = `(${buyerIds.join(",")})`;
                    if (isNumericSearch) tableQuery = tableQuery.or(`bill_no.eq.${Number(debouncedSearch.trim())},contact_bill_no.eq.${Number(debouncedSearch.trim())},buyer_id.in.${idsStr}`);
                    else tableQuery = tableQuery.or(`buyer_id.in.${idsStr}`);
                } else {
                    if (isNumericSearch) tableQuery = tableQuery.or(`bill_no.eq.${Number(debouncedSearch.trim())},contact_bill_no.eq.${Number(debouncedSearch.trim())}`);
                    else tableQuery = tableQuery.eq("bill_no", -1);
                }
            }

            tableQuery = tableQuery.range(startIdx, startIdx + pageSize - 1);
            const { data: tableData, error: tableError } = await tableQuery;
            if (tableError) throw tableError;
            setSales(tableData || []);
            cacheSet("sales_page", profile.organization_id, { 
                sales: tableData || [], 
                totalCount: statsData?.length || 0, 
                totalRevenue: calculateGrossRevenue((statsData as any) || []), 
                debtors: debtorsCount, 
                creditors: creditorsCount 
            });
        } catch (err) {
            console.error("Error fetching sales:", err);
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => { setStatusFilter("all"); setDateRange({ from: subDays(new Date(), 7), to: new Date() }); setSearch(""); setPage(1); };

    // ── STATUS BADGE HELPERS ─────────────────────────────────────────────────
    const statusBadge = (status: string) => {
        if (status === "paid") return { bg: "#DCFCE7", text: "#16A34A", label: "Paid", icon: CheckCircle2 };
        if (status === "overdue") return { bg: "#FEE2E2", text: "#DC2626", label: "Overdue", icon: AlertCircle };
        return { bg: "#FEF3C7", text: "#D97706", label: "Pending", icon: Clock };
    };

    // ── NATIVE MOBILE RENDER ─────────────────────────────────────────────────
    if (isNativePlatform()) {
        const totalPages = Math.ceil(totalCount / pageSize);
        const viewSegments = [
            { label: "Invoices", value: "invoices" },
            { label: "By Buyer", value: "buyers" },
        ];
        const statusOptions = [
            { label: "All Status", value: "all" },
            { label: "Paid", value: "paid" },
            { label: "Pending", value: "pending" },
            { label: "Overdue", value: "overdue" },
        ];

        return (
            <div className="bg-[#EFEFEF] min-h-dvh pb-4">
                {/* KPI strip */}
                <div className="px-4 pt-3 flex gap-3">
                    <StatChip
                        label="Revenue"
                        value={`₹${(totalRevenue / 1000).toFixed(0)}K`}
                        icon={<TrendingUp className="w-3.5 h-3.5" />}
                        color="#1A6B3C"
                        className="min-w-0"
                    />
                    <StatChip
                        label="Debtors"
                        value={activeDebtorsCount.toString()}
                        icon={<Users className="w-3.5 h-3.5" />}
                        color="#2563EB"
                        className="min-w-0"
                    />
                    <StatChip
                        label="Creditors"
                        value={activeCreditorsCount.toString()}
                        icon={<Users className="w-3.5 h-3.5" />}
                        color="#DC2626"
                        className="min-w-0"
                    />
                </div>

                {/* Search + filter row */}
                <div className="px-4 pt-3 flex gap-2">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                        <input
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            placeholder={t("sales.search_placeholder") || "Search buyer, bill no…"}
                            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#E5E7EB] text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A6B3C]"
                        />
                    </div>
                    <button
                        onClick={() => setStatusSheetOpen(true)}
                        className={cn(
                            "h-11 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap",
                            statusFilter !== "all"
                                ? "bg-[#1A6B3C] border-[#1A6B3C] text-white"
                                : "bg-white border-[#E5E7EB] text-[#6B7280]"
                        )}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        {statusFilter === "all" ? "Filter" : statusOptions.find((o) => o.value === statusFilter)?.label}
                    </button>
                    <Link href="/sales/new" className="w-11 h-11 rounded-xl bg-[#1A6B3C] flex items-center justify-center active:scale-95 transition-transform shadow-[0_2px_6px_rgba(26,107,60,0.3)]">
                        <Plus className="w-5 h-5 text-white" />
                    </Link>
                </div>

                {/* View toggle */}
                <SegmentedControl options={viewSegments} value={viewMode} onChange={(v) => setViewMode(v as any)} className="px-0" />

                {/* Date range quick chips */}
                {viewMode === "invoices" && (
                    <div className="flex gap-2 px-4 pb-2 overflow-x-auto [&::-webkit-scrollbar]:hidden items-center">
                        <button
                            onClick={() => setDateSheetOpen(true)}
                            className={cn(
                                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                                dateSheetOpen ? "bg-[#1A6B3C] text-white" : "bg-white border border-[#E5E7EB] text-[#6B7280]"
                            )}
                        >
                            <CalendarIcon className="w-3.5 h-3.5" />
                        </button>
                        
                        {[
                            { label: "Today", days: 0 },
                            { label: "7 Days", days: 7 },
                            { label: "30 Days", days: 30 },
                            { label: "90 Days", days: 90 },
                        ].map((chip) => {
                            const from = subDays(new Date(), chip.days);
                            const isActive = dateRange.from && Math.abs(dateRange.from.getTime() - from.getTime()) < 86400000;
                            return (
                                <button
                                    key={chip.label}
                                    onClick={() => { setDateRange({ from, to: new Date() }); setPage(1); }}
                                    className={cn(
                                        "flex-shrink-0 h-8 px-3 rounded-full text-xs font-medium transition-colors",
                                        isActive ? "bg-[#1A6B3C] text-white" : "bg-white border border-[#E5E7EB] text-[#6B7280]"
                                    )}
                                >
                                    {chip.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Date range bottom sheet */}
                <BottomSheet open={dateSheetOpen} onClose={() => setDateSheetOpen(false)} title="Select Custom Range">
                    <div className="p-4 space-y-6">
                        <div className="flex justify-center bg-white rounded-2xl overflow-hidden border border-slate-100">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange as any}
                                onSelect={(range: any) => setDateRange(range || { from: undefined, to: undefined })}
                                numberOfMonths={1}
                                className="p-4"
                            />
                        </div>
                        <Button 
                            className="w-full bg-[#1A6B3C] text-white h-12 rounded-xl font-bold"
                            onClick={() => { setDateSheetOpen(false); setPage(1); }}
                        >
                            Confirm Selection
                        </Button>
                    </div>
                </BottomSheet>

                {/* Content */}
                {viewMode === "invoices" ? (
                    loading ? (
                        <SkeletonListScreen count={6} />
                    ) : (
                        <div className="px-4 space-y-2">
                            {sales.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                                    <FileText className="w-12 h-12 mb-3 opacity-30" />
                                    <p className="text-sm font-medium">No invoices found</p>
                                </div>
                            ) : (
                                sales.map((sale) => {
                                    const badge = statusBadge(sale.payment_status || "pending");
                                    const Icon = badge.icon;
                                    return (
                                        <Link key={sale.id} href={`/sales/invoice/${sale.id}`}>
                                            <NativeCard className="active:scale-[0.98] transition-transform">
                                                <div className="flex items-start gap-3 p-4">
                                                    {/* Left accent */}
                                                    <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: badge.text }} />

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-semibold text-[#1A1A2E] truncate">
                                                                    {sale.contact?.name || "Unknown Buyer"}
                                                                </p>
                                                                <p className="text-xs text-[#9CA3AF] mt-0.5">
                                                                    #{sale.contact_bill_no || sale.bill_no} · {sale.sale_date ? format(new Date(sale.sale_date), "d MMM") : "—"}
                                                                </p>
                                                            </div>
                                                            <div className="text-right flex-shrink-0">
                                                                <p className="text-sm font-bold text-[#1A1A2E] tabular-nums">
                                                                    ₹{Number(sale.total_amount || 0).toLocaleString()}
                                                                </p>
                                                                <span
                                                                    className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                                                    style={{ backgroundColor: badge.bg, color: badge.text }}
                                                                >
                                                                    <Icon className="w-2.5 h-2.5" />
                                                                    {badge.label}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </NativeCard>
                                        </Link>
                                    );
                                })
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex gap-2 pt-2">
                                    <button
                                        disabled={page === 1 || loading}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        className="flex-1 h-12 rounded-xl bg-white border border-[#E5E7EB] text-sm font-semibold text-[#1A1A2E] disabled:opacity-40 active:scale-95 transition-transform flex items-center justify-center gap-2"
                                    >
                                        <ChevronLeft className="w-4 h-4" /> Prev
                                    </button>
                                    <div className="flex items-center px-4 text-xs text-[#6B7280] font-medium">
                                        {page}/{totalPages}
                                    </div>
                                    <button
                                        disabled={page >= totalPages || loading}
                                        onClick={() => setPage((p) => p + 1)}
                                        className="flex-1 h-12 rounded-xl bg-[#1A6B3C] text-sm font-semibold text-white disabled:opacity-40 active:scale-95 transition-transform flex items-center justify-center gap-2"
                                    >
                                        Next <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <div className="px-4 pt-2">
                        <BuyerReceivablesTable globalSearch={search} statusFilter={statusFilter} dateRange={dateRange} />
                    </div>
                )}

                {/* Status filter sheet */}
                <ActionSheet
                    open={statusSheetOpen}
                    onClose={() => setStatusSheetOpen(false)}
                    title="Filter by Status"
                    options={statusOptions}
                    onSelect={(opt) => { setStatusFilter(opt.value || "all"); setPage(1); }}
                    selectedValue={statusFilter}
                />
            </div>
        );
    }

    // ── WEB / DESKTOP RENDER (ORIGINAL — UNCHANGED) ──────────────────────────
    return (
        <div className="min-h-screen bg-slate-50 text-black p-8 pb-40 space-y-8 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#F0F4E3] p-6 rounded-3xl border border-olive-200/50 shadow-sm transition-colors duration-500">
                <div>
                    <h1 className="text-4xl font-[1000] text-black tracking-tighter uppercase mb-2">{t("sales.title") || "SALES INVOICES"}</h1>
                    <p className="text-slate-500 font-bold text-lg flex items-center gap-2"><Wallet className="w-5 h-5 text-[#0C831F]" />{t("sales.subtitle") || "Create, Track, and Manage Revenue."}</p>
                </div>
                <div className="flex gap-4">
                    <Button variant="outline" onClick={() => fetchSalesAndStats(true)} className="h-12 w-12 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-400 bg-white shadow-sm font-bold"><RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} /></Button>
                    <Link href="/sales/new"><Button className="h-12 px-8 bg-[#0C831F] text-white hover:bg-[#0A6C1A] font-black text-lg rounded-xl shadow-lg shadow-emerald-200 hover:scale-105 transition-all"><Plus className="mr-2 h-5 w-5" /> {t("sales.new_invoice")}</Button></Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-2"><StatsCard title={t("stats.revenue")} value={`₹ ${totalRevenue.toLocaleString()}`} trend="+12.5%" icon={<TrendingUp className="w-8 h-8 text-black/40" />} color="lime" textColor="black" /></div>
                <StatsCard title="Active Debtors" value={activeDebtorsCount.toString()} subtext="Receivables" icon={<Users className="w-8 h-8 text-white/50" />} color="blue" />
                <StatsCard title="Active Creditors" value={activeCreditorsCount.toString()} subtext="Payables" icon={<Users className="w-8 h-8 text-white/50" />} color="red" />
            </div>

            <div className="sticky top-4 z-30 bg-white/90 backdrop-blur-xl border border-slate-200 p-2 rounded-2xl shadow-xl flex flex-col md:flex-row gap-2 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input placeholder={t("sales.search_placeholder")} className="pl-12 bg-white border-slate-200 text-black h-12 rounded-xl focus:ring-0 focus:border-[#0C831F] text-lg font-black transition-all shadow-sm placeholder:text-slate-300" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); const params = new URLSearchParams(searchParams.toString()); if (e.target.value) params.set("search", e.target.value); else params.delete("search"); router.replace(`/sales?${params.toString()}`); }} />
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <Button variant="ghost" onClick={() => setViewMode("invoices")} className={cn("h-10 rounded-lg px-4 font-bold transition-all text-xs uppercase tracking-wider", viewMode === "invoices" ? "bg-white text-black shadow-sm" : "text-slate-400 hover:text-black")}><List className="w-4 h-4 mr-2" /> {t("sales.all_invoices")}</Button>
                    <Button variant="ghost" onClick={() => setViewMode("buyers")} className={cn("h-10 rounded-lg px-4 font-bold transition-all text-xs uppercase tracking-wider", viewMode === "buyers" ? "bg-white text-black shadow-sm" : "text-slate-400 hover:text-black")}><LayoutGrid className="w-4 h-4 mr-2" /> {t("sales.by_buyer")}</Button>
                </div>
                {viewMode === "invoices" && (
                    <>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("h-12 justify-start text-left font-bold rounded-xl border-slate-200 bg-white text-black shadow-sm transition-all", !dateRange.from && "text-slate-500", dateRange.from && "border-[#0C831F] text-[#0C831F] bg-emerald-50")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    <span className="hidden md:inline">{dateRange?.from ? (dateRange.to ? <>{format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}</> : format(dateRange.from, "MMM d, yyyy")) : "Date Range"}</span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-white border-slate-200 rounded-xl shadow-2xl" align="end">
                                <Calendar initialFocus mode="range" defaultMonth={dateRange.from} selected={dateRange as any} onSelect={(range: any) => { setDateRange(range || { from: undefined, to: undefined }); setPage(1); }} numberOfMonths={1} className="bg-white text-black p-4 rounded-xl" />
                            </PopoverContent>
                        </Popover>
                        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("h-12 w-12 rounded-xl border-slate-200 hover:bg-slate-50 bg-white shadow-sm font-bold p-0", (statusFilter !== "all" || dateRange.from) && "border-[#0C831F] text-[#0C831F] bg-emerald-50")}><Filter className="w-5 h-5" /></Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-4 bg-white border-slate-200 shadow-2xl rounded-2xl mr-4" align="end">
                                <div className="space-y-4">
                                    <h3 className="font-black text-black uppercase tracking-widest text-xs border-b border-slate-100 pb-2">Filter Invoices</h3>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Status</label>
                                        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                                            <SelectTrigger className="w-full bg-slate-50 border-slate-200 text-black font-bold h-10 rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
                                            <SelectContent className="bg-white border-slate-200 text-black rounded-xl">
                                                <SelectItem value="all">All Status</SelectItem>
                                                <SelectItem value="paid">Paid</SelectItem>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="overdue">Overdue</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button variant="destructive" onClick={clearFilters} className="w-full h-10 rounded-lg font-black uppercase tracking-widest bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm text-xs"><X className="w-3 h-3 mr-2" /> {t("common.clear_filters")}</Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </>
                )}
            </div>

            <div className="space-y-4">
                {viewMode === "invoices" ? (
                    <>
                        <SalesTable data={sales} isLoading={loading} />
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t("common.pagination_info", { page, totalPages: Math.ceil(totalCount / pageSize), total: totalCount })}</span>
                            <div className="flex gap-2">
                                <Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-10 px-6 rounded-xl bg-white hover:bg-slate-50 text-black font-bold border-slate-200 disabled:opacity-50 shadow-sm"><ChevronLeft className="w-4 h-4 mr-2" /> {t("common.previous")}</Button>
                                <Button variant="outline" disabled={page >= Math.ceil(totalCount / pageSize) || loading} onClick={() => setPage((p) => p + 1)} className="h-10 px-6 rounded-xl bg-black hover:bg-slate-800 text-white font-bold border-0 disabled:opacity-50 shadow-md">{t("common.next")} <ChevronRight className="w-4 h-4 ml-2" /></Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <BuyerReceivablesTable globalSearch={search} statusFilter={statusFilter} dateRange={dateRange} />
                )}
            </div>
        </div>
    );
}



function StatsCard({ title, value, trend, subtext, icon, color, textColor }: any) {
    let bgClass = "";
    const textClass = color === "white" || color === "lime" ? "text-slate-900" : "text-white";
    if (color === "white") bgClass = "bg-white border border-slate-200";
    else if (color === "lime") bgClass = "bg-[#D9F99D] border border-lime-200";
    else if (color === "blue") bgClass = "bg-blue-600";
    else if (color === "red") bgClass = "bg-black";
    else bgClass = "bg-black";

    return (
        <div className={`p-8 rounded-[32px] ${bgClass} relative overflow-hidden group hover:shadow-xl transition-all duration-500 hover:-translate-y-1 shadow-sm`}>
            <div className={`absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-30 transition-opacity`}>{icon}</div>
            <div className="relative z-10">
                <div className={`text-xs font-black uppercase tracking-widest mb-2 ${color === "white" || color === "lime" ? "text-slate-600" : "text-white/80"}`}>{title}</div>
                <div className={`text-5xl font-black tracking-tighter mb-4 drop-shadow-sm ${textClass}`}>{value}</div>
                {(trend || subtext) && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border ${color === "white" || color === "lime" ? "bg-black/5 border-black/10 text-slate-800" : "bg-white/20 border-white/30 text-white"}`}>
                        {trend ? <TrendingUp className="w-3 h-3" /> : null} {trend || subtext}
                    </div>
                )}
            </div>
        </div>
    );
}
