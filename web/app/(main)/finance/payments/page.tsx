"use client";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownLeft, ArrowUpRight, Wallet, History, FileText, Search, Filter, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Loader2 } from "lucide-react";
// import { PaymentDialog } from "@/components/finance/payment-dialog";
import { ExpenseDialog } from "@/components/finance/expense-dialog";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { NewPaymentDialog } from "@/components/finance/new-payment-dialog";
import { VoucherDetailsDialog } from "@/components/finance/voucher-details-dialog";
import { useToast } from "@/hooks/use-toast";
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { isVoucherWellFormed, getVoucherImbalance } from "@/lib/finance/voucher-integrity";

export default function PaymentsPage() {
    const { profile } = useAuth();
    const { toast } = useToast();
    
    // Pre-load from cache for instant render on re-navigation
    const orgId = profile?.organization_id;
    const cachedData = orgId ? cacheGet<any>('payments_list', orgId) : null;

    const [transactions, setTransactions] = useState<any[]>(cachedData?.transactions || []);
    const [loading, setLoading] = useState(!cachedData);
    const [totalCount, setTotalCount] = useState(cachedData?.totalCount || 0);

    // --- Smart Filters State ---
    const [page, setPage] = useState(1);
    const pageSize = 15;
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: undefined,
        to: undefined,
    });
    const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [allContacts, setAllContacts] = useState<any[]>(cacheGet<any[]>('contacts_master', orgId || '') || []);

    useEffect(() => {
        if (!orgId) return;

        const cached = cacheGet<any>('payments_list', orgId);
        if (!cached) return;

        setTransactions(cached.transactions || []);
        setTotalCount(cached.totalCount || 0);
        setLoading(false);
    }, [orgId]);

    // Debounce Fetch
    useEffect(() => {
        const timer = setTimeout(() => {
            if (profile?.organization_id) {
                fetchTransactions();
                fetchMasterContacts();
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [search, page, typeFilter, dateRange, profile]);

    const fetchMasterContacts = async () => {
        if (!orgId) return;
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('contacts')
                .select('id, name, type, city')
                .eq('organization_id', orgId)
                .neq('status', 'deleted')
                .order('name');
            if (error) throw error;
            if (data) {
                setAllContacts(data);
                cacheSet('contacts_master', orgId, data);
            }
        } catch (e) {
            console.error("Error fetching master contacts:", e);
        }
    };

    const fetchTransactions = async () => {
        if (!profile?.organization_id) return;
        if (transactions.length === 0) setLoading(true);

        try {
            const isMandi = profile?.business_domain === 'mandi' || !profile?.business_domain;
            // Build Query
            let query = supabase
                .schema('mandi')
                .from('vouchers')
                .select(`
                    id, date, type, voucher_no, narration, created_at, source, amount,
                    lines:ledger_entries(debit, credit, account_id, contact_id, account:accounts(name))
                `)
                .eq('organization_id', profile.organization_id)
                // Payments & Receipts is strictly a cash/bank movement register (industry standard).
                // Purchase/Sales vouchers belong to their own registers and the Day Book, NOT here.
                .in('type', ['receipt', 'payment'])
                .order('date', { ascending: false })
                .order('created_at', { ascending: false });

            // Apply Filters (already scoped to receipt/payment above)
            if (typeFilter !== 'all') {
                query = query.eq('type', typeFilter);
            }

            if (dateRange.from) {
                query = query.gte('date', format(dateRange.from, 'yyyy-MM-dd'));
            }
            if (dateRange.to) {
                query = query.lte('date', format(dateRange.to, 'yyyy-MM-dd'));
            }

            if (search) {
                const searchStr = search.trim();
                const isNumericSearch = /^\d+$/.test(searchStr);

                if (isNumericSearch) {
                    query = query.eq('voucher_no', Number(searchStr));
                } else {
                    // Step 1: Find matching contacts in appropriate schema
                    const { data: matchingContacts } = await supabase
                        .schema('mandi')
                        .from('contacts')
                        .select('id')
                        .eq('organization_id', profile.organization_id)
                        .ilike('name', `%${searchStr}%`);

                    const contactIds = matchingContacts?.map(c => c.id) || [];

                    if (contactIds.length > 0) {
                        // Step 2: Find voucher IDs for these contacts
                        const { data: matchingEntries } = await supabase
                            .schema('mandi')
                            .from('ledger_entries')
                            .select('voucher_id')
                            .in('contact_id', contactIds)
                            .eq('organization_id', profile.organization_id);

                        const voucherIds = matchingEntries?.map(e => e.voucher_id).filter(Boolean) || [];
                        const uniqueVoucherIds = Array.from(new Set(voucherIds));

                        if (uniqueVoucherIds.length > 0) {
                            const idsStr = `(${uniqueVoucherIds.join(',')})`;
                            query = query.or(`narration.ilike.%${searchStr}%,id.in.${idsStr}`);
                        } else {
                            query = query.ilike('narration', `%${searchStr}%`);
                        }
                    } else {
                        query = query.ilike('narration', `%${searchStr}%`);
                    }
                }
            }

            // Pagination
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;
            query = query.range(from, to);

            const { data: vouchers, error, timedOut } = await fetchWithTimeout<any[]>(
                query,
                12000,
                'finance.vouchers',
            );
            const count = (vouchers as any)?.length ?? 0;

            if (timedOut) {
                console.warn('[Payments] vouchers fetch timed out — keeping cached data visible');
                return;
            }
            if (error) throw error;

            if (vouchers) {
                const isMandi = profile?.business_domain === 'mandi' || !profile?.business_domain;

                // Step 3: Fetch contact names for all vouchers
                const allContactIds = vouchers.flatMap(v => v.lines.map((l: any) => l.contact_id)).filter(Boolean);
                const uniqueContactIds = Array.from(new Set(allContactIds));

                let contactMap: Record<string, string> = {};
                if (uniqueContactIds.length > 0) {
                    const { data: contactsData } = await supabase
                        .schema('mandi')
                        .from('contacts')
                        .select('id, name')
                        .in('id', uniqueContactIds);

                    contactsData?.forEach(c => {
                        contactMap[c.id] = c.name;
                    });
                }

                // Reshape Data for Table
                const formatted = vouchers.map(v => {
                    let amount = 0
                    let partyName = "Unknown"

                    // Enrich lines with contact names from maps
                    v.lines = v.lines.map((l: any) => ({
                        ...l,
                        contactName: l.contact_id ? contactMap[l.contact_id] : null
                    }));

                    const partyEntry = v.lines.find((l: any) => l.contact_id)
                    const expenseEntry = v.lines.find((l: any) => l.account?.type === 'expense' || (l.account?.name || '').toLowerCase().includes('expense'))
                    const accountEntry = v.lines.find((l: any) => l.account_id && !['cash', 'bank'].includes(l.account?.account_sub_type || ''))

                    if (partyEntry) {
                        partyName = contactMap[partyEntry.contact_id] || "Unknown"
                        // Robust amount resolution based on voucher total
                        if (v.type === 'sales' || v.type === 'purchase') {
                            amount = v.amount || Math.max(partyEntry.debit, partyEntry.credit);
                        } else if (v.type === 'receipt') {
                            amount = partyEntry.credit; 
                        } else if (v.type === 'payment') {
                            amount = partyEntry.debit;
                        } else {
                            amount = partyEntry.debit > 0 ? partyEntry.debit : partyEntry.credit;
                        }
                    } else if (expenseEntry || accountEntry) {
                        // For Expenses or non-contact account entries
                        const entry = expenseEntry || accountEntry;
                        const acc = Array.isArray(entry.account) ? entry.account[0] : entry.account;
                        partyName = acc?.name || "Internal Entry";
                        amount = Math.max(entry.debit, entry.credit);
                    } else {
                        // Fallback: Check if it's a Cash Sale/Purchase (no contact)
                        const narration = (v.narration || "").toLowerCase();
                        if (narration.includes('sale')) {
                            partyName = "Cash Buyer (Sale)";
                        } else if (narration.includes('purchase')) {
                            partyName = "Cash Supplier (Purchase)";
                        } else {
                            partyName = "General Entry";
                        }
                        
                        const maxLine = v.lines.reduce((max: any, curr: any) => 
                            (Math.max(curr.debit, curr.credit) > Math.max(max.debit, max.credit) ? curr : max), 
                            { debit: 0, credit: 0 }
                        );
                        amount = Math.max(maxLine.debit, maxLine.credit);
                    }

                    // Improve Labeling based on User Request
                    // Standardized Labels per User Request
                    let displayType = v.type
                    const isExpense = v.lines.some((l: any) => 
                        l.account?.type === 'expense' || 
                        (l.account?.name || '').toLowerCase().includes('expense') ||
                        (v.narration || '').toLowerCase().includes('expense')
                    );

                    if (v.type === 'receipt') {
                        displayType = "Receive Money"
                    } else if (v.type === 'payment') {
                        if (isExpense) displayType = "Mandi Expense"
                        else displayType = "Make Payment"
                    }

                    // Integrity check: flag the row when Dr ≠ Cr so the
                    // cashier can spot corrupt vouchers in the register.
                    const wellFormed = isVoucherWellFormed(v.lines || []);
                    const imbalance = wellFormed ? 0 : Math.abs(getVoucherImbalance(v.lines || []));

                    return { ...v, amount, partyName, displayType, isImbalanced: !wellFormed, imbalance }
                });
                setTransactions(formatted);
                setTotalCount(count || 0);
                if (orgId) {
                    cacheSet('payments_list', orgId, { transactions: formatted, totalCount: count || 0 });
                }
            }
        } catch (e: any) {
            console.error("Error fetching vouchers:", e);
            toast({
                title: "Error fetching transactions",
                description: e.message || "Something went wrong while loading the data.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => {
        setSearch("");
        setTypeFilter("all");
        setDateRange({ from: undefined, to: undefined });
        setPage(1);
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 space-y-6 md:space-y-8 animate-in fade-in w-full max-w-[100vw] overflow-x-hidden">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#FFF9E6] p-4 md:p-6 rounded-2xl border border-[#FFE082]">
                <div>
                    <h1 className="text-3xl md:text-5xl font-black text-[#F57C00] tracking-tighter drop-shadow-sm">PAYMENTS <span className="text-[#FF9800] font-black">& RECEIPTS</span></h1>
                    <p className="text-[#F57C00] font-bold text-sm md:text-lg flex items-center gap-2">
                        <Wallet className="w-4 h-4 md:w-5 md:h-5 text-[#FF9800]" /> Manage daily cash flow and settlements.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="h-12 border-slate-300 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl shadow-sm">
                        <History className="mr-2 h-4 w-4" /> History
                    </Button>
                    <Button variant="outline" className="h-12 border-slate-300 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl shadow-sm">
                        <FileText className="mr-2 h-4 w-4" /> Reports
                    </Button>
                </div>
            </div>

            {/* ACTION CENTER - PREMIUM CARDS */}
            <div className="flex overflow-x-auto md:grid md:grid-cols-3 gap-4 md:gap-6 pb-4 md:pb-0 snap-x hide-scrollbar">
                {/* Receive Money */}
                <NewPaymentDialog mode="receipt" onSuccess={fetchTransactions} preLoadedContacts={allContacts}>
                    <button className="min-w-[280px] md:min-w-0 shrink-0 snap-center group relative w-full h-40 md:h-48 rounded-[32px] bg-gradient-to-br from-green-500 to-green-700 p-6 flex flex-col justify-between overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 shadow-lg">
                        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-30 transition-opacity">
                            <ArrowDownLeft className="h-24 w-24 md:h-32 md:w-32 text-white" />
                        </div>
                        <div className="z-10 bg-white/20 w-fit p-3 rounded-2xl text-white group-hover:scale-110 transition-transform backdrop-blur-sm">
                            <ArrowDownLeft className="h-6 w-6 md:h-8 md:w-8" />
                        </div>
                        <div className="z-10 text-left">
                            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight drop-shadow-lg">RECEIVE MONEY</h3>
                            <p className="text-white/80 font-bold text-[10px] md:text-xs uppercase tracking-widest mt-1">From Buyer / Party</p>
                        </div>
                    </button>
                </NewPaymentDialog>

                {/* Make Payment */}
                <NewPaymentDialog mode="payment" onSuccess={fetchTransactions} preLoadedContacts={allContacts}>
                    <button className="min-w-[280px] md:min-w-0 shrink-0 snap-center group relative w-full h-40 md:h-48 rounded-[32px] bg-gradient-to-br from-red-500 to-red-700 p-6 flex flex-col justify-between overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 shadow-lg">
                        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-30 transition-opacity">
                            <ArrowUpRight className="h-24 w-24 md:h-32 md:w-32 text-white" />
                        </div>
                        <div className="z-10 bg-white/20 w-fit p-3 rounded-2xl text-white group-hover:scale-110 transition-transform backdrop-blur-sm">
                            <ArrowUpRight className="h-6 w-6 md:h-8 md:w-8" />
                        </div>
                        <div className="z-10 text-left">
                            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight drop-shadow-lg">MAKE PAYMENT</h3>
                            <p className="text-white/80 font-bold text-[10px] md:text-xs uppercase tracking-widest mt-1">To Farmer / Supplier</p>
                        </div>
                    </button>
                </NewPaymentDialog>

                {/* Expense */}
                <ExpenseDialog onSuccess={fetchTransactions}>
                    <button className="min-w-[280px] md:min-w-0 shrink-0 snap-center group relative w-full h-40 md:h-48 rounded-[32px] bg-gradient-to-br from-orange-500 to-orange-700 p-6 flex flex-col justify-between overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 shadow-lg">
                        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-30 transition-opacity">
                            <Wallet className="h-24 w-24 md:h-32 md:w-32 text-white" />
                        </div>
                        <div className="z-10 bg-white/20 w-fit p-3 rounded-2xl text-white group-hover:scale-110 transition-transform backdrop-blur-sm">
                            <Wallet className="h-6 w-6 md:h-8 md:w-8" />
                        </div>
                        <div className="z-10 text-left">
                            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight drop-shadow-lg uppercase">Mandi Expenses</h3>
                            <p className="text-white/80 font-bold text-[10px] md:text-xs uppercase tracking-widest mt-1">Shop & Payroll Costs</p>
                        </div>
                    </button>
                </ExpenseDialog>
            </div>

            {/* STICKY FILTERS & DATA GRID */}
            <div className="space-y-4">
                {/* Sticky Filter Bar */}
                <div className="sticky top-4 z-30 bg-white/90 backdrop-blur-xl border border-slate-200 p-2 rounded-2xl shadow-lg flex flex-col md:flex-row gap-2 items-center">
                    {/* Search */}
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                        <Input
                            placeholder="Search Party Name, Voucher #, or Narration..."
                            className="pl-12 bg-white border-slate-200 text-slate-900 h-14 rounded-xl focus:bg-white focus:border-blue-500 text-lg font-medium transition-all"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>

                    {/* Filter Trigger */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("h-14 px-6 rounded-xl border-slate-200 bg-white text-slate-700 font-bold tracking-wide hover:text-slate-900 hover:border-slate-300", (typeFilter !== 'all' || dateRange.from) && "border-blue-500 text-blue-600 bg-blue-50")}>
                                <Filter className="w-5 h-5 mr-3" />
                                FILTERS {(typeFilter !== 'all' || dateRange.from) && <span className="ml-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">!</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 bg-white border-slate-200 p-6 rounded-2xl shadow-2xl">
                            <div className="space-y-6">
                                <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs">Transaction Filter</h4>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Type</label>
                                    <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                                        <SelectTrigger className="h-12 bg-white border-slate-200 rounded-xl">
                                            <SelectValue placeholder="All Types" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                        <SelectItem value="all">All Payments & Receipts</SelectItem>
                                            <SelectItem value="receipt">Receipt (In)</SelectItem>
                                            <SelectItem value="payment">Payment (Out)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Date Range</label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                    "w-full h-12 justify-start text-left font-normal bg-white border-slate-200 rounded-xl",
                                                    !dateRange.from && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dateRange.from ? (
                                                    dateRange.to ? (
                                                        <>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>
                                                    ) : (
                                                        format(dateRange.from, "LLL dd, y")
                                                    )
                                                ) : (
                                                    <span>Pick a date</span>
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 bg-white border-slate-200" align="start">
                                            <Calendar
                                                initialFocus
                                                mode="range"
                                                defaultMonth={dateRange.from}
                                                selected={dateRange as any}
                                                onSelect={(range: any) => { setDateRange(range || { from: undefined, to: undefined }); setPage(1); }}
                                                numberOfMonths={1}
                                                className="bg-white text-slate-900"
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <Button
                                    variant="destructive"
                                    onClick={clearFilters}
                                    className="w-full h-12 rounded-xl font-bold uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 transition-all"
                                >
                                    <X className="w-4 h-4 mr-2" /> Clear All Filters
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Transaction List */}
                <div className="space-y-2">
                    {loading ? (
                        <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-500">
                            No transactions found matching your filters.
                        </div>
                    ) : (
                        transactions.map((t) => (
                            <div
                                key={t.id}
                                onClick={() => {
                                    setSelectedVoucher(t);
                                    setIsDetailsOpen(true);
                                }}
                                className="group bg-white border border-slate-200 p-3 md:p-4 rounded-2xl flex items-center justify-between hover:border-slate-300 transition-all hover:shadow-md cursor-pointer active:scale-[0.99]"
                            >
                                <div className="flex items-center gap-3 md:gap-6 min-w-0">
                                    <div className={cn("w-10 h-10 md:w-14 md:h-14 shrink-0 rounded-xl flex items-center justify-center font-black transition-all group-hover:scale-105",
                                        t.type === 'receipt' ? "bg-green-100 text-green-700" :
                                            t.type === 'payment' ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                                    )}>
                                        {t.type === 'receipt' ? <ArrowDownLeft className="h-5 w-5 md:h-6 md:w-6" /> : t.type === 'payment' ? <ArrowUpRight className="h-5 w-5 md:h-6 md:w-6" /> : <Wallet className="h-5 w-5 md:h-6 md:w-6" />}
                                    </div>
                                    <div className="min-w-0 pr-2">
                                        <div className="flex flex-wrap items-center gap-1.5 md:gap-3 mb-1">
                                            <span className="text-black font-black text-sm md:text-lg truncate max-w-[150px] md:max-w-xs">{t.partyName}</span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[8px] md:text-[10px] font-mono text-black uppercase font-black whitespace-nowrap">
                                                #{t.voucher_no || 'N/A'}
                                            </span>
                                            {t.isImbalanced && (
                                                <span
                                                    title={`Debits do not equal credits (off by ₹${Math.round(t.imbalance || 0).toLocaleString()}). This voucher is corrupt and needs review.`}
                                                    className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-[8px] md:text-[10px] font-black text-amber-700 uppercase tracking-widest whitespace-nowrap"
                                                >
                                                    ⚠️ Imbalanced
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-black text-xs md:text-sm font-bold flex flex-wrap items-center gap-1 md:gap-2 leading-tight">
                                            <span className="capitalize font-black text-blue-600">{t.displayType}</span> <span className="hidden md:inline">•</span> <span className="text-slate-500">{format(new Date(t.date), 'dd MMM yyyy')}</span> <span className="hidden md:inline">•</span> <span className="italic text-slate-500 font-bold truncate max-w-[100px] md:max-w-[200px] hidden sm:block">{t.narration || "No Narration"}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className={cn("text-sm md:text-xl font-black font-mono tracking-tight",
                                        t.type === 'receipt' ? "text-green-600" : "text-red-600"
                                    )}>
                                        {t.type === 'receipt' ? 'Cr' : 'Dr'} ₹{t.amount?.toLocaleString()}
                                    </div>
                                    <div className="text-[8px] md:text-[10px] text-black font-black uppercase tracking-widest mt-0.5 md:mt-1">
                                        {t.type === 'receipt' ? 'Credit' : 'Debit'}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination Controls */}
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-xs font-black text-black uppercase tracking-widest">
                        Page {page} of {Math.ceil(totalCount / pageSize) || 1} • Total {totalCount} Records
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="h-10 px-6 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-bold border-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                            onClick={() => setPage(p => p + 1)}
                            className="h-10 px-6 rounded-xl bg-black hover:bg-slate-900 text-white font-bold border-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            Next <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>

            <VoucherDetailsDialog
                voucher={selectedVoucher}
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
            />
        </div>
    )
}
