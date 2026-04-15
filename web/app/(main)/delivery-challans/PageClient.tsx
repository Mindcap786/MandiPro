"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Search, Truck, Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import { useRouter, useSearchParams } from "next/navigation";
import DeliveryChallansTable from "@/components/delivery-challans/delivery-challans-table";

export default function DeliveryChallans() {
    const { profile, loading: authLoading } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useLanguage();

    const [challans, setChallans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    const [page, setPage] = useState(1);
    const pageSize = 20;
    const [search, setSearch] = useState(searchParams.get("search") || "");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: undefined | Date }>({
        from: undefined,
        to: undefined,
    });

    useEffect(() => {
        if (authLoading) return;
        if (!profile?.organization_id) {
            setLoading(false);
            return;
        }

        const timer = setTimeout(() => {
            fetchChallans();
        }, 500);
        return () => clearTimeout(timer);
    }, [search, page, dateRange, profile, authLoading]);

    const fetchChallans = async () => {
        if (!profile?.organization_id) return;
        setLoading(true);

        try {
            const startIdx = (page - 1) * pageSize;
            const endIdx = startIdx + pageSize - 1;

            let query = supabase
                .from('delivery_challans')
                .select('*, contact:contacts(name, city), sales_order:sales_orders(order_number)', { count: 'exact' })
                .eq('organization_id', profile.organization_id)
                .order('challan_date', { ascending: false })
                .order('created_at', { ascending: false });

            if (dateRange.from) {
                query = query.gte('challan_date', startOfDay(dateRange.from).toISOString());
            }
            if (dateRange.to) {
                query = query.lte('challan_date', endOfDay(dateRange.to).toISOString());
            }

            if (search) {
                const { data: matchingContacts } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('organization_id', profile.organization_id)
                    .ilike('name', `%${search}%`);

                const contactIds = matchingContacts?.map(b => b.id) || [];

                if (contactIds.length > 0) {
                    const idsStr = `(${contactIds.join(',')})`;
                    query = query.or(`challan_number.ilike.%${search}%,vehicle_number.ilike.%${search}%,contact_id.in.${idsStr}`);
                } else {
                    query = query.or(`challan_number.ilike.%${search}%,vehicle_number.ilike.%${search}%`);
                }
            }

            query = query.range(startIdx, endIdx);

            const { data, count, error } = await query;
            if (error) throw error;

            setChallans(data || []);
            setTotalCount(count || 0);

        } catch (err) {
            console.error("Error fetching challans:", err);
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => {
        setDateRange({ from: undefined, to: undefined });
        setSearch("");
        setPage(1);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-black p-8 pb-40 space-y-8 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#F0F4E3] p-6 rounded-3xl border border-olive-200/50 shadow-sm transition-colors duration-500">
                <div>
                    <h1 className="text-4xl font-[1000] text-black tracking-tighter uppercase mb-2">
                        DELIVERY CHALLANS
                    </h1>
                    <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                        <Truck className="w-5 h-5 text-[#0C831F]" />
                        Manage outward goods movement and dispatch.
                    </p>
                </div>
                <div className="flex gap-4">
                    <Link href="/delivery-challans/new">
                        <Button className="h-12 px-8 bg-[#0C831F] text-white hover:bg-[#0A6C1A] font-black text-lg rounded-xl shadow-lg shadow-emerald-200 hover:scale-105 transition-all">
                            <Plus className="mr-2 h-5 w-5" /> New Challan
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="sticky top-4 z-30 bg-white/90 backdrop-blur-xl border border-slate-200 p-2 rounded-2xl shadow-xl flex flex-col md:flex-row gap-2 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                        placeholder="Search challan #, vehicle, or party..."
                        className="pl-12 bg-white border-slate-200 text-black h-12 rounded-xl focus:ring-0 focus:border-[#0C831F] text-lg font-black transition-all shadow-sm placeholder:text-slate-300"
                        value={search}
                        onChange={(e) => {
                            const val = e.target.value;
                            setSearch(val);
                            setPage(1);
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

                {(search || dateRange.from) && (
                    <Button
                        variant="ghost"
                        onClick={clearFilters}
                        className="h-12 w-12 rounded-xl text-slate-400 hover:bg-slate-100 p-0 transition-all font-bold"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                )}
            </div>

            <div className="space-y-4">
                <DeliveryChallansTable
                    data={challans}
                    isLoading={loading}
                    onStatusUpdate={fetchChallans}
                />

                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Page {page} of {Math.max(1, Math.ceil(totalCount / pageSize))} (Total: {totalCount})
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="h-10 px-6 rounded-xl bg-white hover:bg-slate-50 text-black font-bold border-slate-200 disabled:opacity-50 shadow-sm"
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                            onClick={() => setPage(p => p + 1)}
                            className="h-10 px-6 rounded-xl bg-black hover:bg-slate-800 text-white font-bold border-0 disabled:opacity-50 shadow-md"
                        >
                            Next <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
