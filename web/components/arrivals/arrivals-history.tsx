"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"

import { format, startOfDay, endOfDay, subDays } from "date-fns"
import { Loader2, User, MapPin, Truck, Box, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download } from "lucide-react"
import { ArrivalDetailsSheet } from "./arrival-details-sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { exportToCSV } from "@/lib/utils/export-csv"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { DateRange } from "react-day-picker"
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache"

export default function ArrivalsHistory() {
    const { profile } = useAuth()
    
    // CRITICAL FIX: Validate profile data before using it
    const _orgId = profile?.organization_id;
    if (!_orgId) {
        console.warn("[ArrivalsHistory] Profile not loaded or missing organization_id");
    }
    
    const _cached = _orgId ? cacheGet<any>('arrivals_history', _orgId) : null;

    const [arrivals, setArrivals] = useState<any[]>(_cached?.data || [])
    const [loading, setLoading] = useState(!_cached)
    const [selectedArrivalId, setSelectedArrivalId] = useState<string | null>(null)

    // Pagination State
    const [page, setPage] = useState(1)
    const [limit] = useState(20) // Standard page size updated to 20
    const [totalCount, setTotalCount] = useState(_cached?.count || 0)

    // Date Filter State
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(),
        to: new Date(),
    })
    
    // Responsive state for calendar tracking
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        if (!_orgId) return

        const cached = cacheGet<any>('arrivals_history', _orgId)
        if (!cached) return

        setArrivals(cached.data || [])
        setTotalCount(cached.count || 0)
        setLoading(false)
    }, [_orgId])

    useEffect(() => {
        if (!profile?.organization_id) return;

        const schema = 'mandi';
        const uniqueId = Math.random().toString(36).substring(7);
        const channel = supabase
            .channel(`arrivals-history-realtime-${uniqueId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: schema, table: 'arrivals', filter: `organization_id=eq.${profile.organization_id}` },
                () => {
                    fetchArrivals(true);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile]);

    useEffect(() => {
        if (profile?.organization_id) {
            fetchArrivals()
        }
    }, [profile, page, dateRange])

    const fetchArrivals = async (isManualRefresh = false) => {
        // Non-blocking fetch: show cached data immediately if available
        const isBackgroundRefresh = arrivals.length > 0 && !isManualRefresh;
        if (!isBackgroundRefresh) {
            setLoading(true);
        }

        try {
            if (!profile?.organization_id) return;

            const schema = 'mandi';
            
            // Try fast view first (non-blocking, indexed query)
            let query = supabase
                .schema(schema)
                .from('v_arrivals_fast')
                .select(`*`, { count: 'exact' })
                .eq('organization_id', profile.organization_id)
                .order('created_at', { ascending: false })
                .range((page - 1) * limit, page * limit - 1);

            // Apply Date Range Filter
            if (dateRange?.from) {
                query = query.gte('created_at', startOfDay(dateRange.from).toISOString())
            }
            if (dateRange?.to) {
                query = query.lte('created_at', endOfDay(dateRange.to).toISOString())
            }

            // Set timeout for fetch (5 seconds max)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
                const { data, error, count } = await query;
                clearTimeout(timeoutId);

                if (error) {
                    console.warn("v_arrivals_fast failed, falling back to base table:", error);
                    // Fallback to base table without contacts join
                    const fallbackQuery = supabase
                        .schema(schema)
                        .from('arrivals')
                        .select(`*, party_id`, { count: 'exact' })
                        .eq('organization_id', profile.organization_id)
                        .order('created_at', { ascending: false })
                        .range((page - 1) * limit, page * limit - 1);

                    if (dateRange?.from) fallbackQuery.gte('created_at', startOfDay(dateRange.from).toISOString());
                    if (dateRange?.to) fallbackQuery.lte('created_at', endOfDay(dateRange.to).toISOString());

                    const { data: fallbackData, error: fallbackError, count: fallbackCount } = await fallbackQuery;
                    if (fallbackError) throw fallbackError;

                    setArrivals(fallbackData || []);
                    setTotalCount(fallbackCount || 0);
                } else {
                    setArrivals(data || []);
                    setTotalCount(count || 0);
                }

                // Save to cache for offline
                if (_orgId) {
                    cacheSet('arrivals_history', _orgId, { data: data || [], count: count || 0 });
                }
            } catch (timeoutErr) {
                clearTimeout(timeoutId);
                console.error("Fetch timeout - using cached data:", timeoutErr);
                // Use cached data if fetch times out
                const cached = cacheGet<any>('arrivals_history', profile.organization_id);
                if (cached?.data) {
                    setArrivals(cached.data);
                    setTotalCount(cached.count || 0);
                }
            }
        } catch (err) {
            console.error("Fetch Arrivals Error:", err);
            // Non-blocking: show toast but don't prevent UI
            const cached = cacheGet<any>('arrivals_history', profile?.organization_id);
            if (cached?.data) {
                setArrivals(cached.data);
                setTotalCount(cached.count || 0);
            }
        } finally {
            setLoading(false);
        }
    }

    const handleExportCSV = async () => {
        try {
            setLoading(true)
            const schema = 'mandi';
            let query = supabase
                .schema(schema)
                .from('arrivals')
                .select(`
                    *,
                    contacts:party_id (name, city, type)
                `)
                .eq('organization_id', profile?.organization_id)
                .order('created_at', { ascending: false })

            if (dateRange?.from) {
                query = query.gte('created_at', startOfDay(dateRange.from).toISOString())
            }
            if (dateRange?.to) {
                query = query.lte('created_at', endOfDay(dateRange.to).toISOString())
            }

            const { data, error } = await query
            if (error) throw error

            if (data && data.length > 0) {
                exportToCSV(data.map(d => ({
                    Date: d.created_at ? format(new Date(d.created_at), 'dd MMM yyyy') : '',
                    Farmer: Array.isArray(d.contacts) ? d.contacts[0]?.name : d.contacts?.name,
                    Item: d.metadata?.item_name || '',
                    Vehicle: d.vehicle_number || '',
                    Location: d.storage_location || '',
                    Status: d.status || ''
                })), `Arrivals_Export_${format(new Date(), 'yyyyMMdd')}.csv`)
            }
        } catch (err) {
            console.error("Export Error:", err)
        } finally {
            setLoading(false)
        }
    }

    const actualTotalPages = Math.ceil(totalCount / limit)
    const totalPages = Math.min(5, actualTotalPages)

    if (loading && arrivals.length === 0) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header / Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-1.5 bg-blue-600 rounded-full shadow-sm" />
                    <div>
                        <h3 className="text-xl font-black text-black italic tracking-tighter uppercase leading-none">
                            Recent <span className="text-blue-600">Activity</span>
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                            {totalCount} Total Records • Page {page} of {totalPages || 1}
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                    "w-full sm:w-[260px] justify-start text-left font-bold text-black border-slate-200 bg-white hover:bg-slate-50 hover:text-black",
                                    !dateRange && "text-slate-500 font-normal"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
                                {dateRange?.from instanceof Date ? (
                                    dateRange.to instanceof Date ? (
                                        <>
                                            {format(dateRange.from, "LLL dd, y")} -{" "}
                                            {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Pick a date range</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-white border-slate-200 text-black shadow-xl" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={isMobile ? 1 : 2}
                                className="bg-white text-black border-slate-100 p-3"
                            />
                        </PopoverContent>
                    </Popover>

                    {(dateRange?.from || dateRange?.to) && (
                        <Button
                            variant="ghost"
                            onClick={() => setDateRange(undefined)}
                            className="text-[10px] uppercase font-bold text-slate-500 hover:text-black hover:bg-slate-100"
                        >
                            Reset
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        onClick={handleExportCSV}
                        className="flex-1 sm:flex-none h-10 px-4 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold text-xs ml-0 sm:ml-2"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="p-0 flex-1">
                {loading && arrivals.length === 0 ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                ) : arrivals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                            <Box className="w-8 h-8 text-slate-400" />
                        </div>
                        <div className="text-slate-900 font-bold">No arrivals found for this period.</div>
                        <Button variant="outline" onClick={() => setDateRange(undefined)} className="border-slate-200 text-xs text-blue-600 font-bold hover:bg-blue-50 uppercase tracking-widest">
                            Clear Filters
                        </Button>
                    </div>
                ) : (
                    <div className="relative border-t border-slate-100">
                        {/* Mobile List View */}
                        <div className="block md:hidden divide-y divide-slate-100">
                            {arrivals.map((arrival) => {
                                const farmerName = (Array.isArray(arrival.contacts) ? arrival.contacts[0] : arrival.contacts)?.name || 'Unknown';
                                const displayDate = (() => {
                                    try {
                                        const d = arrival.arrival_date;
                                        if (!d) return 'N/A';
                                        const [year, month, day] = d.split('-').map(Number);
                                        const localDate = new Date(year, month - 1, day);
                                        return format(localDate, 'dd MMM yyyy');
                                    } catch (e) { return 'N/A'; }
                                })();
                                const displayTime = (() => {
                                    try {
                                        return arrival.created_at ? format(new Date(arrival.created_at), 'HH:mm aaa') : 'N/A';
                                    } catch (e) { return 'N/A'; }
                                })();

                                return (
                                    <div
                                        key={arrival.id}
                                        className="p-4 active:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => setSelectedArrivalId(arrival.id)}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-black text-blue-600 font-mono">#{arrival.contact_bill_no || arrival.bill_no || '---'}</span>
                                                    <span className="text-sm font-black text-black truncate">{farmerName}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold font-mono">
                                                    <span>{displayDate}</span>
                                                    <span>•</span>
                                                    <span>{displayTime}</span>
                                                </div>
                                            </div>
                                            <span className={cn(
                                                "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border shrink-0",
                                                arrival.status === 'paid' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                arrival.status === 'partial' ? "bg-sky-50 text-sky-700 border-sky-100" :
                                                arrival.status === 'pending' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                                "bg-slate-50 text-slate-600 border-slate-100"
                                            )}>
                                                {arrival.status === 'paid' ? 'Paid' : 
                                                 arrival.status === 'partial' ? 'Partial' : 
                                                 arrival.status === 'pending' ? 'Pending' : 'Received'}
                                            </span>
                                        </div>
                                        
                                        {(arrival.metadata?.item_name || arrival.metadata?.qty != null) && (
                                            <div className="flex items-center justify-between mt-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Item</span>
                                                    <span className="text-xs font-bold text-slate-700">{arrival.metadata?.item_name || 'N/A'}</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Qty / Rate</span>
                                                    <div className="flex flex-wrap justify-end items-center gap-1.5 text-xs">
                                                        {arrival.metadata?.qty != null && (
                                                            <span className="font-bold text-slate-700">{arrival.metadata.qty} {arrival.metadata?.unit || ''}</span>
                                                        )}
                                                        {arrival.metadata?.supplier_rate != null && (
                                                            <span className="text-emerald-600 font-black">@ ₹{arrival.metadata.supplier_rate}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block">
                            <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-100">
                                <TableRow className="border-slate-100 hover:bg-transparent">
                                    <TableHead className="pl-6 w-[100px] text-[10px] font-black uppercase text-slate-600 tracking-widest">Bill #</TableHead>
                                    <TableHead className="w-[150px] text-[10px] font-black uppercase text-slate-600 tracking-widest">Date / Time</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Farmer</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Item / Qty / Rate</TableHead>
                                    <TableHead className="pr-6 text-right text-[10px] font-black uppercase text-slate-600 tracking-widest">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {arrivals.map((arrival) => (
                                    <TableRow
                                        key={arrival.id}
                                        className="border-slate-100 hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => setSelectedArrivalId(arrival.id)}
                                    >
                                        <TableCell className="pl-6 py-4">
                                            <span className="text-sm font-black text-blue-600 font-mono">
                                                #{arrival.contact_bill_no || arrival.bill_no || '---'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-black font-mono">
                                                    {(() => {
                                                        try {
                                                            const d = arrival.arrival_date;
                                                            if (!d) return 'N/A';
                                                            // Split YYYY-MM-DD to avoid UTC shift
                                                            const [year, month, day] = d.split('-').map(Number);
                                                            const localDate = new Date(year, month - 1, day);
                                                            return format(localDate, 'dd MMM yyyy');
                                                        } catch (e) { return 'N/A'; }
                                                    })()}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-bold font-mono">
                                                    {(() => {
                                                        try {
                                                            return arrival.created_at ? format(new Date(arrival.created_at), 'HH:mm aaa') : 'N/A';
                                                        } catch (e) { return 'N/A'; }
                                                    })()}
                                                </span>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <span className="text-sm font-black text-black group-hover:text-blue-600 transition-colors">
                                                {(Array.isArray(arrival.contacts) ? arrival.contacts[0] : arrival.contacts)?.name || 'Unknown'}
                                            </span>
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex flex-col gap-0.5">
                                                {arrival.metadata?.item_name && (
                                                    <span className="text-sm font-black text-black">{arrival.metadata.item_name}</span>
                                                )}
                                                <div className="flex items-center gap-2 text-[11px] font-bold">
                                                    {arrival.metadata?.qty != null && (
                                                        <span className="text-slate-600 font-mono">{arrival.metadata.qty} {arrival.metadata?.unit || ''}</span>
                                                    )}
                                                    {arrival.metadata?.supplier_rate != null && (
                                                        <span className="text-emerald-600 font-mono font-black">@ ₹{arrival.metadata.supplier_rate}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>

                                        <TableCell className="pr-6 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={cn(
                                                    "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border",
                                                    arrival.status === 'paid' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                    arrival.status === 'partial' ? "bg-sky-50 text-sky-700 border-sky-100" :
                                                    arrival.status === 'pending' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                                    "bg-slate-50 text-slate-600 border-slate-100"
                                                )}>
                                                    {arrival.status === 'paid' ? 'Paid' : 
                                                     arrival.status === 'partial' ? 'Partial' : 
                                                     arrival.status === 'pending' ? 'Pending' : 'Received'}
                                                </span>
                                                {arrival.status === 'pending' && arrival.advance_payment_mode === 'cheque' && !arrival.advance_cheque_status && (
                                                    <span className="text-[8px] font-black text-rose-500 uppercase tracking-tighter">Cheque Pending</span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        </div>

                        {/* Pagination Footer */}
                        <div className="p-4 flex items-center justify-between border-t border-slate-100 bg-slate-50/50">
                            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                                {actualTotalPages > 5 ? (
                                    <>
                                        Showing {(page - 1) * limit + 1} - {Math.min(page * limit, totalCount)} of {totalCount} records
                                        <span className="ml-2 text-blue-600">(Max 5 pages shown. Export CSV for all data)</span>
                                    </>
                                ) : (
                                    `Showing ${(page - 1) * limit + 1} - ${Math.min(page * limit, totalCount)} of ${totalCount} records`
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="h-8 w-8 p-0 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-black"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <span className="text-xs font-mono font-black text-black px-2">
                                    PAGE {page}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={page >= totalPages}
                                    className="h-8 w-8 p-0 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-black"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ArrivalDetailsSheet
                arrivalId={selectedArrivalId}
                isOpen={!!selectedArrivalId}
                onClose={() => setSelectedArrivalId(null)}
                onUpdate={fetchArrivals}
            />
        </div>
    )
}
