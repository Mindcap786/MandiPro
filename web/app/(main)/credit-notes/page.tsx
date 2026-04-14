"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { Plus, ArrowDownToLine, ArrowUpToLine, FileText, Search, Filter, Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import { useRouter, useSearchParams } from "next/navigation";
import CreditNotesTable from "@/components/credit-notes/credit-notes-table";

function CreditNotes() {
    const { profile, loading: authLoading } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useLanguage();

    const [notes, setNotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [creditTotal, setCreditTotal] = useState(0);
    const [debitTotal, setDebitTotal] = useState(0);

    const [page, setPage] = useState(1);
    const pageSize = 20;
    const [search, setSearch] = useState(searchParams.get("search") || "");
    const [typeFilter, setTypeFilter] = useState("all");
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
            fetchNotesAndStats();
        }, 500);
        return () => clearTimeout(timer);
    }, [search, page, typeFilter, dateRange, profile, authLoading]);

    const fetchNotesAndStats = async () => {
        if (!profile?.organization_id) return;
        setLoading(true);

        try {
            const buildQuery = (selectStr: string, opts: any = {}) => {
                let q = supabase
                    .from('credit_debit_notes')
                    .select(selectStr, opts)
                    .eq('organization_id', profile.organization_id);

                if (typeFilter !== 'all') {
                    q = q.eq('note_type', typeFilter === 'credit' ? 'Credit Note' : 'Debit Note');
                }
                if (dateRange.from) {
                    q = q.gte('note_date', startOfDay(dateRange.from).toISOString());
                }
                if (dateRange.to) {
                    q = q.lte('note_date', endOfDay(dateRange.to).toISOString());
                }
                return q;
            };

            // Get stats
            const { data: statsData } = await buildQuery('note_type, amount');

            let cTotal = 0;
            let dTotal = 0;
            (statsData as any[])?.forEach(note => {
                const amt = Number(note.amount) || 0;
                if (note.note_type === 'Credit Note') {
                    cTotal += amt;
                } else {
                    dTotal += amt;
                }
            });

            setCreditTotal(cTotal);
            setDebitTotal(dTotal);
            setTotalCount(statsData?.length || 0);

            // Fetch Paginated Table Data
            const startIdx = (page - 1) * pageSize;
            const endIdx = startIdx + pageSize - 1;

            let tableQuery = buildQuery('*, contact:contacts(id, name), invoice:sales(bill_no, contact_bill_no)', { count: 'exact' })
                .order('note_date', { ascending: false })
                .order('created_at', { ascending: false });

            if (search) {
                // Find matching buyers
                const { data: matchingContacts } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('organization_id', profile.organization_id)
                    .ilike('name', `%${search}%`);

                const contactIds = matchingContacts?.map(b => b.id) || [];

                if (contactIds.length > 0) {
                    const idsStr = `(${contactIds.join(',')})`;
                    tableQuery = tableQuery.or(`note_number.ilike.%${search}%,contact_id.in.${idsStr}`);
                } else {
                    tableQuery = tableQuery.ilike('note_number', `%${search}%`);
                }
            }

            tableQuery = tableQuery.range(startIdx, endIdx);

            const { data: tableData, error: tableError } = await tableQuery;
            if (tableError) throw tableError;

            setNotes(tableData || []);
        } catch (err) {
            console.error("Error fetching notes:", err);
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => {
        setTypeFilter("all");
        setDateRange({ from: undefined, to: undefined });
        setSearch("");
        setPage(1);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-black p-8 pb-40 space-y-8 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#F0F4E3] p-6 rounded-3xl border border-olive-200/50 shadow-sm transition-colors duration-500">
                <div>
                    <h1 className="text-4xl font-[1000] text-black tracking-tighter uppercase mb-2">
                        CREDIT / DEBIT NOTES
                    </h1>
                    <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[#0C831F]" />
                        Manage Sales Returns, Adjustments, and Differences.
                    </p>
                </div>
                <div className="flex gap-4">
                    <Link href="/credit-notes/new?type=Debit">
                        <Button variant="outline" className="h-12 px-6 rounded-xl border-orange-200 text-orange-600 hover:bg-orange-50 font-black uppercase tracking-wide bg-white shadow-sm">
                            <ArrowUpToLine className="mr-2 h-4 w-4" /> New Debit Note
                        </Button>
                    </Link>
                    <Link href="/credit-notes/new?type=Credit">
                        <Button className="h-12 px-8 bg-[#0C831F] text-white hover:bg-[#0A6C1A] font-black text-lg rounded-xl shadow-lg shadow-emerald-200 hover:scale-105 transition-all">
                            <ArrowDownToLine className="mr-2 h-5 w-5" /> New Credit Note
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatsCard
                    title="Total Credit Notes Issued"
                    value={`₹ ${(creditTotal).toLocaleString()}`}
                    subtext="Money owed to customers"
                    icon={<ArrowDownToLine className="w-8 h-8 text-black/40" />}
                    color="lime"
                    textColor="black"
                />
                <StatsCard
                    title="Total Debit Notes Issued"
                    value={`₹ ${(debitTotal).toLocaleString()}`}
                    subtext="Additional charges to customers"
                    icon={<ArrowUpToLine className="w-8 h-8 text-white/50" />}
                    color="orange"
                />
            </div>

            <div className="sticky top-4 z-30 bg-white/90 backdrop-blur-xl border border-slate-200 p-2 rounded-2xl shadow-xl flex flex-col md:flex-row gap-2 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                        placeholder="Search notes or parties..."
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

                <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val); setPage(1); }}>
                    <SelectTrigger className="w-[180px] bg-white border-slate-200 text-black font-bold h-12 rounded-xl shadow-sm">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-black rounded-xl">
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="credit">Credit Notes</SelectItem>
                        <SelectItem value="debit">Debit Notes</SelectItem>
                    </SelectContent>
                </Select>

                {(search || typeFilter !== 'all' || dateRange.from) && (
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
                <CreditNotesTable
                    data={notes}
                    isLoading={loading}
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

export default function CreditNotesPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#0C831F]" />
            </div>
        }>
            <CreditNotes />
        </Suspense>
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
        bgClass = 'bg-[#D9F99D] border border-lime-200';
        textClass = 'text-slate-900';
        iconClass = 'text-slate-600';
        subTextClass = 'text-slate-600';
    } else if (color === 'blue') {
        bgClass = 'bg-blue-600';
    } else if (color === 'orange') {
        bgClass = 'bg-orange-500';
    } else {
        bgClass = 'bg-black';
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
                        {subtext}
                    </div>
                )}
            </div>
        </div>
    )
}
