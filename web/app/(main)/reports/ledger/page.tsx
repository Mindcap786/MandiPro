"use client";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import {
    Loader2, Search, Calendar as CalendarIcon, Download,
    ArrowUpRight, ArrowDownRight, Printer, User, Filter,
    ChevronRight, BookOpen, Wallet, Activity
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { isNativePlatform } from "@/lib/capacitor-utils";
import { NativeCard } from "@/components/mobile/NativeCard";

export default function PartyLedgerPage() {
    const { profile } = useAuth();
    const [contacts, setContacts] = useState<any[]>([]);
    const [selectedContact, setSelectedContact] = useState<string>("");
    const [dateRange, setDateRange] = useState({
        from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        to: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });
    const [entries, setEntries] = useState<any[]>([]);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const fetchContacts = async () => {
        const schema = 'mandi';
        const { data } = await supabase
            .schema(schema)
            .from('contacts')
            .select('id, name, type, contact_code')
            .eq('organization_id', profile!.organization_id)
            .order('name');
        setContacts(data || []);
    };

    const fetchLedger = async () => {
        if (!selectedContact) return;
        setLoading(true);

        try {
            // 1. Fetch Opening Balance (entries before 'from' date)
            const { data: obData } = await supabase
                .schema('mandi')
                .from('ledger_entries')
                .select('debit, credit')
                .eq('organization_id', profile!.organization_id)
                .eq('contact_id', selectedContact)
                .lt('entry_date', dateRange.from);

            const ob = (obData || []).reduce((acc, curr) => acc + (Number(curr.debit) - Number(curr.credit)), 0);
            setOpeningBalance(ob);

            // 2. Fetch Statement Entries
            const { data: statementEntries, error } = await supabase
                .schema('mandi')
                .from('ledger_entries')
                .select(`
                    id,
                    entry_date,
                    description,
                    debit,
                    credit,
                    transaction_type,
                    reference_id,
                    status,
                    vouchers!inner(voucher_no, type)
                `)
                .eq('organization_id', profile!.organization_id)
                .eq('contact_id', selectedContact)
                .gte('entry_date', dateRange.from)
                .lte('entry_date', `${dateRange.to}T23:59:59.999Z`)
                .order('entry_date', { ascending: true });

            if (error) throw error;
            
            let augmentedEntries = statementEntries || [];
            
            // Extract all non-null reference IDs
            const allRefIds = augmentedEntries.map(e => e.reference_id).filter(Boolean);
            
            if (allRefIds.length > 0) {
                // Fetch Arrivals
                const { data: arrivals } = await supabase
                    .schema('mandi')
                    .from('arrivals')
                    .select('id, bill_number, lots(lot_code, item:commodities(name))')
                    .in('id', allRefIds);
                    
                // Fetch Sales
                const { data: sales } = await supabase
                    .schema('mandi')
                    .from('sales')
                    .select('id, bill_no, contact_bill_no, sale_items(lot:lots(lot_code), item:commodities(name))')
                    .in('id', allRefIds);

                const refMap = new Map();
                if (arrivals) {
                    arrivals.forEach(a => {
                        const lotStrs = (a.lots || []).map((l:any) => `${l.item?.name || 'Item'} [Lot: ${l.lot_code || 'N/A'}]`).join(', ');
                        const billPrefix = a.bill_number ? `Bill #${a.bill_number}` : '';
                        refMap.set(a.id, `${billPrefix} ${lotStrs}`.trim());
                    });
                }
                if (sales) {
                    sales.forEach(s => {
                        const lotStrs = (s.sale_items || []).map((si:any) => {
                            const lotNode = Array.isArray(si.lot) ? si.lot[0] : si.lot;
                            const lotCode = lotNode?.lot_code ? ` [Lot: ${lotNode.lot_code}]` : '';
                            return `${si.item?.name || 'Item'}${lotCode}`;
                        }).join(', ');
                        const bNo = s.contact_bill_no || s.bill_no;
                        const billPrefix = bNo ? `Invoice #${bNo}` : '';
                        refMap.set(s.id, `${billPrefix} ${lotStrs}`.trim());
                    });
                }

                augmentedEntries = augmentedEntries.map(e => {
                    if (e.reference_id && refMap.has(e.reference_id)) {
                        return { ...e, description: `${refMap.get(e.reference_id)} (${e.description})` };
                    }
                    return e;
                });
            }

            setEntries(augmentedEntries);

        } catch (err) {
            console.error("Ledger Fetch Error:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredContacts = contacts.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contact_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    useEffect(() => {
        if (!profile?.organization_id) return;
        fetchContacts();
    }, [profile?.organization_id]);

    if (isNativePlatform()) {
        const matchingContact = contacts.find(c => c.id === selectedContact);
        let mobileBalance = openingBalance;

        return (
            <NativePageWrapper title="Party Ledger">
                <div className="space-y-4 px-4 pb-10">
                    {/* Header Controls */}
                    <div className="flex flex-col gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <select
                                value={selectedContact}
                                onChange={(e) => {
                                    setSelectedContact(e.target.value);
                                    // Trigger fetch immediately on mobile for better UX
                                    if (e.target.value) setTimeout(() => fetchLedger(), 100);
                                }}
                                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold appearance-none shadow-sm"
                            >
                                <option value="">Select Party...</option>
                                {contacts.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white border border-gray-100 p-3 rounded-xl shadow-sm">
                                <p className="text-[10px] font-black uppercase text-gray-400 mb-1">From</p>
                                <input 
                                    type="date" 
                                    value={dateRange.from}
                                    onChange={e => setDateRange({...dateRange, from: e.target.value})}
                                    className="w-full text-xs font-bold border-none p-0 bg-transparent"
                                />
                            </div>
                            <div className="bg-white border border-gray-100 p-3 rounded-xl shadow-sm">
                                <p className="text-[10px] font-black uppercase text-gray-400 mb-1">To</p>
                                <input 
                                    type="date" 
                                    value={dateRange.to}
                                    onChange={e => setDateRange({...dateRange, to: e.target.value})}
                                    className="w-full text-xs font-bold border-none p-0 bg-transparent"
                                />
                            </div>
                        </div>

                        <Button 
                            onClick={fetchLedger}
                            disabled={loading || !selectedContact}
                            className="w-full bg-slate-900 text-white rounded-xl h-12 font-bold uppercase text-[11px] tracking-widest"
                        >
                            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Generate Statement"}
                        </Button>
                    </div>

                    {!selectedContact ? (
                        <div className="py-20 text-center flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
                                <User className="w-8 h-8" />
                            </div>
                            <p className="text-sm font-bold text-gray-400">Select a party to view their ledger entries</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Opening Balance Card */}
                            <NativeCard className="p-4 bg-gray-50 border-gray-200">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Opening Balance</span>
                                    <span className={cn("font-black text-sm", openingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                                        ₹{Math.abs(openingBalance).toLocaleString()} {openingBalance >= 0 ? "DR" : "CR"}
                                    </span>
                                </div>
                            </NativeCard>

                            {/* Entries List */}
                            <div className="space-y-3">
                                {entries.length === 0 ? (
                                    <div className="py-10 text-center text-xs font-bold text-gray-400 uppercase">No entries in this period</div>
                                ) : (
                                    entries.map(entry => {
                                        mobileBalance += (Number(entry.debit) - Number(entry.credit));
                                        return (
                                            <NativeCard key={entry.id} className="p-4 space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="text-sm font-black text-gray-900">{format(new Date(entry.entry_date), 'dd MMM yyyy')}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase">{entry.vouchers?.type}-{entry.vouchers?.voucher_no}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={cn(
                                                            "text-sm font-black",
                                                            entry.debit > 0 ? "text-green-600" : "text-red-600"
                                                        )}>
                                                            {entry.debit > 0 ? `+₹${Number(entry.debit).toLocaleString()}` : `-₹${Number(entry.credit).toLocaleString()}`}
                                                        </p>
                                                        <p className="text-[10px] font-bold text-gray-400">Balance: ₹{Math.abs(mobileBalance).toLocaleString()} {mobileBalance >= 0 ? "DR" : "CR"}</p>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-gray-600 font-medium leading-relaxed leading-relaxed">{entry.description}</p>
                                            </NativeCard>
                                        );
                                    })
                                )}
                            </div>

                            {/* Floating Summary Card maybe? Or just a footer */}
                        </div>
                    )}
                </div>
            </NativePageWrapper>
        );
    }


    let runningBalance = openingBalance;

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-8 space-y-8 pb-32">
            {/* Header */}
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-[1000] tracking-tight text-slate-900 uppercase">
                        Party <span className="text-indigo-600">Ledger</span>
                    </h1>
                    <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-[0.2em] flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-500" /> Professional Statement of Accounts
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="h-12 px-6 rounded-xl border-slate-200 bg-white shadow-sm font-bold uppercase text-[10px] tracking-widest gap-2">
                        <Printer className="w-4 h-4" /> Print PDF
                    </Button>
                    <Button className="h-12 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 font-bold uppercase text-[10px] tracking-widest gap-2">
                        <Download className="w-4 h-4" /> Export CSV
                    </Button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Search & Select Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search Party..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
                            />
                        </div>
                        <div className="h-[400px] overflow-y-auto pr-2 space-y-2 no-scrollbar">
                            {filteredContacts.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedContact(c.id)}
                                    className={cn(
                                        "w-full text-left p-4 rounded-2xl transition-all group relative overflow-hidden border",
                                        selectedContact === c.id
                                            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-100"
                                            : "bg-white border-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-slate-50"
                                    )}
                                >
                                    <div className="relative z-10 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-widest mb-1 opacity-70">
                                                {c.type}
                                            </p>
                                            <p className="font-bold text-sm truncate">{c.name}</p>
                                        </div>
                                        <ChevronRight className={cn("w-4 h-4 transition-transform", selectedContact === c.id ? "translate-x-1" : "opacity-0")} />
                                    </div>
                                    {selectedContact === c.id && (
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 blur-2xl" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date Range</p>
                        <div className="grid grid-cols-1 gap-3 text-sm font-bold">
                            <input
                                type="date"
                                value={dateRange.from}
                                onChange={e => setDateRange({ ...dateRange, from: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none"
                            />
                            <input
                                type="date"
                                value={dateRange.to}
                                onChange={e => setDateRange({ ...dateRange, to: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none"
                            />
                            <Button
                                onClick={fetchLedger}
                                disabled={loading || !selectedContact}
                                className="w-full mt-2 bg-slate-900 text-white h-12 rounded-xl font-bold uppercase text-[10px] tracking-widest"
                            >
                                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Refresh Report"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Main Ledger View */}
                <div className="lg:col-span-3 space-y-6">
                    {!selectedContact ? (
                        <div className="bg-white rounded-[40px] border border-slate-200 p-20 flex flex-col items-center justify-center text-center space-y-6">
                            <div className="w-24 h-24 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                                <User className="w-10 h-10 text-slate-300" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Select a Party</h3>
                                <p className="text-slate-400 font-bold mt-2">Pick a Customer or Supplier from the list to view their ledger</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Running Balance Overview */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Wallet className="w-4 h-4 text-emerald-500" /> Opening Balance
                                    </p>
                                    <p className={cn("text-3xl font-[1000] tracking-tighter mt-4", openingBalance >= 0 ? "text-slate-800" : "text-rose-600")}>
                                        ₹{Math.abs(openingBalance).toLocaleString()} <span className="text-xs font-bold text-slate-400">{openingBalance >= 0 ? "DR" : "CR"}</span>
                                    </p>
                                </div>
                                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between group overflow-hidden relative">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform duration-700">
                                        <ArrowUpRight className="w-24 h-24" />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Period Debit</p>
                                    <p className="text-3xl font-[1000] tracking-tighter mt-4 text-emerald-600">
                                        ₹{entries.reduce((acc, curr) => acc + Number(curr.debit), 0).toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between group overflow-hidden relative">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform duration-700">
                                        <ArrowDownRight className="w-24 h-24" />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Period Credit</p>
                                    <p className="text-3xl font-[1000] tracking-tighter mt-4 text-rose-600">
                                        ₹{entries.reduce((acc, curr) => acc + Number(curr.credit), 0).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            {/* Detailed Ledger Table */}
                            <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
                                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                                            <Activity className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm">Account Statement</h3>
                                            <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">
                                                {format(new Date(dateRange.from), 'dd MMM yyyy')} — {format(new Date(dateRange.to), 'dd MMM yyyy')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status:</span>
                                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Reconciled</span>
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50/30 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                                            <tr>
                                                <th className="p-8 pl-10">Date / Voucher</th>
                                                <th className="p-8">Description</th>
                                                <th className="p-8 text-right text-emerald-600">Debit (+)</th>
                                                <th className="p-8 text-right text-rose-600">Credit (-)</th>
                                                <th className="p-8 text-right pr-10">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {/* Opening Balance Row */}
                                            <tr className="bg-slate-50/20 italic">
                                                <td className="p-8 pl-10">
                                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Balance B/F</span>
                                                </td>
                                                <td className="p-8 text-xs font-bold text-slate-500 uppercase tracking-widest">Opening Balance as of {format(new Date(dateRange.from), 'dd MMM')}</td>
                                                <td className="p-8 text-right font-mono font-bold text-slate-400">{openingBalance > 0 ? `₹${openingBalance.toLocaleString()}` : "-"}</td>
                                                <td className="p-8 text-right font-mono font-bold text-slate-400">{openingBalance < 0 ? `₹${Math.abs(openingBalance).toLocaleString()}` : "-"}</td>
                                                <td className="p-8 text-right pr-10 font-mono font-black text-slate-800">₹{Math.abs(openingBalance).toLocaleString()} {openingBalance >= 0 ? "DR" : "CR"}</td>
                                            </tr>

                                            {entries.map((entry) => {
                                                runningBalance += (Number(entry.debit) - Number(entry.credit));
                                                return (
                                                    <tr key={entry.id} className={cn("hover:bg-slate-50/50 transition-colors group", entry.status === 'reversed' && "opacity-50")}>
                                                        <td className="p-8 pl-10">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-black text-slate-900 mb-1">{format(new Date(entry.entry_date), 'dd MMM yyyy')}</span>
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                                    {entry.vouchers?.type}-{entry.vouchers?.voucher_no}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="p-8">
                                                            <div className="flex flex-col max-w-sm">
                                                                <span className={cn("text-sm font-bold text-slate-700", entry.status === 'reversed' && "line-through")}>
                                                                    {entry.status === 'reversed' && <span className="text-rose-500 mr-2 uppercase text-[10px] bg-rose-50 px-2 py-0.5 rounded-sm inline-block no-underline">REVERSED</span>}
                                                                    {entry.description}
                                                                </span>
                                                                <div className="flex gap-2 mt-2">
                                                                    <span className={cn(
                                                                        "text-[8px] px-1.5 py-0.5 rounded font-black uppercase border",
                                                                        entry.transaction_type === 'receipt' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                                                            entry.transaction_type === 'payable' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                                                                "bg-indigo-50 text-indigo-600 border-indigo-100"
                                                                    )}>
                                                                        {entry.transaction_type}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-8 text-right font-mono text-sm font-black text-emerald-600">
                                                            {entry.debit > 0 ? `+₹${Number(entry.debit).toLocaleString()}` : "-"}
                                                        </td>
                                                        <td className="p-8 text-right font-mono text-sm font-black text-rose-600">
                                                            {entry.credit > 0 ? `-₹${Number(entry.credit).toLocaleString()}` : "-"}
                                                        </td>
                                                        <td className="p-8 text-right pr-10">
                                                            <div className="flex flex-col items-end">
                                                                <span className="font-mono text-md font-[1000] text-slate-900 tracking-tighter">
                                                                    ₹{Math.abs(runningBalance).toLocaleString()}
                                                                </span>
                                                                <span className="text-[9px] font-black text-slate-400">
                                                                    {runningBalance >= 0 ? "DR" : "CR"}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* Final Closing Balance */}
                                            <tr className="bg-slate-900 text-white font-black">
                                                <td colSpan={2} className="p-8 pl-10 text-xs uppercase tracking-[0.3em]">Closing Balance</td>
                                                <td className="p-8 text-right font-mono text-md">₹{entries.reduce((acc, curr) => acc + Number(curr.debit), 0).toLocaleString()}</td>
                                                <td className="p-8 text-right font-mono text-md">₹{entries.reduce((acc, curr) => acc + Number(curr.credit), 0).toLocaleString()}</td>
                                                <td className="p-8 text-right pr-10 font-mono text-xl tracking-tighter">
                                                    ₹{Math.abs(runningBalance).toLocaleString()} {runningBalance >= 0 ? "DR" : "CR"}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
